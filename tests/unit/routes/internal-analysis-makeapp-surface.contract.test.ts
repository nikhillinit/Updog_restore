/**
 * Proves the internal-analysis router is actually REACHABLE on the makeApp
 * surface at the path its manifest probe declares.
 *
 * Two mount conventions coexist: a router may declare bare `/funds/...` paths
 * and be mounted under `/api` (current-forecast), or declare `/api/funds/...`
 * and be mounted at null (investment-ledger). Mixing them serves nothing and
 * every request 404s. `internal-analysis.contract.test.ts` mounts the router
 * itself, so it cannot see that class of mistake; only a real makeApp boot can.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/services/internal-analysis/analysis-checkpoint-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../../server/services/internal-analysis/analysis-checkpoint-service')
  >('../../../server/services/internal-analysis/analysis-checkpoint-service');
  return {
    ...actual,
    // The routes under test reject before any port is touched; stub the DB seam
    // so a boot without Postgres cannot reach it.
    createAnalysisCheckpointPorts: () => ({
      listDrafts: vi.fn().mockResolvedValue([]),
      getDraftById: vi.fn().mockResolvedValue(null),
      getReferenceById: vi.fn().mockResolvedValue(null),
      listRevisionEvents: vi.fn().mockResolvedValue([]),
    }),
  };
});

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

/** The exact path declared by the internal-analysis manifest probe. */
const PROBE_PATH = '/api/funds/abc/internal-analysis/drafts';

function saveEnv(): void {
  for (const key of ENV_KEYS) originalEnv.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
}

function configureTestAuthEnv(): void {
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
  process.env.JWT_SECRET = 'test'.repeat(8);
  process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
  process.env.JWT_AUDIENCE = 'updog-test';
  process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.SESSION_SECRET = 'internal-analysis-surface-session-secret-32';
}

async function makeAppWithTestAuth() {
  configureTestAuthEnv();
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function authorizationHeader(): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '9',
    email: 'internal-analysis-user@example.com',
    role: 'user',
    fundIds: [7],
  })}`;
}

describe('internal-analysis makeApp surface', () => {
  beforeEach(() => {
    saveEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('returns 401 for an unauthenticated draft write', async () => {
    const response = await request(await makeAppWithTestAuth())
      .post(PROBE_PATH)
      .send({});

    // 401, never 404: a 404 here means the router is not mounted where the
    // manifest says it is.
    expect(response.status).toBe(401);
  }, 30_000);

  it('answers the manifest probe with its declared status, not 404', async () => {
    const response = await request(await makeAppWithTestAuth())
      .post(PROBE_PATH)
      .set('Authorization', await authorizationHeader())
      .send({});

    expect(response.status).not.toBe(404);
    // The probe path carries a non-numeric fund id, so the route rejects it
    // before any service work.
    expect(response.status).toBe(400);
  }, 30_000);

  it('mounts the fund-scoped reads on the same surface', async () => {
    const response = await request(await makeAppWithTestAuth())
      .get('/api/funds/abc/internal-analysis/references')
      .set('Authorization', await authorizationHeader());

    expect(response.status).not.toBe(404);
    expect(response.status).toBe(400);
  }, 30_000);
});
