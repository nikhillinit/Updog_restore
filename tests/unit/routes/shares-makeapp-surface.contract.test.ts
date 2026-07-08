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

describe('shares makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  // (a) Management mount + reachability. A fund-1 token clears the global /api auth boundary AND
  // the handler's requireAuthenticatedUser + canManageFund into the service. Mounted -> 200 or a
  // DB-stub 500 (REFL-037); never 401/404. Unmounted -> makeApp catch-all 404 { error: 'not_found' }.
  it('mounts the shares management router on the production makeApp API surface', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app)
      .get('/api/shares?fundId=1')
      .set('Authorization', await nonAdminAuthorizationHeader());

    expect([401, 404]).not.toContain(res.status);
  }, 30_000);

  // (b) Management auth boundary. This 401 is the PRE-EXISTING global /api boundary, NOT the mount
  // (GET /api/shares 401s with no token whether or not shares is mounted). Boundary sanity check.
  it('401s an unauthenticated GET /api/shares at the pre-existing global /api boundary', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/shares?fundId=1');
    expect(res.status).toBe(401);
  }, 30_000);

  // (c) Public GET mount + anonymous bypass. isPublicApiPath whitelists GET /public/shares/:id so
  // the global /api auth bypasses (status !== 401 proves the bypass). Mounted -> router 404
  // { error: 'Share not found' } or a DB-stub 500; NEITHER is the catch-all { error: 'not_found' }.
  // Unmounted -> catch-all 404 { error: 'not_found' } (the mount RED). Do NOT hard-pin 404.
  it('reaches the public shares GET handler anonymously (mount + isPublicApiPath bypass)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).get('/api/public/shares/nonexistent-share-id');

    expect(res.status).not.toBe(401);
    expect(res.body).not.toMatchObject({ error: 'not_found' });
  }, 30_000);

  // (d) PRIMARY public proof. POST .send({}) sets application/json (clears the 415 guard).
  // isPublicApiPath whitelists POST /public/shares/:id/verify -> auth bypass -> the passkey Zod
  // schema rejects {} BEFORE any DB lookup -> 400 { error: 'Validation error' }. DB-independent.
  // Discriminates BOTH failures: unmounted -> 404 not_found; broken bypass -> 401.
  it('reaches the public verify handler anonymously and 400s an empty body (load-bearing public proof)', async () => {
    const app = await makeAppWithTestAuth();
    const res = await request(app).post('/api/public/shares/nonexistent-share-id/verify').send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Validation error' });
  }, 30_000);
});
