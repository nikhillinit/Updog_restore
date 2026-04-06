import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isUnifiedFundMetrics } from '@shared/types/metrics';

const {
  storageMock,
  actualCalculateMock,
  projectedCalculateMock,
  varianceCalculateMock,
} = vi.hoisted(() => ({
  storageMock: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getFundConfig: vi.fn(),
  },
  actualCalculateMock: vi.fn(),
  projectedCalculateMock: vi.fn(),
  varianceCalculateMock: vi.fn(),
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

import { MetricsAggregator } from '../../../server/services/metrics-aggregator';

describe('MetricsAggregator config-backed target metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    storageMock.getFund.mockResolvedValue({
      id: 1,
      name: 'Test Fund',
      size: '100000000',
      deployedCapital: '25000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
      establishmentDate: '2026-01-15',
      status: 'active',
      isActive: true,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });
    storageMock.getPortfolioCompanies.mockResolvedValue([]);

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
      dpi: null,
      rvpi: 1.2,
      activeCompanies: 0,
      exitedCompanies: 0,
      writtenOffCompanies: 0,
      totalCompanies: 0,
      deploymentRate: 25,
      averageCheckSize: 0,
      fundAgeMonths: 3,
    });

    projectedCalculateMock.mockImplementation(async (_fund: unknown, _companies: unknown, config: any) => ({
      asOfDate: '2026-04-01T00:00:00.000Z',
      projectionDate: '2026-04-01T00:00:00.000Z',
      projectedDeployment: Array(12).fill(0),
      projectedDistributions: Array(12).fill(0),
      projectedNAV: Array(12).fill(0),
      expectedTVPI: config.targetTVPI ?? 2.5,
      expectedIRR: config.targetIRR ?? 0.25,
      expectedDPI: config.targetDPI ?? 1,
      totalReserveNeeds: 0,
      allocatedReserves: 0,
      unallocatedReserves: 0,
      reserveAllocationRate: 0,
      deploymentPace: 'on-track',
      quartersRemaining: 12,
      recommendedQuarterlyDeployment: 0,
    }));

    varianceCalculateMock.mockImplementation((actual: any, projected: any, target: any) => ({
      deploymentVariance: {
        actual: actual.totalDeployed,
        target: target.targetFundSize / Math.max(target.targetDeploymentYears, 1),
        variance: 0,
        percentDeviation: 0,
        status: 'on-track',
      },
      performanceVariance: {
        actualIRR: actual.irr,
        targetIRR: target.targetIRR,
        variance: actual.irr - target.targetIRR,
        status: 'on-track',
      },
      tvpiVariance: {
        actual: actual.tvpi,
        projected: projected.expectedTVPI,
        target: target.targetTVPI,
        varianceVsProjected: actual.tvpi - projected.expectedTVPI,
        varianceVsTarget: actual.tvpi - target.targetTVPI,
      },
      paceVariance: {
        status: 'on-track',
        monthsDeviation: 0,
        periodElapsedPercent: 25,
        capitalDeployedPercent: 25,
      },
      portfolioVariance: {
        actualCompanies: actual.totalCompanies,
        targetCompanies: target.targetCompanyCount,
        variance: actual.totalCompanies - target.targetCompanyCount,
        onTrack: true,
      },
    }));
  });

  it('uses published config target metrics when present', async () => {
    storageMock.getFund.mockResolvedValueOnce({
      id: 1,
      name: 'Test Fund',
      size: '90000000',
      deployedCapital: '25000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2026,
      establishmentDate: '2026-01-15',
      status: 'active',
      isActive: true,
      createdAt: new Date('2026-01-15T00:00:00.000Z'),
    });

    storageMock.getFundConfig.mockResolvedValue({
      id: 11,
      fundId: 1,
      version: 3,
      config: {
        fundName: 'Test Fund',
        fundSize: 100000000,
        fundLife: 10,
        investmentPeriod: 5,
        futureModelMetadata: {
          strategyId: 'strat-1',
        },
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

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getUnifiedMetrics(1);

    expect(isUnifiedFundMetrics(result)).toBe(true);
    expect(result.target.targetFundSize).toBe(100000000);
    expect(result.target.targetIRR).toBe(0.3);
    expect(result.target.targetTVPI).toBe(3.1);
    expect(result.target.targetDPI).toBe(1.8);
    expect(result.target.targetCompanyCount).toBe(28);
    expect(result.target.targetReserveRatio).toBe(0.45);
    expect(result.target.targetDeploymentYears).toBe(5);
    expect(result.projected.expectedIRR).toBe(0.3);
    expect(result.projected.expectedTVPI).toBe(3.1);
    expect(projectedCalculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        size: '100000000',
      }),
      expect.any(Array),
      expect.objectContaining({
        targetIRR: 0.3,
        targetTVPI: 3.1,
        targetDPI: 1.8,
        investmentPeriodYears: 5,
        fundTermYears: 10,
        targetCompanyCount: 28,
      }),
      expect.objectContaining({
        useConstructionForecast: true,
      })
    );
    expect(result._status?.warnings ?? []).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('legacy generic targets'),
      ])
    );
  });

  it('keeps legacy fallback explicit when target metrics are missing', async () => {
    storageMock.getFundConfig.mockResolvedValue({
      id: 12,
      fundId: 1,
      version: 1,
      config: {
        fundName: 'Legacy Fund',
        fundSize: 100000000,
        fundLife: 8,
        investmentPeriod: 4,
      },
      isDraft: false,
      isPublished: true,
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getUnifiedMetrics(1);

    expect(isUnifiedFundMetrics(result)).toBe(true);
    expect(result.target.targetIRR).toBe(0.25);
    expect(result.target.targetTVPI).toBe(2.5);
    expect(result.target.targetCompanyCount).toBe(20);
    expect(result.target.targetDeploymentYears).toBe(4);
    expect(result.projected.expectedIRR).toBe(0.25);
    expect(result._status?.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('has no targetMetrics block'),
      ])
    );
  });

  it('preserves config-backed targetDPI when projections are skipped', async () => {
    storageMock.getFundConfig.mockResolvedValue({
      id: 13,
      fundId: 1,
      version: 4,
      config: {
        fundName: 'Fast Path Fund',
        fundSize: 100000000,
        fundLife: 10,
        investmentPeriod: 5,
        targetMetrics: {
          targetIRR: 0.27,
          targetTVPI: 2.9,
          targetDPI: 1.6,
          targetCompanyCount: 24,
        },
      },
      isDraft: false,
      isPublished: true,
      publishedAt: new Date('2026-03-10T00:00:00.000Z'),
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
    });

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getUnifiedMetrics(1, { skipProjections: true });

    expect(isUnifiedFundMetrics(result)).toBe(true);
    expect(result.projected.expectedIRR).toBe(0.27);
    expect(result.projected.expectedTVPI).toBe(2.9);
    expect(result.projected.expectedDPI).toBe(1.6);
    expect(result._status?.engines.projected).toBe('skipped');
  });

  it('falls back explicitly when published config contains invalid metrics-driving values', async () => {
    storageMock.getFundConfig.mockResolvedValue({
      id: 14,
      fundId: 1,
      version: 5,
      config: {
        fundName: 'Broken Fund',
        fundSize: 100000000,
        fundLife: 0,
        investmentPeriod: 0,
        targetMetrics: {
          targetIRR: 0.22,
          targetTVPI: 2.2,
          targetCompanyCount: 20,
        },
      },
      isDraft: false,
      isPublished: true,
      publishedAt: new Date('2026-03-15T00:00:00.000Z'),
      createdAt: new Date('2026-03-15T00:00:00.000Z'),
      updatedAt: new Date('2026-03-15T00:00:00.000Z'),
    });

    const aggregator = new MetricsAggregator();
    const result = await aggregator.getUnifiedMetrics(1);

    expect(result.target.targetIRR).toBe(0.25);
    expect(result.target.targetTVPI).toBe(2.5);
    expect(result._status?.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid for target extraction'),
      ])
    );
  });
});
