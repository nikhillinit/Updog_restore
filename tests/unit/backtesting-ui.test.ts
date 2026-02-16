import { describe, expect, it } from 'vitest';
import {
  toJobViewModel,
  toResultViewModel,
  toRenderableMetric,
  classifyErrorTier,
  ERROR_TIER_MESSAGES,
  type RenderableDistribution,
  type RenderableMetricState,
} from '../../client/src/types/backtesting-ui';
import type {
  BacktestJobStatusResponse,
  BacktestMetric,
  BacktestResult,
  BacktestingJobStatus,
  DistributionSummary,
} from '../../shared/types/backtesting';

function makeJobStatusResponse(
  overrides: Partial<BacktestJobStatusResponse> = {}
): BacktestJobStatusResponse {
  return {
    jobId: 'job-123',
    status: 'simulating',
    stage: 'simulating',
    progressPercent: 45,
    message: undefined,
    correlationId: 'corr-123',
    error: undefined,
    resultRef: undefined,
    updatedAt: '2025-01-01T00:00:00.000Z',
    links: {
      self: '/api/backtesting/jobs/job-123',
      poll: '/api/backtesting/jobs/job-123/status',
    },
    ...overrides,
  };
}

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

function makeActualPerformance(metric: BacktestMetric): BacktestResult['actualPerformance'] {
  return {
    asOfDate: '2025-01-01',
    irr: metric === 'irr' ? 0.13 : null,
    tvpi: metric === 'tvpi' ? 1.7 : null,
    dpi: metric === 'dpi' ? 0.7 : null,
    multiple: metric === 'multiple' ? 1.8 : null,
    deployedCapital: 1000000,
    distributedCapital: 200000,
    residualValue: 1200000,
    dataSource: 'baseline',
    dataFreshness: 'fresh',
  };
}

function makeValidationMetrics(metric: BacktestMetric): BacktestResult['validationMetrics'] {
  return {
    meanAbsoluteError: { [metric]: 0.02 },
    rootMeanSquareError: { [metric]: 0.03 },
    percentileHitRates: {
      p50: { [metric]: true },
      p90: { [metric]: true },
      p100: { [metric]: true },
    },
    modelQualityScore: 95,
    calibrationStatus: 'well-calibrated',
    incalculableMetrics: [],
  };
}

function makeDataQuality(): BacktestResult['dataQuality'] {
  return {
    hasBaseline: true,
    baselineAgeInDays: 0,
    varianceHistoryCount: 12,
    snapshotAvailable: true,
    isStale: false,
    warnings: [],
    overallQuality: 'good',
  };
}

function makeBacktestResult(
  metric: BacktestMetric = 'irr',
  dist: DistributionSummary = makeDistribution()
): BacktestResult {
  return {
    backtestId: 'bt-123',
    timestamp: '2025-01-01T00:00:00.000Z',
    executionTimeMs: 1234,
    config: {
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2025-01-01',
      simulationRuns: 1000,
      comparisonMetrics: [metric],
    },
    simulationSummary: {
      runs: 1000,
      metrics: {
        [metric]: dist,
      },
      engineUsed: 'traditional',
      executionTimeMs: 1234,
    },
    actualPerformance: makeActualPerformance(metric),
    validationMetrics: makeValidationMetrics(metric),
    dataQuality: makeDataQuality(),
    recommendations: [],
    scenarioComparisons: [],
  };
}

function setActualMetricValue(
  result: BacktestResult,
  metric: BacktestMetric,
  value: number | null
): void {
  if (metric === 'irr') result.actualPerformance.irr = value;
  if (metric === 'tvpi') result.actualPerformance.tvpi = value;
  if (metric === 'dpi') result.actualPerformance.dpi = value;
  if (metric === 'multiple') result.actualPerformance.multiple = value;
}

function metricState(
  distribution: RenderableDistribution | undefined
): RenderableMetricState | undefined {
  return distribution?.actual;
}

describe('toJobViewModel: guards and message semantics', () => {
  it('returns idle empty view model when response is null', () => {
    const vm = toJobViewModel(null, 'job-123');
    expect(vm).toEqual({
      jobId: null,
      phase: 'idle',
      status: null,
      stage: null,
      progressPercent: 0,
      message: '',
      isTerminal: false,
      correlationId: null,
      errorCode: null,
      errorMessage: null,
      isRetryable: false,
      backtestId: null,
    });
  });

  it('returns idle empty view model when jobId is null', () => {
    const vm = toJobViewModel(makeJobStatusResponse(), null);
    expect(vm.phase).toBe('idle');
    expect(vm.jobId).toBeNull();
    expect(vm.status).toBeNull();
  });

  it('preserves empty message string without stage fallback', () => {
    const vm = toJobViewModel(makeJobStatusResponse({ message: '' }), 'job-123');
    expect(vm.message).toBe('');
    expect(vm.message).not.toBe('Running simulation');
  });

  it('falls back to stage label when message is undefined', () => {
    const vm = toJobViewModel(
      makeJobStatusResponse({ stage: 'simulating', message: undefined }),
      'job-123'
    );
    expect(vm.message).toBe('Running simulation');
  });
});

describe('toJobViewModel: phase and terminal mapping', () => {
  it('falls back to stage label when message is null at runtime', () => {
    const response = makeJobStatusResponse({ stage: 'simulating' });
    (response as BacktestJobStatusResponse & { message: string | null }).message = null;
    const vm = toJobViewModel(response, 'job-123');
    expect(vm.message).toBe('Running simulation');
  });

  it.each([
    { status: 'queued', phase: 'queued', isTerminal: false },
    { status: 'simulating', phase: 'running', isTerminal: false },
    { status: 'completed', phase: 'completed', isTerminal: true },
    { status: 'failed', phase: 'failed', isTerminal: true },
    { status: 'timed_out', phase: 'failed', isTerminal: true },
    { status: 'cancelled', phase: 'failed', isTerminal: true },
  ] as const)(
    'maps status "$status" to phase "$phase" and terminal=$isTerminal',
    ({ status, phase, isTerminal }) => {
      const vm = toJobViewModel(
        makeJobStatusResponse({ status: status as BacktestingJobStatus }),
        'job-123'
      );
      expect(vm.phase).toBe(phase);
      expect(vm.isTerminal).toBe(isTerminal);
    }
  );
});

describe('toResultViewModel: distribution filtering', () => {
  it('filters out distribution containing NaN', () => {
    const result = makeBacktestResult('irr', makeDistribution({ median: Number.NaN }));
    const vm = toResultViewModel(result);
    expect(vm.distributions).toHaveLength(0);
  });

  it('filters out distribution containing Infinity', () => {
    const result = makeBacktestResult('tvpi', makeDistribution({ max: Number.POSITIVE_INFINITY }));
    const vm = toResultViewModel(result);
    expect(vm.distributions).toHaveLength(0);
  });

  it('includes valid distributions', () => {
    const result = makeBacktestResult('dpi', makeDistribution());
    const vm = toResultViewModel(result);
    expect(vm.distributions).toHaveLength(1);
    expect(vm.distributions[0].metric).toBe('dpi');
    expect(metricState(vm.distributions[0])?.status).toBe('ready');
  });
});

describe('toResultViewModel: metric-state semantics', () => {
  it('marks actual as insufficient_data when metric is incalculable', () => {
    const result = makeBacktestResult('irr', makeDistribution());
    result.validationMetrics.incalculableMetrics = ['irr'];

    const vm = toResultViewModel(result);
    expect(vm.distributions).toHaveLength(1);
    const actual = metricState(vm.distributions[0]);
    expect(actual?.status).toBe('insufficient_data');
    if (actual?.status === 'insufficient_data') {
      expect(actual.reason).toContain('Insufficient data');
    }
  });

  it('marks actual as unavailable when actual value is null', () => {
    const result = makeBacktestResult('tvpi', makeDistribution());
    setActualMetricValue(result, 'tvpi', null);

    const vm = toResultViewModel(result);
    expect(vm.distributions).toHaveLength(1);
    expect(metricState(vm.distributions[0])?.status).toBe('unavailable');
  });

  it('defaults scenarioComparisons to empty array when absent', () => {
    const result = makeBacktestResult('irr', makeDistribution());
    delete result.scenarioComparisons;

    const vm = toResultViewModel(result);
    expect(vm.scenarioComparisons).toEqual([]);
  });
});

describe('toRenderableMetric', () => {
  it('returns ready state for finite value', () => {
    const state = toRenderableMetric(0.15, 'irr', []);
    expect(state).toEqual({ status: 'ready', value: 0.15 });
  });

  it('returns insufficient_data when metric is in incalculable list', () => {
    const state = toRenderableMetric(0.15, 'irr', ['irr']);
    expect(state.status).toBe('insufficient_data');
    if (state.status === 'insufficient_data') {
      expect(state.reason).toContain('irr');
    }
  });

  it('returns unavailable for null value', () => {
    const state = toRenderableMetric(null, 'tvpi', []);
    expect(state.status).toBe('unavailable');
  });

  it('returns unavailable for undefined value', () => {
    const state = toRenderableMetric(undefined, 'dpi', []);
    expect(state.status).toBe('unavailable');
  });

  it('returns unavailable for NaN', () => {
    const state = toRenderableMetric(Number.NaN, 'irr', []);
    expect(state.status).toBe('unavailable');
  });

  it('returns unavailable for Infinity', () => {
    const state = toRenderableMetric(Number.POSITIVE_INFINITY, 'tvpi', []);
    expect(state.status).toBe('unavailable');
  });

  it('prioritizes incalculable over invalid value', () => {
    const state = toRenderableMetric(null, 'irr', ['irr']);
    expect(state.status).toBe('insufficient_data');
  });
});

describe('classifyErrorTier', () => {
  it('maps VALIDATION_ERROR to user_fixable', () => {
    expect(classifyErrorTier('VALIDATION_ERROR')).toBe('user_fixable');
  });

  it('maps DATA_QUALITY_LIMITATION to data_quality', () => {
    expect(classifyErrorTier('DATA_QUALITY_LIMITATION')).toBe('data_quality');
  });

  it('maps SYSTEM_EXECUTION_FAILURE to system_error', () => {
    expect(classifyErrorTier('SYSTEM_EXECUTION_FAILURE')).toBe('system_error');
  });

  it('defaults null to system_error', () => {
    expect(classifyErrorTier(null)).toBe('system_error');
  });
});

describe('ERROR_TIER_MESSAGES', () => {
  it('provides title and guidance for each tier', () => {
    const tiers = ['user_fixable', 'data_quality', 'system_error'] as const;
    for (const tier of tiers) {
      const msg = ERROR_TIER_MESSAGES[tier];
      expect(msg.title).toBeTruthy();
      expect(msg.guidance).toBeTruthy();
    }
  });
});
