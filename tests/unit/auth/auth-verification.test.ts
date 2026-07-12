import express from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeApp } from '../../../server/app';
import { requireAuth, signToken } from '../../../server/lib/auth/jwt';
import { requireSecureContext } from '../../../server/lib/secure-context';
import { databaseMock } from '../../helpers/database-mock';
import { SESSION_COOKIE_NAME, cookieHeader } from '../../helpers/browser-auth';

function tokenClaims(token: string): JwtPayload {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Expected an object JWT payload');
  }
  return decoded;
}

function activeUser() {
  return {
    id: 1,
    username: 'auth-user',
    password: 'unused',
    role: 'analyst',
    isActive: true,
  };
}

describe('revocable bearer verification', () => {
  beforeEach(() => {
    databaseMock.reset();
    databaseMock.setMockData('users', [activeUser()]);
    databaseMock.setMockData('revoked_tokens', []);
  });

  it('rejects a denylisted token at the mounted makeApp auth boundary', async () => {
    const token = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const claims = tokenClaims(token);
    databaseMock.setMockData('revoked_tokens', [
      {
        jti: claims.jti,
        userId: 1,
        expiresAt: new Date((claims.exp ?? 0) * 1000),
        reason: 'test',
      },
    ]);
    await request(makeApp())
      .get('/api/timeline/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('keeps a different token usable when only one jti is denylisted', async () => {
    const revokedToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const usableToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const revokedClaims = tokenClaims(revokedToken);
    databaseMock.setMockData('revoked_tokens', [
      {
        jti: revokedClaims.jti,
        userId: 1,
        expiresAt: new Date((revokedClaims.exp ?? 0) * 1000),
        reason: 'test',
      },
    ]);

    const response = await request(makeApp())
      .post('/api/capital-allocation/calculate')
      .set('Authorization', `Bearer ${usableToken}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it('rejects an active token after its user is deactivated', async () => {
    const token = signToken({ sub: '1', role: 'admin', fundIds: [] });
    databaseMock.setMockData('users', [{ ...activeUser(), isActive: false }]);

    await request(makeApp())
      .get('/api/timeline/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('writes a logout revocation that blocks the next request', async () => {
    const token = signToken({ sub: '1', role: 'admin', fundIds: [] });

    await request(makeApp())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(204);

    expect(databaseMock.getMockData('revoked_tokens')).toEqual([
      expect.objectContaining({
        jti: tokenClaims(token).jti,
        userId: 1,
        reason: 'logout',
      }),
    ]);
    await request(makeApp())
      .get('/api/timeline/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('populates the same principal shape on requireAuth and secure-context surfaces', async () => {
    const token = signToken({
      sub: '1',
      email: 'auth-user@example.com',
      role: 'analyst',
      fundIds: [7],
      org_id: 'org-1',
    });
    const expectedPrincipal = { kind: 'user', userId: '1', fundIds: [7] };

    const guardedApp = express();
    guardedApp.use(requireAuth());
    guardedApp.get('/principal', (req, res) => res.json(req.principal));

    const secureContextApp = express();
    secureContextApp.use(requireSecureContext);
    secureContextApp.get('/principal', (req, res) => res.json(req.principal));

    const guardedResponse = await request(guardedApp)
      .get('/principal')
      .set('Authorization', `Bearer ${token}`);

    const secureContextResponse = await request(secureContextApp)
      .get('/principal')
      .set('Authorization', `Bearer ${token}`);

    expect(guardedResponse.status).toBe(200);
    expect(guardedResponse.body).toEqual(expectedPrincipal);
    expect(secureContextResponse.status).toBe(200);
    expect(secureContextResponse.body).toEqual(expectedPrincipal);
  });

  it('populates the same principal shape from the browser session cookie on both auth surfaces', async () => {
    const token = signToken({
      sub: '1',
      email: 'auth-user@example.com',
      role: 'analyst',
      fundIds: [7],
      org_id: 'org-1',
    });
    const expectedPrincipal = { kind: 'user', userId: '1', fundIds: [7] };
    const cookie = cookieHeader({ name: SESSION_COOKIE_NAME, value: token });

    const guardedApp = express();
    guardedApp.use(requireAuth());
    guardedApp.get('/principal', (req, res) => res.json(req.principal));

    const secureContextApp = express();
    secureContextApp.use(requireSecureContext);
    secureContextApp.get('/principal', (req, res) => res.json(req.principal));

    const guardedResponse = await request(guardedApp).get('/principal').set('Cookie', cookie);
    const secureContextResponse = await request(secureContextApp)
      .get('/principal')
      .set('Cookie', cookie);

    expect(guardedResponse.status).toBe(200);
    expect(guardedResponse.body).toEqual(expectedPrincipal);
    expect(secureContextResponse.status).toBe(200);
    expect(secureContextResponse.body).toEqual(expectedPrincipal);
  });

  it('rejects simultaneous cookie and Bearer credentials uniformly on both auth surfaces', async () => {
    const token = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const cookie = cookieHeader({ name: SESSION_COOKIE_NAME, value: token });

    const guardedApp = express();
    guardedApp.use(requireAuth());
    guardedApp.get('/principal', (_req, res) => res.sendStatus(200));

    const secureContextApp = express();
    secureContextApp.use(requireSecureContext);
    secureContextApp.get('/principal', (_req, res) => res.sendStatus(200));

    for (const app of [guardedApp, secureContextApp]) {
      const response = await request(app)
        .get('/principal')
        .set('Cookie', cookie)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'ambiguous_credentials' });
    }
  });

  it('rejects revoked and deactivated browser session cookies', async () => {
    const revokedToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const revokedClaims = tokenClaims(revokedToken);
    databaseMock.setMockData('revoked_tokens', [
      {
        jti: revokedClaims.jti,
        userId: 1,
        expiresAt: new Date((revokedClaims.exp ?? 0) * 1000),
        reason: 'test',
      },
    ]);

    await request(makeApp())
      .get('/api/timeline/1')
      .set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: revokedToken }))
      .expect(401);

    const activeToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
    databaseMock.setMockData('revoked_tokens', []);
    databaseMock.setMockData('users', [{ ...activeUser(), isActive: false }]);
    await request(makeApp())
      .get('/api/timeline/1')
      .set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: activeToken }))
      .expect(401);
  });
});
