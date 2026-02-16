/**
 * Backtesting UI View Models
 *
 * Adapters that transform raw API responses into renderable state.
 * Guarantees: no null/NaN/Infinity reaches chart components.
 */

import type {
  BacktestResult,
  BacktestJobStatusResponse,
  BacktestMetric,
  BacktestingJobStatus,
  BacktestingJobStage,
  DistributionSummary,
  CalibrationStatus,
  DataQualityResult,
  ScenarioComparison,
  BacktestingJobErrorCode,
} from '@shared/types/backtesting';

// ============================================================================
// RENDERABLE METRIC STATE
// ============================================================================

export type RenderableMetricState =
  | { status: 'ready'; value: number }
  | { status: 'unavailable'; reason: string }
  | { status: 'insufficient_data'; reason: string };

export function toRenderableMetric(
  value: number | null | undefined,
  metricName: string,
  incalculableMetrics: string[]
): RenderableMetricState {
  if (incalculableMetrics.includes(metricName)) {
    return { status: 'insufficient_data', reason: `Insufficient data for ${metricName}` };
  }
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { status: 'unavailable', reason: `${metricName} is not available` };
  }
  return { status: 'ready', value };
}

// ============================================================================
// RENDERABLE DISTRIBUTION
// ============================================================================

export interface RenderableDistribution {
  metric: BacktestMetric;
  label: string;
  distribution: DistributionSummary;
  actual: RenderableMetricState;
  hitP50: boolean | null;
  hitP90: boolean | null;
}

// ============================================================================
// JOB VIEW MODEL
// ============================================================================

export type JobPhase = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface BacktestJobViewModel {
  jobId: string | null;
  phase: JobPhase;
  status: BacktestingJobStatus | null;
  stage: BacktestingJobStage | null;
  progressPercent: number;
  message: string;
  isTerminal: boolean;
  correlationId: string | null;
  errorCode: BacktestingJobErrorCode | null;
  errorMessage: string | null;
  isRetryable: boolean;
  backtestId: string | null;
}

const TERMINAL_STATUSES: ReadonlySet<BacktestingJobStatus> = new Set([
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);

const STAGE_LABELS: Record<BacktestingJobStage, string> = {
  queued: 'Queued',
  validating_input: 'Validating inputs',
  simulating: 'Running simulation',
  calibrating: 'Calibrating model',
  persisting: 'Saving results',
};

const EMPTY_JOB_STATE: Omit<BacktestJobViewModel, 'jobId'> = {
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
};

function createEmptyJobViewModel(): BacktestJobViewModel {
  return {
    jobId: null,
    ...EMPTY_JOB_STATE,
  };
}

function getJobPhase(status: BacktestingJobStatus): JobPhase {
  const isTerminal = TERMINAL_STATUSES.has(status);
  if (isTerminal) {
    return status === 'completed' ? 'completed' : 'failed';
  }
  return status === 'queued' ? 'queued' : 'running';
}

function getJobMessage(response: BacktestJobStatusResponse): string {
  return response.message ?? STAGE_LABELS[response.stage] ?? '';
}

function getJobErrorInfo(
  response: BacktestJobStatusResponse
): Pick<BacktestJobViewModel, 'errorCode' | 'errorMessage' | 'isRetryable'> {
  return {
    errorCode: response.error?.code ?? null,
    errorMessage: response.error?.message ?? null,
    isRetryable: response.error?.retryable ?? false,
  };
}

export function toJobViewModel(
  response: BacktestJobStatusResponse | null,
  jobId: string | null
): BacktestJobViewModel {
  if (!response || !jobId) {
    return createEmptyJobViewModel();
  }

  return {
    jobId: response.jobId,
    phase: getJobPhase(response.status),
    status: response.status,
    stage: response.stage,
    progressPercent: response.progressPercent,
    message: getJobMessage(response),
    isTerminal: TERMINAL_STATUSES.has(response.status),
    correlationId: response.correlationId ?? null,
    ...getJobErrorInfo(response),
    backtestId: response.resultRef?.backtestId ?? null,
  };
}

// ============================================================================
// RESULT VIEW MODEL
// ============================================================================

export interface BacktestResultViewModel {
  backtestId: string;
  timestamp: string;
  executionTimeMs: number;
  simulationRuns: number;
  engineUsed: string;

  // Distribution data for charts
  distributions: RenderableDistribution[];

  // Calibration
  calibrationStatus: CalibrationStatus;
  modelQualityScore: number;

  // Data quality
  dataQuality: DataQualityResult;

  // Recommendations
  recommendations: string[];

  // Scenario comparisons
  scenarioComparisons: ScenarioComparison[];
}

const METRIC_LABELS: Record<BacktestMetric, string> = {
  irr: 'IRR',
  tvpi: 'TVPI',
  dpi: 'DPI',
  multiple: 'Multiple',
  totalValue: 'Total Value',
};

function createRenderableDistribution(
  metric: BacktestMetric,
  result: BacktestResult,
  incalculableMetrics: BacktestMetric[]
): RenderableDistribution | null {
  const dist = result.simulationSummary.metrics[metric];
  if (!dist) return null;

  // Validate all distribution values are finite
  const values = [
    dist.mean,
    dist.median,
    dist.p5,
    dist.p25,
    dist.p75,
    dist.p95,
    dist.min,
    dist.max,
    dist.standardDeviation,
  ];
  if (values.some((v) => !Number.isFinite(v))) return null;

  const actualValue = result.actualPerformance[
    metric as keyof typeof result.actualPerformance
  ] as number | null;

  return {
    metric,
    label: METRIC_LABELS[metric] ?? metric,
    distribution: dist,
    actual: toRenderableMetric(actualValue, metric, incalculableMetrics),
    hitP50: result.validationMetrics.percentileHitRates.p50[metric] ?? null,
    hitP90: result.validationMetrics.percentileHitRates.p90[metric] ?? null,
  };
}

export function toResultViewModel(result: BacktestResult): BacktestResultViewModel {
  const incalculable = result.validationMetrics.incalculableMetrics;

  const distributions: RenderableDistribution[] = result.config.comparisonMetrics
    .map((metric) => createRenderableDistribution(metric, result, incalculable))
    .filter((d): d is RenderableDistribution => d !== null);

  return {
    backtestId: result.backtestId,
    timestamp: result.timestamp,
    executionTimeMs: result.executionTimeMs,
    simulationRuns: result.simulationSummary.runs,
    engineUsed: result.simulationSummary.engineUsed,
    distributions,
    calibrationStatus: result.validationMetrics.calibrationStatus,
    modelQualityScore: result.validationMetrics.modelQualityScore,
    dataQuality: result.dataQuality,
    recommendations: result.recommendations,
    scenarioComparisons: result.scenarioComparisons ?? [],
  };
}

// ============================================================================
// ERROR TIER CLASSIFICATION
// ============================================================================

export type ErrorTier = 'user_fixable' | 'data_quality' | 'system_error';

export function classifyErrorTier(errorCode: BacktestingJobErrorCode | null): ErrorTier {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return 'user_fixable';
    case 'DATA_QUALITY_LIMITATION':
      return 'data_quality';
    default:
      return 'system_error';
  }
}

export const ERROR_TIER_MESSAGES: Record<ErrorTier, { title: string; guidance: string }> = {
  user_fixable: {
    title: 'Configuration Error',
    guidance: 'Please check your backtest configuration and try again.',
  },
  data_quality: {
    title: 'Data Quality Issue',
    guidance:
      'The fund data is insufficient for this analysis. Consider creating a baseline first.',
  },
  system_error: {
    title: 'System Error',
    guidance: 'An unexpected error occurred. Please try again or contact support.',
  },
};
