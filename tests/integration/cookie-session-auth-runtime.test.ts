import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const revocationState = vi.hoisted(() => ({
  revokedJtis: new Set<string>(),
  calls: [] as Array<{ jti: string; userId: number; reason?: string }>,
}));

vi.mock('../../server/lib/auth/revocation.js', () => ({
  assertTokenUsable: async (claims: { jti?: string }) => {
    if (claims.jti && revocationState.revokedJtis.has(claims.jti)) {
      const error = new Error('Token has been revoked');
      error.name = 'TokenRevokedError';
      throw error;
    }
  },
  revokeToken: async (input: { jti: string; userId: number; reason?: string }) => {
    revocationState.revokedJtis.add(input.jti);
    revocationState.calls.push(input);
  },
}));

const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'REQUIRE_AUTH',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'ENABLE_QUEUES',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'SESSION_SECRET',
  'JWT_SECRET',
  'CORS_ORIGIN',
] as const;

const originalEnv = new Map<string, string | undefined>();

describe('cookie session auth through createServer/registerRoutes', () => {
  let server: Server;
  let providers: Awaited<ReturnType<typeof import('../../server/providers').buildProviders>>;
  let sessionToken: string;
  let csrfToken: string;
  let setReady: (ready: boolean) => void;
  let signToken: typeof import('../../server/lib/auth/jwt').signToken;
  let signBrowserSessionToken: typeof import('../../server/lib/auth/jwt').signBrowserSessionToken;
  let verifyAccessToken: typeof import('../../server/lib/auth/jwt').verifyAccessToken;
  let createSessionCsrfToken: typeof import('../../server/lib/auth/csrf').createSessionCsrfToken;

  beforeAll(async () => {
    for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);

    process.env['NODE_ENV'] = 'test';
    process.env['_EXPLICIT_NODE_ENV'] = 'test';
    process.env['REDIS_URL'] = 'memory://';
    process.env['_EXPLICIT_REDIS_URL'] = 'memory://';
    process.env['ENABLE_QUEUES'] = '0';
    process.env['ALLOW_MEMORY_STORAGE'] = '1';
    process.env['SESSION_SECRET'] = 'integration-session-secret-at-least-32-characters';
    process.env['JWT_SECRET'] = 'integration-jwt-secret-at-least-32-characters';
    process.env['CORS_ORIGIN'] = 'http://localhost:5173';
    delete process.env['DATABASE_URL'];
    delete process.env['NEON_DATABASE_URL'];
    revocationState.revokedJtis.clear();
    revocationState.calls.length = 0;

    vi.resetModules();
    const [{ loadEnv }, { buildProviders }, { createServer }, jwt, csrf, healthState] =
      await Promise.all([
        import('../../server/config/index.js'),
        import('../../server/providers.js'),
        import('../../server/server.js'),
        import('../../server/lib/auth/jwt.js'),
        import('../../server/lib/auth/csrf.js'),
        import('../../server/health/state.js'),
      ]);

    const cfg = loadEnv();
    providers = await buildProviders(cfg);
    server = await createServer(cfg, providers);
    setReady = healthState.setReady;
    setReady(true);
    signToken = jwt.signToken;
    signBrowserSessionToken = jwt.signBrowserSessionToken;
    verifyAccessToken = jwt.verifyAccessToken;
    createSessionCsrfToken = csrf.createSessionCsrfToken;
    sessionToken = signBrowserSessionToken({
      sub: '1',
      email: 'admin@example.com',
      role: 'admin',
      fundIds: [],
    });
    const claims = verifyAccessToken(sessionToken);
    if (typeof claims.jti !== 'string') throw new Error('Expected browser token jti');
    csrfToken = createSessionCsrfToken(claims.jti);
  }, 60_000);

  afterAll(async () => {
    setReady?.(false);
    await providers?.teardown?.();
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it('authenticates a protected session read from the HttpOnly-cookie transport', async () => {
    const response = await request(server)
      .get('/api/auth/session')
      .set('Cookie', `updog.session=${encodeURIComponent(sessionToken)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: '1', email: 'admin@example.com', role: 'admin', fundIds: [] },
    });
  });

  it('enforces CSRF after secure-context auth and before registerRoutes handlers', async () => {
    const cookie = `updog.session=${encodeURIComponent(sessionToken)}; updog.csrf=${encodeURIComponent(csrfToken)}`;
    const missing = await request(server).post('/api/auth/logout').set('Cookie', cookie).send({});
    expect(missing.status).toBe(403);
    expect(missing.body).toEqual({ error: 'csrf_validation_failed' });

    const logoutToken = signBrowserSessionToken({
      sub: '2',
      email: 'logout@example.com',
      role: 'admin',
      fundIds: [],
    });
    const logoutClaims = verifyAccessToken(logoutToken);
    if (typeof logoutClaims.jti !== 'string') throw new Error('Expected logout token jti');
    const logoutCsrf = createSessionCsrfToken(logoutClaims.jti);
    const logoutCookie = `updog.session=${encodeURIComponent(logoutToken)}; updog.csrf=${encodeURIComponent(logoutCsrf)}`;

    const valid = await request(server)
      .post('/api/auth/logout')
      .set('Cookie', logoutCookie)
      .set('X-CSRF-Token', logoutCsrf)
      .send({});
    expect(valid.status).toBe(204);
    expect(valid.headers['set-cookie']?.join(';')).toContain('updog.session=;');
    expect(revocationState.calls).toContainEqual(
      expect.objectContaining({ jti: logoutClaims.jti, userId: 2, reason: 'logout' })
    );

    const reused = await request(server)
      .get('/api/auth/session')
      .set('Cookie', `updog.session=${encodeURIComponent(logoutToken)}`);
    expect(reused.status).toBe(401);
  });

  it('retains machine Bearer compatibility and exempts it from CSRF', async () => {
    const bearerToken = signToken({
      sub: 'machine-service',
      email: 'machine@example.com',
      role: 'service',
      fundIds: [],
    });

    const session = await request(server)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${bearerToken}`);
    expect(session.status).toBe(200);

    const logout = await request(server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${bearerToken}`)
      .send({});
    expect(logout.status).toBe(204);
  });

  it('rejects mixed cookie and Bearer credentials before route handling', async () => {
    const bearerToken = signToken({
      sub: 'mixed-machine',
      email: 'mixed@example.com',
      role: 'service',
      fundIds: [],
    });
    const response = await request(server)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${bearerToken}`)
      .set('Cookie', `updog.session=${encodeURIComponent(sessionToken)}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'ambiguous_credentials' });

    const unsafeResponse = await request(server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${bearerToken}`)
      .set('Cookie', `updog.session=${encodeURIComponent(sessionToken)}`)
      .send({});
    expect(unsafeResponse.status).toBe(401);
    expect(unsafeResponse.body).toEqual({ error: 'ambiguous_credentials' });
  });

  it('allows the CSRF header in credentialed exact-origin preflight', async () => {
    const response = await request(server)
      .options('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-csrf-token,content-type');

    expect([200, 204]).toContain(response.status);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain(
      'x-csrf-token'
    );
  });
});
