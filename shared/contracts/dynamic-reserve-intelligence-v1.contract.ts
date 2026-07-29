import { z } from 'zod';

import { H9ActionabilityStatusSchema } from './h9-actionability.contract';
import { PersistedFinancialFactsSnapshotV1Schema } from './financial-facts-snapshot-v1.contract';
import { DecimalStringSchema } from './lp-reporting/cash-flow-event.contract';
import { CanonicalStageSchema } from '../schemas/stage';

export const DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION =
  'dynamic-reserve-intelligence-v1' as const;
export const DYNAMIC_RESERVE_INTELLIGENCE_CALC_VERSION = 'reserve-intel-v1' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const CentsSchema = z.number().int().safe();
const NonnegativeCentsSchema = CentsSchema.nonnegative();
const JsonNumericSchema = z.union([z.string().min(1), z.number().finite()]);

export const DynamicReserveOverlayEntryV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    plannedReserveCents: NonnegativeCentsSchema,
  })
  .strict();

export const DynamicReserveIntelligenceRunRequestV1Schema = z
  .object({
    financialFactsSnapshotId: z.number().int().positive(),
    overlay: z.array(DynamicReserveOverlayEntryV1Schema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    for (const [index, entry] of (value.overlay ?? []).entries()) {
      if (seen.has(entry.companyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['overlay', index, 'companyId'],
          message: 'Overlay companyId values must be unique',
        });
      }
      seen.add(entry.companyId);
    }
  });

export const PinnedMarginalReserveCompanySourceV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    stage: z.string().nullable(),
    currentStage: z.string().nullable(),
    sector: z.string(),
    currentOwnership: JsonNumericSchema.nullable(),
    plannedReservesCents: z
      .string()
      .regex(/^-?\d+$/)
      .nullable(),
    allocationVersion: z.number().int(),
  })
  .strict();

export const PinnedMarginalReserveApprovedAllocationSourceV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    decisionType: z.string(),
    decisionStatus: z.string(),
    finalPlannedReservesCents: z
      .string()
      .regex(/^-?\d+$/)
      .nullable(),
    liveAllocationVersion: z.number().int().nullable(),
    decidedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const PinnedMarginalReservePublishedAssumptionsV1Schema = z
  .object({
    configId: z.number().int().positive(),
    version: z.number().int(),
    publishedAt: z.string().datetime().nullable(),
    config: z.unknown(),
  })
  .strict();

export const PinnedMarginalReserveNonFactsSourcesV1Schema = z
  .object({
    sourceSnapshotDate: z.string().date(),
    baseCurrency: z.string(),
    companies: z.array(PinnedMarginalReserveCompanySourceV1Schema),
    approvedAllocations: z.array(PinnedMarginalReserveApprovedAllocationSourceV1Schema),
    publishedAssumptions: PinnedMarginalReservePublishedAssumptionsV1Schema.nullable(),
  })
  .strict();

export const PinnedReserveEnvelopeSourcesV1Schema = z
  .object({
    fund: z
      .object({
        sizeDollars: JsonNumericSchema,
        deployedCapitalDollars: JsonNumericSchema.nullable(),
        managementFeeRate: JsonNumericSchema,
        baseCurrency: z.string(),
      })
      .strict(),
    investments: z.array(
      z
        .object({
          amountDollars: JsonNumericSchema,
        })
        .strict()
    ),
    config: z
      .object({
        fundLifeYears: z.number().positive().nullable(),
        expenses: z
          .array(
            z
              .object({
                monthlyAmountDollars: z.number().finite(),
                startMonth: z.number().int(),
                endMonth: z.number().int().nullable(),
              })
              .strict()
          )
          .nullable(),
        recyclingEnabled: z.boolean().nullable(),
        recyclingCapDollars: z.number().finite().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const DynamicReserveIntelligenceCompanyResultV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    name: z.string().min(1),
    canonicalStage: CanonicalStageSchema,
    status: z.enum(['actionable', 'indicative', 'unavailable']),
    rank: z.number().int().positive().nullable(),
    marginalMoic: DecimalStringSchema.nullable(),
    systemAllocatedCents: NonnegativeCentsSchema,
    overlayPlannedCents: NonnegativeCentsSchema.nullable(),
    deltaCents: CentsSchema.nullable(),
    concentration: DecimalStringSchema.nullable(),
  })
  .strict();

export const DynamicReserveIntelligenceFundResultV1Schema = z
  .object({
    totalSystemAllocatedCents: NonnegativeCentsSchema,
    totalOverlayPlannedCents: NonnegativeCentsSchema.nullable(),
    totalDeltaCents: CentsSchema.nullable(),
    followOnCapacityCents: CentsSchema,
    failSafe: z.boolean(),
    failSafeReason: z
      .enum(['envelope_blocked', 'envelope_untrusted', 'no_actionable_candidates', 'engine_error'])
      .nullable(),
    excluded: z.array(
      z
        .object({
          companyId: z.number().int().positive(),
          reason: z.enum(['unavailable', 'indicative']),
        })
        .strict()
    ),
    disclosedDefaults: z.array(z.string()),
    neutralPolicies: z.array(
      z
        .object({
          stage: z.enum(['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus']),
          reserveMultiple: z.literal(1),
          weight: z.literal(1),
        })
        .strict()
    ),
  })
  .strict();

export const DynamicReserveIntelligenceConstraintFindingV1Schema = z
  .object({
    code: z.literal('overlay_unknown_company'),
    companyId: z.number().int().positive(),
  })
  .strict();

export const DynamicReserveIntelligenceProvenanceV1Schema = z
  .object({
    financialFactsSnapshotId: z.number().int().positive(),
    factsInputHash: Sha256Schema,
    assumptionsHash: Sha256Schema,
    envelopeInputHash: Sha256Schema,
    effectiveMode: z.enum(['shadow', 'on']),
    h9Actionability: H9ActionabilityStatusSchema,
    overlayProvenance: z
      .object({
        suppliedBy: z.number().int().positive().nullable(),
        suppliedAt: z.string().datetime(),
      })
      .strict(),
    overlay: z.array(DynamicReserveOverlayEntryV1Schema).nullable(),
    idempotencyKey: z.string().min(1),
    requestHash: Sha256Schema,
    calcVersion: z.literal(DYNAMIC_RESERVE_INTELLIGENCE_CALC_VERSION),
    asOfDate: z.string().date(),
    factsSnapshot: PersistedFinancialFactsSnapshotV1Schema,
    marginalNonFactsSources: PinnedMarginalReserveNonFactsSourcesV1Schema,
    envelopeSources: PinnedReserveEnvelopeSourcesV1Schema,
  })
  .strict();

export const DynamicReserveIntelligencePayloadV1Schema = z
  .object({
    contractVersion: z.literal(DYNAMIC_RESERVE_INTELLIGENCE_CONTRACT_VERSION),
    fundId: z.number().int().positive(),
    actionability: z.enum(['actionable', 'non_actionable']),
    companies: z.array(DynamicReserveIntelligenceCompanyResultV1Schema),
    fund: DynamicReserveIntelligenceFundResultV1Schema,
    constraintFindings: z.array(DynamicReserveIntelligenceConstraintFindingV1Schema),
    provenance: DynamicReserveIntelligenceProvenanceV1Schema,
  })
  .strict();

export const DynamicReserveIntelligenceRunV1Schema = z
  .object({
    snapshotId: z.number().int().positive(),
    createdAt: z.string().datetime(),
    result: DynamicReserveIntelligencePayloadV1Schema,
  })
  .strict();

export const DynamicReserveIntelligenceCommandResponseV1Schema =
  DynamicReserveIntelligenceRunV1Schema.extend({
    replayed: z.boolean(),
  }).strict();

export type DynamicReserveOverlayEntryV1 = z.infer<typeof DynamicReserveOverlayEntryV1Schema>;
export type PinnedMarginalReserveNonFactsSourcesV1 = z.infer<
  typeof PinnedMarginalReserveNonFactsSourcesV1Schema
>;
export type PinnedReserveEnvelopeSourcesV1 = z.infer<typeof PinnedReserveEnvelopeSourcesV1Schema>;
export type DynamicReserveIntelligencePayloadV1 = z.infer<
  typeof DynamicReserveIntelligencePayloadV1Schema
>;
export type DynamicReserveIntelligenceRunV1 = z.infer<typeof DynamicReserveIntelligenceRunV1Schema>;
export type DynamicReserveIntelligenceCommandResponseV1 = z.infer<
  typeof DynamicReserveIntelligenceCommandResponseV1Schema
>;
