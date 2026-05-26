/**
 * FundScenarioSetsV1 -- Canonical contract for ADR-022 fund-results scenarios.
 *
 * This slice persists fund-scoped scenario sets and variants, then supports
 * sync fee-profile calculation. It intentionally does not extend the
 * publish-comparison contract.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-scenario-sets-v1.contract
 */

import { z } from 'zod';
import { EconomicsResultV1Schema, EconomicsSummaryV1Schema } from './economics-v1.contract';
import { FundDraftWriteV1Schema } from './fund-draft-write-v1.contract';

const DateTimeStringSchema = z.string().datetime();

export const FundScenarioOverrideTypeV1Schema = z.literal('fee_profile');

const FeeProfileOverridePayloadV1Schema = FundDraftWriteV1Schema.pick({
  feeProfiles: true,
})
  .required()
  .strict()
  .refine((value) => value.feeProfiles.length > 0, {
    message: 'feeProfiles must include at least one profile',
    path: ['feeProfiles'],
  });

export const FundScenarioFeeProfileOverrideV1Schema = z
  .object({
    overrideType: FundScenarioOverrideTypeV1Schema,
    payload: FeeProfileOverridePayloadV1Schema,
  })
  .strict();

export const FundScenarioVariantOverrideV1Schema = FundScenarioFeeProfileOverrideV1Schema;

export const CreateFundScenarioVariantV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    override: FundScenarioVariantOverrideV1Schema,
  })
  .strict();

export const CreateFundScenarioSetV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    variants: z.array(CreateFundScenarioVariantV1Schema).min(1).max(5),
  })
  .strict();

export const ArchiveFundScenarioSetV1Schema = z
  .object({
    reason: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();

export const FundScenarioSetSummaryV1Schema = z
  .object({
    id: z.string().uuid(),
    fundId: z.number().int().positive(),
    name: z.string(),
    description: z.string().nullable(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    variantCount: z.number().int().min(0),
    archivedAt: DateTimeStringSchema.nullable(),
    archivedByUserId: z.number().int().positive().nullable(),
    archivedByLabel: z.string().nullable(),
    createdByUserId: z.number().int().positive().nullable(),
    createdByLabel: z.string().nullable(),
    updatedByUserId: z.number().int().positive().nullable(),
    updatedByLabel: z.string().nullable(),
    createdAt: DateTimeStringSchema,
    updatedAt: DateTimeStringSchema,
  })
  .strict();

export const FundScenarioVariantV1Schema = z
  .object({
    id: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int().min(0),
    override: FundScenarioVariantOverrideV1Schema,
    createdAt: DateTimeStringSchema,
    updatedAt: DateTimeStringSchema,
  })
  .strict();

export const FundScenarioSetDetailV1Schema = FundScenarioSetSummaryV1Schema.extend({
  variants: z.array(FundScenarioVariantV1Schema).max(5),
}).strict();

export const FundScenarioSetListResponseV1Schema = z
  .object({
    scenarioSets: z.array(FundScenarioSetSummaryV1Schema),
  })
  .strict();

export const FundScenarioCalculationStalenessV1Schema = z
  .object({
    state: z.enum(['CURRENT', 'STALE_PUBLISH', 'STALE_CONFIG']),
    sourceConfigVersion: z.number().int().positive(),
    currentPublishedConfigVersion: z.number().int().positive().nullable(),
  })
  .strict();

export const FundScenarioResultStalenessStateV1Schema = z.enum([
  'CURRENT',
  'STALE_PUBLISH',
  'STALE_CONFIG',
]);

export const FundScenariosSectionReasonCodeV1Schema = z.enum([
  'SCENARIOS_NONE_EXIST',
  'SCENARIOS_NONE_CALCULATED',
  'SCENARIOS_LOAD_FAILED',
]);

export const ScenarioSetVariantResultSummaryV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: FundScenarioOverrideTypeV1Schema,
    economicsSummary: EconomicsSummaryV1Schema,
  })
  .strict();

export const ScenarioSetResultSummaryV1Schema = z
  .object({
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    calculatedAt: DateTimeStringSchema,
    staleness: FundScenarioResultStalenessStateV1Schema,
    variantCount: z.number().int().min(0).max(5),
    variants: z.array(ScenarioSetVariantResultSummaryV1Schema).min(1).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.variantCount !== value.variants.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variantCount'],
        message: 'variantCount must match variants.length',
      });
    }
  });

export const ScenariosSectionPayloadV1Schema = z
  .object({
    version: z.literal('fund-scenarios-v1'),
    aggregateStaleness: FundScenarioResultStalenessStateV1Schema,
    sets: z.array(ScenarioSetResultSummaryV1Schema).min(1).max(10),
  })
  .strict();

export const FundScenarioCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    overrideType: FundScenarioOverrideTypeV1Schema,
    economics: EconomicsResultV1Schema,
  })
  .strict();

export const FundScenarioCalculationPayloadV1Schema = z
  .object({
    version: z.literal('fund-scenarios-v1'),
    calculationMode: z.literal('sync_fee_profile'),
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    staleness: FundScenarioCalculationStalenessV1Schema,
    calculatedAt: DateTimeStringSchema,
    variants: z.array(FundScenarioCalculationVariantV1Schema).min(1).max(5),
  })
  .strict();

export const FundScenarioCalculationResponseV1Schema = z
  .object({
    snapshotId: z.number().int().positive(),
    correlationId: z.string().uuid(),
    source: z.literal('fund_snapshots'),
    payload: FundScenarioCalculationPayloadV1Schema,
  })
  .strict();

export type FundScenarioOverrideTypeV1 = z.infer<typeof FundScenarioOverrideTypeV1Schema>;
export type FundScenarioVariantOverrideV1 = z.infer<typeof FundScenarioVariantOverrideV1Schema>;
export type CreateFundScenarioVariantV1 = z.infer<typeof CreateFundScenarioVariantV1Schema>;
export type CreateFundScenarioSetV1 = z.infer<typeof CreateFundScenarioSetV1Schema>;
export type ArchiveFundScenarioSetV1 = z.infer<typeof ArchiveFundScenarioSetV1Schema>;
export type FundScenarioVariantV1 = z.infer<typeof FundScenarioVariantV1Schema>;
export type FundScenarioSetSummaryV1 = z.infer<typeof FundScenarioSetSummaryV1Schema>;
export type FundScenarioSetDetailV1 = z.infer<typeof FundScenarioSetDetailV1Schema>;
export type FundScenarioResultStalenessStateV1 = z.infer<
  typeof FundScenarioResultStalenessStateV1Schema
>;
export type FundScenariosSectionReasonCodeV1 = z.infer<
  typeof FundScenariosSectionReasonCodeV1Schema
>;
export type ScenarioSetVariantResultSummaryV1 = z.infer<
  typeof ScenarioSetVariantResultSummaryV1Schema
>;
export type ScenarioSetResultSummaryV1 = z.infer<typeof ScenarioSetResultSummaryV1Schema>;
export type ScenariosSectionPayloadV1 = z.infer<typeof ScenariosSectionPayloadV1Schema>;
export type FundScenarioCalculationPayloadV1 = z.infer<
  typeof FundScenarioCalculationPayloadV1Schema
>;
export type FundScenarioCalculationResponseV1 = z.infer<
  typeof FundScenarioCalculationResponseV1Schema
>;
