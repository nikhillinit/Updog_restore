import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'bootstrap-test-jwt-secret-minimum-32-characters';
const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'REQUIRE_AUTH',
  'JWT_ALG',
  '_EXPLICIT_JWT_ALG',
  'JWT_SECRET',
  '_EXPLICIT_JWT_SECRET',
  'JWT_ISSUER',
  '_EXPLICIT_JWT_ISSUER',
  'JWT_AUDIENCE',
  '_EXPLICIT_JWT_AUDIENCE',
  'JWT_JWKS_URL',
  '_EXPLICIT_JWT_JWKS_URL',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'ENABLE_QUEUES',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'RATE_LIMIT_REDIS_URL',
  'QUEUE_REDIS_URL',
  'SESSION_REDIS_URL',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const originalEnv = new Map<EnvKey, string | undefined>();

function setAuthEnv(nodeEnv: 'development' | 'test', requireAuth: '0' | '1'): void {
  process.env.NODE_ENV = nodeEnv;
  process.env._EXPLICIT_NODE_ENV = nodeEnv;
  process.env.REQUIRE_AUTH = requireAuth;
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env._EXPLICIT_JWT_SECRET = TEST_SECRET;
  process.env.JWT_ISSUER = 'updog-test';
  process.env._EXPLICIT_JWT_ISSUER = 'updog-test';
  process.env.JWT_AUDIENCE = 'updog-app-test';
  process.env._EXPLICIT_JWT_AUDIENCE = 'updog-app-test';
  delete process.env.JWT_JWKS_URL;
  delete process.env._EXPLICIT_JWT_JWKS_URL;
  process.env.REDIS_URL = 'memory://';
  process.env._EXPLICIT_REDIS_URL = process.env.REDIS_URL;
  process.env.ENABLE_QUEUES = '0';
  process.env.ALLOW_MEMORY_STORAGE = '1';
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.QUEUE_REDIS_URL;
  delete process.env.SESSION_REDIS_URL;
}

async function loadApp() {
  const { makeApp } = await import('../../../server/app');
  return makeApp();
}

async function authorizationHeader(): Promise<string> {
  const { signToken } = await import('../../../server/lib/auth/jwt');
  return `Bearer ${signToken({
    sub: '1',
    email: 'bootstrap-test@example.com',
    role: 'admin',
    fundIds: [],
  })}`;
}

describe('makeApp bootstrap surface', () => {
  beforeEach(() => {
    vi.resetModules();
    originalEnv.clear();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }
    setAuthEnv('test', '1');
  });

  afterEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('accepts browser RUM beacons on /api/metrics/rum', async () => {
    const app = await loadApp();

    const res = await request(app).post('/api/metrics/rum').set('x-rum-sample', '1').send({
      name: 'LCP',
      value: 1200,
      pathname: '/fund-setup',
      rating: 'good',
      navigationType: 'navigate',
      timestamp: Date.now(),
    });

    expect(res.status).toBe(204);
  }, 20_000);

  it('creates funds through POST /api/funds', async () => {
    const app = await loadApp();

    const res = await request(app)
      .post('/api/funds')
      .set('Authorization', await authorizationHeader())
      .set('Idempotency-Key', 'make-app-bootstrap-fund-01')
      .send({
        name: 'Bootstrap Surface Fund',
        size: 100_000_000,
        managementFee: 0.02,
        carryPercentage: 0.2,
        vintageYear: 2026,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data.id');
    expect(res.body).toHaveProperty('message', 'Fund created successfully');
  });

  it('surfaces the variance dashboard route on the bootstrap app', async () => {
    const app = await loadApp();

    const res = await request(app)
      .get('/api/funds/abc/variance-dashboard')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid fund ID');
  });

  it('surfaces the company scenario list on the bootstrap app', async () => {
    const app = await loadApp();

    const res = await request(app)
      .get('/api/companies/01/scenarios')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid company ID' });
  });

  it('surfaces unified fund metrics on the bootstrap app', async () => {
    const app = await loadApp();

    const res = await request(app)
      .get('/api/funds/abc/metrics')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Bad Request');
    expect(res.body).toHaveProperty('message', 'Invalid fund ID');
  });

  it('surfaces persisted performance metrics on the bootstrap app', async () => {
    const app = await loadApp();

    const res = await request(app)
      .get('/api/funds/abc/performance/metrics')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Bad Request');
    expect(res.body).toHaveProperty('message', 'Invalid fund ID');
  });

  it('surfaces pacing history on the bootstrap app', async () => {
    const app = await loadApp();

    const res = await request(app)
      .get('/api/funds/abc/pacing-history')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Bad Request');
    expect(res.body).toHaveProperty('message', 'Invalid fund ID');
  });

  it('keeps the variance dashboard protected on the bootstrap app', async () => {
    const app = await loadApp();

    const res = await request(app).get('/api/funds/1/variance-dashboard');

    expect(res.status).toBe(401);
  });

  it('allows the explicit development auth bypass on the bootstrap app', async () => {
    setAuthEnv('development', '0');
    vi.resetModules();
    const app = await loadApp();

    const res = await request(app).get('/api/funds/1/variance-dashboard');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('returns the variance dashboard shape without triggering the engine guard', async () => {
    const app = await loadApp();

    const res = await request(app)
      .get('/api/funds/1/variance-dashboard')
      .set('Authorization', await authorizationHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('alertsBySeverity');
    expect(res.body.data).toHaveProperty('alertsByseverity');
    expect(res.body.data.alertsByseverity).toEqual(res.body.data.alertsBySeverity);
  });
});
