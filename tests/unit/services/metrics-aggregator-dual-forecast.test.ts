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

// Spread importOriginal so isLivePortfolioCompany (the shared NAV-universe
// classifier, ADR-029) keeps flowing to the aggregator; only the class mock
// is replaced.
vi.mock('../../../server/services/actual-metrics-calculator', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../server/services/actual-metrics-calculator')>();
  return {
    ...original,
    ActualMetricsCalculator: class {
      calculate = actualCalculateMock;
    },
  };
});

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
// facts fixtures below are produced by the actual producer (importOriginal
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
import {
  buildFundCompanyActualsFactsFromRows,
  type FundCompanyActualsFactsRows,
} from '../../../server/services/fund-actuals/fund-company-actuals-facts-service';
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

const BASE_EQUITY_ROUND = {
  id: 5,
  fundId: 1,
  investmentId: 201,
  roundDate: '2026-01-15',
  createdAt: new Date('2026-01-16T00:00:00.000Z'),
  securityType: 'equity' as const,
  currency: 'USD',
  investmentAmount: '24000000.000000',
  preMoneyValuation: '120000000.000000',
  roundSize: null,
  supersedesRoundId: null,
};

const BASE_ROWS: FundCompanyActualsFactsRows = {
  fund: { id: 1, baseCurrency: 'USD' },
  companies: [{ id: 10, fundId: 1, name: 'Northstar AI' }],
  investments: [{ id: 201, fundId: 1, companyId: 10 }],
  allRounds: [BASE_EQUITY_ROUND],
  activeOverrides: [],
  planningMarks: [
    {
      id: 301,
      fundId: 1,
      companyId: 10,
      markDate: '2026-03-01',
      fairValue: '30000000.000000',
      currency: 'USD',
      status: 'approved' as const,
    },
  ],
};

// Facts fixtures produced by the REAL row-builder so they always match what
// the facts service emits; the base fixture is validated against the facts
// contract in a guard test below.
function makeFacts(rows: Partial<FundCompanyActualsFactsRows> = {}) {
  return buildFundCompanyActualsFactsFromRows({
    fundId: 1,
    asOfDate: '2026-04-01',
    now: new Date('2026-04-01T00:00:00.000Z'),
    rows: { ...BASE_ROWS, ...rows },
  });
}

const factsFixture = makeFacts();

function baseStorageCompany() {
  return {
    id: 10,
    fundId: 1,
    name: 'Northstar AI',
    status: 'active',
    currentValuation: '10000000.00',
    investmentAmount: '24000000',
    stage: 'Seed',
    currentStage: 'Seed',
    sector: 'AI',
    ownershipCurrentPct: '0.1',
    investmentDate: new Date('2024-06-01T00:00:00.000Z'),
  };
}

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
      activeRoundIds: fact.activeRoundIds,
      supersedeLineage: fact.supersedeLineage,
      latestRoundDate: fact.latestRoundDate,
      latestRoundValuation: fact.latestRoundValuation,
      latestPlanningFmvDate: fact.latestPlanningFmvDate,
      latestPlanningFmvValue: fact.latestPlanningFmvValue,
      warnings: fact.warnings,
    })),
    warnings: facts.facts.flatMap((fact) => fact.warnings),
  };
}

function trustCounts(
  overrides: Partial<Record<'LIVE' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED', number>> = {}
) {
  return { LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0, ...overrides };
}

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
    storageMock.getPortfolioCompanies.mockResolvedValue([baseStorageCompany()]);
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
    expect(result.currentProjection).toEqual({ status: 'projected', fallbackReason: null });

    // Fixture blend: active mark 30M == the mocked calculator NAV, so the
    // as-of numbers are unchanged while the anchor discloses planning_fmv.
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

    // Empty NAV universe: TVPI/RVPI keep the calculator's 0-not-null
    // semantics when no capital is called.
    expect(result.series[0]?.actual).toMatchObject({ nav: 0, tvpi: 0, rvpi: 0, dpi: null });
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
    // The facts company is not in the portfolio read: disclosed outside the
    // NAV universe, counted in the trust rollup, contributing nothing.
    expect(result.navAnchoring).toEqual({
      blendedNav: '0.000000',
      countsByTrustState: trustCounts({ LIVE: 1 }),
      companies: [
        {
          companyId: 10,
          companyName: 'Northstar AI',
          inNavUniverse: false,
          trustState: 'LIVE',
          anchor: null,
          contribution: null,
        },
      ],
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

  it('discloses a facts failure with null blocks and an unblended series', async () => {
    buildFundCompanyActualsFactsMock.mockRejectedValueOnce(new Error('facts backend down'));

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getDualForecast(1);

    expect(result.actualsFacts).toBeNull();
    expect(result.navAnchoring).toBeNull();
    expect(result.warnings).toEqual([
      expect.stringContaining('Actuals facts unavailable: facts backend down'),
    ]);
    // No blend: the as-of point keeps the legacy calculator values verbatim.
    expect(result.series[0]?.actual).toEqual({
      nav: 30_000_000,
      calledCapital: 25_000_000,
      distributions: 2_000_000,
      tvpi: 1.28,
      dpi: 0.08,
      rvpi: 1.2,
      irr: 0.14,
    });
    expect(result.currentProjection).toEqual({ status: 'projected', fallbackReason: null });
  });

  describe('PR-2 blend (ADR-029 anchor ladder / ADR-030 trust / ADR-032 currency)', () => {
    it('rung 1: an active Planning FMV mark re-anchors the as-of NAV over the legacy value', async () => {
      buildFundCompanyActualsFactsMock.mockResolvedValue(
        makeFacts({
          planningMarks: [
            {
              id: 301,
              fundId: 1,
              companyId: 10,
              markDate: '2026-03-01',
              fairValue: '42000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      );

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      // NAV = mark fairValue, not currentValuation (10M), not the calculator
      // NAV (30M), and NEVER the round pre-money (120M).
      expect(result.series[0]?.actual).toEqual({
        nav: 42_000_000,
        calledCapital: 25_000_000,
        distributions: 2_000_000,
        tvpi: 1.76, // (42M + 2M) / 25M
        dpi: 0.08, // cash-flow-derived, unchanged
        rvpi: 1.68, // 42M / 25M
        irr: 0.14, // cash-flow-derived, unchanged
      });
      expect(result.series[0]?.current).toEqual(result.series[0]?.actual);
      expect(result.navAnchoring).toEqual({
        blendedNav: '42000000.000000',
        countsByTrustState: trustCounts({ LIVE: 1 }),
        companies: [
          {
            companyId: 10,
            companyName: 'Northstar AI',
            inNavUniverse: true,
            trustState: 'LIVE',
            anchor: 'planning_fmv',
            contribution: '42000000.000000',
          },
        ],
      });
    });

    it('rung 2: a stale mark contributes the same value with degraded disclosure (PARTIAL)', async () => {
      buildFundCompanyActualsFactsMock.mockResolvedValue(
        makeFacts({
          planningMarks: [
            {
              id: 301,
              fundId: 1,
              companyId: 10,
              markDate: '2025-11-01', // 151 days before as-of > 120-day policy
              fairValue: '42000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      );

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      // Same numbers as rung 1 - staleness changes disclosure, never value.
      expect(result.series[0]?.actual).toMatchObject({ nav: 42_000_000, tvpi: 1.76, rvpi: 1.68 });
      expect(result.navAnchoring?.blendedNav).toBe('42000000.000000');
      expect(result.navAnchoring?.countsByTrustState).toEqual(trustCounts({ PARTIAL: 1 }));
      expect(result.navAnchoring?.companies[0]).toMatchObject({
        companyId: 10,
        inNavUniverse: true,
        trustState: 'PARTIAL',
        anchor: 'planning_fmv_stale',
        contribution: '42000000.000000',
      });
      expect(result.actualsFacts?.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'PLANNING_FMV_STALE' })])
      );
    });

    it('adversarial (PRD DoD): a PARTIAL fixture changes disclosure, never numbers, vs LIVE at the same anchor rung', async () => {
      const liveFacts = makeFacts({
        planningMarks: [
          {
            id: 301,
            fundId: 1,
            companyId: 10,
            markDate: '2026-03-01',
            fairValue: '42000000.000000',
            currency: 'USD',
            status: 'approved',
          },
        ],
      });
      // Same active mark, same rung; a convertible note adds a
      // warning-severity NON_EQUITY_AMOUNT_ONLY -> the envelope leaves LIVE.
      const partialFacts = makeFacts({
        allRounds: [
          BASE_EQUITY_ROUND,
          {
            ...BASE_EQUITY_ROUND,
            id: 6,
            roundDate: '2026-02-01',
            securityType: 'convertible_note',
            investmentAmount: '1000000.000000',
            preMoneyValuation: null,
          },
        ],
        planningMarks: [
          {
            id: 301,
            fundId: 1,
            companyId: 10,
            markDate: '2026-03-01',
            fairValue: '42000000.000000',
            currency: 'USD',
            status: 'approved',
          },
        ],
      });

      const aggregator = new MetricsAggregator();
      buildFundCompanyActualsFactsMock.mockResolvedValueOnce(liveFacts);
      const liveResult = await aggregator.getDualForecast(1);
      buildFundCompanyActualsFactsMock.mockResolvedValueOnce(partialFacts);
      const partialResult = await aggregator.getDualForecast(1);

      expect(liveFacts.facts[0]?.provenance.trustState).toBe('LIVE');
      expect(partialFacts.facts[0]?.provenance.trustState).toBe('PARTIAL');
      expect(partialFacts.facts[0]?.planningFmvStatus).toBe('active');

      // Identical numeric series; only disclosure moves.
      expect(partialResult.series).toEqual(liveResult.series);
      expect(partialResult.navAnchoring?.blendedNav).toBe(liveResult.navAnchoring?.blendedNav);
      expect(liveResult.navAnchoring?.countsByTrustState).toEqual(trustCounts({ LIVE: 1 }));
      expect(partialResult.navAnchoring?.countsByTrustState).toEqual(trustCounts({ PARTIAL: 1 }));
      expect(partialResult.navAnchoring?.companies[0]?.anchor).toBe('planning_fmv');
      expect(partialResult.actualsFacts?.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'NON_EQUITY_AMOUNT_ONLY' })])
      );
    });

    it('rung 3: no usable mark falls back to currentValuation, disclosed', async () => {
      buildFundCompanyActualsFactsMock.mockResolvedValue(makeFacts({ planningMarks: [] }));

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      expect(result.series[0]?.actual).toEqual({
        nav: 10_000_000,
        calledCapital: 25_000_000,
        distributions: 2_000_000,
        tvpi: 0.48, // (10M + 2M) / 25M
        dpi: 0.08,
        rvpi: 0.4, // 10M / 25M
        irr: 0.14,
      });
      expect(result.navAnchoring).toMatchObject({
        blendedNav: '10000000.000000',
        countsByTrustState: trustCounts({ PARTIAL: 1 }), // PLANNING_FMV_MISSING
      });
      expect(result.navAnchoring?.companies[0]).toMatchObject({
        anchor: 'legacy_current_valuation',
        contribution: '10000000.000000',
        trustState: 'PARTIAL',
      });
      expect(result.actualsFacts?.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'PLANNING_FMV_MISSING' })])
      );
    });

    it('rung 4: no mark and no legacy value is a DISCLOSED zero, and pre-money never enters NAV', async () => {
      storageMock.getPortfolioCompanies.mockResolvedValue([
        { ...baseStorageCompany(), currentValuation: null },
      ]);
      buildFundCompanyActualsFactsMock.mockResolvedValue(makeFacts({ planningMarks: [] }));

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      // The facts carry latestRoundValuation 120M pre-money; NAV must be 0.
      expect(result.actualsFacts?.companies[0]?.latestRoundValuation).toBe('120000000.000000');
      expect(result.series[0]?.actual).toMatchObject({ nav: 0, rvpi: 0 });
      expect(result.series[0]?.actual?.tvpi).toBeCloseTo(0.08, 10); // (0 + 2M) / 25M
      expect(result.navAnchoring?.blendedNav).toBe('0.000000');
      expect(result.navAnchoring?.companies[0]).toMatchObject({
        anchor: 'none',
        contribution: '0.000000',
      });
    });

    it('ADR-032 adversarial: a currency-blocked company with a large mark changes disclosure only', async () => {
      buildFundCompanyActualsFactsMock.mockResolvedValue(
        makeFacts({
          allRounds: [{ ...BASE_EQUITY_ROUND, currency: 'EUR' }],
          planningMarks: [
            {
              id: 301,
              fundId: 1,
              companyId: 10,
              markDate: '2026-03-01',
              fairValue: '999000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      );

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      // The 999M mark is CARRIED by the facts but contributes nothing; the
      // company descends to the base-currency legacy fallback (rung 3).
      expect(result.actualsFacts?.companies[0]).toMatchObject({
        currencyStatus: 'mismatch_blocked',
        planningFmvStatus: 'blocked',
        latestPlanningFmvValue: '999000000.000000',
      });
      expect(result.series[0]?.actual).toMatchObject({ nav: 10_000_000, tvpi: 0.48, rvpi: 0.4 });
      expect(result.navAnchoring).toMatchObject({
        blendedNav: '10000000.000000',
        countsByTrustState: trustCounts({ UNAVAILABLE: 1 }),
      });
      expect(result.navAnchoring?.companies[0]).toMatchObject({
        inNavUniverse: true,
        trustState: 'UNAVAILABLE',
        anchor: 'legacy_current_valuation',
        contribution: '10000000.000000',
      });
      expect(result.actualsFacts?.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'CURRENCY_MISMATCH_BLOCK' })])
      );
    });

    it('ADR-032: a blocked superseded-round chain surfaces ids and lineage while its money stays out', async () => {
      // Round 7 (EUR) supersedes round 5: the company is currency-blocked,
      // the 999M mark is refused, but activeRoundIds + supersedeLineage
      // must surface fully (ADR-032 decision 1).
      buildFundCompanyActualsFactsMock.mockResolvedValue(
        makeFacts({
          allRounds: [
            BASE_EQUITY_ROUND,
            {
              ...BASE_EQUITY_ROUND,
              id: 7,
              roundDate: '2026-02-15',
              currency: 'EUR',
              investmentAmount: '30000000.000000',
              preMoneyValuation: '150000000.000000',
              supersedesRoundId: 5,
            },
          ],
          planningMarks: [
            {
              id: 301,
              fundId: 1,
              companyId: 10,
              markDate: '2026-03-01',
              fairValue: '999000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      );

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      expect(result.actualsFacts?.companies[0]).toMatchObject({
        currencyStatus: 'mismatch_blocked',
        activeRoundIds: [7],
        supersedeLineage: [
          { roundId: 5, supersedesRoundId: null },
          { roundId: 7, supersedesRoundId: 5 },
        ],
      });
      // Money refused: neither the 999M mark nor the 150M pre-money enters;
      // the company descends to the legacy fallback.
      expect(result.series[0]?.actual?.nav).toBe(10_000_000);
      expect(result.navAnchoring?.blendedNav).toBe('10000000.000000');
      expect(result.navAnchoring?.countsByTrustState).toEqual(trustCounts({ UNAVAILABLE: 1 }));
    });

    it('exited companies stay out of the NAV universe regardless of anchor state', async () => {
      storageMock.getPortfolioCompanies.mockResolvedValue([
        { ...baseStorageCompany(), currentValuation: null },
        {
          ...baseStorageCompany(),
          id: 20,
          name: 'Exited Co',
          status: 'exited',
          currentValuation: '50000000.00',
        },
      ]);
      buildFundCompanyActualsFactsMock.mockResolvedValue(
        makeFacts({
          companies: [
            { id: 10, fundId: 1, name: 'Northstar AI' },
            { id: 20, fundId: 1, name: 'Exited Co' },
          ],
          planningMarks: [
            {
              id: 301,
              fundId: 1,
              companyId: 10,
              markDate: '2026-03-01',
              fairValue: '42000000.000000',
              currency: 'USD',
              status: 'approved',
            },
            {
              id: 302,
              fundId: 1,
              companyId: 20,
              markDate: '2026-03-01',
              fairValue: '50000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      );

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      // Only the live company contributes; the exited company's active 50M
      // mark and 50M legacy value both stay out (ADR-029 universe rule).
      expect(result.navAnchoring?.blendedNav).toBe('42000000.000000');
      expect(result.series[0]?.actual?.nav).toBe(42_000_000);
      const exited = result.navAnchoring?.companies.find((entry) => entry.companyId === 20);
      expect(exited).toEqual({
        companyId: 20,
        companyName: 'Exited Co',
        inNavUniverse: false,
        trustState: 'LIVE',
        anchor: null,
        contribution: null,
      });
    });

    it('a live company outside the facts universe descends to the legacy rungs', async () => {
      storageMock.getPortfolioCompanies.mockResolvedValue([
        baseStorageCompany(),
        {
          ...baseStorageCompany(),
          id: 30,
          name: 'Legacy Co',
          currentValuation: '5000000.00',
        },
      ]);
      buildFundCompanyActualsFactsMock.mockResolvedValue(
        makeFacts({
          planningMarks: [
            {
              id: 301,
              fundId: 1,
              companyId: 10,
              markDate: '2026-03-01',
              fairValue: '42000000.000000',
              currency: 'USD',
              status: 'approved',
            },
          ],
        })
      );

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      expect(result.navAnchoring?.blendedNav).toBe('47000000.000000');
      expect(result.series[0]?.actual?.nav).toBe(47_000_000);
      const legacyCo = result.navAnchoring?.companies.find((entry) => entry.companyId === 30);
      expect(legacyCo).toEqual({
        companyId: 30,
        companyName: 'Legacy Co',
        inNavUniverse: true,
        trustState: null, // no facts entry for this company
        anchor: 'legacy_current_valuation',
        contribution: '5000000.000000',
      });
    });

    it('a projection-engine failure becomes a disclosed structured fallback state', async () => {
      projectedCalculateMock.mockRejectedValueOnce(new Error('projection engine down'));

      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      expect(result.currentProjection).toEqual({
        status: 'fallback_default',
        fallbackReason: 'projection engine down',
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('projection engine down')])
      );
      // The as-of point still blends; future quarters come from the default
      // (zero) projection, disclosed rather than silent.
      expect(result.series[0]?.actual?.nav).toBe(30_000_000);
      expect(result.series[1]?.current).toMatchObject({
        nav: 0,
        calledCapital: 25_000_000,
        distributions: 2_000_000,
      });
      expect(DualForecastResponseSchema.parse(result)).toEqual(result);
    });

    it('every series point carries current-minus-construction variance', async () => {
      const aggregator = new MetricsAggregator();
      const result = await aggregator.getDualForecast(1);

      for (const point of result.series) {
        expect(point.variance.nav).toBe(point.current.nav - point.construction.nav);
        expect(point.variance.calledCapital).toBe(
          point.current.calledCapital - point.construction.calledCapital
        );
        expect(point.variance.distributions).toBe(
          point.current.distributions - point.construction.distributions
        );
        for (const ratio of ['tvpi', 'dpi', 'rvpi', 'irr'] as const) {
          const current = point.current[ratio];
          const construction = point.construction[ratio];
          if (current == null || construction == null) {
            expect(point.variance[ratio]).toBeNull();
          } else {
            expect(point.variance[ratio]).toBe(current - construction);
          }
        }
      }

      // Spot check the as-of quarter against explicit expectations.
      const asOf = result.series[0];
      expect(asOf?.variance.nav).toBeCloseTo(30_000_000 - (asOf?.construction.nav ?? 0), 6);
      expect(asOf?.variance.distributions).toBe(2_000_000);
    });
  });
});
