import { z } from 'zod';

import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../lib/decimal-string';

export const ENGINE_VERSION = 'current-forecast-v2-engine/1.0.0' as const;
export const METHODOLOGY_VERSION = 'cohort-projection-v2/1.0.0' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const CurrentForecastV2InputSchema = z
  .object({
    fundId: z.number().int().positive(),
    financialFactsSnapshotId: z.string(),
    currentPlanVersionId: z.string(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    clock: z.string().datetime(),
  })
  .strict();

export const CurrentForecastSeriesPointV1Schema = z
  .object({
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    source: z.enum(['actual', 'projected']),
    deployedUsd: MoneyDecimalStringSchema,
    contributionsUsd: MoneyDecimalStringSchema,
    distributionsUsd: MoneyDecimalStringSchema,
    navUsd: MoneyDecimalStringSchema,
    tvpi: RatioDecimalStringSchema,
    dpi: RatioDecimalStringSchema,
    activeCompanyCount: z.number().int().nonnegative(),
    projectedCohortCount: z.number().int().nonnegative(),
  })
  .strict();

export const CurrentForecastUnavailableReasonSchema = z.enum([
  'FACTS_UNAVAILABLE',
  'PLAN_DERIVATION_INCOMPLETE',
  'FEE_PROFILE_ABSENT',
  'OWNERSHIP_STRATEGY_UNSUPPORTED',
  'ASSUMPTION_STAGE_INCOMPLETE',
]);

export const CurrentForecastUnavailableReasonDetailSchema = z
  .object({
    code: CurrentForecastUnavailableReasonSchema,
    detail: z.string().min(1),
  })
  .strict();

export const CurrentForecastV2Schema = z
  .object({
    contractVersion: z.literal('current-forecast-v2'),
    fundId: z.number().int().positive(),
    financialFactsSnapshotId: z.string(),
    currentPlanVersionId: z.string(),
    asOfDate: z.string().date(),
    status: z.enum(['available', 'indicative', 'unavailable', 'failed', 'held']),
    series: z.array(CurrentForecastSeriesPointV1Schema),
    remainingDeployableCapitalUsd: MoneyDecimalStringSchema,
    committedCapitalUsd: MoneyDecimalStringSchema,
    calledToDateUsd: MoneyDecimalStringSchema,
    projectedFeesRemainingUsd: MoneyDecimalStringSchema,
    recallableDistributionsUsd: MoneyDecimalStringSchema,
    uncalledCapitalUsd: MoneyDecimalStringSchema,
    netIrr: RatioDecimalStringSchema.nullable(),
    inputHash: Sha256Schema,
    assumptionsHash: Sha256Schema,
    resultHash: Sha256Schema.nullable(),
    engineVersion: z.literal(ENGINE_VERSION),
    methodologyVersion: z.literal(METHODOLOGY_VERSION),
    unavailableReasons: z.array(CurrentForecastUnavailableReasonDetailSchema),
    warnings: z.array(z.string()),
  })
  .strict();

export type CurrentForecastV2Input = z.infer<typeof CurrentForecastV2InputSchema>;
export type CurrentForecastSeriesPointV1 = z.infer<typeof CurrentForecastSeriesPointV1Schema>;
export type CurrentForecastUnavailableReason = z.infer<
  typeof CurrentForecastUnavailableReasonSchema
>;
export type CurrentForecastUnavailableReasonDetail = z.infer<
  typeof CurrentForecastUnavailableReasonDetailSchema
>;
export type CurrentForecastV2 = z.infer<typeof CurrentForecastV2Schema>;
