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

describe('capital-allocation makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  // (a) PRIMARY mount + reachability proof. A signed token clears the global /api auth boundary; the
  // /calculate handler's `if (!input || !input.fund)` guard returns 400 { error: 'invalid_request' }
  // BEFORE any compute (DB-free, engine-free). This single assertion discriminates the mount:
  // mounted -> 400; unmounted -> makeApp catch-all 404 { error: 'not_found' }; no token -> 401.
  // DO NOT upgrade this to a happy-path 200 — a real { fund } body enters the throw-prone engine.
  // NOTE: makeApp 415s a body-less POST, so ALWAYS `.send({})` (sets application/json).
  it('mounts capital-allocation on the makeApp API surface (400 invalid_request, not 404/401)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .post('/api/capital-allocation/calculate')
      .set('Authorization', await nonAdminAuthorizationHeader())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_request' });
  }, 30_000);

  // (b) Auth-boundary sanity. This 401 is the PRE-EXISTING global /api boundary, NOT the mount
  // (a no-token POST 401s whether or not capital-allocation is mounted). Boundary check only.
  it('401s an unauthenticated POST /api/capital-allocation/calculate at the global /api boundary', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).post('/api/capital-allocation/calculate').send({});
    expect(res.status).toBe(401);
  }, 30_000);

  // (c) Second-route coverage (belt-and-suspenders; both routes share ONE default router, so (a)
  // already proves the mount). /validate runs `schema.parse({})` which THROWS a ZodError -> errorHandler.
  // Mounted -> 400/500 (error path); unmounted -> catch-all 404. Do NOT hard-pin the status.
  it('reaches the /validate handler when mounted (not 401/404 with a token)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .post('/api/capital-allocation/validate')
      .set('Authorization', await nonAdminAuthorizationHeader())
      .send({});

    expect([401, 404]).not.toContain(res.status);
  }, 30_000);
});
