import { z } from 'zod';
import Decimal from '@shared/lib/decimal-config';
import { CANONICAL_STAGES, CanonicalStageSchema } from '@shared/schemas/stage';
import { DecimalStringSchema } from './lp-reporting/cash-flow-event.contract';

/**
 * The denominator floor has two prongs: an absolute USD 1,000 minimum and
 * 1% of the with-decision path's total expected capital. The engine applies
 * the greater amount for each result.
 */
export const MIN_DELTA_CAPITAL_FLOOR = {
  absoluteUsd: '1000',
  withDecisionExpectedCapitalRatio: '0.01',
} as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((value) => value === 'USD', {
    message: 'marginal-reserve-moic-v1 supports USD only',
  });

const NonnegativeDecimalStringSchema = DecimalStringSchema.refine(
  (value) => new Decimal(value).gte(0),
  { message: 'Expected a nonnegative decimal string' }
);

export const ProbabilityDecimalStringSchema = DecimalStringSchema.refine(
  (value) => new Decimal(value).gte(0) && new Decimal(value).lte(1),
  { message: 'Expected a decimal string between 0 and 1' }
);

export const MarginalReserveInputReadinessReasonSchema = z.enum([
  'MISSING_ACTUALS_FACTS',
  'MISSING_CURRENT_OWNERSHIP',
  'MISSING_PUBLISHED_ASSUMPTIONS',
  'MISSING_STAGE_ASSUMPTION',
  'MISSING_FOLLOW_ON_POLICY',
  'MISSING_PLANNED_CHECK',
  'PLANNED_CHECK_EXCEEDS_ROUND_SIZE',
  'BLOCKED_CURRENCY',
  'STALE_ASSUMPTION',
]);

export const MarginalReserveInputReadinessSchema = z
  .object({
    status: z.enum(['actionable', 'indicative']),
    reasons: z.array(MarginalReserveInputReadinessReasonSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasStaleAssumption = value.reasons.includes('STALE_ASSUMPTION');
    if (value.status === 'actionable' && value.reasons.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Actionable inputs cannot have readiness reasons',
        path: ['reasons'],
      });
    }
    if (value.status === 'indicative' && !hasStaleAssumption) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicative inputs require a stale-assumption reason',
        path: ['reasons'],
      });
    }
  });

export const MarginalReserveInputFailureSchema = z
  .object({
    companyId: z.number().int().positive(),
    reasons: z.array(MarginalReserveInputReadinessReasonSchema).min(1),
  })
  .strict();

const ParticipationSchema = z
  .object({
    participate: z.boolean(),
    checkAmount: NonnegativeDecimalStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const checkAmount = new Decimal(value.checkAmount);
    if (value.participate && !checkAmount.gt(0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A participating path requires a positive checkAmount',
        path: ['checkAmount'],
      });
    }
    if (!value.participate && !checkAmount.isZero()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A non-participating path requires a zero checkAmount',
        path: ['checkAmount'],
      });
    }
  });

export const MarginalReserveStageV1Schema = z
  .object({
    stage: CanonicalStageSchema,
    preMoneyValuation: NonnegativeDecimalStringSchema,
    roundSize: NonnegativeDecimalStringSchema,
    monthsFromPriorStage: z.number().int().nonnegative(),
    graduationProbability: ProbabilityDecimalStringSchema,
    exitProbability: ProbabilityDecimalStringSchema,
    exitValuation: NonnegativeDecimalStringSchema,
    withDecision: ParticipationSchema,
    withoutDecision: ParticipationSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const preMoney = new Decimal(value.preMoneyValuation);
    const roundSize = new Decimal(value.roundSize);
    if (preMoney.plus(roundSize).lte(0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'preMoneyValuation plus roundSize must be positive',
        path: ['roundSize'],
      });
    }

    const probabilitySum = new Decimal(value.exitProbability).plus(value.graduationProbability);
    if (probabilitySum.gt(1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exitProbability plus graduationProbability must not exceed 1',
        path: ['exitProbability'],
      });
    }

    for (const path of ['withDecision', 'withoutDecision'] as const) {
      if (new Decimal(value[path].checkAmount).gt(roundSize)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'checkAmount cannot exceed roundSize',
          path: [path, 'checkAmount'],
        });
      }
    }
  });

function validateCanonicalStageOrder(
  stages: ReadonlyArray<{ stage: z.infer<typeof CanonicalStageSchema> }>,
  ctx: z.RefinementCtx,
  collectionPath: 'stages' | 'stageContributions'
): void {
  let priorIndex = -1;
  stages.forEach((stage, index) => {
    const currentIndex = CANONICAL_STAGES.indexOf(stage.stage);
    if (currentIndex <= priorIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Stages must be unique and follow canonical stage order',
        path: [collectionPath, index, 'stage'],
      });
    }
    priorIndex = currentIndex;
  });
}

export const MarginalReserveMoicInputV1Schema = z
  .object({
    contractVersion: z.literal('marginal-reserve-moic-input-v1'),
    fundId: z.number().int().positive(),
    companyId: z.number().int().positive(),
    baseCurrency: CurrencyCodeSchema,
    asOfDate: z.string().date(),
    currentOwnership: ProbabilityDecimalStringSchema,
    stages: z.array(MarginalReserveStageV1Schema).min(1),
    factsInputHash: Sha256Schema,
    assumptionsHash: Sha256Schema,
    engineVersion: z.literal('marginal-reserve-moic-v1'),
    readiness: MarginalReserveInputReadinessSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateCanonicalStageOrder(value.stages, ctx, 'stages');

    const hasCapitalDifference = value.stages.some(
      (stage) => !new Decimal(stage.withDecision.checkAmount).eq(stage.withoutDecision.checkAmount)
    );
    if (!hasCapitalDifference) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one stage must differ in capital between counterfactual paths',
        path: ['stages'],
      });
    }
  });

export const MarginalReserveWarningCodeSchema = z.enum([
  'NON_POSITIVE_DELTA_CAPITAL',
  'MIN_DENOMINATOR_FLOOR',
  'IMPLAUSIBLE_MAGNITUDE',
  'IRR_UNAVAILABLE',
  'STALE_ASSUMPTION',
]);

export const StructuredWarningSchema = z
  .object({
    code: MarginalReserveWarningCodeSchema,
    message: z.string().min(1),
  })
  .strict();

export const CounterfactualSummarySchema = z
  .object({
    expectedProceeds: DecimalStringSchema,
    expectedCapital: DecimalStringSchema,
    expectedOwnershipAtExit: DecimalStringSchema,
  })
  .strict();

const CounterfactualStageContributionSchema = z
  .object({
    ownershipAfterRound: DecimalStringSchema,
    expectedCapital: DecimalStringSchema,
    expectedProceeds: DecimalStringSchema,
    expectedOwnershipAtExit: DecimalStringSchema,
  })
  .strict();

export const StageContributionSchema = z
  .object({
    stage: CanonicalStageSchema,
    reachProbability: ProbabilityDecimalStringSchema,
    conditionalExitProbability: ProbabilityDecimalStringSchema,
    conditionalGraduationProbability: ProbabilityDecimalStringSchema,
    conditionalFailureProbability: ProbabilityDecimalStringSchema,
    unconditionalExitProbability: ProbabilityDecimalStringSchema,
    unconditionalFailureProbability: ProbabilityDecimalStringSchema,
    withDecision: CounterfactualStageContributionSchema,
    withoutDecision: CounterfactualStageContributionSchema,
    deltaExpectedProceeds: DecimalStringSchema,
    deltaExpectedCapital: DecimalStringSchema,
  })
  .strict();

export const MarginalReserveMoicResultV1Schema = z
  .object({
    contractVersion: z.literal('marginal-reserve-moic-result-v1'),
    companyId: z.number().int().positive(),
    status: z.enum(['actionable', 'indicative', 'unavailable']),
    marginalMoic: DecimalStringSchema.nullable(),
    marginalIrr: DecimalStringSchema.nullable(),
    deltaExpectedProceeds: DecimalStringSchema,
    deltaExpectedCapital: DecimalStringSchema,
    withDecision: CounterfactualSummarySchema,
    withoutDecision: CounterfactualSummarySchema,
    stageContributions: z.array(StageContributionSchema).min(1),
    factsInputHash: Sha256Schema,
    assumptionsHash: Sha256Schema,
    resultHash: Sha256Schema,
    warnings: z.array(StructuredWarningSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateCanonicalStageOrder(value.stageContributions, ctx, 'stageContributions');
    const hasMagnitudeWarning = value.warnings.some(
      (warning) => warning.code === 'IMPLAUSIBLE_MAGNITUDE'
    );
    const hasStaleAssumptionWarning = value.warnings.some(
      (warning) => warning.code === 'STALE_ASSUMPTION'
    );
    const exceedsMagnitudeThreshold =
      value.marginalMoic !== null && new Decimal(value.marginalMoic).gt(100);

    if (
      value.status === 'unavailable' &&
      (value.marginalMoic !== null || value.marginalIrr !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unavailable results cannot contain marginalMoic or marginalIrr',
        path: ['status'],
      });
    }
    if (value.status !== 'unavailable' && value.marginalMoic === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Available results require marginalMoic',
        path: ['marginalMoic'],
      });
    }
    if (value.status === 'indicative' && !exceedsMagnitudeThreshold && !hasStaleAssumptionWarning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicative results require a magnitude or stale-assumption warning',
        path: ['marginalMoic'],
      });
    }
    if (value.status === 'indicative' && exceedsMagnitudeThreshold && !hasMagnitudeWarning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicative results require an IMPLAUSIBLE_MAGNITUDE warning',
        path: ['warnings'],
      });
    }
    if (exceedsMagnitudeThreshold && value.status !== 'indicative') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Marginal MOIC above 100 must be indicative',
        path: ['status'],
      });
    }
    if (!exceedsMagnitudeThreshold && hasMagnitudeWarning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'IMPLAUSIBLE_MAGNITUDE is valid only when marginalMoic is above 100',
        path: ['warnings'],
      });
    }
    if (value.status === 'actionable' && hasStaleAssumptionWarning) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Stale assumptions cannot produce an actionable result',
        path: ['status'],
      });
    }
  });

export const MarginalReserveRankingsResponseV1Schema = z
  .object({
    contractVersion: z.literal('marginal-reserve-rankings-v1'),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    factsInputHash: Sha256Schema,
    assumptionsHash: Sha256Schema,
    rankings: z.array(MarginalReserveMoicResultV1Schema),
    unavailable: z.array(MarginalReserveInputFailureSchema),
  })
  .strict();

export type MarginalReserveStageV1 = z.infer<typeof MarginalReserveStageV1Schema>;
export type MarginalReserveInputReadinessReason = z.infer<
  typeof MarginalReserveInputReadinessReasonSchema
>;
export type MarginalReserveInputReadiness = z.infer<typeof MarginalReserveInputReadinessSchema>;
export type MarginalReserveInputFailure = z.infer<typeof MarginalReserveInputFailureSchema>;
export type MarginalReserveMoicInputV1 = z.infer<typeof MarginalReserveMoicInputV1Schema>;
export type MarginalReserveWarningCode = z.infer<typeof MarginalReserveWarningCodeSchema>;
export type StructuredWarning = z.infer<typeof StructuredWarningSchema>;
export type CounterfactualSummary = z.infer<typeof CounterfactualSummarySchema>;
export type StageContribution = z.infer<typeof StageContributionSchema>;
export type MarginalReserveMoicResultV1 = z.infer<typeof MarginalReserveMoicResultV1Schema>;
export type MarginalReserveRankingsResponseV1 = z.infer<
  typeof MarginalReserveRankingsResponseV1Schema
>;
