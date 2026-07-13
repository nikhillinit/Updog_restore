import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FundCompanyActualsFactSchema,
  type FundCompanyActualsFact,
} from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  ScenarioCaseSeedV1Schema,
  type ScenarioCaseSeedV1,
} from '../../../shared/contracts/scenarios/scenario-case-seed-v1.contract';

const fundScopeState = vi.hoisted(() => ({
  enforceCompanyFundScope: vi.fn(async (_req: Request, _res: Response, _companyId: number) => true),
  resolveCompanyFundId: vi.fn(async (_companyId: number) => 7 as number | null | undefined),
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

const persistenceState = vi.hoisted(() => {
  class ScenarioCaseSeedPersistenceError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ScenarioCaseSeedPersistenceError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  return {
    createScenarioCaseFromSeed: vi.fn(),
    ScenarioCaseSeedPersistenceError,
  };
});

// Chain-safe db stub: every builder method is a spy; terminal awaits resolve to
// empty/benign values so a neutered guard (negative control) falls through to a
// harmless 404 instead of throwing mid-chain before the assertion runs.
const dbState = vi.hoisted(() => {
  const selectChain: Record<string, unknown> = {};
  selectChain['from'] = vi.fn(() => selectChain);
  selectChain['innerJoin'] = vi.fn(() => selectChain);
  selectChain['where'] = vi.fn(() => selectChain);
  const selectThen = vi.fn((resolve: (value: unknown[]) => void) => resolve([]));
  selectChain['then'] = selectThen;
  const selectLimit = vi.fn(async () => [] as unknown[]);
  selectChain['limit'] = selectLimit;

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
  return { select, selectThen, selectLimit, insert, update, remove, transaction, findFirst };
});

vi.mock('../../../server/lib/auth/company-fund-scope', () => ({
  enforceCompanyFundScope: fundScopeState.enforceCompanyFundScope,
  resolveCompanyFundId: fundScopeState.resolveCompanyFundId,
}));

vi.mock('../../../server/lib/auth/jwt', () => ({
  requireAuth: () => (_req: Request, _res: Response, next: () => void) => next(),
  requireFundAccess: fundAccessState.requireFundAccess,
}));

vi.mock('../../../server/services/fund-actuals/fund-company-actuals-facts-service', () => ({
  buildFundCompanyActualsFacts: factsState.buildFundCompanyActualsFacts,
  FundActualsFactsServiceError: factsState.FundActualsFactsServiceError,
}));

vi.mock('../../../server/services/scenarios/scenario-case-seed-persistence-service', () => ({
  createScenarioCaseFromSeed: persistenceState.createScenarioCaseFromSeed,
  ScenarioCaseSeedPersistenceError: persistenceState.ScenarioCaseSeedPersistenceError,
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

const SCENARIO_ID = '00000000-0000-4000-8000-000000000101';
const SCENARIO_CASE_ID = '00000000-0000-4000-8000-000000000201';
const UNSEEDED_CASE_ID = '00000000-0000-4000-8000-000000000202';

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
  fundScopeState.resolveCompanyFundId.mockReset();
  fundScopeState.resolveCompanyFundId.mockResolvedValue(7);
  dbState.select.mockClear();
  dbState.selectThen.mockReset();
  dbState.selectThen.mockImplementation((resolve: (value: unknown[]) => void) => resolve([]));
  dbState.selectLimit.mockReset();
  dbState.selectLimit.mockResolvedValue([]);
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
  persistenceState.createScenarioCaseFromSeed.mockReset();
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

function makeSeed(overrides: Partial<ScenarioCaseSeedV1> = {}): ScenarioCaseSeedV1 {
  return ScenarioCaseSeedV1Schema.parse({
    contractVersion: 'scenario-case-seed-v1',
    fundId: 7,
    companyId: 101,
    asOfDate: '2026-07-13',
    factsInputHash: 'c'.repeat(64),
    trustState: 'LIVE',
    currencyStatus: 'base_currency',
    fields: {
      investment: {
        status: 'seeded',
        value: '500000.000000',
        source: 'facts.initialInvestmentAmount',
      },
      followOns: {
        status: 'seeded',
        value: '250000.000000',
        source: 'facts.followOnInvestmentAmount',
      },
      fmv: {
        status: 'seeded',
        value: '14000000.000000',
        source: 'facts.latestPlanningFmvValue',
      },
      exitValuation: {
        status: 'user_required',
        value: null,
        marketReference: '12000000.000000',
      },
      probability: { status: 'user_required', value: null },
      ownershipAtExit: { status: 'user_required', value: null },
    },
    warnings: [],
    ...overrides,
  });
}

function validFromSeedBody(overrides: Record<string, unknown> = {}) {
  return {
    seed: makeSeed(),
    overrides: {
      caseName: 'Base case',
      probability: '0.40',
      exitValuation: '20000000.000000',
      monthsToExit: 36,
      ownershipAtExit: '0.20',
    },
    expectedScenarioVersion: 4,
    ...overrides,
  };
}

function expectNoScenarioWrites() {
  expect(dbState.insert).not.toHaveBeenCalled();
  expect(dbState.update).not.toHaveBeenCalled();
  expect(dbState.remove).not.toHaveBeenCalled();
  expect(dbState.transaction).not.toHaveBeenCalled();
}

interface ScenarioCaseRowFixture {
  id: string;
  caseName: string;
  description: string | null;
  probability: string;
  investment: string;
  followOns: string;
  exitProceeds: string;
  exitValuation: string;
  monthsToExit: number | null;
  ownershipAtExit: string | null;
}

interface SeedProvenanceRowFixture {
  scenarioCaseId: string;
  fundId: number;
  companyId: number;
  factsInputHash: string;
  factsAsOfDate: string;
  seededAt: Date;
  trustState: 'LIVE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED';
  currencyStatus: 'base_currency' | 'mismatch_blocked' | 'unknown';
}

function makeScenarioRow() {
  return {
    id: SCENARIO_ID,
    companyId: 101,
    name: 'Actuals-backed scenario',
    description: null,
    version: 4,
    isDefault: false,
    lockedAt: null,
    createdBy: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-12T15:30:00.000Z'),
  };
}

function makeScenarioCaseRow(
  overrides: Partial<ScenarioCaseRowFixture> = {}
): ScenarioCaseRowFixture {
  return {
    id: SCENARIO_CASE_ID,
    caseName: 'Base case',
    description: null,
    probability: '0.40',
    investment: '500000.000000',
    followOns: '250000.000000',
    exitProceeds: '1000000.000000',
    exitValuation: '20000000.000000',
    monthsToExit: 36,
    ownershipAtExit: '0.20',
    ...overrides,
  };
}

function makeSeedProvenanceRow(
  overrides: Partial<SeedProvenanceRowFixture> = {}
): SeedProvenanceRowFixture {
  return {
    scenarioCaseId: SCENARIO_CASE_ID,
    fundId: 7,
    companyId: 101,
    factsInputHash: 'c'.repeat(64),
    factsAsOfDate: '2026-07-01',
    seededAt: new Date('2026-07-01T11:00:00.000Z'),
    trustState: 'LIVE',
    currencyStatus: 'base_currency',
    ...overrides,
  };
}

function mockScenarioRead(
  options: {
    cases?: ScenarioCaseRowFixture[];
    provenance?: unknown[];
  } = {}
) {
  dbState.selectLimit.mockResolvedValueOnce([makeScenarioRow()]);
  dbState.selectThen
    .mockImplementationOnce((resolve: (value: unknown[]) => void) =>
      resolve(options.cases ?? [makeScenarioCaseRow()])
    )
    .mockImplementationOnce((resolve: (value: unknown[]) => void) =>
      resolve(options.provenance ?? [])
    );
}

function currentScenarioReadResponse() {
  return {
    company_name: '',
    company_id: '101',
    scenario: {
      id: SCENARIO_ID,
      company_id: '101',
      name: 'Actuals-backed scenario',
      version: 4,
      is_default: false,
      created_at: '2026-07-01T10:00:00.000Z',
      updated_at: '2026-07-12T15:30:00.000Z',
    },
    cases: [
      {
        id: SCENARIO_CASE_ID,
        case_name: 'Base case',
        probability: 0.4,
        investment: 500000,
        follow_ons: 250000,
        exit_proceeds: 1000000,
        exit_valuation: 20000000,
        months_to_exit: 36,
        ownership_at_exit: 0.2,
        moic: 2,
      },
    ],
    weighted_summary: {
      moic: 2,
      investment: 200000,
      follow_ons: 100000,
      exit_proceeds: 400000,
      exit_valuation: 8000000,
      months_to_exit: 14.4,
    },
  };
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

describe('scenario-analysis read seed provenance disclosure', () => {
  beforeEach(() => resetState());

  it('keeps the existing response unchanged when no cases were seeded', async () => {
    mockScenarioRead();

    const res = await request(makeApp()).get(`/api/companies/101/scenarios/${SCENARIO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(currentScenarioReadResponse());
    expect(factsState.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expectNoScenarioWrites();
  });

  it('marks a seeded case current using the per-company facts hash', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-13T23:59:59.000-07:00'));
    mockScenarioRead({ provenance: [makeSeedProvenanceRow()] });
    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce(factsResponse('2026-07-14'));

    const res = await request(makeApp()).get(`/api/companies/101/scenarios/${SCENARIO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.cases[0].seed_provenance).toEqual({
      facts_input_hash: 'c'.repeat(64),
      facts_as_of_date: '2026-07-01',
      seeded_at: '2026-07-01T11:00:00.000Z',
      trust_state: 'LIVE',
      currency_status: 'base_currency',
      staleness: 'current',
    });
    expect(res.body.weighted_summary).toEqual(currentScenarioReadResponse().weighted_summary);
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: '2026-07-14',
    });
    expectNoScenarioWrites();
  });

  it('marks a seeded case stale when its stored hash differs from current company facts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    mockScenarioRead({
      provenance: [makeSeedProvenanceRow({ factsInputHash: 'a'.repeat(64) })],
    });
    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce(factsResponse('2026-07-14'));

    const res = await request(makeApp()).get(`/api/companies/101/scenarios/${SCENARIO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.cases[0].seed_provenance).toMatchObject({
      facts_input_hash: 'a'.repeat(64),
      staleness: 'stale',
    });
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expectNoScenarioWrites();
  });

  it('returns 200 and marks staleness unknown when current facts cannot be loaded', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    mockScenarioRead({ provenance: [makeSeedProvenanceRow()] });
    factsState.buildFundCompanyActualsFacts.mockRejectedValueOnce(new Error('facts unavailable'));

    const res = await request(makeApp()).get(`/api/companies/101/scenarios/${SCENARIO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.cases[0].seed_provenance).toEqual({
      facts_input_hash: 'c'.repeat(64),
      facts_as_of_date: '2026-07-01',
      seeded_at: '2026-07-01T11:00:00.000Z',
      trust_state: 'LIVE',
      currency_status: 'base_currency',
      staleness: 'unknown',
    });
    expect(res.body.weighted_summary).toEqual(currentScenarioReadResponse().weighted_summary);
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expectNoScenarioWrites();
  });

  it('marks staleness unknown when current facts omit the seeded company', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    mockScenarioRead({ provenance: [makeSeedProvenanceRow()] });
    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce({
      ...factsResponse('2026-07-14'),
      facts: [makeBlockedFact()],
    });

    const res = await request(makeApp()).get(`/api/companies/101/scenarios/${SCENARIO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.cases[0].seed_provenance.staleness).toBe('unknown');
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expectNoScenarioWrites();
  });

  it('discloses provenance only on seeded cases and loads current facts exactly once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    mockScenarioRead({
      cases: [
        makeScenarioCaseRow(),
        makeScenarioCaseRow({
          id: UNSEEDED_CASE_ID,
          caseName: 'Downside case',
          probability: '0.60',
          investment: '250000.000000',
          followOns: '50000.000000',
          exitProceeds: '750000.000000',
          exitValuation: '10000000.000000',
          monthsToExit: 24,
          ownershipAtExit: '0.15',
        }),
      ],
      provenance: [makeSeedProvenanceRow()],
    });
    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce(factsResponse('2026-07-14'));

    const res = await request(makeApp()).get(`/api/companies/101/scenarios/${SCENARIO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.cases[0].seed_provenance.staleness).toBe('current');
    expect(res.body.cases[1]).not.toHaveProperty('seed_provenance');
    expect(res.body.weighted_summary).toEqual({
      moic: 2.4285714285714284,
      investment: 350000,
      follow_ons: 130000,
      exit_proceeds: 850000,
      exit_valuation: 14000000,
      months_to_exit: 28.8,
    });
    expect(dbState.select).toHaveBeenCalledTimes(3);
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
    expectNoScenarioWrites();
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

describe('scenario-analysis from-seed case creation', () => {
  beforeEach(() => {
    resetState();
    factsState.buildFundCompanyActualsFacts.mockResolvedValue(factsResponse());
  });

  it('rejects an invalid fund before fund access and persistence', async () => {
    const res = await request(makeApp())
      .post(`/api/funds/07/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-1')
      .send(validFromSeedBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_fund_id');
    expect(fundAccessState.requireFundAccess).not.toHaveBeenCalled();
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('enforces fund access before scenario and body validation', async () => {
    denyFundAccessOnce();

    const res = await request(makeApp())
      .post('/api/funds/7/scenario-analysis/scenarios/not-a-uuid/cases/from-seed')
      .send({});

    expect(res.status).toBe(403);
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('rejects an invalid scenario id before body validation', async () => {
    const res = await request(makeApp())
      .post('/api/funds/7/scenario-analysis/scenarios/not-a-uuid/cases/from-seed')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_scenario_id');
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('validates the strict body before requiring an idempotency key', async () => {
    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .send({ ...validFromSeedBody(), unexpected: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('requires the Idempotency-Key header', async () => {
    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .send(validFromSeedBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_idempotency_key');
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('rejects a seed from another fund before calling persistence', async () => {
    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-2')
      .send(validFromSeedBody({ seed: makeSeed({ fundId: 8 }) }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('seed_fund_mismatch');
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('rejects a seed whose company belongs to another fund before calling persistence', async () => {
    fundScopeState.resolveCompanyFundId.mockResolvedValueOnce(8);

    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-company-scope')
      .send(validFromSeedBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('company_mismatch');
    expect(fundScopeState.resolveCompanyFundId).toHaveBeenCalledWith(101);
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('rejects a structurally valid seed that differs from server-generated actuals', async () => {
    const seed = makeSeed();
    const tamperedSeed = ScenarioCaseSeedV1Schema.parse({
      ...seed,
      fields: {
        ...seed.fields,
        investment: {
          ...seed.fields.investment,
          value: '999999.000000',
        },
      },
    });

    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-tampered')
      .send(validFromSeedBody({ seed: tamperedSeed }));

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('seed_conflict');
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledWith({
      fundId: 7,
      asOfDate: '2026-07-13',
    });
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it('creates a case and returns the strict route response', async () => {
    const seededAt = new Date('2026-07-13T19:53:05.111Z');
    const body = validFromSeedBody();
    persistenceState.createScenarioCaseFromSeed.mockResolvedValueOnce({
      case: { id: SCENARIO_CASE_ID, scenarioId: SCENARIO_ID },
      provenance: { seededAt },
      replayed: false,
    });
    dbState.findFirst.mockResolvedValueOnce({ version: 5 });

    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-3')
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      scenarioCaseId: SCENARIO_CASE_ID,
      scenarioId: SCENARIO_ID,
      scenarioVersion: 5,
      seededAt: seededAt.toISOString(),
      replay: false,
    });
    expect(persistenceState.createScenarioCaseFromSeed).toHaveBeenCalledWith({
      scenarioId: SCENARIO_ID,
      expectedScenarioVersion: 4,
      seed: body.seed,
      overrides: body.overrides,
      actor: { userId: null },
      idempotencyKey: 'seed-create-3',
    });
  });

  it('returns the original replay after facts drift following a successful create', async () => {
    const seededAt = new Date('2026-07-13T19:53:05.111Z');
    const body = validFromSeedBody();
    dbState.selectLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ scenarioId: SCENARIO_ID }]);
    persistenceState.createScenarioCaseFromSeed
      .mockResolvedValueOnce({
        case: { id: SCENARIO_CASE_ID, scenarioId: SCENARIO_ID },
        provenance: { seededAt },
        replayed: false,
      })
      .mockResolvedValueOnce({
        case: { id: SCENARIO_CASE_ID, scenarioId: SCENARIO_ID },
        provenance: { seededAt },
        replayed: true,
      });
    dbState.findFirst.mockResolvedValueOnce({ version: 5 }).mockResolvedValueOnce({ version: 17 });

    const first = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-replay')
      .send(body);

    expect(first.status).toBe(201);
    expect(first.body.replay).toBe(false);

    factsState.buildFundCompanyActualsFacts.mockResolvedValueOnce({
      ...factsResponse(),
      facts: [
        makeFact({
          initialInvestmentAmount: '600000.000000',
          inputHash: 'd'.repeat(64),
        }),
      ],
      inputHash: '8'.repeat(64),
    });

    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-replay')
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.replay).toBe(true);
    expect(res.body.scenarioVersion).toBe(17);
    expect(factsState.buildFundCompanyActualsFacts).toHaveBeenCalledTimes(1);
  });

  it('rejects an idempotency key already associated with another scenario', async () => {
    dbState.selectLimit.mockResolvedValueOnce([
      { scenarioId: '00000000-0000-4000-8000-000000000102' },
    ]);

    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', 'seed-create-other-scenario')
      .send(validFromSeedBody());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('idempotency_conflict');
    expect(factsState.buildFundCompanyActualsFacts).not.toHaveBeenCalled();
    expect(persistenceState.createScenarioCaseFromSeed).not.toHaveBeenCalled();
  });

  it.each([
    ['scenario_not_found', 404, 404],
    ['scenario_locked', 409, 423],
    ['version_conflict', 409, 409],
    ['missing_required_override', 422, 400],
    ['company_mismatch', 422, 400],
    ['idempotency_conflict', 409, 409],
  ])('maps %s to HTTP %i', async (code, serviceStatus, expectedStatus) => {
    persistenceState.createScenarioCaseFromSeed.mockRejectedValueOnce(
      new persistenceState.ScenarioCaseSeedPersistenceError(
        serviceStatus,
        code,
        `Persistence rejected ${code}`,
        { code }
      )
    );

    const res = await request(makeApp())
      .post(`/api/funds/7/scenario-analysis/scenarios/${SCENARIO_ID}/cases/from-seed`)
      .set('Idempotency-Key', `seed-create-${code}`)
      .send(validFromSeedBody());

    expect(res.status).toBe(expectedStatus);
    expect(res.body).toEqual({
      error: code,
      message: `Persistence rejected ${code}`,
      details: { code },
    });
  });
});
