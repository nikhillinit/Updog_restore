import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  storageMock,
  actualCalculateMock,
  projectedCalculateMock,
  varianceCalculateMock,
  buildFundCompanyActualsFactsMock,
} = vi.hoisted(() => ({
  storageMock: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getFundConfig: vi.fn(),
  },
  actualCalculateMock: vi.fn(),
  projectedCalculateMock: vi.fn(),
  varianceCalculateMock: vi.fn(),
  buildFundCompanyActualsFactsMock: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../../server/services/actual-metrics-calculator', () => ({
  ActualMetricsCalculator: class {
    calculate = actualCalculateMock;
  },
}));

vi.mock('../../../server/services/projected-metrics-calculator', () => ({
  ProjectedMetricsCalculator: class {
    calculate = projectedCalculateMock;
  },
}));

vi.mock('../../../server/services/variance-calculator', () => ({
  VarianceCalculator: class {
    calculate = varianceCalculateMock;
  },
}));

// Mock ONLY the db-backed entrypoint; keep the pure row-builder real so the
// facts fixture below is produced by the actual producer (importOriginal
// spread also survives new exports on the module).
vi.mock(
  '../../../server/services/fund-actuals/fund-company-actuals-facts-service',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../../server/services/fund-actuals/fund-company-actuals-facts-service')
      >();
    return {
      ...original,
      buildFundCompanyActualsFacts: buildFundCompanyActualsFactsMock,
    };
  }
);

import { MetricsAggregator } from '../../../server/services/metrics-aggregator';
import { buildFundCompanyActualsFactsFromRows } from '../../../server/services/fund-actuals/fund-company-actuals-facts-service';
import { FundCompanyActualsFactsResponseSchema } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { DualForecastResponseSchema } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';

const actualMetrics = {
  asOfDate: '2026-04-01T00:00:00.000Z',
  totalCommitted: 100_000_000,
  totalCalled: 25_000_000,
  totalDeployed: 24_000_000,
  totalUncalled: 75_000_000,
  currentNAV: 30_000_000,
  totalDistributions: 2_000_000,
  totalValue: 32_000_000,
  irr: 0.14,
  tvpi: 1.28,
  dpi: 0.08,
  rvpi: 1.2,
  activeCompanies: 1,
  exitedCompanies: 0,
  writtenOffCompanies: 0,
  totalCompanies: 1,
  deploymentRate: 24,
  averageCheckSize: 24_000_000,
  fundAgeMonths: 27,
};

const projectedMetrics = {
  asOfDate: '2026-04-01T00:00:00.000Z',
  projectionDate: '2026-04-01T00:00:00.000Z',
  projectedDeployment: [5_000_000, 6_000_000],
  projectedDistributions: [1_000_000, 2_000_000],
  projectedNAV: [36_000_000, 44_000_000],
  expectedTVPI: 2.7,
  expectedIRR: 0.22,
  expectedDPI: 1.4,
  totalReserveNeeds: 10_000_000,
  allocatedReserves: 4_000_000,
  unallocatedReserves: 6_000_000,
  reserveAllocationRate: 40,
  deploymentPace: 'on-track' as const,
  quartersRemaining: 10,
  recommendedQuarterlyDeployment: 5_000_000,
};

// Facts fixture produced by the REAL row-builder so it always matches what the
// facts service emits; validated against the facts contract in a guard test.
const factsFixture = buildFundCompanyActualsFactsFromRows({
  fundId: 1,
  asOfDate: '2026-04-01',
  now: new Date('2026-04-01T00:00:00.000Z'),
  rows: {
    fund: { id: 1, baseCurrency: 'USD' },
    companies: [{ id: 10, fundId: 1, name: 'Northstar AI' }],
    investments: [{ id: 201, fundId: 1, companyId: 10 }],
    allRounds: [
      {
        id: 5,
        fundId: 1,
        investmentId: 201,
        roundDate: '2026-01-15',
        createdAt: new Date('2026-01-16T00:00:00.000Z'),
        securityType: 'equity',
        currency: 'USD',
        investmentAmount: '24000000.000000',
        preMoneyValuation: '120000000.000000',
        roundSize: null,
        supersedesRoundId: null,
      },
    ],
    activeOverrides: [],
    planningMarks: [
      {
        id: 301,
        fundId: 1,
        companyId: 10,
        markDate: '2026-03-01',
        fairValue: '30000000.000000',
        currency: 'USD',
        status: 'approved',
      },
    ],
  },
});

function expectedActualsFactsBlock(facts = factsFixture) {
  return {
    asOfDate: facts.asOfDate,
    generatedAt: facts.generatedAt,
    inputHash: facts.inputHash,
    companies: facts.facts.map((fact) => ({
      companyId: fact.companyId,
      companyName: fact.companyName,
      trustState: fact.provenance.trustState,
      planningFmvStatus: fact.planningFmvStatus,
      currency: fact.currency,
      currencyStatus: fact.currencyStatus,
      latestRoundDate: fact.latestRoundDate,
      latestRoundValuation: fact.latestRoundValuation,
      latestPlanningFmvDate: fact.latestPlanningFmvDate,
      latestPlanningFmvValue: fact.latestPlanningFmvValue,
      warnings: fact.warnings,
    })),
    warnings: facts.facts.flatMap((fact) => fact.warnings),
  };
}

// Pre-change output captured on main (fd0788bf) before the actualsFacts block
// landed. The numeric series MUST stay byte-identical in PR-1 (shadow read).
const BASELINE_FUNDED = JSON.parse(
  '{"fundId":1,"fundName":"Dual Forecast Fund","asOfDate":"2026-04-01T00:00:00.000Z","series":[{"quarterIndex":0,"label":"As of","date":"2026-04-01T00:00:00.000Z","construction":{"nav":47500000,"calledCapital":50000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":{"nav":30000000,"calledCapital":25000000,"distributions":2000000,"tvpi":1.28,"dpi":0.08,"rvpi":1.2,"irr":0.14},"currentMode":"actual","current":{"nav":30000000,"calledCapital":25000000,"distributions":2000000,"tvpi":1.28,"dpi":0.08,"rvpi":1.2,"irr":0.14}},{"quarterIndex":1,"label":"Q+1","date":"2026-07-01T00:00:00.000Z","construction":{"nav":52250000,"calledCapital":55000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":null,"currentMode":"forecast","current":{"nav":36000000,"calledCapital":30000000,"distributions":3000000,"tvpi":1.3,"dpi":0.1,"rvpi":1.2,"irr":0.22}},{"quarterIndex":2,"label":"Q+2","date":"2026-10-01T00:00:00.000Z","construction":{"nav":59363771.005187295,"calledCapital":60000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.9893961834197883,"irr":0.22},"actual":null,"currentMode":"forecast","current":{"nav":44000000,"calledCapital":36000000,"distributions":5000000,"tvpi":1.3611111111111112,"dpi":0.1388888888888889,"rvpi":1.2222222222222223,"irr":0.22}}],"sources":{"construction":"construction_forecast_jcurve","current":"projected_metrics_calculator","actual":"actual_metrics_calculator"},"config":{"source":"published","version":4,"publishedAt":"2026-03-01T00:00:00.000Z","fallbackReason":null},"warnings":[]}'
) as Record<string, unknown>;

const BASELINE_NO_INVESTMENTS = JSON.parse(
  '{"fundId":1,"fundName":"Dual Forecast Fund","asOfDate":"2026-04-01T00:00:00.000Z","series":[{"quarterIndex":0,"label":"As of","date":"2026-04-01T00:00:00.000Z","construction":{"nav":9500000,"calledCapital":10000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":{"nav":0,"calledCapital":0,"distributions":0,"tvpi":0,"dpi":null,"rvpi":0,"irr":null},"currentMode":"actual","current":{"nav":0,"calledCapital":0,"distributions":0,"tvpi":0,"dpi":null,"rvpi":0,"irr":null}},{"quarterIndex":1,"label":"Q+1","date":"2026-07-01T00:00:00.000Z","construction":{"nav":14250000,"calledCapital":15000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":null,"currentMode":"forecast","current":{"nav":12000000,"calledCapital":3000000,"distributions":300000,"tvpi":4.1,"dpi":0.1,"rvpi":4,"irr":0.22}},{"quarterIndex":2,"label":"Q+2","date":"2026-10-01T00:00:00.000Z","construction":{"nav":19000000,"calledCapital":20000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":null,"currentMode":"forecast","current":{"nav":15000000,"calledCapital":7000000,"distributions":700000,"tvpi":2.242857142857143,"dpi":0.1,"rvpi":2.142857142857143,"irr":0.22}},{"quarterIndex":3,"label":"Q+3","date":"2027-01-01T00:00:00.000Z","construction":{"nav":23750000,"calledCapital":25000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":null,"currentMode":"forecast","current":{"nav":15000000,"calledCapital":7000000,"distributions":700000,"tvpi":2.242857142857143,"dpi":0.1,"rvpi":2.142857142857143,"irr":0.22}},{"quarterIndex":4,"label":"Q+4","date":"2027-04-01T00:00:00.000Z","construction":{"nav":28500000,"calledCapital":30000000,"distributions":0,"tvpi":0.95,"dpi":0,"rvpi":0.95,"irr":0.22},"actual":null,"currentMode":"forecast","current":{"nav":15000000,"calledCapital":7000000,"distributions":700000,"tvpi":2.242857142857143,"dpi":0.1,"rvpi":2.142857142857143,"irr":0.22}}],"sources":{"construction":"construction_forecast_jcurve","current":"projected_metrics_calculator","actual":"actual_metrics_calculator"},"config":{"source":"published","version":4,"publishedAt":"2026-03-01T00:00:00.000Z","fallbackReason":null},"warnings":["Using J-curve construction forecast (no investments yet)"]}'
) as Record<string, unknown>;

describe('MetricsAggregator dual forecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    storageMock.getFund.mockResolvedValue({
      id: 1,
      name: 'Dual Forecast Fund',
      size: '90000000',
      deployedCapital: '24000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2024,
      establishmentDate: '2024-01-01',
      status: 'active',
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    storageMock.getPortfolioCompanies.mockResolvedValue([
      {
        id: 10,
        fundId: 1,
        name: 'Northstar AI',
        investmentAmount: '24000000',
        stage: 'Seed',
        currentStage: 'Seed',
        sector: 'AI',
        ownershipCurrentPct: '0.1',
        investmentDate: new Date('2024-06-01T00:00:00.000Z'),
      },
    ]);
    storageMock.getFundConfig.mockResolvedValue({
      id: 11,
      fundId: 1,
      version: 4,
      config: {
        fundName: 'Dual Forecast Fund',
        fundSize: 100_000_000,
        fundLife: 10,
        investmentPeriod: 5,
        targetMetrics: {
          targetIRR: 0.22,
          targetTVPI: 2.7,
          targetDPI: 1.4,
          targetCompanyCount: 25,
          targetReserveRatio: 0.45,
        },
      },
      isDraft: false,
      isPublished: true,
      publishedAt: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    actualCalculateMock.mockResolvedValue(actualMetrics);
    projectedCalculateMock.mockResolvedValue(projectedMetrics);
    buildFundCompanyActualsFactsMock.mockResolvedValue(factsFixture);
  });

  it('returns an as-of point and cumulative future current forecast points', async () => {
    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    expect(result.fundId).toBe(1);
    expect(result.fundName).toBe('Dual Forecast Fund');
    expect(result.asOfDate).toBe('2026-04-01T00:00:00.000Z');
    expect(result.sources).toEqual({
      construction: 'construction_forecast_jcurve',
      current: 'projected_metrics_calculator',
      actual: 'actual_metrics_calculator',
    });
    expect(result.config).toEqual({
      source: 'published',
      version: 4,
      publishedAt: '2026-03-01T00:00:00.000Z',
      fallbackReason: null,
    });

    expect(result.series).toHaveLength(3);
    expect(result.series[0]).toMatchObject({
      quarterIndex: 0,
      label: 'As of',
      date: '2026-04-01T00:00:00.000Z',
      currentMode: 'actual',
      actual: {
        nav: 30_000_000,
        calledCapital: 25_000_000,
        distributions: 2_000_000,
        tvpi: 1.28,
        dpi: 0.08,
        rvpi: 1.2,
        irr: 0.14,
      },
      current: {
        nav: 30_000_000,
        calledCapital: 25_000_000,
        distributions: 2_000_000,
        tvpi: 1.28,
        dpi: 0.08,
        rvpi: 1.2,
        irr: 0.14,
      },
    });
    expect(result.series[1]?.label).toBe('Q+1');
    expect(result.series[1]?.date).toBe('2026-07-01T00:00:00.000Z');
    expect(result.series[1]?.currentMode).toBe('forecast');
    expect(result.series[1]?.actual).toBeNull();
    expect(result.series[1]?.current).toMatchObject({
      nav: 36_000_000,
      calledCapital: 30_000_000,
      distributions: 3_000_000,
      irr: 0.22,
    });
    expect(result.series[2]?.currentMode).toBe('forecast');
    expect(result.series[2]?.actual).toBeNull();
    expect(result.series[2]?.current).toMatchObject({
      nav: 44_000_000,
      calledCapital: 36_000_000,
      distributions: 5_000_000,
      irr: 0.22,
    });
    expect(result.series[2]?.current.tvpi).toBeCloseTo(49_000_000 / 36_000_000, 6);
    expect(result.series[0]?.construction.calledCapital).toBeGreaterThan(20_000_000);
    expect(result.series[2]?.construction.calledCapital).toBeGreaterThan(
      result.series[0]?.construction.calledCapital ?? 0
    );

    expect(projectedCalculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        size: '100000000',
      }),
      expect.any(Array),
      expect.objectContaining({
        targetIRR: 0.22,
        targetTVPI: 2.7,
        targetDPI: 1.4,
      })
    );
  });

  it('sums current forecast distributions as quarterly deltas for no-investment funds', async () => {
    storageMock.getFund.mockResolvedValueOnce({
      id: 1,
      name: 'Dual Forecast Fund',
      size: '90000000',
      deployedCapital: '0',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
      establishmentDate: '2026-01-01',
      status: 'active',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    storageMock.getPortfolioCompanies.mockResolvedValue([]);
    actualCalculateMock.mockResolvedValue({
      ...actualMetrics,
      totalCalled: 0,
      totalDeployed: 0,
      currentNAV: 0,
      totalDistributions: 0,
      totalValue: 0,
      irr: null,
      tvpi: 0,
      dpi: null,
      rvpi: 0,
      activeCompanies: 0,
      totalCompanies: 0,
      deploymentRate: 0,
      averageCheckSize: 0,
    });
    projectedCalculateMock.mockResolvedValueOnce({
      ...projectedMetrics,
      projectedDeployment: [1_000_000, 2_000_000, 3_000_000, 4_000_000],
      projectedDistributions: [100_000, 200_000, 300_000, 400_000],
      projectedNAV: [5_000_000, 9_000_000, 12_000_000, 15_000_000],
    });

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    expect(result.series[1]?.current).toMatchObject({
      nav: 12_000_000,
      calledCapital: 3_000_000,
      distributions: 300_000,
    });
    expect(result.series[2]?.current).toMatchObject({
      nav: 15_000_000,
      calledCapital: 7_000_000,
      distributions: 700_000,
    });
    expect(projectedCalculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        size: '100000000',
      }),
      [],
      expect.objectContaining({
        targetIRR: 0.22,
      }),
      expect.objectContaining({
        useConstructionForecast: true,
      })
    );
  });

  it('exposes legacy fallback provenance when no published config exists', async () => {
    storageMock.getFundConfig.mockResolvedValue(undefined);

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    expect(result.config).toEqual({
      source: 'legacy_default_no_published_config',
      version: null,
      publishedAt: null,
      fallbackReason: 'No published fund config is available.',
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('legacy generic targets')])
    );
  });

  it('uses a facts fixture that satisfies the facts contract (fixture guard)', () => {
    expect(FundCompanyActualsFactsResponseSchema.parse(factsFixture)).toEqual(factsFixture);
  });

  it('emits the additive actualsFacts block with hash passthrough and per-company attribution', async () => {
    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    // asOfDate is the day-grain projection of the actual metrics as-of.
    expect(buildFundCompanyActualsFactsMock).toHaveBeenCalledWith({
      fundId: 1,
      asOfDate: '2026-04-01',
    });

    expect(result.actualsFacts).toEqual(expectedActualsFactsBlock());
    expect(result.actualsFacts?.inputHash).toBe(factsFixture.inputHash);
    expect(result.actualsFacts?.companies[0]?.trustState).toBe(
      factsFixture.facts[0]?.provenance.trustState
    );
  });

  it('parses against the dual-forecast response contract at the service boundary', async () => {
    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    expect(DualForecastResponseSchema.parse(result)).toEqual(result);
  });

  it('discloses a facts failure with a null block and an unchanged numeric series', async () => {
    buildFundCompanyActualsFactsMock.mockRejectedValueOnce(new Error('facts backend down'));

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    expect(result).toEqual({
      ...BASELINE_FUNDED,
      actualsFacts: null,
      warnings: [expect.stringContaining('Actuals facts unavailable: facts backend down')],
    });
  });

  describe('PR-1 numeric-series snapshot equality (baseline captured on main @ fd0788bf)', () => {
    it('funded-portfolio scenario is byte-identical outside the additive block', async () => {
      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      expect(result).toEqual({
        ...BASELINE_FUNDED,
        actualsFacts: expectedActualsFactsBlock(),
      });
    });

    it('no-investment scenario is byte-identical outside the additive block', async () => {
      storageMock.getFund.mockResolvedValueOnce({
        id: 1,
        name: 'Dual Forecast Fund',
        size: '90000000',
        deployedCapital: '0',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
        establishmentDate: '2026-01-01',
        status: 'active',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      storageMock.getPortfolioCompanies.mockResolvedValue([]);
      actualCalculateMock.mockResolvedValue({
        ...actualMetrics,
        totalCalled: 0,
        totalDeployed: 0,
        currentNAV: 0,
        totalDistributions: 0,
        totalValue: 0,
        irr: null,
        tvpi: 0,
        dpi: null,
        rvpi: 0,
        activeCompanies: 0,
        totalCompanies: 0,
        deploymentRate: 0,
        averageCheckSize: 0,
      });
      projectedCalculateMock.mockResolvedValueOnce({
        ...projectedMetrics,
        projectedDeployment: [1_000_000, 2_000_000, 3_000_000, 4_000_000],
        projectedDistributions: [100_000, 200_000, 300_000, 400_000],
        projectedNAV: [5_000_000, 9_000_000, 12_000_000, 15_000_000],
      });

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      expect(result).toEqual({
        ...BASELINE_NO_INVESTMENTS,
        actualsFacts: expectedActualsFactsBlock(),
      });
    });
  });
});
