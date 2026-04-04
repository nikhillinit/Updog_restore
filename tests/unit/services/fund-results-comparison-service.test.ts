import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPARISON_METRIC_KEYS } from '@shared/contracts/fund-results-comparison-v1.contract';

const findFundMock = vi.fn();
const selectPublishedConfigsLimitMock = vi.fn();
const findCalcRunMock = vi.fn();
const findSnapshotMock = vi.fn();

vi.mock('../../../server/db', () => ({
  db: {
    query: {
      funds: {
        findFirst: findFundMock,
      },
      calcRuns: {
        findFirst: findCalcRunMock,
      },
      fundSnapshots: {
        findFirst: findSnapshotMock,
      },
    },
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: selectPublishedConfigsLimitMock,
          }),
        }),
      }),
    })),
  },
}));

describe('FundResultsComparisonService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when fund does not exist', async () => {
    findFundMock.mockResolvedValue(null);

    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );

    await expect(fundResultsComparisonService.getComparison(123)).resolves.toBeNull();
  });

  it('returns no_published_version when fund exists but no published configs exist', async () => {
    findFundMock.mockResolvedValue({
      id: 1,
      name: 'Alpha',
      size: '100000000',
    });
    selectPublishedConfigsLimitMock.mockResolvedValue([]);

    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );

    await expect(fundResultsComparisonService.getComparison(1)).resolves.toMatchObject({
      fundId: 1,
      comparisonStatus: 'no_published_version',
      currentVersion: null,
      previousVersion: null,
      metricDeltas: [],
    });
  });

  it('returns no_previous_version with current metrics when only one published version exists', async () => {
    findFundMock.mockResolvedValue({
      id: 1,
      name: 'Alpha',
      size: '100000000',
    });
    selectPublishedConfigsLimitMock.mockResolvedValue([
      {
        id: 11,
        version: 3,
        publishedAt: new Date('2026-03-29T12:00:00.000Z'),
        config: { fundSize: 120000000 },
      },
    ]);
    findCalcRunMock.mockResolvedValue({
      id: 90,
      dispatchState: 'dispatched',
      completedAt: new Date('2026-03-29T12:30:00.000Z'),
      failedAt: null,
      correlationId: 'corr-90',
    });
    findSnapshotMock
      .mockResolvedValueOnce({
        payload: {
          totalAllocation: 60000000,
          avgConfidence: 0.62,
          allocations: [],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          avgQuarterlyDeployment: 5000000,
          totalQuarters: 12,
          marketCondition: 'neutral',
          deployments: [],
        },
      });

    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );

    const result = await fundResultsComparisonService.getComparison(1);

    expect(result).toMatchObject({
      fundId: 1,
      comparisonStatus: 'no_previous_version',
      previousVersion: null,
      metricDeltas: [],
    });
    expect(result?.currentVersion).toMatchObject({
      version: 3,
      calcRun: {
        runId: 90,
        status: 'ready',
        correlationId: 'corr-90',
      },
      metrics: {
        fundSize: 120000000,
        reserveRatio: 0.5,
        avgConfidence: 0.62,
        yearsToFullDeploy: 3,
      },
    });
  });

  it('returns comparable versions with metric deltas', async () => {
    findFundMock.mockResolvedValue({
      id: 1,
      name: 'Alpha',
      size: '100000000',
    });
    selectPublishedConfigsLimitMock.mockResolvedValue([
      {
        id: 22,
        version: 4,
        publishedAt: new Date('2026-03-29T12:00:00.000Z'),
        config: { fundSize: 125000000 },
      },
      {
        id: 21,
        version: 3,
        publishedAt: new Date('2026-03-20T10:00:00.000Z'),
        config: { fundSize: 100000000 },
      },
    ]);

    findCalcRunMock
      .mockResolvedValueOnce({
        id: 91,
        dispatchState: 'dispatched',
        completedAt: new Date('2026-03-29T12:30:00.000Z'),
        failedAt: null,
        correlationId: 'corr-91',
      })
      .mockResolvedValueOnce({
        id: 81,
        dispatchState: 'partial',
        completedAt: null,
        failedAt: null,
        correlationId: 'corr-81',
      });

    findSnapshotMock
      .mockResolvedValueOnce({
        payload: {
          totalAllocation: 62500000,
          avgConfidence: 0.7,
          allocations: [],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          avgQuarterlyDeployment: 6250000,
          totalQuarters: 16,
          marketCondition: 'neutral',
          deployments: [],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          totalAllocation: 40000000,
          avgConfidence: 0.55,
          allocations: [],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          avgQuarterlyDeployment: 5000000,
          totalQuarters: 12,
          marketCondition: 'neutral',
          deployments: [],
        },
      });

    const { fundResultsComparisonService } = await import(
      '../../../server/services/fund-results-comparison-service'
    );

    const result = await fundResultsComparisonService.getComparison(1);

    expect(result?.comparisonStatus).toBe('comparable');
    expect(result?.currentVersion?.version).toBe(4);
    expect(result?.previousVersion?.version).toBe(3);
    expect(result?.previousVersion?.calcRun?.status).toBe('calculating');
    expect(result?.metricDeltas.map((delta) => delta.metric)).toEqual([
      ...COMPARISON_METRIC_KEYS,
    ]);

    expect(result?.metricDeltas[0]).toMatchObject({
      metric: 'fundSize',
      currentValue: 125000000,
      previousValue: 100000000,
      absoluteDelta: 25000000,
      percentageDelta: 25,
      driftCapable: true,
      driftReason: 'stable',
    });
    expect(result?.metricDeltas[1]).toMatchObject({
      metric: 'reserveRatio',
      currentValue: 0.5,
      previousValue: 0.4,
      driftCapable: true,
      driftReason: 'stable',
    });
    expect(result?.metricDeltas[1]?.absoluteDelta).toBeCloseTo(0.1);
    expect(result?.metricDeltas[1]?.percentageDelta).toBeCloseTo(25);
    expect(result?.metricDeltas[2]).toMatchObject({
      metric: 'avgConfidence',
      currentValue: 0.7,
      previousValue: 0.55,
      driftCapable: true,
      driftReason: 'stable',
    });
    expect(result?.metricDeltas[2]?.absoluteDelta).toBeCloseTo(0.15);
    expect(result?.metricDeltas[3]).toMatchObject({
      metric: 'yearsToFullDeploy',
      currentValue: 4,
      previousValue: 3,
      absoluteDelta: 1,
      driftCapable: true,
      driftReason: 'stable',
    });
  });
});
