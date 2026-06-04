/**
 * FundScenarioSetsV1 -- Canonical contract for ADR-022 fund-results scenarios.
 *
 * Strict schema: unknown keys are rejected (.strict()).
 *
 * @module shared/contracts/fund-scenario-sets-v1.contract
 */

import { z } from 'zod';
import { EconomicsResultV1Schema, EconomicsSummaryV1Schema } from './economics-v1.contract';
import { FundDraftWriteV1Schema } from './fund-draft-write-v1.contract';

const DateTimeStringSchema = z.string().datetime();

export const FundScenarioOverrideTypeV1Schema = z.enum([
  'fee_profile',
  'reserve_allocation',
  'allocation',
  'sector_profile',
]);

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
    overrideType: z.literal('fee_profile'),
    payload: FeeProfileOverridePayloadV1Schema,
  })
  .strict();

const AllocationOverridePayloadV1Schema = FundDraftWriteV1Schema.pick({
  allocations: true,
  capitalPlanAllocations: true,
})
  .partial()
  .strict()
  .refine((value) => value.allocations != null || value.capitalPlanAllocations != null, {
    message: 'allocation override requires allocations or capitalPlanAllocations',
  });

export const FundScenarioAllocationOverrideV1Schema = z
  .object({
    overrideType: z.literal('allocation'),
    payload: AllocationOverridePayloadV1Schema,
  })
  .strict();

const SectorProfileOverridePayloadV1Schema = FundDraftWriteV1Schema.pick({
  sectorProfiles: true,
})
  .required()
  .strict()
  .refine((value) => value.sectorProfiles.length > 0, {
    message: 'sectorProfiles must include at least one profile',
    path: ['sectorProfiles'],
  });

export const FundScenarioSectorProfileOverrideV1Schema = z
  .object({
    overrideType: z.literal('sector_profile'),
    payload: SectorProfileOverridePayloadV1Schema,
  })
  .strict();

export const ReserveScenarioAllocationOverrideItemV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    plannedReservesCents: z.number().int().min(0),
    maxAllocationCents: z.number().int().min(0).nullable().optional(),
    allocationReason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const FundScenarioReserveAllocationOverrideV1Schema = z
  .object({
    overrideType: z.literal('reserve_allocation'),
    payload: z
      .object({
        allocationVersion: z.number().int().positive().nullable().optional(),
        items: z.array(ReserveScenarioAllocationOverrideItemV1Schema).min(1).max(500),
      })
      .strict(),
  })
  .strict();

export const FundScenarioVariantOverrideV1Schema = z.discriminatedUnion('overrideType', [
  FundScenarioFeeProfileOverrideV1Schema,
  FundScenarioReserveAllocationOverrideV1Schema,
  FundScenarioAllocationOverrideV1Schema,
  FundScenarioSectorProfileOverrideV1Schema,
]);

export const CreateFundScenarioVariantV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    override: FundScenarioVariantOverrideV1Schema,
  })
  .strict();

function allVariantsShareOverrideType(
  variants: Array<{ override: { overrideType: FundScenarioOverrideTypeV1 } }>
): boolean {
  const first = variants[0]?.override.overrideType;
  return first != null && variants.every((variant) => variant.override.overrideType === first);
}

export const CreateFundScenarioSetV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    variants: z.array(CreateFundScenarioVariantV1Schema).min(1).max(5),
  })
  .strict()
  .refine((value) => allVariantsShareOverrideType(value.variants), {
    message: 'All variants in a scenario set must use the same overrideType',
    path: ['variants'],
  });

export const CreateReserveOptimizationScenarioSetV1Schema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    variantName: z.string().trim().min(1).max(120).optional(),
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

export const ScenarioEvidenceStateV1Schema = z.enum([
  'CURRENT',
  'STALE_PUBLISH',
  'STALE_CONFIG',
  'CALCULATING',
  'FAILED',
  'UNAVAILABLE',
]);

export const FundScenarioCalculationStalenessV1Schema = z
  .object({
    state: ScenarioEvidenceStateV1Schema,
    sourceConfigVersion: z.number().int().positive(),
    currentPublishedConfigVersion: z.number().int().positive().nullable(),
  })
  .strict();

export const FundScenarioResultStalenessStateV1Schema = ScenarioEvidenceStateV1Schema;

export const FundScenariosSectionReasonCodeV1Schema = z.enum([
  'SCENARIOS_NONE_EXIST',
  'SCENARIOS_NONE_CALCULATED',
  'SCENARIOS_LOAD_FAILED',
]);

export const ScenarioReserveAllocationResultV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    baseAllocationCents: z.number().int().min(0),
    plannedReservesCents: z.number().int().min(0),
    maxAllocationCents: z.number().int().min(0).nullable(),
    scenarioAllocationCents: z.number().int().min(0),
    allocationDeltaCents: z.number().int(),
    capApplied: z.boolean(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })
  .strict();

export const ScenarioReserveWarningCodeV1Schema = z.enum([
  'TOTAL_SCENARIO_ALLOCATION_EXCEEDS_FUND_SIZE',
  'OVERRIDE_COMPANY_NOT_FOUND',
  'DUPLICATE_COMPANY_OVERRIDE',
]);

export const ScenarioReserveWarningV1Schema = z
  .object({
    code: ScenarioReserveWarningCodeV1Schema,
    message: z.string(),
    companyId: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const ScenarioReserveSummaryV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    totalBaseAllocationCents: z.number().int().min(0),
    totalScenarioAllocationCents: z.number().int().min(0),
    totalAllocationDeltaCents: z.number().int(),
    avgConfidence: z.number().min(0).max(1),
    highConfidenceCount: z.number().int().min(0),
    allocations: z.array(ScenarioReserveAllocationResultV1Schema),
    warnings: z.array(ScenarioReserveWarningV1Schema),
    generatedAt: DateTimeStringSchema,
  })
  .strict();

export const ScenarioReserveResultSummaryV1Schema = z
  .object({
    totalScenarioAllocationCents: z.number().int().min(0),
    totalAllocationDeltaCents: z.number().int(),
    avgConfidence: z.number().min(0).max(1),
    highConfidenceCount: z.number().int().min(0),
    warningCount: z.number().int().min(0),
  })
  .strict();

export const ScenarioSetFeeProfileVariantResultSummaryV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('fee_profile'),
    economicsSummary: EconomicsSummaryV1Schema,
  })
  .strict();

export const ScenarioSetAllocationVariantResultSummaryV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('allocation'),
    economicsSummary: EconomicsSummaryV1Schema,
  })
  .strict();

export const ScenarioSetSectorProfileVariantResultSummaryV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('sector_profile'),
    economicsSummary: EconomicsSummaryV1Schema,
  })
  .strict();

export const ScenarioSetReserveVariantResultSummaryV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('reserve_allocation'),
    reserveSummary: ScenarioReserveResultSummaryV1Schema,
  })
  .strict();

export const ScenarioSetVariantResultSummaryV1Schema = z.discriminatedUnion('overrideType', [
  ScenarioSetFeeProfileVariantResultSummaryV1Schema,
  ScenarioSetAllocationVariantResultSummaryV1Schema,
  ScenarioSetSectorProfileVariantResultSummaryV1Schema,
  ScenarioSetReserveVariantResultSummaryV1Schema,
]);

export const FundScenarioCalculationModeV1Schema = z.enum([
  'sync_fee_profile',
  'sync_allocation',
  'sync_sector_profile',
  'async_reserve_allocation',
]);

function overrideTypeForCalculationMode(
  calculationMode: z.infer<typeof FundScenarioCalculationModeV1Schema>
): FundScenarioOverrideTypeV1 {
  switch (calculationMode) {
    case 'sync_fee_profile':
      return 'fee_profile';
    case 'sync_allocation':
      return 'allocation';
    case 'sync_sector_profile':
      return 'sector_profile';
    case 'async_reserve_allocation':
      return 'reserve_allocation';
  }
}

export const ScenarioSetResultSummaryV1Schema = z
  .object({
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    calculationMode: FundScenarioCalculationModeV1Schema,
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    currentPublishedConfigVersion: z.number().int().positive().nullable(),
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

    const expectedOverrideType = overrideTypeForCalculationMode(value.calculationMode);

    for (const [index, variant] of value.variants.entries()) {
      if (variant.overrideType !== expectedOverrideType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index, 'overrideType'],
          message: `${value.calculationMode} requires ${expectedOverrideType} variants`,
        });
      }
    }
  });

export const ScenariosSectionPayloadV1Schema = z
  .object({
    version: z.literal('fund-scenarios-v1'),
    aggregateStaleness: FundScenarioResultStalenessStateV1Schema,
    sets: z.array(ScenarioSetResultSummaryV1Schema).min(1).max(10),
  })
  .strict();

export const FundScenarioFeeProfileCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('fee_profile'),
    economics: EconomicsResultV1Schema,
  })
  .strict();

export const FundScenarioAllocationCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('allocation'),
    economics: EconomicsResultV1Schema,
  })
  .strict();

export const FundScenarioSectorProfileCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('sector_profile'),
    economics: EconomicsResultV1Schema,
  })
  .strict();

export const FundScenarioReserveCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('reserve_allocation'),
    reserve: ScenarioReserveSummaryV1Schema,
  })
  .strict();

export const FundScenarioCalculationVariantV1Schema = z.discriminatedUnion('overrideType', [
  FundScenarioFeeProfileCalculationVariantV1Schema,
  FundScenarioAllocationCalculationVariantV1Schema,
  FundScenarioSectorProfileCalculationVariantV1Schema,
  FundScenarioReserveCalculationVariantV1Schema,
]);

export const FundScenarioCalculationPayloadV1Schema = z
  .object({
    version: z.literal('fund-scenarios-v1'),
    calculationMode: FundScenarioCalculationModeV1Schema,
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    staleness: FundScenarioCalculationStalenessV1Schema,
    calculatedAt: DateTimeStringSchema,
    variants: z.array(FundScenarioCalculationVariantV1Schema).min(1).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedOverrideType = overrideTypeForCalculationMode(value.calculationMode);

    for (const [index, variant] of value.variants.entries()) {
      if (variant.overrideType !== expectedOverrideType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index, 'overrideType'],
          message: `${value.calculationMode} requires ${expectedOverrideType} variants`,
        });
      }
    }
  });

export const FundScenarioCalculationResponseV1Schema = z
  .object({
    snapshotId: z.number().int().positive(),
    correlationId: z.string().uuid(),
    source: z.literal('fund_snapshots'),
    payload: FundScenarioCalculationPayloadV1Schema,
  })
  .strict();

export const FundScenarioReserveCalculationRequestV1Schema = z
  .object({
    calculationMode: z.literal('async_reserve_allocation').optional(),
  })
  .strict();

export const FundScenarioReserveCalculationQueuedV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    calculationMode: z.literal('async_reserve_allocation'),
    status: z.literal('queued'),
    jobId: z.string(),
    correlationId: z.string().uuid(),
  })
  .strict();

export const FundScenarioCalculationStatusV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    calculationMode: FundScenarioCalculationModeV1Schema.nullable(),
    status: z.enum(['not_requested', 'queued', 'calculating', 'succeeded', 'failed']),
    jobId: z.string().nullable(),
    correlationId: z.string().uuid().nullable(),
    snapshotId: z.number().int().positive().nullable(),
    lastEventAt: DateTimeStringSchema.nullable(),
    lastError: z.string().nullable(),
  })
  .strict();

export type FundScenarioOverrideTypeV1 = z.infer<typeof FundScenarioOverrideTypeV1Schema>;
export type FundScenarioVariantOverrideV1 = z.infer<typeof FundScenarioVariantOverrideV1Schema>;
export type FundScenarioReserveAllocationOverrideV1 = z.infer<
  typeof FundScenarioReserveAllocationOverrideV1Schema
>;
export type ReserveScenarioAllocationOverrideItemV1 = z.infer<
  typeof ReserveScenarioAllocationOverrideItemV1Schema
>;
export type CreateFundScenarioVariantV1 = z.infer<typeof CreateFundScenarioVariantV1Schema>;
export type CreateFundScenarioSetV1 = z.infer<typeof CreateFundScenarioSetV1Schema>;
export type CreateReserveOptimizationScenarioSetV1 = z.infer<
  typeof CreateReserveOptimizationScenarioSetV1Schema
>;
export type ArchiveFundScenarioSetV1 = z.infer<typeof ArchiveFundScenarioSetV1Schema>;
export type FundScenarioVariantV1 = z.infer<typeof FundScenarioVariantV1Schema>;
export type FundScenarioSetSummaryV1 = z.infer<typeof FundScenarioSetSummaryV1Schema>;
export type FundScenarioSetDetailV1 = z.infer<typeof FundScenarioSetDetailV1Schema>;
export type ScenarioEvidenceStateV1 = z.infer<typeof ScenarioEvidenceStateV1Schema>;
export type FundScenarioResultStalenessStateV1 = z.infer<
  typeof FundScenarioResultStalenessStateV1Schema
>;
export type FundScenariosSectionReasonCodeV1 = z.infer<
  typeof FundScenariosSectionReasonCodeV1Schema
>;
export type ScenarioReserveSummaryV1 = z.infer<typeof ScenarioReserveSummaryV1Schema>;
export type ScenarioReserveWarningV1 = z.infer<typeof ScenarioReserveWarningV1Schema>;
export type ScenarioSetVariantResultSummaryV1 = z.infer<
  typeof ScenarioSetVariantResultSummaryV1Schema
>;
export type ScenarioSetResultSummaryV1 = z.infer<typeof ScenarioSetResultSummaryV1Schema>;
export type ScenariosSectionPayloadV1 = z.infer<typeof ScenariosSectionPayloadV1Schema>;
export type FundScenarioCalculationModeV1 = z.infer<typeof FundScenarioCalculationModeV1Schema>;
export type FundScenarioCalculationPayloadV1 = z.infer<
  typeof FundScenarioCalculationPayloadV1Schema
>;
export type FundScenarioCalculationResponseV1 = z.infer<
  typeof FundScenarioCalculationResponseV1Schema
>;
export type FundScenarioReserveCalculationQueuedV1 = z.infer<
  typeof FundScenarioReserveCalculationQueuedV1Schema
>;
export type FundScenarioCalculationStatusV1 = z.infer<typeof FundScenarioCalculationStatusV1Schema>;
