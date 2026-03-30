/**
 * FundResultsComparisonV1 -- Read contract for
 * GET /api/funds/:id/results-comparison
 *
 * Compares the current published fund version against the immediately previous
 * published version using existing persisted config and calc-run evidence.
 *
 * This is intentionally summary-level. It is designed to support KPI delta
 * cards and version context on the results page, not arbitrary config-body
 * diffing.
 *
 * @module shared/contracts/fund-results-comparison-v1.contract
 */

import { z } from 'zod';
import { CalculationStatusSchema } from './fund-state-read-v1.contract';

export const ComparisonCalcRunSchema = z
  .object({
    runId: z.number().int(),
    status: CalculationStatusSchema,
    dispatchState: z.enum(['pending', 'dispatched', 'partial', 'failed']).nullable(),
    lastCalculatedAt: z.string().datetime().nullable(),
    correlationId: z.string().nullable(),
  })
  .strict();

export const ComparisonMetricsSchema = z
  .object({
    fundSize: z.number().nullable(),
    reserveRatio: z.number().nullable(),
    avgConfidence: z.number().nullable(),
    yearsToFullDeploy: z.number().nullable(),
  })
  .strict();

export const PublishedVersionSummarySchema = z
  .object({
    version: z.number().int(),
    publishedAt: z.string().datetime(),
    calcRun: ComparisonCalcRunSchema.nullable(),
    metrics: ComparisonMetricsSchema,
  })
  .strict();

export const MetricDeltaSchema = z
  .object({
    metric: z.enum(['fundSize', 'reserveRatio', 'avgConfidence', 'yearsToFullDeploy']),
    displayName: z.string(),
    currentValue: z.number().nullable(),
    previousValue: z.number().nullable(),
    absoluteDelta: z.number().nullable(),
    percentageDelta: z.number().nullable(),
  })
  .strict();

export const FundResultsComparisonV1Schema = z
  .object({
    fundId: z.number().int(),
    comparisonStatus: z.enum(['no_published_version', 'no_previous_version', 'comparable']),
    currentVersion: PublishedVersionSummarySchema.nullable(),
    previousVersion: PublishedVersionSummarySchema.nullable(),
    metricDeltas: z.array(MetricDeltaSchema),
  })
  .strict();

export type ComparisonCalcRun = z.infer<typeof ComparisonCalcRunSchema>;
export type ComparisonMetrics = z.infer<typeof ComparisonMetricsSchema>;
export type PublishedVersionSummary = z.infer<typeof PublishedVersionSummarySchema>;
export type MetricDelta = z.infer<typeof MetricDeltaSchema>;
export type FundResultsComparisonV1 = z.infer<typeof FundResultsComparisonV1Schema>;
