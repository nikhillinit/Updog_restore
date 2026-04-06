/**
 * SensitivityRunV1 -- Canonical contract for sensitivity analysis runs.
 *
 * Persists the lifecycle of a sensitivity calculation (one-way, two-way,
 * or stress) attached to a fund. The kind/status enums match the CHECK
 * constraints declared in the migration; any change here MUST be mirrored
 * to the SQL CHECK and to the corresponding service guards.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/sensitivity-run-v1.contract
 */

import { z } from 'zod';
import { SensitivityVariableIdSchema, SensitivityMetricIdSchema } from './sensitivity-variables-v1';

export const SensitivityRunKindSchema = z.enum(['one_way', 'two_way', 'stress']);
export const SensitivityRunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed']);

export const SensitivityRunV1Schema = z
  .object({
    id: z.number().int(),
    fundId: z.number().int(),
    kind: SensitivityRunKindSchema,
    status: SensitivityRunStatusSchema,
    /** Caller-supplied parameters; opaque JSONB blob, validated upstream by kind-specific schemas. */
    params: z.unknown(),
    /** Calculation output; null until status transitions to completed. */
    results: z.unknown().nullable(),
    createdBy: z.number().int(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    durationMs: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();

export type SensitivityRunV1 = z.infer<typeof SensitivityRunV1Schema>;
export type SensitivityRunKind = z.infer<typeof SensitivityRunKindSchema>;
export type SensitivityRunStatus = z.infer<typeof SensitivityRunStatusSchema>;

// =====================
// ONE-WAY ANALYSIS (Phase 1A)
// =====================

/**
 * Inclusive sweep range for a single variable. Refined to require min < max so
 * downstream linspace math can never divide by zero or produce a degenerate
 * single-point grid.
 */
export const OneWayAnalysisRangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
  })
  .strict()
  .refine((r) => r.min < r.max, { message: 'min must be less than max' });

/**
 * Caller-supplied parameters for a one-way sensitivity request. The variable
 * and metric ids are constrained to the supported library; the steps bound
 * (2..50) keeps a single sweep below the engine budget.
 */
export const OneWayAnalysisRequestV1Schema = z
  .object({
    variableId: SensitivityVariableIdSchema,
    range: OneWayAnalysisRangeSchema,
    steps: z.number().int().min(2).max(50),
    metricId: SensitivityMetricIdSchema,
  })
  .strict();

export const OneWayAnalysisDatapointSchema = z
  .object({
    variableValue: z.number(),
    metricValue: z.number(),
  })
  .strict();

export const OneWayAnalysisSummarySchema = z
  .object({
    minMetric: z.number(),
    maxMetric: z.number(),
    range: z.number(),
  })
  .strict();

export const OneWayAnalysisResultV1Schema = z
  .object({
    variableId: SensitivityVariableIdSchema,
    metricId: SensitivityMetricIdSchema,
    /** Metric value computed from the unmodified base config. */
    baselineValue: z.number(),
    datapoints: z.array(OneWayAnalysisDatapointSchema),
    summary: OneWayAnalysisSummarySchema,
    computedAt: z.string().datetime(),
  })
  .strict();

export type OneWayAnalysisRequestV1 = z.infer<typeof OneWayAnalysisRequestV1Schema>;
export type OneWayAnalysisResultV1 = z.infer<typeof OneWayAnalysisResultV1Schema>;
export type OneWayAnalysisDatapoint = z.infer<typeof OneWayAnalysisDatapointSchema>;
export type OneWayAnalysisSummary = z.infer<typeof OneWayAnalysisSummarySchema>;
