import jwt, { type JwtPayload } from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeApp } from '../../../server/app';
import { signToken } from '../../../server/lib/auth/jwt';
import { databaseMock } from '../../helpers/database-mock';
import { SESSION_COOKIE_NAME, cookieHeader, withBrowserAuth } from '../../helpers/browser-auth';

const TEST_SESSION_SECRET = 'makeapp-cookie-session-secret-at-least-32-chars';
let originalSessionSecret: string | undefined;

function tokenClaims(token: string): JwtPayload {
  const claims = jwt.decode(token);
  if (!claims || typeof claims === 'string') throw new Error('Expected JWT claims');
  return claims;
}

async function browserCredentials() {
  const { createSessionCsrfToken } = await import('../../../server/lib/auth/csrf');
  const sessionToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
  const claims = tokenClaims(sessionToken);
  if (typeof claims.jti !== 'string') throw new Error('Expected JWT jti');
  return { sessionToken, csrfToken: createSessionCsrfToken(claims.jti) };
}

describe('makeApp browser cookie auth surface', () => {
  beforeEach(() => {
    originalSessionSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    databaseMock.reset();
    databaseMock.setMockData('users', [
      { id: 1, username: 'makeapp-user', password: 'unused', role: 'admin', isActive: true },
    ]);
    databaseMock.setMockData('revoked_tokens', []);
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
  });

  it('authenticates a safe request through the browser session cookie', async () => {
    const { sessionToken } = await browserCredentials();
    const response = await request(makeApp())
      .get('/api/timeline/abc')
      .set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: sessionToken }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid fund ID' });
  });

  it('rejects a cookie-authenticated mutation without CSRF before the route handler', async () => {
    const { sessionToken } = await browserCredentials();
    const response = await request(makeApp())
      .post('/api/capital-allocation/calculate')
      .set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: sessionToken }))
      .send({});

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
  });

  it('lets valid cookie CSRF reach the mutation handler', async () => {
    const { sessionToken, csrfToken } = await browserCredentials();
    const response = await withBrowserAuth(
      request(makeApp()).post('/api/capital-allocation/calculate'),
      sessionToken,
      csrfToken
    ).send({});

    expect(response.status).toBe(400);
    expect(response.body).not.toEqual({ error: 'csrf_validation_failed' });
  });

  it('retains machine Bearer mutation compatibility without CSRF', async () => {
    const token = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const response = await request(makeApp())
      .post('/api/capital-allocation/calculate')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).not.toEqual({ error: 'csrf_validation_failed' });
  });

  it('rejects ambiguous cookie and Bearer credentials', async () => {
    const { sessionToken, csrfToken } = await browserCredentials();
    const response = await withBrowserAuth(
      request(makeApp()).post('/api/capital-allocation/calculate'),
      sessionToken,
      csrfToken
    )
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'ambiguous_credentials' });
  });

  it('allows X-CSRF-Token in credentialed CORS preflight only for an accepted exact origin', async () => {
    const app = makeApp();
    const accepted = await request(app)
      .options('/api/capital-allocation/calculate')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, x-csrf-token');

    expect(accepted.status).toBe(200);
    expect(accepted.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(accepted.headers['access-control-allow-credentials']).toBe('true');
    expect(accepted.headers['access-control-allow-headers'].toLowerCase()).toContain(
      'x-csrf-token'
    );

    const rejected = await request(app)
      .options('/api/capital-allocation/calculate')
      .set('Origin', 'http://localhost:5173.evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-csrf-token');
    expect(rejected.status).toBe(403);
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });
});
