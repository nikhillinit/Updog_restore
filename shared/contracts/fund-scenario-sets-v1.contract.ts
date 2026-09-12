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
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS,
  CAPITAL_PLANNING_VERSION,
  CAPITAL_PREIMAGE_VERSION,
  CapitalCalculationReadinessV1Schema,
  CapitalHashV1Schema,
  CapitalInterpretationCompatibilityV1Schema,
  CapitalIssuesV1Schema,
  CapitalScenarioNameV1Schema,
  CapitalPlanningDraftV1Schema,
  CapitalBenchmarkSnapshotV1Schema,
  CapitalPathV1Schema,
  CapitalPlanningInputV1Schema,
  CapitalPlanningResultV1Schema,
  CapitalReadStateV1Schema,
  CapitalSourceBundleV1Schema,
  CapitalSourceProjectionV1Schema,
  CapitalSourceUnitV1Schema,
  CapitalUnitDeclarationsV1Schema,
  CapitalVersionV1Schema,
} from './capital-planning-v1.contract';
import { canonicalJson } from '../lib/scenarios/canonicalize';

const DateTimeStringSchema = z.string().datetime();

export const FundScenarioOverrideTypeV1Schema = z.enum([
  'fee_profile',
  'reserve_allocation',
  'allocation',
  'sector_profile',
  'methodology',
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

export const MethodologyOverridePayloadV1Schema = z
  .object({
    waterfallType: FundDraftWriteV1Schema.shape.waterfallType,
    waterfallTiers: FundDraftWriteV1Schema.shape.waterfallTiers,
    managementFeeRate: FundDraftWriteV1Schema.shape.managementFeeRate,
  })
  .strict()
  .refine(
    (p) =>
      p.waterfallType !== undefined ||
      p.waterfallTiers !== undefined ||
      p.managementFeeRate !== undefined,
    { message: 'Methodology override must specify at least one field' }
  );

export const FundScenarioMethodologyOverrideV1Schema = z
  .object({
    overrideType: z.literal('methodology'),
    payload: MethodologyOverridePayloadV1Schema,
  })
  .strict();

export const FundScenarioVariantOverrideV1Schema = z.discriminatedUnion('overrideType', [
  FundScenarioFeeProfileOverrideV1Schema,
  FundScenarioReserveAllocationOverrideV1Schema,
  FundScenarioAllocationOverrideV1Schema,
  FundScenarioSectorProfileOverrideV1Schema,
  FundScenarioMethodologyOverrideV1Schema,
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

const FundScenarioSourceConfigAllocationFieldsV1Schema = FundDraftWriteV1Schema.pick({
  allocations: true,
  capitalPlanAllocations: true,
})
  .required()
  .strict();

export const FundScenarioSourceConfigResponseV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-source-config/1.0.0'),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    publishedAt: DateTimeStringSchema,
    allocations: FundScenarioSourceConfigAllocationFieldsV1Schema.shape.allocations.nullable(),
    capitalPlanAllocations:
      FundScenarioSourceConfigAllocationFieldsV1Schema.shape.capitalPlanAllocations.nullable(),
  })
  .strict();

const CreateFundScenarioSetV2VariantsSchema = z.tuple([
  CreateFundScenarioVariantV1Schema,
  CreateFundScenarioVariantV1Schema,
  CreateFundScenarioVariantV1Schema,
]);

export const CreateFundScenarioSetV2Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-set-create/2.0.0'),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(4000).nullable().optional(),
    variants: CreateFundScenarioSetV2VariantsSchema,
    expectedSourceConfigId: z.number().int().positive(),
    expectedSourceConfigVersion: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) => value.variants.every((variant) => variant.override.overrideType === 'allocation'),
    {
      message: 'V2 scenario set requires allocation overrides for all variants',
      path: ['variants'],
    }
  );

export const CreateFundScenarioSetV1OrV2Schema = z.union([
  CreateFundScenarioSetV1Schema,
  CreateFundScenarioSetV2Schema,
]);

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

export const ScenarioSetMethodologyVariantResultSummaryV1Schema = z
  .object({
    variantId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('methodology'),
    economicsSummary: EconomicsSummaryV1Schema,
  })
  .strict();

export const ScenarioSetVariantResultSummaryV1Schema = z.discriminatedUnion('overrideType', [
  ScenarioSetFeeProfileVariantResultSummaryV1Schema,
  ScenarioSetAllocationVariantResultSummaryV1Schema,
  ScenarioSetSectorProfileVariantResultSummaryV1Schema,
  ScenarioSetReserveVariantResultSummaryV1Schema,
  ScenarioSetMethodologyVariantResultSummaryV1Schema,
]);

export const FundScenarioCalculationModeV1Schema = z.enum([
  'sync_fee_profile',
  'sync_allocation',
  'sync_sector_profile',
  'sync_methodology',
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
    case 'sync_methodology':
      return 'methodology';
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

export const FundScenarioMethodologyCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: z.string(),
    overrideType: z.literal('methodology'),
    economics: EconomicsResultV1Schema,
  })
  .strict();

export const FundScenarioCalculationVariantV1Schema = z.discriminatedUnion('overrideType', [
  FundScenarioFeeProfileCalculationVariantV1Schema,
  FundScenarioAllocationCalculationVariantV1Schema,
  FundScenarioSectorProfileCalculationVariantV1Schema,
  FundScenarioReserveCalculationVariantV1Schema,
  FundScenarioMethodologyCalculationVariantV1Schema,
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
    calculationStartedAt: DateTimeStringSchema.optional(),
    failureCode: z.literal('HARD_TIMEOUT').nullable().default(null),
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
export type FundScenarioSourceConfigResponseV1 = z.infer<
  typeof FundScenarioSourceConfigResponseV1Schema
>;
export type CreateFundScenarioSetV2 = z.infer<typeof CreateFundScenarioSetV2Schema>;
export type CreateFundScenarioSetV1OrV2 = z.infer<typeof CreateFundScenarioSetV1OrV2Schema>;
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
export type FundScenarioCalculationVariantV1 = z.infer<
  typeof FundScenarioCalculationVariantV1Schema
>;
export type MethodologyOverridePayloadV1 = z.infer<typeof MethodologyOverridePayloadV1Schema>;

// Capital contracts are separate wire representations. Do not add these schemas
// to the legacy create/read unions or the reserve calculation-status contract.
export const CAPITAL_PLAN_REPRESENTATION = 'capital-plan-v1' as const;
export const CapitalPlanRepresentationV1Schema = z.literal(CAPITAL_PLAN_REPRESENTATION);

// Fresh requests accept normalized historical inputs or explicit draft selection intent.
// Persisted inputs below remain fully normalized.
export const FundScenarioCapitalRequestInputV1Schema = z.union([
  CapitalPlanningInputV1Schema,
  CapitalPlanningDraftV1Schema,
]);
export const FundScenarioCapitalOverrideV1Schema = z
  .object({
    overrideType: z.literal('capital_plan'),
    payload: FundScenarioCapitalRequestInputV1Schema,
  })
  .strict();

export const CreateFundScenarioCapitalVariantV3Schema = z
  .object({
    variantId: z.string().uuid(),
    name: CapitalScenarioNameV1Schema,
    description: z.string().trim().max(4000).nullable().optional(),
    override: FundScenarioCapitalOverrideV1Schema,
  })
  .strict();

export const CreateFundScenarioSetV3Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-set-create/3.0.0'),
    name: CapitalScenarioNameV1Schema,
    description: z.string().trim().max(4000).nullable().optional(),
    variants: z.array(CreateFundScenarioCapitalVariantV3Schema).min(1).max(5),
    baselineVariantId: z.string().uuid(),
    expectedSourceConfigId: z.number().int().positive(),
    expectedSourceConfigVersion: z.number().int().positive(),
    expectedSourceBundleHash: CapitalHashV1Schema,
    expectedInterpretationVersion: CapitalVersionV1Schema,
    unitDeclarations: CapitalUnitDeclarationsV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.baselineVariantId !== value.variants[0]?.variantId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baselineVariantId'],
        message: 'The first named variant is the stable baseline',
      });
    if (new Set(value.variants.map((variant) => variant.variantId)).size !== value.variants.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Variant IDs must be unique',
      });
    const rows = value.variants.reduce((total, variant) => {
      const payload = variant.override.payload;
      const input = 'input' in payload ? payload.input : payload;
      return (
        total +
        input.allocations.reduce(
          (sum, allocation) =>
            sum +
            allocation.deploymentPeriodYears *
              12 *
              (1 + allocation.followOnRounds.length) *
              (allocation.plannedCompanyCount === undefined ? 1 : 2),
          0
        )
      );
    }, 0);
    if (rows > CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxExpandedRows)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'INPUT_TOO_LARGE: provisional monthly row ceiling exceeded',
      });
  });

export const FundScenarioCapitalStoredOverrideV1Schema = z
  .object({
    overrideType: z.literal('capital_plan'),
    payload: z
      .object({
        input: CapitalPlanningInputV1Schema,
        sourceBundle: CapitalSourceBundleV1Schema,
        sourceBundleHash: CapitalHashV1Schema,
        benchmarkSnapshots: z
          .array(CapitalBenchmarkSnapshotV1Schema)
          .max(
            CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxAllocations *
              (CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxFollowOnRounds + 1)
          )
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.payload.sourceBundleHash !== value.payload.sourceBundle.sourceBundleHash)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'sourceBundleHash'],
        message: 'SOURCE_BUNDLE_INCONSISTENT',
      });
  });

export const FundScenarioCapitalSourceResponseV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-source/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    projection: CapitalSourceProjectionV1Schema,
    sourceBundleHash: CapitalHashV1Schema,
    publishedAt: DateTimeStringSchema,
    interpretationVersion: CapitalVersionV1Schema,
    remainingDeclarations: z
      .array(
        z
          .object({
            path: CapitalPathV1Schema,
            allowedUnits: z.array(CapitalSourceUnitV1Schema).min(1).max(2),
          })
          .strict()
      )
      .max(CAPITAL_PLANNING_PROVISIONAL_LIMITS.maxDeclarations),
    materialized: CapitalSourceBundleV1Schema.nullable(),
    calculationReadiness: CapitalCalculationReadinessV1Schema,
    interpretationCompatibility: CapitalInterpretationCompatibilityV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.calculationReadiness.context !== 'current_preview')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['calculationReadiness', 'context'],
        message: 'Source readiness describes current_preview',
      });
    if (
      value.calculationReadiness.state === 'READY' &&
      (value.materialized === null || value.remainingDeclarations.length !== 0)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialized'],
        message: 'Ready preview requires complete materialization and declarations',
      });
    if (
      value.materialized &&
      (value.materialized.sourceBundleHash !== value.sourceBundleHash ||
        canonicalJson(value.materialized.projection) !== canonicalJson(value.projection) ||
        value.materialized.interpretationVersion !== value.interpretationVersion)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialized'],
        message: 'Preview materialization identity mismatch',
      });
  });

export const FundScenarioCapitalSetSummaryV1Schema = FundScenarioSetSummaryV1Schema.extend({
  overrideType: z.literal('capital_plan'),
  name: CapitalScenarioNameV1Schema,
  variantCount: z.number().int().min(1).max(5),
  baselineVariantId: z.string().uuid(),
  sourceBundleHash: CapitalHashV1Schema,
  interpretationVersion: CapitalVersionV1Schema,
  readState: CapitalReadStateV1Schema,
}).strict();

// Archive returns the same strict capital summary shape, with archival complete.
export const FundScenarioCapitalArchiveResponseV1Schema =
  FundScenarioCapitalSetSummaryV1Schema.extend({ archivedAt: DateTimeStringSchema }).strict();

export const FundScenarioCapitalListResponseV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-list/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    scenarioSets: z.array(FundScenarioCapitalSetSummaryV1Schema),
  })
  .strict();

export const FundScenarioCapitalVariantV1Schema = z
  .object({
    id: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: CapitalScenarioNameV1Schema,
    description: z.string().max(4000).nullable(),
    sortOrder: z.number().int().min(0).max(4),
    override: FundScenarioCapitalStoredOverrideV1Schema,
    createdAt: DateTimeStringSchema,
    updatedAt: DateTimeStringSchema,
  })
  .strict();

export const FundScenarioCapitalDetailResponseV1Schema =
  FundScenarioCapitalSetSummaryV1Schema.extend({
    contractVersion: z.literal('fund-scenario-capital-detail/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    variants: z.array(FundScenarioCapitalVariantV1Schema).min(1).max(5),
  })
    .strict()
    .superRefine((value, ctx) => {
      if (
        value.variants.length !== value.variantCount ||
        value.variants[0]?.id !== value.baselineVariantId
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants'],
          message: 'Variant count/baseline mismatch',
        });
      const firstBundle = value.variants[0]?.override.payload.sourceBundle;
      let firstBundleJson: string | undefined;
      for (const [index, variant] of value.variants.entries()) {
        const bundle = variant.override.payload.sourceBundle;
        if (
          variant.scenarioSetId !== value.id ||
          variant.sortOrder !== index ||
          bundle.sourceBundleHash !== value.sourceBundleHash ||
          bundle.interpretationVersion !== value.interpretationVersion ||
          bundle.projection.fundId !== value.fundId ||
          bundle.projection.sourceConfigId !== value.sourceConfigId ||
          bundle.projection.sourceConfigVersion !== value.sourceConfigVersion ||
          canonicalJson(bundle) !== (firstBundleJson ??= canonicalJson(firstBundle))
        )
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['variants', index],
            message: 'Capital variant source/set/order mismatch',
          });
      }
      if (new Set(value.variants.map((variant) => variant.id)).size !== value.variants.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants'],
          message: 'Variant IDs must be unique',
        });
    });

export const CapitalScenarioLineageV1Schema = z.discriminatedUnion('hashKind', [
  z
    .object({
      hashKind: z.literal('scenario-input-hash-v1'),
      modelInputsAsOfDate: z.null(),
      comparisonLineageVersion: z.null(),
    })
    .strict(),
  z
    .object({
      hashKind: z.literal('scenario-input-hash-v2'),
      modelInputsAsOfDate: z.string().date(),
      comparisonLineageVersion: z.literal('comparison-lineage-v1'),
    })
    .strict(),
]);

export const FundScenarioCapitalCalculationVariantV1Schema = z
  .object({
    variantId: z.string().uuid(),
    scenarioSetId: z.string().uuid(),
    name: CapitalScenarioNameV1Schema,
    overrideType: z.literal('capital_plan'),
    result: CapitalPlanningResultV1Schema,
  })
  .strict();

export const FundScenarioCapitalCalculationPayloadV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-calculation/1.0.0'),
    calculationDomain: z.literal('capital_plan'),
    calculationMode: z.literal('sync_capital_plan'),
    capitalPreimageVersion: z.literal(CAPITAL_PREIMAGE_VERSION),
    methodVersion: z.literal(CAPITAL_PLANNING_VERSION),
    interpretationVersion: CapitalVersionV1Schema,
    calculationVersion: z.string().min(1).max(20),
    inputHash: CapitalHashV1Schema,
    lineage: CapitalScenarioLineageV1Schema,
    fundId: z.number().int().positive(),
    scenarioSetId: z.string().uuid(),
    baselineVariantId: z.string().uuid(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    sourceBundleHash: CapitalHashV1Schema,
    calculatedAt: DateTimeStringSchema,
    variants: z.array(FundScenarioCapitalCalculationVariantV1Schema).min(1).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.variants[0]?.variantId !== value.baselineVariantId ||
      new Set(value.variants.map((variant) => variant.variantId)).size !== value.variants.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants'],
        message: 'Stable baseline/variant identities required',
      });
    const firstBundle = value.variants[0]?.result.sourceBundle;
    let firstBundleJson: string | undefined;
    for (const [index, variant] of value.variants.entries()) {
      const bundle = variant.result.sourceBundle;
      if (
        variant.scenarioSetId !== value.scenarioSetId ||
        bundle.sourceBundleHash !== value.sourceBundleHash ||
        bundle.projection.fundId !== value.fundId ||
        bundle.projection.sourceConfigId !== value.sourceConfigId ||
        bundle.projection.sourceConfigVersion !== value.sourceConfigVersion ||
        bundle.interpretationVersion !== value.interpretationVersion ||
        bundle.modelInputsAsOfDate !== value.lineage.modelInputsAsOfDate ||
        canonicalJson(bundle) !== (firstBundleJson ??= canonicalJson(firstBundle))
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', index],
          message: 'Saved capital identity/lineage/bundle mismatch',
        });
    }
  });

export const FundScenarioCapitalCreateResponseV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-create/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    scenarioSetId: z.string().uuid(),
  })
  .strict();

export const FundScenarioCapitalCalculateResponseV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-calculate/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    snapshotId: z.number().int().positive(),
    correlationId: z.string().uuid(),
    source: z.literal('fund_snapshots'),
    payload: FundScenarioCapitalCalculationPayloadV1Schema,
  })
  .strict();

export const FundScenarioCapitalResultsResponseV1Schema = z
  .object({
    contractVersion: z.literal('fund-scenario-capital-results/1.0.0'),
    representation: CapitalPlanRepresentationV1Schema,
    scenarioSetId: z.string().uuid(),
    savedResult: z
      .object({
        snapshotId: z.number().int().positive(),
        correlationId: z.string().uuid(),
        source: z.literal('fund_snapshots'),
        payload: FundScenarioCapitalCalculationPayloadV1Schema,
      })
      .strict()
      .nullable(),
    unavailableReason: z.literal('NO_CALCULATED_RESULT').nullable(),
    readState: CapitalReadStateV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.savedResult === null) !== (value.unavailableReason !== null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unavailableReason'],
        message: 'Only absent results carry an unavailable reason',
      });
    if (value.savedResult && value.savedResult.payload.scenarioSetId !== value.scenarioSetId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['savedResult'],
        message: 'Saved result must belong to requested scenario set',
      });
  });

export const CapitalScenarioRefusalV1Schema = z
  .object({
    error: z.string().min(1).max(120),
    message: z.string().min(1).max(2000),
    issues: CapitalIssuesV1Schema.nonempty(),
  })
  .strict();

export type CreateFundScenarioSetV3 = z.infer<typeof CreateFundScenarioSetV3Schema>;
export type CreateFundScenarioCapitalVariantV3 = z.infer<
  typeof CreateFundScenarioCapitalVariantV3Schema
>;
export type FundScenarioCapitalStoredOverrideV1 = z.infer<
  typeof FundScenarioCapitalStoredOverrideV1Schema
>;
export type FundScenarioCapitalSourceResponseV1 = z.infer<
  typeof FundScenarioCapitalSourceResponseV1Schema
>;
export type FundScenarioCapitalSetSummaryV1 = z.infer<typeof FundScenarioCapitalSetSummaryV1Schema>;
export type FundScenarioCapitalListResponseV1 = z.infer<
  typeof FundScenarioCapitalListResponseV1Schema
>;
export type FundScenarioCapitalDetailResponseV1 = z.infer<
  typeof FundScenarioCapitalDetailResponseV1Schema
>;
export type FundScenarioCapitalCalculationPayloadV1 = z.infer<
  typeof FundScenarioCapitalCalculationPayloadV1Schema
>;
export type FundScenarioCapitalCreateResponseV1 = z.infer<
  typeof FundScenarioCapitalCreateResponseV1Schema
>;
export type FundScenarioCapitalCalculateResponseV1 = z.infer<
  typeof FundScenarioCapitalCalculateResponseV1Schema
>;
export type FundScenarioCapitalResultsResponseV1 = z.infer<
  typeof FundScenarioCapitalResultsResponseV1Schema
>;

export type FundScenarioCapitalRequestInputV1 = z.infer<
  typeof FundScenarioCapitalRequestInputV1Schema
>;
export type FundScenarioCapitalArchiveResponseV1 = z.infer<
  typeof FundScenarioCapitalArchiveResponseV1Schema
>;
