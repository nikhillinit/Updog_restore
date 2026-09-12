/**
 * FundScenarioComparisonV1 -- shared contract for ADR-022 scenario comparisons.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-scenario-comparison-v1.contract
 */

import { z } from 'zod';
import { ScenarioEvidenceStateV1Schema } from './fund-scenario-sets-v1.contract';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../lib/decimal-string';
import { CapitalPlanRepresentationV1Schema } from './fund-scenario-sets-v1.contract';
import {
  CapitalCountBasisV1Schema,
  CapitalDecimalV1Schema,
  CapitalLabelV1Schema,
  CapitalMoneyV1Schema,
  CapitalPathV1Schema,
  CapitalPlanningMemoV1Schema,
  CapitalReadStateV1Schema,
  CapitalScenarioNameV1Schema,
  CapitalUnavailableReasonV1Schema,
} from './capital-planning-v1.contract';

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

// Persisted capital comparisons never borrow the authoritative-economics baseline
// or widen the legacy numeric metric map above.
export const CapitalComparisonMetricKeyV1Schema = z.enum([
  'availableConstructionCapitalUsd',
  'planningBudgetUsd',
  'gpDeemedContributionUsd',
  'lifetimeFeesUsd',
  'lifetimeExpensesUsd',
  'companyCount',
  'initialDemandUsd',
  'lifetimeFollowOnUsd',
  'totalDemandUsd',
  'reserveRatio',
  'unassignedPlanningBudgetUsd',
  'signedLifetimeHeadroomUsd',
  'allocationGapUsd',
  'reserveEarmarkGapUsd',
  'withinTermFollowOnUsd',
  'beyondTermFollowOnUsd',
  'adjustedProceedsUsd',
  'noPreferenceBaselineUsd',
  'signedPreferenceBenefitUsd',
  'adjustedMoic',
  'baselineMoic',
]);
const CapitalMetricValueSchema = z.union([CapitalMoneyV1Schema, CapitalDecimalV1Schema]);
const CapitalAbsoluteMoneyDeltaSchema = MoneyDecimalStringSchema.max(26).refine(
  (value) => value !== '-0.000000',
  'Negative zero is not canonical'
);
const CapitalAbsoluteDecimalDeltaSchema = RatioDecimalStringSchema.max(26).refine(
  (value) => value !== '-0.000000000000',
  'Negative zero is not canonical'
);
const CapitalPercentageDeltaSchema = RatioDecimalStringSchema.max(39).refine(
  (value) => value !== '-0.000000000000',
  'Negative zero is not canonical'
);
const CapitalComparisonOperandsSchema = z.discriminatedUnion('scale', [
  z
    .object({
      scale: z.literal(6),
      baselineValue: CapitalMoneyV1Schema,
      variantValue: CapitalMoneyV1Schema,
    })
    .strict(),
  z
    .object({
      scale: z.literal(12),
      baselineValue: CapitalDecimalV1Schema,
      variantValue: CapitalDecimalV1Schema,
    })
    .strict(),
]);

function formatCapitalComparisonUnits(units: bigint, scale: 6 | 12): string {
  const magnitude = (units < 0n ? -units : units).toString().padStart(scale + 1, '0');
  return `${units < 0n ? '-' : ''}${magnitude.slice(0, -scale)}.${magnitude.slice(-scale)}`;
}

/** Exact capital arithmetic; availability and metric metadata belong to the caller. */
export function calculateCapitalComparisonDeltaV1(args: {
  baselineValue: string;
  variantValue: string;
  scale: 6 | 12;
}): { absoluteDelta: string; percentageDelta: string | null } {
  const operands = CapitalComparisonOperandsSchema.parse(args);
  const baseline = BigInt(operands.baselineValue.replace('.', ''));
  const variant = BigInt(operands.variantValue.replace('.', ''));
  const delta = variant - baseline;
  const absoluteDelta = formatCapitalComparisonUnits(delta, operands.scale);
  if (baseline === 0n) return { absoluteDelta, percentageDelta: null };
  const numerator = delta * 100n * 10n ** 12n;
  const denominator = baseline < 0n ? -baseline : baseline;
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = quotient + (2n * remainder >= denominator ? 1n : 0n);
  return {
    absoluteDelta,
    percentageDelta: formatCapitalComparisonUnits(numerator < 0n ? -rounded : rounded, 12),
  };
}

export const CapitalComparisonMetricDeltaV1Schema = z
  .object({
    metric: CapitalComparisonMetricKeyV1Schema,
    label: CapitalLabelV1Schema,
    group: z.enum(['construction', 'companion']),
    countBasis: CapitalCountBasisV1Schema,
    baselineValue: CapitalMetricValueSchema.nullable(),
    variantValue: CapitalMetricValueSchema.nullable(),
    absoluteDelta: z
      .union([CapitalAbsoluteMoneyDeltaSchema, CapitalAbsoluteDecimalDeltaSchema])
      .nullable(),
    percentageDelta: CapitalPercentageDeltaSchema.nullable(),
    unavailableReason: CapitalUnavailableReasonV1Schema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const moneyMetric = value.metric.endsWith('Usd');
    const operandSchema = moneyMetric ? CapitalMoneyV1Schema : CapitalDecimalV1Schema;
    const deltaSchema = moneyMetric
      ? CapitalAbsoluteMoneyDeltaSchema
      : CapitalAbsoluteDecimalDeltaSchema;
    for (const key of ['baselineValue', 'variantValue'] as const) {
      if (value[key] !== null && !operandSchema.safeParse(value[key]).success)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Metric values must use money6 or ratio/count12 scale',
        });
    }
    if (value.absoluteDelta !== null && !deltaSchema.safeParse(value.absoluteDelta).success)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['absoluteDelta'],
        message: 'Absolute delta must use the metric scale and comparison-only bound',
      });
    const missing = value.baselineValue === null || value.variantValue === null;
    if (missing) {
      if (
        value.absoluteDelta !== null ||
        value.percentageDelta !== null ||
        value.unavailableReason === null ||
        value.unavailableReason === 'ZERO_BASELINE'
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['unavailableReason'],
          message: 'Missing values require null deltas and a source unavailable reason',
        });
      return;
    }
    // Only validated, present operands reach BigInt conversion. Invalid inputs
    // remain field issues instead of being coerced to zero or unavailable.
    if (
      !operandSchema.safeParse(value.baselineValue).success ||
      !operandSchema.safeParse(value.variantValue).success
    )
      return;
    const expected = calculateCapitalComparisonDeltaV1({
      baselineValue: value.baselineValue!,
      variantValue: value.variantValue!,
      scale: moneyMetric ? 6 : 12,
    });
    if (value.absoluteDelta !== expected.absoluteDelta)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['absoluteDelta'],
        message: 'Delta must equal variant minus baseline',
      });
    if (value.percentageDelta !== expected.percentageDelta)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['percentageDelta'],
        message: 'Percentage delta must equal exact signed change divided by absolute baseline',
      });
    if (value.unavailableReason !== (expected.percentageDelta === null ? 'ZERO_BASELINE' : null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unavailableReason'],
        message: 'Only a present zero baseline requires ZERO_BASELINE',
      });
  });

const CapitalChangedValueSchema = z.union([
  z.string().max(2048),
  z.number().int().safe(),
  z.boolean(),
  z.null(),
]);
export const CapitalChangedInputV1Schema = z
  .object({
    group: z.enum([
      'budget_gp_deemed',
      'checks',
      'graduation',
      'participation',
      'valuation_round_size',
      'pool_dilution',
      'provenance',
      'earmarks',
      'timing',
      'companion',
    ]),
    path: CapitalPathV1Schema,
    label: CapitalLabelV1Schema,
    baseline: CapitalChangedValueSchema,
    variant: CapitalChangedValueSchema,
  })
  .strict();

export const CapitalComparisonVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: CapitalScenarioNameV1Schema,
    overrideType: z.literal('capital_plan'),
    memo: CapitalPlanningMemoV1Schema,
    changedInputs: z.array(CapitalChangedInputV1Schema).max(4096),
    metricDeltas: z.array(CapitalComparisonMetricDeltaV1Schema).max(44),
    companionComparison: z.enum(['same_issuer', 'different_issuers', 'companion_unavailable']),
  })
  .strict();

export const FundScenarioCapitalComparisonV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-comparison/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    comparisonStatus: z.enum(['no_scenario_results', 'comparable']),
    snapshotId: z.number().int().positive().nullable(),
    baselineVariantId: z.string().uuid(),
    baseline: CapitalPlanningMemoV1Schema.nullable(),
    variants: z.array(CapitalComparisonVariantV1Schema).max(4),
    readState: CapitalReadStateV1Schema,
    calculatedAt: DateTimeStringSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.comparisonStatus === 'no_scenario_results') {
      if (
        value.snapshotId !== null ||
        value.baseline !== null ||
        value.variants.length !== 0 ||
        value.calculatedAt !== null
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['baseline'],
          message: 'Absent results cannot expose calculated comparison values',
        });
    } else if (
      value.snapshotId === null ||
      value.baseline === null ||
      value.calculatedAt === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snapshotId'],
        message: 'Comparison requires persisted baseline and snapshot identity',
      });
    }
    if (
      value.baseline &&
      (value.baseline.variantId !== value.baselineVariantId ||
        value.baseline.fundId !== value.fundId ||
        value.baseline.scenarioSetId !== value.scenarioSetId)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseline'],
        message: 'Baseline identity mismatch',
      });
    for (const [index, variant] of value.variants.entries()) {
      if (
        variant.variantId !== variant.memo.variantId ||
        variant.memo.scenarioSetId !== value.scenarioSetId ||
        variant.memo.fundId !== value.fundId ||
        variant.variantId === value.baselineVariantId
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index],
          message: 'Comparison variant identity mismatch',
        });
    }
    if (new Set(value.variants.map((variant) => variant.variantId)).size !== value.variants.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Comparison variants must be unique',
      });
  });

export type CapitalComparisonMetricDeltaV1 = z.infer<typeof CapitalComparisonMetricDeltaV1Schema>;
export type CapitalChangedInputV1 = z.infer<typeof CapitalChangedInputV1Schema>;
export type FundScenarioCapitalComparisonV1 = z.infer<typeof FundScenarioCapitalComparisonV1Schema>;
