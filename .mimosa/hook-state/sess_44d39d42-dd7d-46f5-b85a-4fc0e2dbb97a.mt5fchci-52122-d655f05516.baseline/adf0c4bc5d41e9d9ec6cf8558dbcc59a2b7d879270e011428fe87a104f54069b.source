import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'portfolio-overview-route-auth-test-secret-minimum-32-chars';
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

const serviceState = vi.hoisted(() => ({ getPortfolioOverview: vi.fn() }));

vi.mock('../../../server/services/portfolio-overview-service', () => ({
  getPortfolioOverview: serviceState.getPortfolioOverview,
}));

function overviewFixture() {
  return {
    fundId: 1,
    generatedAt: '2026-06-24T00:00:00.000Z',
    currency: 'USD',
    provenance: { isFinanciallyActionable: true },
    sourceRecordCounts: { companies: 0 },
    metrics: {
      totalInvested: '0',
      totalValue: '0',
      averageMOIC: '0',
      returnPct: '0',
      totalCompanies: 0,
      activeCompanies: 0,
      exitedCompanies: 0,
    },
    companies: [],
    meta: {
      mode: 'live',
      requestedAsOf: null,
      resolvedAsOf: null,
      source: 'live',
      historicalAvailable: false,
    },
  };
}

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

function signToken(fundIds: number[]): string {
  return jwt.sign(
    {
      sub: 'portfolio-overview-route-user',
      email: 'portfolio-overview-route@example.com',
      role: 'analyst',
      fundIds,
    },
    TEST_SECRET,
    { algorithm: 'HS256', issuer: TEST_ISSUER, audience: TEST_AUDIENCE, expiresIn: '1h' }
  );
}

async function makeApp() {
  const { default: portfolioOverviewRouter } =
    await import('../../../server/routes/portfolio-overview');
  const app = express();
  app.use(express.json());
  app.use('/api', portfolioOverviewRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

describe('portfolio overview route', () => {
  const originalEnv = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    setJwtEnv();
    serviceState.getPortfolioOverview.mockReset();
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

  it('rejects requests without fundId before calling the service', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-overview')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'fund_scope_required' });
    expect(serviceState.getPortfolioOverview).not.toHaveBeenCalled();
  });

  it('rejects an array-valued fundId (non-string query value)', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-overview?fundId=1&fundId=2')
      .set('Authorization', `Bearer ${signToken([1, 2])}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'fund_scope_required' });
    expect(serviceState.getPortfolioOverview).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical fundId format', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-overview?fundId=0')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_fund_id' });
    expect(serviceState.getPortfolioOverview).not.toHaveBeenCalled();
  });

  it('rejects an array-valued asOf', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-overview?fundId=1&asOf=2025-01&asOf=2025-02')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_as_of' });
    expect(serviceState.getPortfolioOverview).not.toHaveBeenCalled();
  });

  it('allows a team member to read another fund overview (universal read)', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-overview?fundId=1')
      .set('Authorization', `Bearer ${signToken([2])}`);

    expect(response.status).not.toBe(403);
  });

  it('returns 404 when the fund does not exist', async () => {
    const { NotFoundError } = await import('../../../server/errors');
    serviceState.getPortfolioOverview.mockRejectedValueOnce(new NotFoundError('Fund 1 not found'));
    const app = await makeApp();

    const response = await request(app)
      .get('/api/portfolio-overview?fundId=1')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'fund_not_found' });
  });

  it('returns the overview for a scoped live request', async () => {
    serviceState.getPortfolioOverview.mockResolvedValueOnce(overviewFixture());
    const app = await makeApp();

    const response = await request(app)
      .get('/api/portfolio-overview?fundId=1')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ fundId: 1, currency: 'USD' });
    expect(serviceState.getPortfolioOverview).toHaveBeenCalledWith(1, {});
  });

  it('passes parsed asOf and original requestedAsOf to the service for historical requests', async () => {
    serviceState.getPortfolioOverview.mockResolvedValueOnce(overviewFixture());
    const app = await makeApp();

    const response = await request(app)
      .get('/api/portfolio-overview?fundId=1&asOf=2025-01')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(200);
    const [fundIdArg, optionsArg] = serviceState.getPortfolioOverview.mock.calls[0]!;
    expect(fundIdArg).toBe(1);
    expect(optionsArg).toMatchObject({ requestedAsOf: '2025-01' });
    expect(optionsArg.asOf).toBeInstanceOf(Date);
  });
});
