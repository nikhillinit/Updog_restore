/**
 * Backtesting Types
 *
 * Types for Monte Carlo simulation backtesting and historical validation.
 * Used to validate simulation accuracy against actual fund performance.
 *
 * @author Claude Code
 * @version 1.0
 */

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Metrics available for backtesting comparison
 */
export type BacktestMetric = 'irr' | 'tvpi' | 'dpi' | 'multiple' | 'totalValue';

/**
 * Predefined historical market scenarios
 */
export type HistoricalScenarioName =
  | 'financial_crisis_2008'
  | 'dotcom_bust_2000'
  | 'covid_2020'
  | 'bull_market_2021'
  | 'rate_hikes_2022'
  | 'custom';

/**
 * Market parameters that define scenario characteristics
 */
export interface MarketParameters {
  exitMultiplierMean: number;
  exitMultiplierVolatility: number;
  failureRate: number;
  followOnProbability: number;
  holdPeriodYears: number;
}

/**
 * Historical scenario definition
 */
export interface HistoricalScenario {
  name: HistoricalScenarioName;
  startDate: string;
  endDate: string;
  description?: string;
  marketParameters?: MarketParameters;
}

/**
 * Configuration for running a backtest
 */
export interface BacktestConfig {
  fundId: number;
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
  simulationRuns: number;
  comparisonMetrics: BacktestMetric[];
  includeHistoricalScenarios?: boolean;
  historicalScenarios?: HistoricalScenarioName[];
  baselineId?: string;
  snapshotId?: string; // Link to fund snapshot
  randomSeed?: number;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Statistical summary of a distribution
 * Note: Uses p90 (not p75) for 90% confidence interval
 */
export interface DistributionSummary {
  mean: number;
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  min: number;
  max: number;
  standardDeviation: number;
}

/**
 * Actual fund performance data from baselines/variance reports
 */
export interface ActualPerformance {
  asOfDate: string;
  irr: number | null;
  tvpi: number | null;
  dpi: number | null;
  multiple: number | null;
  deployedCapital: number;
  distributedCapital: number;
  residualValue: number;
  dataSource: 'baseline' | 'variance_report' | 'snapshot';
  dataFreshness: 'fresh' | 'stale' | 'unknown';
}

/**
 * Percentile hit rate tracking
 * Tracks whether actual performance fell within predicted confidence intervals
 */
export interface PercentileHitRates {
  /** Within 50% CI (p25-p75) */
  p50: Partial<Record<BacktestMetric, boolean | null>>;
  /** Within 90% CI (p5-p95) */
  p90: Partial<Record<BacktestMetric, boolean | null>>;
  /** Within full range (min-max) */
  p100: Partial<Record<BacktestMetric, boolean | null>>;
}

/**
 * Validation metrics for assessing model quality
 */
export interface ValidationMetrics {
  /** Mean absolute error for each metric */
  meanAbsoluteError: Partial<Record<BacktestMetric, number | null>>;
  /** Root mean square error for each metric */
  rootMeanSquareError: Partial<Record<BacktestMetric, number | null>>;
  /** Whether actual fell within predicted percentile ranges */
  percentileHitRates: PercentileHitRates;
  /** Overall model quality score (0-100) */
  modelQualityScore: number;
  /** Calibration assessment */
  calibrationStatus: CalibrationStatus;
  /** Metrics that couldn't be calculated due to missing data */
  incalculableMetrics: BacktestMetric[];
}

export type CalibrationStatus =
  | 'well-calibrated'
  | 'under-predicting'
  | 'over-predicting'
  | 'insufficient-data';

/**
 * Comparison result for a historical scenario
 */
export interface ScenarioComparison {
  scenario: HistoricalScenarioName;
  simulatedPerformance: DistributionSummary;
  description: string;
  keyInsights: string[];
  marketParameters: MarketParameters;
}

/**
 * Summary of simulation run
 */
export interface SimulationSummary {
  runs: number;
  metrics: Partial<Record<BacktestMetric, DistributionSummary>>;
  engineUsed: 'streaming' | 'traditional';
  executionTimeMs: number;
}

/**
 * Data quality assessment for backtest inputs
 */
export interface DataQualityResult {
  hasBaseline: boolean;
  baselineAgeInDays: number | null;
  varianceHistoryCount: number;
  snapshotAvailable: boolean;
  isStale: boolean;
  warnings: string[];
  overallQuality: 'good' | 'acceptable' | 'poor';
}

/**
 * Complete backtest result
 */
export interface BacktestResult {
  backtestId: string;
  config: BacktestConfig;
  executionTimeMs: number;
  timestamp: string;
  simulationSummary: SimulationSummary;
  actualPerformance: ActualPerformance;
  validationMetrics: ValidationMetrics;
  dataQuality: DataQualityResult;
  scenarioComparisons?: ScenarioComparison[];
  recommendations: string[];
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Request to run a backtest
 */
export interface BacktestRequest {
  config: BacktestConfig;
  correlationId?: string;
}

/**
 * Response from backtest run
 */
export interface BacktestResponse {
  correlationId: string;
  result: BacktestResult;
}

/**
 * Request to compare multiple scenarios
 */
export interface ScenarioCompareRequest {
  fundId: number;
  scenarios: HistoricalScenarioName[];
  simulationRuns?: number;
}

/**
 * Response from scenario comparison
 */
export interface ScenarioCompareResponse {
  correlationId: string;
  fundId: number;
  comparisons: ScenarioComparison[];
  summary: {
    scenariosCompared: number;
    timestamp: string;
  };
}

/**
 * Backtest history query options
 */
export interface BacktestHistoryOptions {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Backtest history response
 */
export interface BacktestHistoryResponse {
  fundId: number;
  history: BacktestResult[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
}
