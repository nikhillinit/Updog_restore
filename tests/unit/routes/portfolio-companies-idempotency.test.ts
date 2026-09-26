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
  kind: 'database' as 'database' | 'memory',
  getPortfolioCompany: vi.fn(),
  createPortfolioCompany: vi.fn(),
}));
const createWithReceipt = vi.hoisted(() => vi.fn());

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
  createPortfolioCompanyWithReceipt: createWithReceipt,
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
    storageMock.kind = 'database';
  });

  it('rejects POST /portfolio-companies without an idempotency-key header', async () => {
    const res = await request(makeApp()).post('/portfolio-companies').send(validBody);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(createWithReceipt).not.toHaveBeenCalled();
  });

  it('accepts POST /portfolio-companies with idempotency-key header', async () => {
    createWithReceipt.mockResolvedValueOnce({ row: { id: 99, ...validBody }, replayed: false });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotency-key', 'test-create-key')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.headers['idempotency-replay']).toBeUndefined();
  });

  it('accepts x-idempotency-key header variant', async () => {
    createWithReceipt.mockResolvedValueOnce({ row: { id: 100, ...validBody }, replayed: false });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('x-idempotency-key', 'alt-key-100')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.headers['idempotency-replay']).toBeUndefined();
  });

  it('passes each accepted header variant to the durable create as the key', async () => {
    createWithReceipt.mockResolvedValue({ row: { id: 102, ...validBody }, replayed: false });

    for (const header of ['idempotency-key', 'x-idempotency-key', 'idempotent-key']) {
      await request(makeApp())
        .post('/portfolio-companies')
        .set(header, `${header}-102`)
        .send(validBody);
    }

    expect(createWithReceipt.mock.calls.map((call) => call[1])).toEqual([
      'idempotency-key-102',
      'x-idempotency-key-102',
      'idempotent-key-102',
    ]);
  });

  it('keeps the memory store create path in memory mode', async () => {
    storageMock.kind = 'memory';
    storageMock.createPortfolioCompany.mockResolvedValueOnce({ id: 104, ...validBody });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotency-key', 'memory-key-104')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(storageMock.createPortfolioCompany).toHaveBeenCalledTimes(1);
    expect(createWithReceipt).not.toHaveBeenCalled();
  });

  it('replays an existing create with 200 and Idempotency-Replay', async () => {
    createWithReceipt.mockResolvedValueOnce({ row: { id: 103, ...validBody }, replayed: true });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotency-key', 'replayed-key-103')
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.headers['idempotency-replay']).toBe('true');
    expect(res.body).toMatchObject({ id: 103 });
  });

  it('rejects a key longer than 128 characters before the durable create', async () => {
    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotency-key', 'k'.repeat(129))
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(createWithReceipt).not.toHaveBeenCalled();
  });

  it('accepts idempotent-key header variant', async () => {
    createWithReceipt.mockResolvedValueOnce({ row: { id: 101, ...validBody }, replayed: false });

    const res = await request(makeApp())
      .post('/portfolio-companies')
      .set('idempotent-key', 'third-key-101')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.headers['idempotency-replay']).toBeUndefined();
  });
});
