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

async function nonAdminAuthorizationHeader() {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'route-surface-nonadmin@example.com',
    role: 'user',
    fundIds: [1],
  })}`;
}

describe('graduation makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  // (a) PRIMARY mount proof — the CLEANEST of the burn-down (a hard pin, not an exclusion). A signed token
  // clears the global /api auth boundary; GET /api/graduation/defaults returns createDefaultGraduationConfig
  // (pure config — NO engine run, NO request body, NO throw risk) and GET skips the makeApp 415 body guard.
  // Mounted -> deterministic 200; unmounted -> makeApp catch-all 404; no token -> 401 (before routing).
  // graduation's POST /project fills VALID DEFAULTS (20/16) on `.send({})` and returns 200 (see (c)); it does
  // NOT schema.parse and has NO fund guard, so DO NOT copy capital-allocation's 400 or liquidity's 500.
  it('mounts graduation on the makeApp API surface (GET /defaults -> 200)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/graduation/defaults')
      .set('Authorization', await nonAdminAuthorizationHeader());

    expect(res.status).toBe(200);
  }, 30_000);

  // (b) Auth-boundary sanity. This 401 is the PRE-EXISTING global /api boundary, NOT the mount
  // (a no-token GET 401s whether or not graduation is mounted). Boundary check only.
  it('401s an unauthenticated GET /api/graduation/defaults at the global /api boundary', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/graduation/defaults');
    expect(res.status).toBe(401);
  }, 30_000);

  // (c) Second-route coverage (belt-and-suspenders; both routes share ONE default router, so (a) already
  // proves the mount). POST /project fills valid defaults (20, 16) on `.send({})` -> passes the numeric
  // guards -> engine runs -> 200. Mounted -> reachable (not 401/404); unmounted -> catch-all 404. Do NOT
  // `toBe(400)` (empty body is VALID via defaults) and do NOT copy liquidity's 500.
  // NOTE: makeApp 415s a body-less POST, so ALWAYS `.send({})` (sets application/json). The GETs above do not.
  it('reaches the /project handler when mounted (not 401/404 with a token)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .post('/api/graduation/project')
      .set('Authorization', await nonAdminAuthorizationHeader())
      .send({});

    expect([401, 404]).not.toContain(res.status);
  }, 30_000);
});
