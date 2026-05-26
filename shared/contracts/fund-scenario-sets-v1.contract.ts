/**
 * FundScenarioSetsV1 -- Canonical contract for ADR-022 fund-results scenarios.
 *
 * This first slice persists fund-scoped scenario sets and variants only. It
 * supports fee-profile overrides and intentionally does not calculate scenario
 * results or extend the publish-comparison contract.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-scenario-sets-v1.contract
 */

import { z } from 'zod';
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

export type FundScenarioOverrideTypeV1 = z.infer<typeof FundScenarioOverrideTypeV1Schema>;
export type FundScenarioVariantOverrideV1 = z.infer<typeof FundScenarioVariantOverrideV1Schema>;
export type CreateFundScenarioVariantV1 = z.infer<typeof CreateFundScenarioVariantV1Schema>;
export type CreateFundScenarioSetV1 = z.infer<typeof CreateFundScenarioSetV1Schema>;
export type ArchiveFundScenarioSetV1 = z.infer<typeof ArchiveFundScenarioSetV1Schema>;
export type FundScenarioVariantV1 = z.infer<typeof FundScenarioVariantV1Schema>;
export type FundScenarioSetSummaryV1 = z.infer<typeof FundScenarioSetSummaryV1Schema>;
export type FundScenarioSetDetailV1 = z.infer<typeof FundScenarioSetDetailV1Schema>;
