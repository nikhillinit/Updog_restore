import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundCompanyActualsFact } from '../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';

const {
  applyAllocationUpdatesMock,
  buildFundCompanyActualsFactsMock,
  dbMock,
  loggerWarnMock,
  transactionMock,
} = vi.hoisted(() => ({
  applyAllocationUpdatesMock: vi.fn(),
  buildFundCompanyActualsFactsMock: vi.fn(),
  dbMock: {
    select: vi.fn(),
  },
  loggerWarnMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../../../server/db', () => ({
  db: dbMock,
}));

vi.mock('../../../server/db/pg-circuit', () => ({
  transaction: transactionMock,
}));

vi.mock('../../../server/services/allocation-write-service.js', () => ({
  applyAllocationUpdates: applyAllocationUpdatesMock,
}));

vi.mock(
  '../../../server/services/fund-actuals/fund-company-actuals-facts-service.js',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../server/services/fund-actuals/fund-company-actuals-facts-service')
      >();
    return {
      ...actual,
      buildFundCompanyActualsFacts: buildFundCompanyActualsFactsMock,
    };
  }
);

vi.mock('../../../server/lib/auth/provided-fund-scope', () => ({
  enforceProvidedFundScope: vi.fn(async () => true),
}));

vi.mock('../../../server/lib/logger.js', () => ({
  logger: {
    warn: loggerWarnMock,
    info: vi.fn(),
  },
}));

import allocationsRouter from '../../../server/routes/allocations';

const FACT_INPUT_HASH = 'a'.repeat(64);
const RESPONSE_INPUT_HASH = 'c'.repeat(64);

function actualsFact(overrides: Partial<FundCompanyActualsFact> = {}): FundCompanyActualsFact {
  return {
    fundId: 1,
    companyId: 10,
    companyName: 'TechCorp',
    investmentIds: [20],
    activeRoundIds: [30],
    approvedPlanningFmvMarkId: 40,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '500000.000000',
    followOnInvestmentAmount: '600000.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: '2026-07-01',
    latestRoundValuation: '20000000.000000',
    latestPlanningFmvDate: '2026-07-01',
    latestPlanningFmvValue: '21000000.000000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [{ roundId: 30, supersedesRoundId: null }],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: FACT_INPUT_HASH,
        assumptionsHash: 'b'.repeat(64),
        generatedAt: '2026-07-13T00:00:00.000Z',
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: FACT_INPUT_HASH,
    ...overrides,
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', allocationsRouter);
  return app;
}

function queryChain<T>(result: Promise<T>) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnValue(result),
    limit: vi.fn().mockReturnValue(result),
  };
}

function failingLimitChain(error: Error) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockRejectedValue(error),
    limit: vi.fn().mockRejectedValue(error),
  };
}

describe('latest allocations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildFundCompanyActualsFactsMock.mockImplementation(
      async (input: { fundId: number; asOfDate: string }) => ({
        fundId: input.fundId,
        asOfDate: input.asOfDate,
        facts: [actualsFact({ fundId: input.fundId })],
        inputHash: RESPONSE_INPUT_HASH,
        generatedAt: '2026-07-13T00:00:00.000Z',
      })
    );
  });

  it('returns safe JSON instead of leaking database credential failures', async () => {
    dbMock.select.mockReturnValueOnce(
      failingLimitChain(new Error('password authentication failed for user "mock"'))
    );

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(503);
    expect(res.type).toMatch(/json/);
    expect(res.body).toMatchObject({
      error: 'allocation_data_unavailable',
    });
    expect(JSON.stringify(res.body)).not.toContain('mock');
    expect(JSON.stringify(res.body)).not.toContain('password authentication failed');
  });

  it('serves latest allocation state through the schema-backed read path', async () => {
    dbMock.select.mockReturnValueOnce(queryChain(Promise.resolve([{ id: 1 }]))).mockReturnValueOnce(
      queryChain(
        Promise.resolve([
          {
            company_id: 10,
            company_name: 'TechCorp',
            sector: 'AI',
            stage: 'Series A',
            status: 'active',
            invested_amount: '1250000.00',
            planned_reserves_cents: 200_000_000,
            deployed_reserves_cents: 50_000_000,
            allocation_cap_cents: null,
            allocation_reason: 'Follow-on reserve',
            allocation_version: 3,
            last_allocation_at: new Date('2026-04-01T00:00:00.000Z'),
          },
        ])
      )
    );

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fund_id: 1,
      companies: [
        {
          company_id: 10,
          company_name: 'TechCorp',
          invested_amount_cents: 125_000_000,
          planned_reserves_cents: 200_000_000,
          deployed_reserves_cents: 50_000_000,
          allocation_version: 3,
        },
      ],
      metadata: {
        total_planned_cents: 200_000_000,
        total_deployed_cents: 50_000_000,
        companies_count: 1,
        last_updated_at: '2026-04-01T00:00:00.000Z',
      },
    });
    expect(buildFundCompanyActualsFactsMock).toHaveBeenCalledTimes(1);
    expect(buildFundCompanyActualsFactsMock).toHaveBeenCalledWith({
      fundId: 1,
      asOfDate: res.body.metadata.actuals_drift_summary.as_of_date,
    });
    expect(res.body.companies[0].actuals_drift).toMatchObject({
      contractVersion: 'allocation-actuals-drift-v1',
      companyId: 10,
      allocationVersion: 3,
      factsInputHash: FACT_INPUT_HASH,
      trustState: 'LIVE',
      comparisons: [
        {
          basis: 'deployed_reserves_vs_observed_follow_on',
          planCents: '50000000',
          actualCents: '60000000',
          deltaCents: '10000000',
          state: 'drifted',
          material: true,
        },
        {
          basis: 'legacy_invested_vs_observed_total',
          planCents: '125000000',
          actualCents: '110000000',
          deltaCents: '-15000000',
          state: 'drifted',
          material: true,
        },
      ],
    });
    expect(res.body.metadata.actuals_drift_summary).toEqual({
      facts_status: 'available',
      drifted_company_count: 1,
      material_company_count: 1,
      degraded_company_count: 0,
      facts_input_hash: RESPONSE_INPUT_HASH,
      as_of_date: res.body.metadata.actuals_drift_summary.as_of_date,
    });
  });

  it('returns a true empty state when the fund exists but has no companies', async () => {
    dbMock.select
      .mockReturnValueOnce(queryChain(Promise.resolve([{ id: 1 }])))
      .mockReturnValueOnce(queryChain(Promise.resolve([])));

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fund_id: 1,
      companies: [],
      metadata: {
        total_planned_cents: 0,
        total_deployed_cents: 0,
        companies_count: 0,
        allocation_facts_missing_count: 0,
        last_updated_at: null,
      },
    });
  });

  it('keeps company rows visible when allocation facts are missing', async () => {
    dbMock.select.mockReturnValueOnce(queryChain(Promise.resolve([{ id: 1 }]))).mockReturnValueOnce(
      queryChain(
        Promise.resolve([
          {
            company_id: 10,
            company_name: 'TechCorp',
            sector: 'AI',
            stage: 'Series A',
            status: 'active',
            invested_amount: '1250000.00',
            planned_reserves_cents: null,
            deployed_reserves_cents: null,
            allocation_cap_cents: null,
            allocation_reason: null,
            allocation_version: null,
            last_allocation_at: null,
          },
        ])
      )
    );

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fund_id: 1,
      companies: [
        {
          company_id: 10,
          company_name: 'TechCorp',
          planned_reserves_cents: 0,
          deployed_reserves_cents: 0,
          allocation_version: 0,
          allocation_facts_missing: true,
          missing_allocation_fields: [
            'planned_reserves_cents',
            'deployed_reserves_cents',
            'allocation_version',
          ],
        },
      ],
      metadata: {
        companies_count: 1,
        allocation_facts_missing_count: 1,
      },
    });
  });

  it('degrades facts failures to unavailable drift without mutating allocation rows', async () => {
    const sourceRows = [
      {
        company_id: 10,
        company_name: 'TechCorp',
        sector: 'AI',
        stage: 'Series A',
        status: 'active',
        invested_amount: '1250000.00',
        planned_reserves_cents: 200_000_000,
        deployed_reserves_cents: 50_000_000,
        allocation_cap_cents: null,
        allocation_reason: 'Follow-on reserve',
        allocation_version: 3,
        last_allocation_at: new Date('2026-04-01T00:00:00.000Z'),
      },
    ];
    const before = structuredClone(sourceRows);
    dbMock.select
      .mockReturnValueOnce(queryChain(Promise.resolve([{ id: 1 }])))
      .mockReturnValueOnce(queryChain(Promise.resolve(sourceRows)));
    buildFundCompanyActualsFactsMock.mockRejectedValueOnce(new Error('facts backend down'));

    const res = await request(makeApp()).get('/api/funds/1/allocations/latest');

    expect(res.status).toBe(200);
    expect(sourceRows).toEqual(before);
    expect(res.body.companies[0]).toMatchObject({
      company_id: 10,
      invested_amount_cents: 125_000_000,
      planned_reserves_cents: 200_000_000,
      deployed_reserves_cents: 50_000_000,
      allocation_version: 3,
      actuals_drift: {
        factsInputHash: null,
        trustState: 'FAILED',
      },
    });
    expect(
      res.body.companies[0].actuals_drift.comparisons.every(
        (comparison: { state: string; unavailableReason: string }) =>
          comparison.state === 'unavailable' && comparison.unavailableReason === 'facts_failed'
      )
    ).toBe(true);
    expect(res.body.metadata.actuals_drift_summary).toEqual({
      facts_status: 'failed',
      drifted_company_count: 0,
      material_company_count: 0,
      degraded_company_count: 1,
      facts_input_hash: null,
      as_of_date: res.body.metadata.actuals_drift_summary.as_of_date,
    });
    expect(applyAllocationUpdatesMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
