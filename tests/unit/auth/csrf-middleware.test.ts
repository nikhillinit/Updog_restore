import express, { type Express } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import request, { type Test } from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth, signToken } from '../../../server/lib/auth/jwt';
import { databaseMock } from '../../helpers/database-mock';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  cookieHeader,
  withBrowserAuth,
} from '../../helpers/browser-auth';

const TEST_SESSION_SECRET = 'csrf-middleware-session-secret-at-least-32-chars';
let originalSessionSecret: string | undefined;

function decodeClaims(token: string): JwtPayload {
  const claims = jwt.decode(token);
  if (!claims || typeof claims === 'string') throw new Error('Expected JWT claims');
  return claims;
}

async function makeGuardedApp(): Promise<Express> {
  const { requireCsrf } = await import('../../../server/lib/auth/csrf');
  const app = express();
  app.use(express.json());
  app.use(requireAuth());
  app.use(requireCsrf);
  app.all('/probe', (req, res) => res.status(200).json({ method: req.method }));
  return app;
}

async function sessionFixture() {
  const { createSessionCsrfToken } = await import('../../../server/lib/auth/csrf');
  const sessionToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
  const claims = decodeClaims(sessionToken);
  if (typeof claims.jti !== 'string') throw new Error('Expected JWT jti');
  return {
    sessionToken,
    csrfToken: createSessionCsrfToken(claims.jti),
  };
}

describe('cookie-authenticated CSRF middleware', () => {
  beforeEach(() => {
    originalSessionSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
    databaseMock.reset();
    databaseMock.setMockData('users', [
      { id: 1, username: 'csrf-user', password: 'unused', role: 'admin', isActive: true },
    ]);
    databaseMock.setMockData('revoked_tokens', []);
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSessionSecret;
    vi.restoreAllMocks();
  });

  it.each(['get', 'head', 'options'] as const)('%s passes without a CSRF token', async (method) => {
    const app = await makeGuardedApp();
    const { sessionToken } = await sessionFixture();
    const testRequest = request(app);
    const response = await testRequest[method]('/probe').set(
      'Cookie',
      cookieHeader({ name: SESSION_COOKIE_NAME, value: sessionToken })
    );

    expect(response.status).toBe(200);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    '%s accepts a matching, valid, jti-bound CSRF token',
    async (method) => {
      const app = await makeGuardedApp();
      const { sessionToken, csrfToken } = await sessionFixture();
      const response = await withBrowserAuth(
        request(app)[method]('/probe'),
        sessionToken,
        csrfToken
      );

      expect(response.status).toBe(200);
    }
  );

  it.each([
    {
      label: 'missing CSRF cookie and header',
      decorate: (test: Test, sessionToken: string) =>
        test.set('Cookie', cookieHeader({ name: SESSION_COOKIE_NAME, value: sessionToken })),
    },
    {
      label: 'missing CSRF header',
      decorate: (test: Test, sessionToken: string, csrfToken: string) =>
        test.set(
          'Cookie',
          cookieHeader(
            { name: SESSION_COOKIE_NAME, value: sessionToken },
            { name: CSRF_COOKIE_NAME, value: csrfToken }
          )
        ),
    },
    {
      label: 'cookie/header mismatch',
      decorate: (test: Test, sessionToken: string, csrfToken: string) =>
        test
          .set(
            'Cookie',
            cookieHeader(
              { name: SESSION_COOKIE_NAME, value: sessionToken },
              { name: CSRF_COOKIE_NAME, value: csrfToken }
            )
          )
          .set(CSRF_HEADER_NAME, `${csrfToken}-mismatch`),
    },
  ])('returns one uniform error for $label', async ({ decorate }) => {
    const app = await makeGuardedApp();
    const { sessionToken, csrfToken } = await sessionFixture();
    const response = await decorate(request(app).post('/probe'), sessionToken, csrfToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
  });

  it('rejects a valid token bound to a different session jti', async () => {
    const app = await makeGuardedApp();
    const { createSessionCsrfToken } = await import('../../../server/lib/auth/csrf');
    const { sessionToken } = await sessionFixture();
    const wrongToken = createSessionCsrfToken('different-session-jti');
    const response = await withBrowserAuth(request(app).post('/probe'), sessionToken, wrongToken);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
  });

  it('rejects cross-site fetch metadata even with a valid token', async () => {
    const app = await makeGuardedApp();
    const { sessionToken, csrfToken } = await sessionFixture();
    const response = await withBrowserAuth(
      request(app).post('/probe'),
      sessionToken,
      csrfToken
    ).set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'csrf_validation_failed' });
  });

  it('rejects a foreign Origin and accepts the request origin', async () => {
    const app = await makeGuardedApp();
    const { sessionToken, csrfToken } = await sessionFixture();

    const foreign = await withBrowserAuth(request(app).post('/probe'), sessionToken, csrfToken)
      .set('Host', 'app.example.test')
      .set('Origin', 'https://evil.example.test');
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ error: 'csrf_validation_failed' });

    const sameOrigin = await withBrowserAuth(request(app).post('/probe'), sessionToken, csrfToken)
      .set('Host', 'app.example.test')
      .set('Origin', 'http://app.example.test');
    expect(sameOrigin.status).toBe(200);
  });

  it('exempts machine Bearer mutations from browser CSRF', async () => {
    const app = await makeGuardedApp();
    const sessionToken = signToken({ sub: '1', role: 'admin', fundIds: [] });
    const response = await request(app)
      .post('/probe')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(200);
  });

  it('rejects ambiguous cookie plus Bearer before CSRF source selection', async () => {
    const app = await makeGuardedApp();
    const { sessionToken, csrfToken } = await sessionFixture();
    const response = await withBrowserAuth(
      request(app).post('/probe'),
      sessionToken,
      csrfToken
    ).set('Authorization', `Bearer ${sessionToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'ambiguous_credentials' });
  });
});
