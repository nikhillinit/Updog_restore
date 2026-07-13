import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FundCompanyActualsFactSchema,
  type FundCompanyActualsFact,
} from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';

const fundScopeState = vi.hoisted(() => ({
  enforceCompanyFundScope: vi.fn(async (_req: Request, _res: Response, _companyId: number) => true),
}));

const fundAccessState = vi.hoisted(() => ({
  requireFundAccess: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

const factsState = vi.hoisted(() => {
  class FundActualsFactsServiceError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = 'FundActualsFactsServiceError';
      this.status = status;
      this.code = code;
    }
  }

  return {
    buildFundCompanyActualsFacts: vi.fn(),
    FundActualsFactsServiceError,
  };
});

// Chain-safe db stub: every builder method is a spy; terminal awaits resolve to
// empty/benign values so a neutered guard (negative control) falls through to a
// harmless 404 instead of throwing mid-chain before the assertion runs.
const dbState = vi.hoisted(() => {
  const selectChain: Record<string, unknown> = {};
  selectChain['from'] = vi.fn(() => selectChain);
  selectChain['where'] = vi.fn(() => selectChain);
  selectChain['limit'] = vi.fn(async () => [] as unknown[]);

  const insertChain: Record<string, unknown> = {};
  insertChain['values'] = vi.fn(() => insertChain);
  insertChain['returning'] = vi.fn(async () => [{ id: '00000000-0000-0000-0000-000000000999' }]);

  const deleteChain: Record<string, unknown> = {};
  deleteChain['where'] = vi.fn(async () => undefined);

  const updateChain: Record<string, unknown> = {};
  updateChain['set'] = vi.fn(() => updateChain);
  updateChain['where'] = vi.fn(async () => undefined);

  const select = vi.fn(() => selectChain);
  const insert = vi.fn(() => insertChain);
  const update = vi.fn(() => updateChain);
  const remove = vi.fn(() => deleteChain);
  const transaction = vi.fn(async () => undefined);
  const findFirst = vi.fn(async () => undefined);
  return { select, insert, update, remove, transaction, findFirst };
});

vi.mock('../../../server/lib/auth/company-fund-scope', () => ({
  enforceCompanyFundScope: fundScopeState.enforceCompanyFundScope,
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (_req: Request, _res: Response, next: () => void) => next(),
  requireFundAccess: fundAccessState.requireFundAccess,
}));

vi.mock('../../../server/services/fund-actuals/fund-company-actuals-facts-service', () => ({
  buildFundCompanyActualsFacts: factsState.buildFundCompanyActualsFacts,
  FundActualsFactsServiceError: factsState.FundActualsFactsServiceError,
}));

vi.mock('../../../server/db', () => ({
  db: {
    select: dbState.select,
    insert: dbState.insert,
    update: dbState.update,
    delete: dbState.remove,
    transaction: dbState.transaction,
    query: { scenarios: { findFirst: dbState.findFirst } },
  },
}));

import scenarioAnalysisRouter from '../../../server/routes/scenario-analysis';

const SCENARIO_ID = '00000000-0000-0000-0000-000000000101';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', scenarioAnalysisRouter);
  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  return app;
}

function denyOnce() {
  fundScopeState.enforceCompanyFundScope.mockImplementationOnce(
    async (_req: Request, res: Response) => {
      res.status(403).json({ error: 'Forbidden', code: 'FUND_ACCESS_DENIED' });
      return false;
    }
  );
}

function resetState() {
  fundScopeState.enforceCompanyFundScope.mockReset();
  fundScopeState.enforceCompanyFundScope.mockResolvedValue(true);
  dbState.select.mockClear();
  dbState.insert.mockClear();
  dbState.update.mockClear();
  dbState.remove.mockClear();
  dbState.transaction.mockClear();
  dbState.findFirst.mockClear();
  fundAccessState.requireFundAccess.mockReset();
  fundAccessState.requireFundAccess.mockImplementation(
    (_req: Request, _res: Response, next: NextFunction) => next()
  );
  factsState.buildFundCompanyActualsFacts.mockReset();
}

function denyFundAccessOnce() {
  fundAccessState.requireFundAccess.mockImplementationOnce(
    (_req: Request, res: Response, _next: NextFunction) => {
      res.status(403).json({ error: 'Forbidden' });
    }
  );
}

function makeFact(overrides: Partial<FundCompanyActualsFact> = {}): FundCompanyActualsFact {
  return FundCompanyActualsFactSchema.parse({
    fundId: 7,
    companyId: 101,
    companyName: 'Acme Robotics',
    investmentIds: [201],
    activeRoundIds: [301],
    approvedPlanningFmvMarkId: 401,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '500000.000000',
    followOnInvestmentAmount: '250000.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: '2025-02-01',
    latestRoundValuation: '12000000.000000',
    latestPlanningFmvDate: '2026-06-01',
    latestPlanningFmvValue: '14000000.000000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'fund-company-actuals-facts',
        engineVersion: 'fund-company-actuals-facts-v1',
        inputHash: 'a'.repeat(64),
        assumptionsHash: 'b'.repeat(64),
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: 'c'.repeat(64),
    ...overrides,
  });
}

function makeBlockedFact(): FundCompanyActualsFact {
  const warning = {
    code: 'CURRENCY_MISMATCH_BLOCK',
    severity: 'blocking',
    message: 'The source currency does not match the fund base currency.',
    source: 'company:102',
  } as const;

  return makeFact({
    companyId: 102,
    companyName: 'Blocked Robotics',
    currency: 'EUR',
    currencyStatus: 'mismatch_blocked',
    planningFmvStatus: 'blocked',
    warnings: [warning],
    provenance: {
      trustState: 'UNAVAILABLE',
      core: {
        sourceKind: 'computed',
        actionability: 'quarantined',
        sourceEngine: 'fund-company-actuals-facts',
        engineVersion: 'fund-company-actuals-facts-v1',
        inputHash: 'd'.repeat(64),
        assumptionsHash: 'e'.repeat(64),
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: false,
        quarantineReason: 'currency_mismatch',
        warnings: [],
      },
      structuredWarnings: [warning],
    },
    inputHash: 'f'.repeat(64),
  });
}

function factsResponse(asOfDate = '2026-07-13') {
  return {
    fundId: 7,
    asOfDate,
    facts: [makeFact(), makeBlockedFact()],
    inputHash: '9'.repeat(64),
    generatedAt: '2026-07-13T00:00:00.000Z',
  };
}

function expectNoScenarioWrites() {
  expect(dbState.insert).not.toHaveBeenCalled();
  expect(dbState.update).not.toHaveBeenCalled();
  expect(dbState.remove).not.toHaveBeenCalled();
  expect(dbState.transaction).not.toHaveBeenCalled();
}

afterEach(() => vi.useRealTimers());

describe('scenario-analysis route fund-scope contracts', () => {
  beforeEach(() => resetState());

  it('denies a cross-fund scenario read before any db read', async () => {
    denyOnce();
    const res = await request(makeApp()).get(`/api/companies/7/scenarios/${SCENARIO_ID}`);
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.select).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scenario create before the write', async () => {
    denyOnce();
    const res = await request(makeApp()).post('/api/companies/7/scenarios').send({ name: 'probe' });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.insert).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scenario update before the read or write', async () => {
    denyOnce();
    const res = await request(makeApp())
      .patch(`/api/companies/7/scenarios/${SCENARIO_ID}`)
      .send({ scenario_id: SCENARIO_ID, cases: [] });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.select).not.toHaveBeenCalled();
    expect(dbState.transaction).not.toHaveBeenCalled();
  });

  it('denies a cross-fund scenario delete before the read or write', async () => {
    denyOnce();
    const res = await request(makeApp()).delete(`/api/companies/7/scenarios/${SCENARIO_ID}`);
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.select).not.toHaveBeenCalled();
    expect(dbState.remove).not.toHaveBeenCalled();
  });

  it('denies a cross-fund reserves optimize before the read', async () => {
    denyOnce();
    const res = await request(makeApp())
      .post('/api/companies/7/reserves/optimize')
      .send({ scenario_id: SCENARIO_ID });
    expect(res.status).toBe(403);
    expect(fundScopeState.enforceCompanyFundScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      7
    );
    expect(dbState.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical companyId before the scope check and any read', async () => {
    const res = await request(makeApp()).get(`/api/companies/0/scenarios/${SCENARIO_ID}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid company ID' });
    expect(fundScopeState.enforceCompanyFundScope).not.toHaveBeenCalled();
    expect(dbState.select).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric companyId on create before the scope check and any write', async () => {
    const res = await request(makeApp())
      .post('/api/companies/abc/scenarios')
      .send({ name: 'probe' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid company ID' });
    expect(fundScopeState.enforceCompanyFundScope).not.toHaveBeenCalled();
    expect(dbState.insert).not.toHaveBeenCalled();
  });
});

describe('scenario-analysis actuals-backed seed suggestions', () => {
  beforeEach(() => resetState());

  it('rejects a non-canonical fundId before the fund guard or facts service', async () => {
    const res = await request(makeApp()).get('/api/funds/01/scenario-analysis/seeds');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_fund_id' });
    expect(fundAccessState.requireFundAccess).not.toHaveBeenCalled();
    expect(factsState.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
  });

  it('denies cross-fund access before loading facts', async () => {
    denyFundAccessOnce();

    const res = await request(makeApp()).get('/api/funds/7/scenario-analysis/seeds');

    expect(res.status).toBe(403);
    expect(factsState.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expectNoScenarioWrites();
  });

  it('rejects malformed or extra query values before loading facts', async () => {
    const malformed = await request(makeApp()).get(
      '/api/funds/7/scenario-analysis/seeds?asOfDate=2026-7-1'
    );
    const extra = await request(makeApp()).get(
      '/api/funds/7/scenario-analysis/seeds?asOfDate=2026-07-01&extra=true'
    );

    expect(malformed.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(factsState.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
  });

  it('returns every company seed and performs no scenario writes', async () => {
    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce(factsResponse('2026-07-01'));

    const res = await request(makeApp()).get(
      '/api/funds/7/scenario-analysis/seeds?asOfDate=2026-07-01'
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fundId: 7,
      asOfDate: '2026-07-01',
      factsStatus: 'available',
      factsInputHash: '9'.repeat(64),
    });
    expect(res.body.seeds).toHaveLength(2);
    expect(res.body.seeds[0].fields.investment).toMatchObject({
      status: 'seeded',
      value: '500000.000000',
    });
    expect(res.body.seeds[1].fields.investment).toMatchObject({
      status: 'unavailable',
      reason: 'currency_blocked',
    });
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: '2026-07-01',
    });
    expect(res.headers['cache-control']).toBeUndefined();
    expectNoScenarioWrites();
  });

  it.each([
    ['fund ID', { fundId: 8 }],
    ['as-of date', { asOfDate: '2026-07-12' }],
  ] as const)(
    'fails closed when the facts %s does not match the request',
    async (_label, drift) => {
      factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce({
        ...factsResponse('2026-07-13'),
        ...drift,
      });

      const res = await request(makeApp()).get(
        '/api/funds/7/scenario-analysis/seeds?asOfDate=2026-07-13'
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        fundId: 7,
        asOfDate: '2026-07-13',
        factsStatus: 'failed',
        factsInputHash: null,
        seeds: [],
      });
      expectNoScenarioWrites();
    }
  );

  it('defaults asOfDate to the current UTC date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-13T23:59:59.000-07:00'));
    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce(factsResponse('2026-07-14'));

    const res = await request(makeApp()).get('/api/funds/7/scenario-analysis/seeds');

    expect(res.status).toBe(200);
    expect(res.body.asOfDate).toBe('2026-07-14');
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: '2026-07-14',
    });
  });

  it('propagates a facts-service fund-not-found response', async () => {
    factsState.buildFundCompanyActualsFacts.mockRejectedValueOnce(
      new factsState.FundActualsFactsServiceError(404, 'fund_not_found', 'Fund 7 was not found')
    );

    const res = await request(makeApp()).get('/api/funds/7/scenario-analysis/seeds');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'fund_not_found', message: 'Fund 7 was not found' });
    expectNoScenarioWrites();
  });

  it('discloses a non-404 facts failure without returning partial seeds', async () => {
    factsState.buildFundCompanyActualsFacts.mockRejectedValueOnce(
      new Error('database unavailable')
    );

    const res = await request(makeApp()).get('/api/funds/7/scenario-analysis/seeds');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fundId: 7,
      asOfDate: '2026-07-13',
      factsStatus: 'failed',
      factsInputHash: null,
      seeds: [],
    });
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expectNoScenarioWrites();
  });
});
