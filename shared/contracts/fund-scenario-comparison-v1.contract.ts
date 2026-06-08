/**
 * FundScenarioComparisonV1 -- shared contract for ADR-022 scenario comparisons.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-scenario-comparison-v1.contract
 */

import { z } from 'zod';
import { ScenarioEvidenceStateV1Schema } from './fund-scenario-sets-v1.contract';

const DateTimeStringSchema = z.string().datetime();

export const SCENARIO_COMPARISON_METRIC_KEYS = [
  'lpNetIrr',
  'gpNetIrr',
  'totalManagementFees',
  'totalGpCarryDistributed',
  'totalGpFeeIncome',
  'finalDpi',
  'finalTvpi',
  'finalClawbackDue',
] as const;

const MetricValueSchema = z.number().nullable();

export const ScenarioComparisonMetricKeyV1Schema = z.enum(SCENARIO_COMPARISON_METRIC_KEYS);

export const ScenarioComparisonStatusV1Schema = z.enum([
  'no_scenario_results',
  'baseline_unavailable',
  'unsupported_override_type',
  'comparable',
]);

export const ScenarioComparisonUnavailableReasonV1Schema = z.enum([
  'ECONOMICS_DISABLED',
  'ECONOMICS_ASSUMPTIONS_MISSING',
  'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
  'BASELINE_ECONOMICS_SNAPSHOT_STALE',
  'VARIANT_ECONOMICS_FAILED',
  'SOURCE_CONFIG_STALE_UNPINNED',
  'UNSUPPORTED_OVERRIDE_TYPE',
]);

export const ScenarioComparisonMetricMapV1Schema = z
  .object({
    lpNetIrr: MetricValueSchema,
    gpNetIrr: MetricValueSchema,
    totalManagementFees: MetricValueSchema,
    totalGpCarryDistributed: MetricValueSchema,
    totalGpFeeIncome: MetricValueSchema,
    finalDpi: MetricValueSchema,
    finalTvpi: MetricValueSchema,
    finalClawbackDue: MetricValueSchema,
  })
  .strict();

export const ScenarioComparisonStalenessObjectV1Schema = z
  .object({
    state: ScenarioEvidenceStateV1Schema,
    sourceConfigVersion: z.number().int().positive(),
    currentPublishedConfigVersion: z.number().int().positive().nullable(),
  })
  .strict();

export const ScenarioComparisonStalenessV1Schema = z.union([
  ScenarioEvidenceStateV1Schema,
  ScenarioComparisonStalenessObjectV1Schema,
]);

export const ScenarioComparisonDriftReasonV1Schema = z.enum([
  'stable',
  'missing_baseline',
  'missing_scenario',
  'missing_both',
  'zero_baseline',
]);

export const ScenarioComparisonScenarioSetV1Schema = z
  .object({
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
  })
  .strict();

export const ScenarioComparisonBaselineV1Schema = z
  .object({
    label: z.string().nullable().optional(),
    metrics: ScenarioComparisonMetricMapV1Schema,
  })
  .strict();

export const ScenarioComparisonMetricDeltaV1Schema = z
  .object({
    metric: ScenarioComparisonMetricKeyV1Schema,
    displayName: z.string(),
    baselineValue: MetricValueSchema,
    scenarioValue: MetricValueSchema,
    absoluteDelta: MetricValueSchema,
    percentageDelta: MetricValueSchema,
    driftCapable: z.boolean(),
    driftReason: ScenarioComparisonDriftReasonV1Schema,
  })
  .strict();

export const ScenarioComparisonVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: z.enum(['fee_profile', 'allocation', 'sector_profile', 'methodology']),
    metrics: ScenarioComparisonMetricMapV1Schema,
    metricDeltas: z.array(ScenarioComparisonMetricDeltaV1Schema),
  })
  .strict();

export const FundScenarioComparisonV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    comparisonStatus: ScenarioComparisonStatusV1Schema,
    unavailableReason: ScenarioComparisonUnavailableReasonV1Schema.nullable().optional(),
    scenarioSet: ScenarioComparisonScenarioSetV1Schema,
    baseline: ScenarioComparisonBaselineV1Schema.nullable(),
    variants: z.array(ScenarioComparisonVariantV1Schema),
    staleness: ScenarioComparisonStalenessV1Schema.nullable(),
    calculatedAt: DateTimeStringSchema.nullable(),
  })
  .strict();

export type ScenarioComparisonMetricKey = z.infer<typeof ScenarioComparisonMetricKeyV1Schema>;
export type ScenarioComparisonMetricKeyV1 = ScenarioComparisonMetricKey;
export type ScenarioComparisonStatus = z.infer<typeof ScenarioComparisonStatusV1Schema>;
export type ScenarioComparisonStatusV1 = ScenarioComparisonStatus;
export type ScenarioComparisonUnavailableReasonV1 = z.infer<
  typeof ScenarioComparisonUnavailableReasonV1Schema
>;
export type ScenarioComparisonMetricValue = z.infer<typeof MetricValueSchema>;
export type ScenarioComparisonMetricValueV1 = ScenarioComparisonMetricValue;
export type ScenarioComparisonMetricMap = z.infer<typeof ScenarioComparisonMetricMapV1Schema>;
export type ScenarioComparisonMetricMapV1 = ScenarioComparisonMetricMap;
export type ScenarioComparisonStalenessObjectV1 = z.infer<
  typeof ScenarioComparisonStalenessObjectV1Schema
>;
export type ScenarioComparisonStalenessV1 = z.infer<typeof ScenarioComparisonStalenessV1Schema>;
export type ScenarioComparisonDriftReason = z.infer<typeof ScenarioComparisonDriftReasonV1Schema>;
export type ScenarioComparisonDriftReasonV1 = ScenarioComparisonDriftReason;
export type ScenarioComparisonScenarioSetV1 = z.infer<typeof ScenarioComparisonScenarioSetV1Schema>;
export type ScenarioComparisonBaselineV1 = z.infer<typeof ScenarioComparisonBaselineV1Schema>;
export type ScenarioComparisonMetricDeltaV1 = z.infer<typeof ScenarioComparisonMetricDeltaV1Schema>;
export type ScenarioComparisonVariantV1 = z.infer<typeof ScenarioComparisonVariantV1Schema>;
export type FundScenarioComparisonV1 = z.infer<typeof FundScenarioComparisonV1Schema>;
