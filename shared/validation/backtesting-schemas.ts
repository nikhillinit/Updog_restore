/**
 * Backtesting Validation Schemas
 *
 * Zod schemas for validating backtesting requests and responses.
 * Security-hardened with proper bounds checking and edge case handling.
 *
 * @author Claude Code
 * @version 1.0
 */

import { z } from 'zod';

// =============================================================================
// BASE VALIDATION PRIMITIVES
// =============================================================================

const PositiveNumber = z.number().positive().finite();
const PositiveInteger = z.number().int().positive().finite();
const Percentage = z.number().min(0).max(1).finite();
const FundId = z.number().int().positive();
const UUID = z.string().uuid();
const ISODateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const BacktestMetricSchema = z.enum(['irr', 'tvpi', 'dpi', 'multiple', 'totalValue']);

export const HistoricalScenarioNameSchema = z.enum([
  'financial_crisis_2008',
  'dotcom_bust_2000',
  'covid_2020',
  'bull_market_2021',
  'rate_hikes_2022',
  'custom',
]);

export const CalibrationStatusSchema = z.enum([
  'well-calibrated',
  'under-predicting',
  'over-predicting',
  'insufficient-data',
]);

export const DataSourceSchema = z.enum(['baseline', 'variance_report', 'snapshot']);
export const DataFreshnessSchema = z.enum(['fresh', 'stale', 'unknown']);
export const DataQualityLevelSchema = z.enum(['good', 'acceptable', 'poor']);
export const EngineTypeSchema = z.enum(['streaming', 'traditional']);

// =============================================================================
// MARKET PARAMETERS SCHEMA
// =============================================================================

export const MarketParametersSchema = z
  .object({
    exitMultiplierMean: PositiveNumber.min(0.1).max(10),
    exitMultiplierVolatility: PositiveNumber.min(0.01).max(5),
    failureRate: Percentage,
    followOnProbability: Percentage,
    holdPeriodYears: PositiveNumber.min(1).max(15),
  })
  .strict();

// =============================================================================
// HISTORICAL SCENARIO SCHEMA
// =============================================================================

export const HistoricalScenarioSchema = z
  .object({
    name: HistoricalScenarioNameSchema,
    startDate: ISODateString,
    endDate: ISODateString,
    description: z.string().max(500).optional(),
    marketParameters: MarketParametersSchema.optional(),
  })
  .strict();

// =============================================================================
// BACKTEST CONFIG SCHEMA
// =============================================================================

export const BacktestConfigSchema = z
  .object({
    fundId: FundId,
    startDate: ISODateString,
    endDate: ISODateString,
    simulationRuns: PositiveInteger.min(100).max(50000).default(10000),
    comparisonMetrics: z.array(BacktestMetricSchema).min(1).max(5).default(['irr', 'tvpi', 'dpi']),
    includeHistoricalScenarios: z.boolean().default(false),
    historicalScenarios: z.array(HistoricalScenarioNameSchema).max(5).optional(),
    baselineId: UUID.optional(),
    snapshotId: UUID.optional(),
    randomSeed: z.number().int().min(1).max(2147483647).optional(),
  })
  .strict()
  .refine((data) => new Date(data.startDate) < new Date(data.endDate), {
    message: 'startDate must be before endDate',
    path: ['startDate'],
  })
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return years <= 20;
    },
    { message: 'Date range cannot exceed 20 years', path: ['endDate'] }
  );

// =============================================================================
// DISTRIBUTION SUMMARY SCHEMA
// =============================================================================

export const DistributionSummarySchema = z
  .object({
    mean: z.number().finite(),
    median: z.number().finite(),
    p5: z.number().finite(),
    p25: z.number().finite(),
    p75: z.number().finite(),
    p95: z.number().finite(),
    min: z.number().finite(),
    max: z.number().finite(),
    standardDeviation: z.number().min(0).finite(),
  })
  .strict()
  .refine(
    (data) =>
      data.p5 <= data.p25 &&
      data.p25 <= data.median &&
      data.median <= data.p75 &&
      data.p75 <= data.p95,
    { message: 'Percentiles must be in ascending order' }
  )
  .refine((data) => data.min <= data.p5 && data.p95 <= data.max, {
    message: 'Min/max must bound the percentiles',
  });

// =============================================================================
// ACTUAL PERFORMANCE SCHEMA
// =============================================================================

export const ActualPerformanceSchema = z
  .object({
    asOfDate: ISODateString,
    irr: z.number().min(-1).max(10).finite().nullable(),
    tvpi: z.number().min(0).max(100).finite().nullable(),
    dpi: z.number().min(0).max(100).finite().nullable(),
    multiple: z.number().min(0).max(100).finite().nullable(),
    deployedCapital: z.number().min(0).finite(),
    distributedCapital: z.number().min(0).finite(),
    residualValue: z.number().min(0).finite(),
    dataSource: DataSourceSchema,
    dataFreshness: DataFreshnessSchema,
  })
  .strict();

// =============================================================================
// PERCENTILE HIT RATES SCHEMA
// =============================================================================

const MetricBooleanOrNullRecord = z
  .record(BacktestMetricSchema, z.boolean().nullable())
  .optional()
  .default({});

export const PercentileHitRatesSchema = z
  .object({
    p50: MetricBooleanOrNullRecord,
    p90: MetricBooleanOrNullRecord,
    p100: MetricBooleanOrNullRecord,
  })
  .strict();

// =============================================================================
// VALIDATION METRICS SCHEMA
// =============================================================================

const MetricNumberOrNullRecord = z
  .record(BacktestMetricSchema, z.number().min(0).finite().nullable())
  .optional()
  .default({});

export const ValidationMetricsSchema = z
  .object({
    meanAbsoluteError: MetricNumberOrNullRecord,
    rootMeanSquareError: MetricNumberOrNullRecord,
    percentileHitRates: PercentileHitRatesSchema,
    modelQualityScore: z.number().min(0).max(100).finite(),
    calibrationStatus: CalibrationStatusSchema,
    incalculableMetrics: z.array(BacktestMetricSchema).default([]),
  })
  .strict();

// =============================================================================
// SCENARIO COMPARISON SCHEMA
// =============================================================================

export const ScenarioComparisonSchema = z
  .object({
    scenario: HistoricalScenarioNameSchema,
    simulatedPerformance: DistributionSummarySchema,
    description: z.string().max(500),
    keyInsights: z.array(z.string().max(200)).max(10),
    marketParameters: MarketParametersSchema,
  })
  .strict();

// =============================================================================
// SIMULATION SUMMARY SCHEMA
// =============================================================================

export const SimulationSummarySchema = z
  .object({
    runs: PositiveInteger,
    metrics: z.record(BacktestMetricSchema, DistributionSummarySchema).optional().default({}),
    engineUsed: EngineTypeSchema,
    executionTimeMs: z.number().min(0).finite(),
  })
  .strict();

// =============================================================================
// DATA QUALITY SCHEMA
// =============================================================================

export const DataQualityResultSchema = z
  .object({
    hasBaseline: z.boolean(),
    baselineAgeInDays: z.number().int().min(0).nullable(),
    varianceHistoryCount: z.number().int().min(0),
    snapshotAvailable: z.boolean(),
    isStale: z.boolean(),
    warnings: z.array(z.string().max(200)).max(10),
    overallQuality: DataQualityLevelSchema,
  })
  .strict();

// =============================================================================
// BACKTEST RESULT SCHEMA
// =============================================================================

export const BacktestResultSchema = z
  .object({
    backtestId: UUID,
    config: BacktestConfigSchema,
    executionTimeMs: z.number().min(0).finite(),
    timestamp: z.string().datetime(),
    simulationSummary: SimulationSummarySchema,
    actualPerformance: ActualPerformanceSchema,
    validationMetrics: ValidationMetricsSchema,
    dataQuality: DataQualityResultSchema,
    scenarioComparisons: z.array(ScenarioComparisonSchema).optional(),
    recommendations: z.array(z.string().max(300)).max(10),
  })
  .strict();

// =============================================================================
// API REQUEST SCHEMAS
// =============================================================================

export const BacktestRequestSchema = z
  .object({
    config: BacktestConfigSchema,
    correlationId: z.string().max(100).optional(),
  })
  .strict();

export const ScenarioCompareRequestSchema = z
  .object({
    fundId: FundId,
    scenarios: z
      .array(HistoricalScenarioNameSchema.exclude(['custom']))
      .min(1)
      .max(5),
    simulationRuns: PositiveInteger.min(100).max(25000).default(5000),
  })
  .strict();

export const BacktestHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
    offset: z.coerce.number().int().min(0).default(0),
    startDate: ISODateString.optional(),
    endDate: ISODateString.optional(),
  })
  .strict();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;
export type BacktestResult = z.infer<typeof BacktestResultSchema>;
export type HistoricalScenario = z.infer<typeof HistoricalScenarioSchema>;
export type DistributionSummary = z.infer<typeof DistributionSummarySchema>;
export type ValidationMetrics = z.infer<typeof ValidationMetricsSchema>;
export type ActualPerformance = z.infer<typeof ActualPerformanceSchema>;
export type ScenarioComparison = z.infer<typeof ScenarioComparisonSchema>;
export type SimulationSummary = z.infer<typeof SimulationSummarySchema>;
export type DataQualityResult = z.infer<typeof DataQualityResultSchema>;
export type MarketParameters = z.infer<typeof MarketParametersSchema>;
export type BacktestMetric = z.infer<typeof BacktestMetricSchema>;
export type HistoricalScenarioName = z.infer<typeof HistoricalScenarioNameSchema>;
export type CalibrationStatus = z.infer<typeof CalibrationStatusSchema>;

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate a backtest configuration
 */
export function validateBacktestConfig(data: unknown) {
  return BacktestConfigSchema.safeParse(data);
}

/**
 * Validate a backtest result
 */
export function validateBacktestResult(data: unknown) {
  return BacktestResultSchema.safeParse(data);
}

/**
 * Create a standardized validation error response
 */
export function createValidationError(error: z.ZodError) {
  return {
    isValid: false,
    errors: error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })),
  };
}

/**
 * Safe division utility to prevent division by zero
 * Returns null if divisor is zero or near-zero
 */
export function safeDivide(numerator: number, divisor: number | null): number | null {
  if (divisor === null || divisor === undefined) return null;
  if (Math.abs(divisor) < 1e-10) return null;
  const result = numerator / divisor;
  if (!Number.isFinite(result)) return null;
  return result;
}

/**
 * Calculate normalized error with safe division
 */
export function calculateNormalizedError(simulated: number, actual: number | null): number | null {
  if (actual === null || actual === undefined) return null;
  const error = Math.abs(simulated - actual);
  return safeDivide(error, Math.abs(actual));
}
