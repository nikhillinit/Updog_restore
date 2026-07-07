import { describe, expect, it } from 'vitest';
import { getDashboardSummaryReadModel } from '../../../server/services/dashboard-summary-read-service';
import type { IStorage } from '../../../server/storage';

type StoredFund = NonNullable<Awaited<ReturnType<IStorage['getFund']>>>;
type StoredPortfolioCompany = Awaited<ReturnType<IStorage['getPortfolioCompanies']>>[number];
type StoredFundMetric = Awaited<ReturnType<IStorage['getFundMetrics']>>[number];
type StoredActivity = Awaited<ReturnType<IStorage['getActivities']>>[number];

function makeFund(): StoredFund {
  return {
    id: 7,
    name: 'Evidence Fund',
    size: '10000000',
    deployedCapital: '2500000',
    managementFee: '0.0200',
    carryPercentage: '0.2000',
    vintageYear: 2026,
    establishmentDate: null,
    status: 'active',
    isActive: true,
    baseCurrency: 'USD',
    engineResults: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeCompany(overrides: Partial<StoredPortfolioCompany> = {}): StoredPortfolioCompany {
  return {
    id: 1,
    fundId: 7,
    name: 'Northstar AI',
    sector: 'AI',
    stage: 'Seed',
    currentStage: 'Seed',
    investmentAmount: '1000000',
    investmentDate: null,
    currentValuation: '4000000',
    foundedYear: 2021,
    status: 'active',
    description: null,
    dealTags: null,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    deployedReservesCents: 0,
    plannedReservesCents: 0,
    exitMoicBps: null,
    exitProbability: null,
    ownershipCurrentPct: null,
    allocationCapCents: null,
    allocationReason: null,
    allocationIteration: 0,
    lastAllocationAt: null,
    allocationVersion: 1,
    ...overrides,
  };
}

function makeMetric(overrides: Partial<StoredFundMetric> = {}): StoredFundMetric {
  return {
    id: 11,
    fundId: 7,
    metricDate: new Date('2026-04-01T00:00:00.000Z'),
    asOfDate: new Date('2026-04-01T00:00:00.000Z'),
    totalValue: '4000000',
    irr: '0.1800',
    multiple: '4.00',
    dpi: '0.50',
    tvpi: '4.50',
    runId: 42,
    configId: 3,
    configVersion: 5,
    createdAt: new Date('2026-04-02T00:00:00.000Z'),
    ...overrides,
  };
}

function makeActivity(id: number): StoredActivity {
  return {
    id,
    fundId: 7,
    companyId: null,
    type: 'update',
    title: `Activity ${id}`,
    description: null,
    amount: null,
    activityDate: new Date(`2026-04-${String(id).padStart(2, '0')}T00:00:00.000Z`),
    createdAt: new Date(`2026-04-${String(id).padStart(2, '0')}T01:00:00.000Z`),
  };
}

function makeStore(input: {
  fund?: StoredFund;
  portfolioCompanies?: StoredPortfolioCompany[];
  metrics?: StoredFundMetric[];
  activities?: StoredActivity[];
}): IStorage {
  return {
    kind: 'memory',
    capabilities: { investmentScenarioWrites: false },
    ping: async () => true,
    getUser: async () => undefined,
    getUserByUsername: async () => undefined,
    createUser: async () => {
      throw new Error('not used');
    },
    getAllFunds: async () => (input.fund ? [input.fund] : []),
    getFund: async () => input.fund,
    getFundConfig: async () => undefined,
    createFund: async () => {
      throw new Error('not used');
    },
    getPortfolioCompanies: async () => input.portfolioCompanies ?? [],
    getPortfolioCompany: async () => undefined,
    createPortfolioCompany: async () => {
      throw new Error('not used');
    },
    getInvestments: async () => [],
    getInvestment: async () => undefined,
    createInvestment: async () => {
      throw new Error('not used');
    },
    addInvestmentRound: async () => {
      throw new Error('not used');
    },
    addPerformanceCase: async () => {
      throw new Error('not used');
    },
    getFundMetrics: async () => input.metrics ?? [],
    createFundMetrics: async () => {
      throw new Error('not used');
    },
    getActivities: async () => input.activities ?? [],
    createActivity: async () => {
      throw new Error('not used');
    },
  };
}

describe('dashboard summary read service evidence', () => {
  it('adds per-KPI provenance and labels dashboard IRR as non-authoritative', async () => {
    const latestMetric = makeMetric({ id: 12, totalValue: '5000000', irr: '0.1900' });
    const readModel = await getDashboardSummaryReadModel(
      makeStore({
        fund: makeFund(),
        portfolioCompanies: [makeCompany(), makeCompany({ id: 2, currentValuation: null })],
        metrics: [makeMetric(), latestMetric],
        activities: [1, 2, 3, 4, 5, 6].map(makeActivity),
      }),
      7
    );

    expect(readModel?.metrics).toBe(latestMetric);
    expect(readModel?.recentActivities.map((activity) => activity.id)).toEqual([1, 2, 3, 4, 5]);
    expect(readModel?.summary).toMatchObject({
      totalCompanies: 2,
      deploymentRate: 25,
      currentIRR: 19,
    });
    expect(readModel?.evidence.kpis.currentAum).toMatchObject({
      source: 'fund_metrics.totalvalue',
      sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
      readModel: 'dashboard-summary-read-service',
      fundId: 7,
      asOfDate: '2026-04-01T00:00:00.000Z',
      calculatedAt: '2026-04-02T00:00:00.000Z',
      freshness: 'timestamped',
      status: 'available',
    });
    expect(readModel?.evidence.kpis.irr).toMatchObject({
      source: 'fund_metrics.irr',
      fundId: 7,
      freshness: 'timestamped',
      status: 'unverified',
      note: 'Unverified dashboard metric; not authoritative IRR/XIRR.',
    });
    expect(readModel?.evidence.kpis.portfolioCompanies).toMatchObject({
      source: 'storage.getPortfolioCompanies.count',
      fundId: 7,
      freshness: 'timestamp_unavailable',
      status: 'available',
    });
    expect(readModel?.evidence.portfolioAllocation).toMatchObject({
      source: 'storage.getPortfolioCompanies',
      sourceTable: 'portfoliocompanies',
      fundId: 7,
      companyCount: 2,
      valuedCompanyCount: 1,
      valuationFreshness: {
        status: 'unavailable',
        reason: expect.stringContaining('do not include valuation timestamps'),
      },
    });
  });

  it('marks metric-backed KPI evidence unavailable when no fund metrics row exists', async () => {
    const readModel = await getDashboardSummaryReadModel(
      makeStore({
        fund: makeFund(),
        portfolioCompanies: [],
        metrics: [],
      }),
      7
    );

    expect(readModel?.evidence.kpis.currentAum).toMatchObject({
      source: 'fund_metrics.totalvalue',
      freshness: 'source_unavailable',
      status: 'unavailable',
    });
    expect(readModel?.evidence.kpis.irr).toMatchObject({
      source: 'fund_metrics.irr',
      freshness: 'source_unavailable',
      status: 'unavailable',
    });
  });

  it('returns undefined when the scoped fund does not exist', async () => {
    await expect(getDashboardSummaryReadModel(makeStore({}), 7)).resolves.toBeUndefined();
  });
});
