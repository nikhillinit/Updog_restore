import { z } from 'zod';

import { Decimal } from '../lib/decimal-config';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../lib/decimal-string';

export const PLAN_TRANSFORMATION_VERSION = 'fund-config-to-current-plan/1.0.0' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const CurrentPlanPacingAssumptionsV1Schema = z
  .object({
    contractVersion: z.literal('current-plan-pacing-v1'),
    deploymentQuarters: z.number().int().nonnegative(),
    quarterlyDeploymentPcts: z.array(RatioDecimalStringSchema),
    followOnReservePct: RatioDecimalStringSchema,
    annualFeeDragPct: RatioDecimalStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const total = value.quarterlyDeploymentPcts.reduce((sum, pct) => sum.plus(pct), new Decimal(0));
    if (!total.eq(1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'quarterlyDeploymentPcts must sum to 1',
        path: ['quarterlyDeploymentPcts'],
      });
    }
  });

export const CurrentPlanStageDistributionEntryV1Schema = z
  .object({
    stage: z.string().min(1),
    pct: RatioDecimalStringSchema,
  })
  .strict();

export const CurrentPlanGraduationAssumptionV1Schema = z
  .object({
    fromStage: z.string().min(1),
    toStage: z.string().min(1),
    rate: RatioDecimalStringSchema,
    quartersToGraduate: z.number().int().nonnegative(),
  })
  .strict();

export const CurrentPlanExitAssumptionV1Schema = z
  .object({
    stage: z.string().min(1),
    exitMultiple: RatioDecimalStringSchema,
    quartersToExit: z.number().int().nonnegative(),
    failureRate: RatioDecimalStringSchema,
  })
  .strict();

export const CurrentPlanCohortAssumptionsV1Schema = z
  .object({
    contractVersion: z.literal('current-plan-cohort-v1'),
    averageInitialCheckUsd: MoneyDecimalStringSchema,
    stageDistribution: z.array(CurrentPlanStageDistributionEntryV1Schema),
    graduationMatrix: z.array(CurrentPlanGraduationAssumptionV1Schema),
    exitAssumptions: z.array(CurrentPlanExitAssumptionV1Schema),
  })
  .strict()
  .superRefine((value, ctx) => {
    const total = value.stageDistribution.reduce(
      (sum, distribution) => sum.plus(distribution.pct),
      new Decimal(0)
    );
    if (!total.eq(1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stageDistribution percentages must sum to 1',
        path: ['stageDistribution'],
      });
    }

    value.graduationMatrix.forEach((assumption, index) => {
      const rate = new Decimal(assumption.rate);
      if (rate.lt(0) || rate.gt(1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'graduation rate must be between 0 and 1',
          path: ['graduationMatrix', index, 'rate'],
        });
      }
    });

    value.exitAssumptions.forEach((assumption, index) => {
      const failureRate = new Decimal(assumption.failureRate);
      if (failureRate.lt(0) || failureRate.gt(1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'failure rate must be between 0 and 1',
          path: ['exitAssumptions', index, 'failureRate'],
        });
      }
    });
  });

export const CurrentPlanAllocationV1Schema = z
  .object({
    allocationId: z.string().min(1),
    name: z.string().min(1),
    stageFocus: z.string().min(1),
    initialCapitalUsd: MoneyDecimalStringSchema,
    followOnCapitalUsd: MoneyDecimalStringSchema,
    avgInitialCheckUsd: MoneyDecimalStringSchema,
    pacingQuarters: z.number().int().nonnegative(),
    followOnStrategy: z.enum(['amount', 'maintain_ownership']),
    followOnParticipationPct: RatioDecimalStringSchema.nullable(),
  })
  .strict();

export const CurrentPlanVersionV1Schema = z
  .object({
    contractVersion: z.literal('current-plan-version-v1'),
    id: z.string().min(1),
    fundId: z.number().int().positive(),
    version: z.number().int().positive(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().nonnegative(),
    sourceFactsSnapshotId: z.string().min(1),
    deployableCapitalUsd: MoneyDecimalStringSchema,
    planTransformationVersion: z.string().min(1),
    allocations: z.array(CurrentPlanAllocationV1Schema),
    pacingAssumptions: CurrentPlanPacingAssumptionsV1Schema,
    cohortAssumptions: CurrentPlanCohortAssumptionsV1Schema,
    reservePolicyVersion: z.string().min(1),
    assumptionsHash: Sha256Schema,
    supersedesVersionId: z.string().min(1).nullable(),
    supersededByVersionId: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const CurrentPlanAssumptionsHashPreimageV1Schema = z
  .object({
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().nonnegative(),
    sourceFactsSnapshotId: z.string().min(1),
    asOfDate: z.string().date(),
    planTransformationVersion: z.literal(PLAN_TRANSFORMATION_VERSION),
    feeCompilerVersion: z.string().min(1),
    deployableCapitalUsd: MoneyDecimalStringSchema,
    allocations: z.array(CurrentPlanAllocationV1Schema),
    pacingAssumptions: CurrentPlanPacingAssumptionsV1Schema,
    cohortAssumptions: CurrentPlanCohortAssumptionsV1Schema,
    reservePolicyVersion: z.string().min(1),
  })
  .strict();

export type CurrentPlanPacingAssumptionsV1 = z.infer<typeof CurrentPlanPacingAssumptionsV1Schema>;
export type CurrentPlanStageDistributionEntryV1 = z.infer<
  typeof CurrentPlanStageDistributionEntryV1Schema
>;
export type CurrentPlanGraduationAssumptionV1 = z.infer<
  typeof CurrentPlanGraduationAssumptionV1Schema
>;
export type CurrentPlanExitAssumptionV1 = z.infer<typeof CurrentPlanExitAssumptionV1Schema>;
export type CurrentPlanCohortAssumptionsV1 = z.infer<typeof CurrentPlanCohortAssumptionsV1Schema>;
export type CurrentPlanAllocationV1 = z.infer<typeof CurrentPlanAllocationV1Schema>;
export type CurrentPlanVersionV1 = z.infer<typeof CurrentPlanVersionV1Schema>;
export type CurrentPlanAssumptionsHashPreimageV1 = z.infer<
  typeof CurrentPlanAssumptionsHashPreimageV1Schema
>;
