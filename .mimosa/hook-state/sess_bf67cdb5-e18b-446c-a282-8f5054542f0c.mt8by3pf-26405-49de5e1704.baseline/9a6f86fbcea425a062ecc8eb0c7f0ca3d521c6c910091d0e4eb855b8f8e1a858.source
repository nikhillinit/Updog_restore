import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'VITEST',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'RATE_LIMIT_REDIS_URL',
  'QUEUE_REDIS_URL',
  'SESSION_REDIS_URL',
  'ENABLE_QUEUES',
  'REQUIRE_AUTH',
  'DEFAULT_USER_ID',
  'JWT_ALG',
  '_EXPLICIT_JWT_ALG',
  'JWT_SECRET',
  '_EXPLICIT_JWT_SECRET',
  'JWT_AUDIENCE',
  '_EXPLICIT_JWT_AUDIENCE',
  'JWT_ISSUER',
  '_EXPLICIT_JWT_ISSUER',
  'JWT_JWKS_URL',
  '_EXPLICIT_JWT_JWKS_URL',
  'SESSION_SECRET',
] as const;

const originalEnv = new Map<string, string | undefined>();

function saveEnv() {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  originalEnv.clear();
}

function configureTestAuthEnv() {
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.VITEST = 'true';
  process.env.ALLOW_MEMORY_STORAGE = '1';
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = 'memory://';
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.QUEUE_REDIS_URL;
  delete process.env.SESSION_REDIS_URL;
  process.env.ENABLE_QUEUES = '0';
  process.env.REQUIRE_AUTH = '0';
  process.env.DEFAULT_USER_ID = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = 'route-surface-test-secret-32-chars-min';
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'route-surface-session-secret-32-chars-min';
}

async function makeAppWithTestAuth() {
  configureTestAuthEnv();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function authorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '1',
    email: 'route-surface-test@example.com',
    role: 'admin',
    fundIds: [],
  })}`;
}

async function nonAdminAuthorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'route-surface-nonadmin@example.com',
    role: 'user',
    fundIds: [1],
  })}`;
}

describe('timeline makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('mounts the timeline router on the production makeApp API surface', async () => {
    // Non-numeric fundId reaches the mounted /:fundId handler's own guard:
    // parseTimelineFundId rejects it -> 400 { error: 'Invalid fund ID' } before
    // any DB access. When NOT mounted, the same request falls through to the
    // makeApp catch-all 404 { error: 'not_found' } (the mount-parity defect).
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/timeline/abc')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid fund ID' });
  }, 30_000);

  // NOTE: this 401 comes from the PRE-EXISTING global /api auth boundary
  // (app.ts:187), NOT from the route-local requireAuth() this PR adds -- it would
  // 401 even if timeline were unmounted. It is a boundary sanity check, not proof
  // of the new admin gate. The 403 test below is the proof of the new gate.
  it('401s an unauthenticated /events/latest at the pre-existing global /api boundary', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/timeline/events/latest');
    expect(res.status).toBe(401);
  }, 30_000);

  it('rejects a signed non-admin /events/latest with 403 (proves the new route-local admin gate)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/timeline/events/latest')
      .set('Authorization', await nonAdminAuthorizationHeader());
    expect(res.status).toBe(403);
  }, 30_000);

  it('lets an authenticated fund-scoped GET /api/timeline/:fundId clear auth+scope into the service', async () => {
    // The mount exists to fix the CLIENT's fund-scoped timeline reads (useTimelineData),
    // so prove one actually reaches the service on makeApp. A signed token scoped to fund 1
    // (role is irrelevant here -- the /:fundId routes use enforceProvidedFundScope, not
    // requireRole). Assert the status is NOT 401/403/404: 404 => not mounted, 401 => global
    // auth rejected the token, 403 => fund-scope denied. Any other status (200, or a DB-driven
    // 500 from the eager default service / REFL-037) proves the request cleared the mount, the
    // /api auth boundary, AND the fund-scope gate. We deliberately do NOT assert 200:
    // timeline.ts:334-343 injects the real DB on this surface (REFL-037); the 200 body is
    // covered by timeline.contract.test.ts via createTimelineRouter(mockService).
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/timeline/1')
      .set('Authorization', await nonAdminAuthorizationHeader());

    expect([401, 403, 404]).not.toContain(res.status);
  }, 30_000);
});
