import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PortfolioCompanyMock = {
  id: number;
  fundId: number;
  name: string;
  sector: string;
  stage: string;
  status: string;
  investmentAmount: string;
  deployedReservesCents: number;
  plannedReservesCents: number;
  exitMoicBps: number | null;
  ownershipCurrentPct: string;
  allocationCapCents: number | null;
  allocationReason: string | null;
  lastAllocationAt: Date | null;
};

type CompanyListResponseBody = {
  companies: Array<{ id: number }>;
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
};

type CompanyListSortBy = 'exit_moic_desc' | 'planned_reserves_desc' | 'name_asc';

const dbState = vi.hoisted(() => ({
  db: {
    select: vi.fn(() => {
      throw new Error('database branch should not run in memory cursor tests');
    }),
  },
}));

const writeState = vi.hoisted(() => ({
  applyAllocationUpdates: vi.fn(),
  transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn({ kind: 'mock-client' })),
}));

const fundScopeState = vi.hoisted(() => ({
  enforceProvidedFundScope: vi.fn(async (_req: Request, _res: Response, _fundId: number) => true),
}));

const storageState = vi.hoisted(() => ({
  kind: 'memory',
  getPortfolioCompanies: vi.fn(async (): Promise<PortfolioCompanyMock[]> => []),
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
  storage: storageState,
}));

import allocationsRouter from '../../../server/routes/allocations';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.rid = 'alloc-keyset-rid';
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

function companyRow(overrides: Partial<PortfolioCompanyMock>): PortfolioCompanyMock {
  return {
    id: 1,
    fundId: 1,
    name: 'Company',
    sector: 'SaaS',
    stage: 'Seed',
    status: 'active',
    investmentAmount: '1000000',
    deployedReservesCents: 0,
    plannedReservesCents: 0,
    exitMoicBps: null,
    ownershipCurrentPct: '0.10',
    allocationCapCents: null,
    allocationReason: null,
    lastAllocationAt: null,
    ...overrides,
  };
}

function responseBody(response: request.Response): CompanyListResponseBody {
  return response.body as CompanyListResponseBody;
}

describe('allocations company list keyset cursor', () => {
  beforeEach(() => {
    storageState.kind = 'memory';
    storageState.getPortfolioCompanies.mockReset();
    fundScopeState.enforceProvidedFundScope.mockReset();
    fundScopeState.enforceProvidedFundScope.mockResolvedValue(true);
    dbState.db.select.mockClear();
  });

  it.each([
    {
      sortBy: 'exit_moic_desc',
      rows: [
        companyRow({ id: 10, name: 'Alpha', exitMoicBps: 30000 }),
        companyRow({ id: 30, name: 'Beta', exitMoicBps: 20000 }),
        companyRow({ id: 20, name: 'Gamma', exitMoicBps: 10000 }),
      ],
    },
    {
      sortBy: 'planned_reserves_desc',
      rows: [
        companyRow({ id: 10, name: 'Alpha', plannedReservesCents: 300_000_00 }),
        companyRow({ id: 30, name: 'Beta', plannedReservesCents: 200_000_00 }),
        companyRow({ id: 20, name: 'Gamma', plannedReservesCents: 100_000_00 }),
      ],
    },
    {
      sortBy: 'name_asc',
      rows: [
        companyRow({ id: 10, name: 'Alpha' }),
        companyRow({ id: 30, name: 'Beta' }),
        companyRow({ id: 20, name: 'Gamma' }),
      ],
    },
  ] satisfies Array<{ sortBy: CompanyListSortBy; rows: PortfolioCompanyMock[] }>)(
    'does not duplicate or skip rows across memory pages sorted by $sortBy',
    async ({ sortBy, rows }) => {
      storageState.getPortfolioCompanies.mockResolvedValue(rows);
      const app = makeApp();

      const firstPage = await request(app)
        .get('/api/funds/1/companies')
        .query({ limit: '2', sortBy });
      const firstBody = responseBody(firstPage);

      expect(firstPage.status).toBe(200);
      expect(firstBody.companies.map((company) => company.id)).toEqual([10, 30]);
      expect(firstBody.pagination.next_cursor).toEqual(expect.any(String));
      expect(firstBody.pagination.has_more).toBe(true);

      const secondPage = await request(app)
        .get('/api/funds/1/companies')
        .query({ limit: '2', sortBy, cursor: firstBody.pagination.next_cursor });
      const secondBody = responseBody(secondPage);
      const combinedIds = [
        ...firstBody.companies.map((company) => company.id),
        ...secondBody.companies.map((company) => company.id),
      ];

      expect(secondPage.status).toBe(200);
      expect(secondBody.companies.map((company) => company.id)).toEqual([20]);
      expect(secondBody.pagination).toEqual({ next_cursor: null, has_more: false });
      expect(combinedIds).toEqual([10, 30, 20]);
      expect(new Set(combinedIds).size).toBe(combinedIds.length);
      expect(dbState.db.select).not.toHaveBeenCalled();
    }
  );
});
