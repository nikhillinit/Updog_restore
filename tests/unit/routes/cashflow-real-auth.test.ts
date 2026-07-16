import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'cashflow-route-auth-test-secret-minimum-32-chars';
const TEST_ISSUER = 'updog-test';
const TEST_AUDIENCE = 'updog-app-test';
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
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function setJwtEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env._EXPLICIT_NODE_ENV = 'test';
  process.env.REQUIRE_AUTH = '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env._EXPLICIT_JWT_SECRET = TEST_SECRET;
  process.env.JWT_ISSUER = TEST_ISSUER;
  process.env._EXPLICIT_JWT_ISSUER = TEST_ISSUER;
  process.env.JWT_AUDIENCE = TEST_AUDIENCE;
  process.env._EXPLICIT_JWT_AUDIENCE = TEST_AUDIENCE;
}

function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(
    {
      sub: 'cashflow-route-user',
      email: 'cashflow-route@example.com',
      role: 'analyst',
      ...payload,
    },
    TEST_SECRET,
    {
      algorithm: 'HS256',
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      expiresIn: '1h',
    }
  );
}

async function makeApp() {
  const { default: cashflowRouter } = await import('../../../server/routes/cashflow');
  const app = express();
  app.use(express.json());
  app.use('/api/cashflow', cashflowRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

describe('cashflow route real bearer fund scope', () => {
  const originalEnv = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    setJwtEnv();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('allows a team member to read an out-of-scope fund using the real bearer-token helper', async () => {
    const app = await makeApp();
    const token = signToken({ fundIds: [1] });

    const response = await request(app)
      .get('/api/cashflow/2/transactions')
      .set('Authorization', `Bearer ${token}`);

    // Universal read: a team member may read any fund on safe methods.
    expect(response.status).not.toBe(403);
  });

  it('rejects a non-canonical route fundId instead of authorizing its numeric alias', async () => {
    const app = await makeApp();
    const token = signToken({ fundIds: [1] });

    const response = await request(app)
      .get('/api/cashflow/01/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('canonical positive integer');
  });
});
