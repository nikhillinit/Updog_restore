import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isUnifiedFundMetrics } from '@shared/types/metrics';

const { storageMock, actualCalculateMock, projectedCalculateMock } = vi.hoisted(() => ({
  storageMock: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getFundConfig: vi.fn(),
  },
  actualCalculateMock: vi.fn(),
  projectedCalculateMock: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

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

// VarianceCalculator is deliberately NOT mocked: a null projection must reach the
// API payload unaltered through the real variance lane.
import { MetricsAggregator } from '../../../server/services/metrics-aggregator';

const unavailableProjected = {
  asOfDate: '2026-04-01T00:00:00.000Z',
  projectionDate: '2026-04-01T00:00:00.000Z',
  projectedDeployment: Array(12).fill(1_000_000),
  projectedDistributions: null,
  projectedNAV: null,
  expectedTVPI: null,
  expectedIRR: null,
  expectedDPI: null,
  totalReserveNeeds: 5_000_000,
  allocatedReserves: 2_000_000,
  unallocatedReserves: 3_000_000,
  reserveAllocationRate: 40,
  deploymentPace: 'on-track' as const,
  quartersRemaining: 12,
  recommendedQuarterlyDeployment: 1_000_000,
};

describe('MetricsAggregator projected lane when cohort projections are unavailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    storageMock.getFund.mockResolvedValue({
      id: 1,
      name: 'Test Fund',
      size: '100000000',
      deployedCapital: '25000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2024,
      establishmentDate: '2024-01-15',
      status: 'active',
      isActive: true,
      createdAt: new Date('2024-01-15T00:00:00.000Z'),
    });
    storageMock.getPortfolioCompanies.mockResolvedValue([
      {
        id: 1,
        fundId: 1,
        name: 'Portfolio Co',
        investmentAmount: '1000000',
        stage: 'Seed',
        currentStage: 'Seed',
        sector: 'SaaS',
        ownershipCurrentPct: '0.1',
        investmentDate: new Date('2024-06-01T00:00:00.000Z'),
        status: 'active',
      },
    ]);
    storageMock.getFundConfig.mockResolvedValue({
      id: 21,
      fundId: 1,
      version: 1,
      config: {
        fundName: 'Test Fund',
        fundSize: 100000000,
        fundLife: 10,
        investmentPeriod: 5,
        targetMetrics: {
          targetIRR: 0.3,
          targetTVPI: 3.1,
          targetDPI: 1.8,
          targetCompanyCount: 28,
          targetReserveRatio: 0.45,
        },
      },
      isDraft: false,
      isPublished: true,
      publishedAt: new Date('2026-03-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    actualCalculateMock.mockResolvedValue({
      asOfDate: '2026-04-01T00:00:00.000Z',
      totalCommitted: 100000000,
      totalCalled: 25000000,
      totalDeployed: 25000000,
      totalUncalled: 75000000,
      currentNAV: 30000000,
      totalDistributions: 0,
      totalValue: 30000000,
      irr: 0.12,
      tvpi: 1.2,
      dpi: 0,
      rvpi: 1.2,
      activeCompanies: 1,
      exitedCompanies: 0,
      writtenOffCompanies: 0,
      totalCompanies: 1,
      deploymentRate: 25,
      averageCheckSize: 1000000,
      fundAgeMonths: 27,
    });

    projectedCalculateMock.mockResolvedValue(unavailableProjected);
  });

  it('labels the projected engine partial and carries null projections to the payload', async () => {
    const aggregator = new MetricsAggregator();
    const metrics = await aggregator.getUnifiedMetrics(1, { skipCache: true });

    expect(isUnifiedFundMetrics(metrics)).toBe(true);
    expect(metrics._status?.engines.projected).toBe('partial');
    expect(metrics._status?.quality).toBe('partial');
    expect(metrics._status?.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Cohort projections unavailable')])
    );

    // Config targets must not leak into projections.
    expect(metrics.projected.expectedTVPI).toBeNull();
    expect(metrics.projected.expectedIRR).toBeNull();
    expect(metrics.projected.expectedDPI).toBeNull();
    expect(metrics.projected.projectedDistributions).toBeNull();
    expect(metrics.projected.projectedNAV).toBeNull();
    expect(metrics.target.targetTVPI).toBe(3.1);

    expect(metrics.variance.tvpiVariance.projected).toBeNull();
    expect(metrics.variance.tvpiVariance.varianceVsProjected).toBeNull();
    expect(metrics.variance.tvpiVariance.varianceVsTarget).toBeCloseTo(1.2 - 3.1, 10);
  });

  it('keeps the skipped-projections default free of config targets', async () => {
    const aggregator = new MetricsAggregator();
    const metrics = await aggregator.getUnifiedMetrics(1, {
      skipCache: true,
      skipProjections: true,
    });

    expect(projectedCalculateMock).not.toHaveBeenCalled();
    expect(metrics._status?.engines.projected).toBe('skipped');
    expect(metrics._status?.quality).toBe('partial');
    expect(metrics.projected.expectedTVPI).toBeNull();
    expect(metrics.projected.expectedIRR).toBeNull();
    expect(metrics.projected.expectedDPI).toBeNull();
    expect(metrics.projected.projectedNAV).toBeNull();
    expect(metrics.projected.projectedDistributions).toBeNull();
    expect(metrics.variance.tvpiVariance.varianceVsProjected).toBeNull();
  });
});
