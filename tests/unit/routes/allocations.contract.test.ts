import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = PromiseLike<unknown[]> & {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

const dbState = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
  };

  function next(): unknown[] {
    return state.selectResults.shift() ?? [];
  }

  function thenFor(result: unknown[]): QueryChain['then'] {
    return (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected);
  }

  function makeQuery(result: unknown[]): QueryChain {
    const query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(result)),
      then: thenFor(result),
    } as QueryChain;
    return query;
  }

  const db = {
    select: vi.fn(() => makeQuery(next())),
  };

  return { db, state };
});

const writeState = vi.hoisted(() => ({
  applyAllocationUpdates: vi.fn(),
  transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn({ kind: 'mock-client' })),
}));

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(
    async (_req: Request, _res: Response, _fundId: number) => true
  ),
}));

vi.mock('../../../server/db', () => ({ db: dbState.db }));

vi.mock('../../../server/db/pg-circuit', () => ({
  transaction: writeState.transaction,
}));

vi.mock('../../../server/services/allocation-write-service.js', () => ({
  applyAllocationUpdates: writeState.applyAllocationUpdates,
}));

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: fundScopeState.enforceProvidedFundScope,
}));

vi.mock('../../../server/lib/stage-validation-mode', () => ({
  getStageValidationMode: vi.fn(async () => 'warn'),
}));

vi.mock('../../../server/observability/stage-metrics', () => ({
  recordValidationDuration: vi.fn(),
  recordValidationSuccess: vi.fn(),
  recordUnknownStage: vi.fn(),
}));

vi.mock('../../../server/middleware/deprecation-headers', () => ({
  setStageWarningHeaders: vi.fn(),
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../server/storage', () => ({
  storage: { getPortfolioCompanies: vi.fn(async () => []) },
}));

import allocationsRouter from '../../../server/routes/allocations';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.rid = 'alloc-contract-rid';
    req.user = {
      id: '42',
      sub: '42',
      email: 'admin@example.com',
      role: 'admin',
      roles: ['admin'],
      fundIds: [1],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    };
    next();
  });
  app.use('/api', allocationsRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function resetState() {
  dbState.state.selectResults = [];
  dbState.db.select.mockClear();
  writeState.applyAllocationUpdates.mockReset();
  writeState.transaction.mockClear();
  fundScopeState.enforceProvidedFundScope.mockReset();
  fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
}

function companyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    fundId: 1,
    name: 'Alpha AI',
    sector: 'SaaS',
    stage: 'Seed',
    status: 'active',
    investmentAmount: '1000000',
    deployedReservesCents: 250_000_00,
    plannedReservesCents: 750_000_00,
    exitMoicBps: 35000,
    ownershipCurrentPct: '0.10',
    allocationCapCents: 2_000_000_00,
    allocationReason: 'contract lock',
    lastAllocationAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('allocations route contracts', () => {
  beforeEach(() => resetState());

  it('GET /api/funds/:fundId/companies rejects invalid fundId before DB access', async () => {
    const response = await request(makeApp()).get('/api/funds/not-a-number/companies');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
    });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('GET /api/funds/:fundId/allocations/latest rejects denied fund scope before data reads', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({
        error: 'Forbidden',
        code: 'FUND_ACCESS_DENIED',
        message: 'You do not have access to fund 2',
      });
      return false;
    });

    const response = await request(makeApp()).get('/api/funds/2/allocations/latest');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
    });
    expect(dbState.db.select).not.toHaveBeenCalled();
  });

  it('GET /api/funds/:fundId/companies locks company-list envelope and snake_case cursor fields', async () => {
    dbState.state.selectResults.push([
      companyRow({ id: 30, name: 'Gamma' }),
      companyRow({ id: 20, name: 'Beta' }),
      companyRow({ id: 10, name: 'Alpha' }),
    ]);

    const response = await request(makeApp()).get(
      '/api/funds/1/companies?limit=2&sortBy=exit_moic_desc'
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['companies', 'pagination']);
    expect(response.body.pagination).toEqual({ next_cursor: '20', has_more: true });
    expect(response.body.companies).toHaveLength(2);
    expect(Object.keys(response.body.companies[0]).sort()).toEqual([
      'allocation_cap_cents',
      'allocation_reason',
      'deployed_reserves_cents',
      'exit_moic_bps',
      'fundId',
      'id',
      'invested_cents',
      'last_allocation_at',
      'name',
      'ownership_pct',
      'planned_reserves_cents',
      'sector',
      'stage',
      'status',
    ]);
  });

  it('GET /api/funds/:fundId/allocations/latest locks latest-allocation response shape', async () => {
    dbState.state.selectResults.push([{ id: 1 }]);
    dbState.state.selectResults.push([
      {
        company_id: 11,
        company_name: 'Alpha AI',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        invested_amount: '1000000',
        planned_reserves_cents: 750_000_00,
        deployed_reserves_cents: 250_000_00,
        allocation_cap_cents: 2_000_000_00,
        allocation_reason: 'contract lock',
        allocation_version: 3,
        last_allocation_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const response = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      fund_id: 1,
      companies: [
        {
          company_id: 11,
          company_name: 'Alpha AI',
          sector: 'SaaS',
          stage: 'Seed',
          status: 'active',
          invested_amount_cents: 100_000_000,
          planned_reserves_cents: 75_000_000,
          deployed_reserves_cents: 25_000_000,
          allocation_cap_cents: 200_000_000,
          allocation_reason: 'contract lock',
          allocation_version: 3,
          last_allocation_at: '2026-01-01T00:00:00.000Z',
          allocation_facts_missing: false,
          missing_allocation_fields: [],
        },
      ],
      metadata: {
        total_planned_cents: 75_000_000,
        total_deployed_cents: 25_000_000,
        companies_count: 1,
        allocation_facts_missing_count: 0,
        last_updated_at: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('POST /api/funds/:fundId/allocations rejects invalid body with current error envelope', async () => {
    const response = await request(makeApp()).post('/api/funds/1/allocations').send({
      expected_version: 1,
      updates: [],
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'Invalid request body' });
    expect(writeState.applyAllocationUpdates).not.toHaveBeenCalled();
  });

  it('POST /api/funds/:fundId/allocations rejects denied fund scope before writes', async () => {
    fundScopeState.enforceProvidedFundScope.mockImplementationOnce(async (_req, res) => {
      res.status(403).json({
        error: 'Forbidden',
        code: 'FUND_ACCESS_DENIED',
        message: 'You do not have access to fund 2',
      });
      return false;
    });

    const response = await request(makeApp())
      .post('/api/funds/2/allocations')
      .send({
        expected_version: 1,
        updates: [
          {
            company_id: 11,
            planned_reserves_cents: 800_000_00,
          },
        ],
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
    });
    expect(writeState.transaction).not.toHaveBeenCalled();
    expect(writeState.applyAllocationUpdates).not.toHaveBeenCalled();
  });

  it('POST /api/funds/:fundId/allocations maps update payload and returns write result', async () => {
    writeState.applyAllocationUpdates.mockResolvedValueOnce({ new_version: 2, updated_count: 1 });

    const response = await request(makeApp())
      .post('/api/funds/1/allocations')
      .send({
        expected_version: 1,
        updates: [
          {
            company_id: 11,
            planned_reserves_cents: 800_000_00,
            allocation_cap_cents: null,
            allocation_reason: 'increase reserves',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, new_version: 2, updated_count: 1 });
    expect(writeState.applyAllocationUpdates).toHaveBeenCalledWith(
      { kind: 'mock-client' },
      {
        fundId: 1,
        updates: [
          {
            company_id: 11,
            planned_reserves_cents: 800_000_00,
            allocation_cap_cents: null,
            allocation_reason: 'increase reserves',
            expected_version: 1,
          },
        ],
        userId: 42,
      }
    );
  });
});
