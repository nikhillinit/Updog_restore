import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type {
  BacktestJobStatusResponse,
  BacktestResult,
  DistributionSummary,
} from '@shared/types/backtesting';
import { createWouterWrapper } from '../../utils/withWouter';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
}));

import { useBacktestLifecycle } from '@/hooks/useBacktesting';

function makeDistribution(overrides: Partial<DistributionSummary> = {}): DistributionSummary {
  return {
    mean: 0.12,
    median: 0.11,
    p5: 0.05,
    p25: 0.09,
    p75: 0.14,
    p95: 0.18,
    min: 0.01,
    max: 0.22,
    standardDeviation: 0.03,
    ...overrides,
  };
}

function makeJobStatusResponse(
  overrides: Partial<BacktestJobStatusResponse> = {}
): BacktestJobStatusResponse {
  return {
    jobId: 'job-123',
    fundId: 7,
    status: 'completed',
    stage: 'persisting',
    progressPercent: 100,
    updatedAt: '2026-04-03T00:00:00.000Z',
    resultRef: { backtestId: 'bt-123' },
    links: {
      self: '/api/backtesting/jobs/job-123',
      poll: '/api/backtesting/jobs/job-123',
    },
    ...overrides,
  };
}

function makeBacktestResult(): BacktestResult {
  return {
    backtestId: 'bt-123',
    config: {
      fundId: 7,
      startDate: '2020-01-01',
      endDate: '2025-01-01',
      simulationRuns: 1000,
      comparisonMetrics: ['irr'],
    },
    executionTimeMs: 1200,
    timestamp: '2026-04-03T00:00:00.000Z',
    simulationSummary: {
      runs: 1000,
      metrics: {
        irr: makeDistribution(),
      },
      engineUsed: 'streaming',
      executionTimeMs: 1200,
    },
    actualPerformance: {
      asOfDate: '2025-01-01',
      irr: 0.13,
      tvpi: null,
      dpi: null,
      multiple: null,
      deployedCapital: 1000000,
      distributedCapital: 200000,
      residualValue: 1200000,
      dataSource: 'baseline',
      dataFreshness: 'fresh',
    },
    validationMetrics: {
      meanAbsoluteError: { irr: 0.01 },
      rootMeanSquareError: { irr: 0.01 },
      percentileHitRates: {
        p50: { irr: true },
        p90: { irr: true },
        p100: { irr: true },
      },
      modelQualityScore: 92,
      calibrationStatus: 'well-calibrated',
      incalculableMetrics: [],
    },
    dataQuality: {
      hasBaseline: true,
      baselineAgeInDays: 10,
      varianceHistoryCount: 4,
      snapshotAvailable: true,
      isStale: false,
      warnings: [],
      overallQuality: 'good',
    },
    recommendations: [],
    scenarioComparisons: [],
  };
}

function createHookWrapper(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const { Wrapper: RouterWrapper } = createWouterWrapper(initialPath);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RouterWrapper>{children}</RouterWrapper>
    </QueryClientProvider>
  );

  return { Wrapper, queryClient };
}

describe('useBacktestLifecycle', () => {
  afterEach(() => {
    apiRequestMock.mockReset();
  });

  it('clears a resumed job when it belongs to a different fund', async () => {
    apiRequestMock.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/backtesting/jobs/job-123') {
        return makeJobStatusResponse({
          fundId: 99,
          status: 'simulating',
          stage: 'simulating',
          progressPercent: 45,
          resultRef: undefined,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const { Wrapper } = createHookWrapper('/sensitivity-analysis?jobId=job-123');
    const { result } = renderHook(() => useBacktestLifecycle(7), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.activeJobId).toBeNull();
    });

    expect(result.current.jobStatus.phase).toBe('idle');
    expect(result.current.resumeMismatch).toEqual({
      jobId: 'job-123',
      actualFundId: 99,
    });
  });

  it('keeps a resumed job when it belongs to the selected fund', async () => {
    apiRequestMock.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/backtesting/jobs/job-123') {
        return makeJobStatusResponse();
      }

      if (url === '/api/backtesting/result/bt-123') {
        return { result: makeBacktestResult() };
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const { Wrapper } = createHookWrapper('/sensitivity-analysis?jobId=job-123');
    const { result } = renderHook(() => useBacktestLifecycle(7), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.result?.backtestId).toBe('bt-123');
    });

    expect(result.current.activeJobId).toBe('job-123');
    expect(result.current.jobStatus.phase).toBe('completed');
    expect(result.current.resumeMismatch).toBeNull();
  });
});
