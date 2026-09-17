import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearIdempotencyCache } from '../../../server/middleware/idempotency';

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async () => true),
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('express-rate-limit', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const storageMock = vi.hoisted(() => ({
  createPortfolioCompany: vi.fn(),
  getPortfolioCompany: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../../server/services/portfolio-time-machine-read', () => ({
  portfolioTimeMachineReadService: {
    listCompanies: vi.fn(async () => ({ companies: [], asOf: null })),
  },
}));

vi.mock('../../../server/services/portfolio-company-update-service', () => ({
  updatePortfolioCompanyMetadata: vi.fn(),
  PortfolioCompanyUpdateVersionConflictError: class extends Error {
    readonly code = 'VERSION_CONFLICT';
  },
  PortfolioCompanyUpdateIdempotencyReuseError: class extends Error {
    readonly code = 'IDEMPOTENCY_KEY_REUSE';
  },
  PortfolioCompanyUpdateNotFoundError: class extends Error {
    readonly code = 'COMPANY_NOT_FOUND';
  },
}));

const redisMock = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  setex: vi.fn(async () => 'OK'),
  del: vi.fn(async () => 0),
}));

vi.mock('../../../server/lib/redis', () => ({
  maybeRedis: () => redisMock,
}));

import portfolioCompaniesRouter from '../../../server/routes/portfolio-companies';

function makeApp(fundIds: number[] = [1], role = 'analyst') {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: '42',
      sub: '42',
      email: `${role}@example.com`,
      role,
      roles: [role],
      fundIds,
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use(portfolioCompaniesRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

const validBody = {
  fundId: 1,
  name: 'Test Company Inc',
  sector: 'SaaS',
  stage: 'Seed',
  investmentAmount: '100000.00',
  status: 'active',
};

describe('portfolio-companies POST idempotency guard (A6)', () => {
  beforeEach(() => {
    clearIdempotencyCache();
    vi.clearAllMocks();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
  });

  it('rejects POST /portfolio-companies without an idempotency-key header', async () => {
    const res = await request(makeApp()).post('/portfolio-companies').send(validBody);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(storageMock.createPortfolioCompany).not.toHaveBeenCalled();
  });

  it('accepts POST /portfolio-companies with idempotency-key header', async () => {
    storageMock.createPortfolioCompany.mockResolvedValueOnce({ id: 99, ...validBody });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotency-key', 'test-create-key')
      .send(validBody);

    expect(res.status).toBe(201);
  });

  it('accepts x-idempotency-key header variant', async () => {
    storageMock.createPortfolioCompany.mockResolvedValueOnce({ id: 100, ...validBody });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('x-idempotency-key', 'alt-key-100')
      .send(validBody);

    expect(res.status).toBe(201);
  });

  it('accepts idempotent-key header variant', async () => {
    storageMock.createPortfolioCompany.mockResolvedValueOnce({ id: 101, ...validBody });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotent-key', 'third-key-101')
      .send(validBody);

    expect(res.status).toBe(201);
  });
});
