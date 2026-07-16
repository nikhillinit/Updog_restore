import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Direct investment reads exercise the REAL enforceProvidedFundScope helper
// (signed bearer tokens) while storage is mocked so fund ownership is explicit.
// Authenticated non-LP team members may read across funds; the unscoped list
// path remains closed and explicit ?fundId= behavior remains required.

const TEST_SECRET = 'investments-route-auth-test-secret-minimum-32-chars';
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

const storageState = vi.hoisted(() => ({
  getInvestment: vi.fn(),
  getInvestments: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getInvestment: storageState.getInvestment,
    getInvestments: storageState.getInvestments,
  },
  UnsupportedStorageOperationError: class UnsupportedStorageOperationError extends Error {
    code = 'unsupported_storage_operation';
  },
}));

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
      sub: 'investments-route-user',
      email: 'investments-route@example.com',
      role: 'user',
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
  const { default: investmentsRouter } = await import('../../../server/routes/investments');
  const app = express();
  app.use(express.json());
  app.use('/api', investmentsRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

describe('investments direct-read fund-scope boundary (PR-H1)', () => {
  const originalEnv = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    setJwtEnv();
    storageState.getInvestment.mockReset();
    storageState.getInvestments.mockReset();
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

  describe('GET /api/investments/:id', () => {
    it('allows a team member to read an investment from another fund', async () => {
      storageState.getInvestment.mockResolvedValue({ id: 5, fundId: 2, name: 'Secret Co' });
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments/5')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 5, fundId: 2, name: 'Secret Co' });
    });

    it('returns the investment when it belongs to a fund in the caller scope', async () => {
      storageState.getInvestment.mockResolvedValue({ id: 5, fundId: 1, name: 'My Co' });
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments/5')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 5, fundId: 1, name: 'My Co' });
    });

    it('returns 404 for a missing investment without leaking existence via scope checks', async () => {
      storageState.getInvestment.mockResolvedValue(undefined);
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments/999')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: 'Investment not found' });
    });

    it('rejects a NULL-fund investment as unscopeable', async () => {
      storageState.getInvestment.mockResolvedValue({ id: 7, fundId: null, name: 'Orphan' });
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments/7')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'invalid_investment_fund_scope' });
    });
  });

  describe('GET /api/investments (list)', () => {
    it('closes the unscoped list path: requires an explicit fundId', async () => {
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: 'fund_scope_required' });
      expect(storageState.getInvestments).not.toHaveBeenCalled();
    });

    it('allows a team member to list investments for another fund', async () => {
      storageState.getInvestments.mockResolvedValue([{ id: 10, fundId: 2, name: 'Other Fund' }]);
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments?fundId=2')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: 10, fundId: 2, name: 'Other Fund' }]);
      expect(storageState.getInvestments).toHaveBeenCalledWith(2);
    });

    it('preserves the scoped list for ?fundId= within the caller scope', async () => {
      storageState.getInvestments.mockResolvedValue([{ id: 9, fundId: 1, name: 'In Scope' }]);
      const app = await makeApp();
      const token = signToken({ fundIds: [1] });

      const response = await request(app)
        .get('/api/investments?fundId=1')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: 9, fundId: 1, name: 'In Scope' }]);
      expect(storageState.getInvestments).toHaveBeenCalledWith(1);
    });
  });
});
