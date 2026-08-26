import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'portfolio-companies-route-auth-test-secret-minimum-32-chars';
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

interface TestPortfolioCompany {
  id: number;
  fundId: number;
  name: string;
  sector: string;
  stage: string;
  currentStage: string | null;
  investmentAmount: string;
  investmentDate: Date | null;
  currentValuation: string | null;
  foundedYear: number | null;
  status: string;
  description: string | null;
  dealTags: string[] | null;
  createdAt: Date;
}

const storageState = vi.hoisted(() => ({
  createPortfolioCompany: vi.fn(),
  getPortfolioCompany: vi.fn(),
}));

const readServiceState = vi.hoisted(() => ({
  listCompanies: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    createPortfolioCompany: storageState.createPortfolioCompany,
    getPortfolioCompany: storageState.getPortfolioCompany,
  },
}));

vi.mock('../../../server/services/portfolio-time-machine-read', () => ({
  portfolioTimeMachineReadService: {
    listCompanies: readServiceState.listCompanies,
  },
}));

function portfolioCompany(overrides: Partial<TestPortfolioCompany> = {}): TestPortfolioCompany {
  return {
    id: 10,
    fundId: 1,
    name: 'Scoped Co',
    sector: 'Enterprise',
    stage: 'Seed',
    currentStage: null,
    investmentAmount: '1000000.00',
    investmentDate: null,
    currentValuation: '5000000.00',
    foundedYear: null,
    status: 'active',
    description: null,
    dealTags: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function listResponse(companies: TestPortfolioCompany[]) {
  return {
    companies,
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
      sub: 'portfolio-companies-route-user',
      email: 'portfolio-companies-route@example.com',
      role: 'user',
      fundIds,
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
  const { default: portfolioCompaniesRouter } =
    await import('../../../server/routes/portfolio-companies');
  const app = express();
  app.use(express.json());
  app.use('/api', portfolioCompaniesRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

describe('portfolio companies fund-scope boundary', () => {
  const originalEnv = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    setJwtEnv();
    storageState.createPortfolioCompany.mockReset();
    storageState.getPortfolioCompany.mockReset();
    readServiceState.listCompanies.mockReset();
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

  it('rejects list requests without fundId before reading companies', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-companies')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'fund_scope_required' });
    expect(readServiceState.listCompanies).not.toHaveBeenCalled();
  });

  it('preserves scoped list requests with fundId', async () => {
    const company = portfolioCompany({ fundId: 1 });
    readServiceState.listCompanies.mockResolvedValueOnce(listResponse([company]));
    const app = await makeApp();

    const response = await request(app)
      .get('/api/portfolio-companies?fundId=1')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(200);
    expect(response.body.companies).toHaveLength(1);
    expect(response.body.companies[0]).toMatchObject({ id: 10, fundId: 1, name: 'Scoped Co' });
    expect(readServiceState.listCompanies).toHaveBeenCalledWith(1, {});
  });

  it('rejects detail requests without fundId before reading the company', async () => {
    const app = await makeApp();
    const response = await request(app)
      .get('/api/portfolio-companies/10')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'fund_scope_required' });
    expect(storageState.getPortfolioCompany).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested company belongs to a different fund', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce(portfolioCompany({ fundId: 1 }));
    const app = await makeApp();

    const response = await request(app)
      .get('/api/portfolio-companies/10?fundId=2')
      .set('Authorization', `Bearer ${signToken([2])}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'Company not found' });
    expect(storageState.getPortfolioCompany).toHaveBeenCalledWith(10);
  });

  it('returns the company when the fundId matches the stored company', async () => {
    storageState.getPortfolioCompany.mockResolvedValueOnce(portfolioCompany({ fundId: 1 }));
    const app = await makeApp();

    const response = await request(app)
      .get('/api/portfolio-companies/10?fundId=1')
      .set('Authorization', `Bearer ${signToken([1])}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 10, fundId: 1, name: 'Scoped Co' });
    expect(storageState.getPortfolioCompany).toHaveBeenCalledWith(10);
  });
});
