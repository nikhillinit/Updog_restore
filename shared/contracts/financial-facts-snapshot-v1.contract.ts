/**
 * Canonical financial-facts snapshot contract.
 *
 * D21 snapshot resolution: GET surfaces serve the latest persisted accepted
 * snapshot and its knowledgeCutoff. Reads never create snapshots. Creation is
 * limited to explicit POST commands and deterministic post-commit triggers.
 */
import { z } from 'zod';

import { FundCompanyActualsFactsResponseSchema } from './fund-actuals/fund-company-actuals-fact.contract';
import {
  ConsumerEvaluationSchema,
  ConsumerEvaluationV2Schema,
  ConsumerEvaluationV3Schema,
} from './financial-facts-consumer-policies';
import { FinancialProvenanceSchema } from './financial-provenance.contract';
import { FundAccountingStateSnapshotRefV1Schema } from './internal-economics/fund-accounting-state-observation-v1.contract';
import { FundAccountingStateSnapshotRefV1_1Schema } from './internal-economics/fund-accounting-state-observation-v1.1.contract';
import { ProvenanceEnvelopeSchema } from './provenance-envelope.contract';
import { canonicalSha256 } from '../lib/canonical-hash';
import { MoneyDecimalStringSchema, RatioDecimalStringSchema } from '../lib/decimal-string';

export const FINANCIAL_FACTS_POLICY_VERSION_1_0_0 = 'financial-facts-policy/1.0.0' as const;
export const FINANCIAL_FACTS_POLICY_VERSION_1_0_1 = 'financial-facts-policy/1.0.1' as const;
export const FINANCIAL_FACTS_POLICY_VERSION_1_1_0 = 'financial-facts-policy/1.1.0' as const;
export const FINANCIAL_FACTS_POLICY_VERSION_1_2_0 = 'financial-facts-policy/1.2.0' as const;
export const FINANCIAL_FACTS_POLICY_VERSION_1_3_0 = 'financial-facts-policy/1.3.0' as const;
export const FINANCIAL_FACTS_POLICY_VERSION_1_4_0 = 'financial-facts-policy/1.4.0' as const;
export const FINANCIAL_FACTS_POLICY_VERSION = FINANCIAL_FACTS_POLICY_VERSION_1_3_0;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1 = 'financial-facts-payload/1' as const;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2 = 'financial-facts-payload/2' as const;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3 = 'financial-facts-payload/3' as const;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4 = 'financial-facts-payload/4' as const;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5 = 'financial-facts-payload/5' as const;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID = FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4;

const SelectionIdSchema = z.union([z.number().int().positive(), z.string().min(1)]);

export const FinancialFactsSelectionSetHashPreimageSchema = z
  .object({
    sourceObservationIds: z.array(SelectionIdSchema),
    workingValueSelectionIds: z.array(SelectionIdSchema),
  })
  .strict();

export type FinancialFactsSelectionSetHashPreimage = z.infer<
  typeof FinancialFactsSelectionSetHashPreimageSchema
>;

function sortSelectionIds(ids: FinancialFactsSelectionSetHashPreimage['sourceObservationIds']) {
  return [...ids].sort((left, right) => String(left).localeCompare(String(right)));
}

export function buildSelectionSetHash(input: FinancialFactsSelectionSetHashPreimage): string {
  const parsed = FinancialFactsSelectionSetHashPreimageSchema.parse(input);
  return canonicalSha256({
    sourceObservationIds: sortSelectionIds(parsed.sourceObservationIds),
    workingValueSelectionIds: sortSelectionIds(parsed.workingValueSelectionIds),
  });
}

export const EMPTY_SELECTION_SET_HASH = buildSelectionSetHash({
  sourceObservationIds: [],
  workingValueSelectionIds: [],
});

const VolatileStrippedFinancialProvenanceSchema = FinancialProvenanceSchema.innerType().omit({
  generatedAt: true,
});
const VolatileStrippedProvenanceEnvelopeSchema = z
  .object({
    ...ProvenanceEnvelopeSchema.innerType().shape,
    core: VolatileStrippedFinancialProvenanceSchema,
  })
  .strict();
const VolatileStrippedActualsFactSchema = z
  .object({
    ...FundCompanyActualsFactsResponseSchema.shape.facts.element.shape,
    provenance: VolatileStrippedProvenanceEnvelopeSchema,
  })
  .strict();
export const VolatileStrippedFundCompanyActualsFactsResponseSchema = z
  .object({
    fundId: FundCompanyActualsFactsResponseSchema.shape.fundId,
    asOfDate: FundCompanyActualsFactsResponseSchema.shape.asOfDate,
    facts: z.array(VolatileStrippedActualsFactSchema),
    inputHash: FundCompanyActualsFactsResponseSchema.shape.inputHash,
  })
  .strict();

export const FinancialFactsWarningSchema = z
  .object({
    code: z.enum([
      'NON_USD_CASH_FLOW_EXCLUDED',
      'VALUATION_MARK_STALE',
      'PERIOD_NAV_IS_POSITION_VALUE',
    ]),
    severity: z.enum(['warning', 'blocking']),
    message: z.string().min(1),
    source: z.string().min(1).optional(),
  })
  .strict();

export const FinancialFactsCashFlowSeriesSchema = z
  .object({
    series: z.array(
      z
        .object({
          eventType: z.enum([
            'lp_capital_call',
            'lp_distribution',
            'fund_expense',
            'portfolio_investment',
            'realized_proceeds',
            'recallable_distribution',
          ]),
          vehicleId: z.number().int().positive().nullable(),
          perspective: z.enum(['lp_net', 'fund_gross', 'vehicle', 'company']),
          points: z.array(
            z
              .object({
                eventId: z.number().int().positive(),
                effectiveAt: z.string().datetime(),
                amount: MoneyDecimalStringSchema,
              })
              .strict()
          ),
        })
        .strict()
    ),
    totals: z
      .object({
        contributions: MoneyDecimalStringSchema,
        distributions: MoneyDecimalStringSchema,
        recallableDistributions: MoneyDecimalStringSchema,
      })
      .strict(),
    warnings: z.array(FinancialFactsWarningSchema),
  })
  .strict();

export const FinancialFactsMarksSeriesSchema = z
  .object({
    marks: z.array(
      z
        .object({
          markId: z.number().int().positive(),
          companyId: z.number().int().positive(),
          vehicleId: z.number().int().positive().nullable(),
          effectiveAt: z.string().date(),
          fairValue: MoneyDecimalStringSchema,
          currency: z.literal('USD'),
        })
        .strict()
    ),
    periodNav: z.array(
      z
        .object({
          periodEnd: z.string().date(),
          nav: MoneyDecimalStringSchema,
          warnings: z.array(FinancialFactsWarningSchema),
        })
        .strict()
    ),
    warnings: z.array(FinancialFactsWarningSchema),
  })
  .strict();

export const FinancialFactsVehicleRosterEntrySchema = z
  .object({
    vehicleId: z.number().int().positive(),
    vehicleType: z.enum(['main_fund', 'spv', 'co_invest']),
    vehicleSlug: z.string().min(1),
    name: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

export const FinancialFactsPayloadV1_0_0Schema = z
  .object({
    companyActuals: VolatileStrippedFundCompanyActualsFactsResponseSchema,
    sourceObservationIds: z.array(SelectionIdSchema).length(0),
    workingValueSelectionIds: z.array(SelectionIdSchema).length(0),
    participationTermRefs: z.array(z.string().min(1)).length(0),
    cashFlowSeries: FinancialFactsCashFlowSeriesSchema,
    marksSeries: FinancialFactsMarksSeriesSchema,
    vehicleRoster: z.array(FinancialFactsVehicleRosterEntrySchema),
  })
  .strict();

export const FinancialFactsPayloadV1Schema = z
  .object({
    companyActuals: VolatileStrippedFundCompanyActualsFactsResponseSchema,
    sourceObservationIds: z.array(SelectionIdSchema),
    workingValueSelectionIds: z.array(SelectionIdSchema),
    participationTermRefs: z.array(z.string().min(1)).length(0),
    cashFlowSeries: FinancialFactsCashFlowSeriesSchema,
    marksSeries: FinancialFactsMarksSeriesSchema,
    vehicleRoster: z.array(FinancialFactsVehicleRosterEntrySchema),
  })
  .strict();

const PositionRefSchema = z
  .object({
    positionEventId: z.number().int().positive(),
    eventType: z.string().min(1),
    vehicleId: z.number().int().positive(),
    companyIdentityId: z.number().int().positive(),
    vehicleParticipationId: z.number().int().positive().nullable(),
    resultingParticipationId: z.number().int().positive().nullable(),
    sourceObservationId: z.number().int().positive().nullable(),
    effectiveDate: z.string().date(),
    recordedAt: z.string().datetime(),
  })
  .strict();

const PositionComponentRefSchema = z
  .object({
    vehicleId: z.number().int().positive(),
    companyIdentityId: z.number().int().positive(),
    kind: z.enum(['priced', 'contingent', 'conversion_source', 'conversion_result']),
    participationId: z.number().int().positive().nullable(),
    participationVersion: z.number().int().positive().nullable(),
    financingTrancheId: z.number().int().positive().nullable(),
    trancheVersion: z.number().int().positive().nullable(),
  })
  .strict();

const OwnershipRefSchema = z
  .object({
    ownershipSnapshotId: z.number().int().positive(),
    vehicleId: z.number().int().positive(),
    companyIdentityId: z.number().int().positive(),
    sourceObservationId: z.number().int().positive(),
    effectiveDate: z.string().date(),
    recordedAt: z.string().datetime(),
  })
  .strict();

const ValuationRefSchema = z
  .object({
    basis: z.enum(['direct', 'derived', 'unavailable']),
    vehicleId: z.number().int().positive(),
    companyIdentityId: z.number().int().positive(),
    directMarkId: z.number().int().positive().nullable(),
    directSourceObservationId: z.number().int().positive().nullable(),
    ownershipSnapshotId: z.number().int().positive().nullable(),
    derivedTrancheId: z.number().int().positive().nullable(),
    derivedTrancheVersion: z.number().int().positive().nullable(),
    derivedParticipationId: z.number().int().positive().nullable(),
    derivedParticipationVersion: z.number().int().positive().nullable(),
  })
  .strict();

const ParticipationTermRefSchema = z
  .object({
    participationId: z.number().int().positive(),
    participationVersion: z.number().int().positive(),
    financingTrancheId: z.number().int().positive(),
    trancheVersion: z.number().int().positive(),
  })
  .strict();

const ObservationRefSchema = z
  .object({
    observationId: z.number().int().positive(),
    domain: z.string().min(1),
    status: z.literal('accepted'),
    effectiveDate: z.string().date(),
  })
  .strict();

export const FinancialFactsPayloadV2Schema = FinancialFactsPayloadV1Schema.omit({
  participationTermRefs: true,
})
  .extend({
    positionRefs: z.array(PositionRefSchema),
    positionComponentRefs: z.array(PositionComponentRefSchema),
    ownershipRefs: z.array(OwnershipRefSchema),
    valuationRefs: z.array(ValuationRefSchema),
    participationTermRefs: z.array(ParticipationTermRefSchema),
    observationRefs: z.array(ObservationRefSchema),
  })
  .strict();

export const FinancialFactsPayloadV3Schema = FinancialFactsPayloadV2Schema.extend({
  openingAccountingState: FundAccountingStateSnapshotRefV1Schema.nullable(),
}).strict();

const EMBEDDED_OPENING_STATE_DERIVED_FIELD = 'lpUnreturnedContributedCapitalUsd' as const;

type FundAccountingStateSnapshotRefV1_1Resolved = z.infer<
  typeof FundAccountingStateSnapshotRefV1_1Schema
>;

/**
 * V4-only idempotent embedded-ref adapter (WP-L3 section 7, R10 amendment).
 *
 * The frozen v1.1 observation contract is intentionally asymmetric: its strict
 * raw input omits `lpUnreturnedContributedCapitalUsd` and its transform derives
 * that field into the output, so parsing a resolved output a second time is
 * rejected by the frozen schema. This adapter is the resolved/persisted
 * embedding boundary ONLY (payload, hash preimage, persisted envelope, and
 * readback validation). It delegates all authoritative validation and
 * derivation to the frozen `FundAccountingStateSnapshotRefV1_1Schema`:
 *
 * - Raw-shape input (no derived field): parsed once via the frozen schema.
 * - Already-resolved input (derived field present): the derived field alone is
 *   stripped to reconstruct the frozen input shape, the frozen schema reparses
 *   it, and the supplied value must equal the frozen recomputation
 *   byte-for-byte. A mismatch is rejected, never silently healed.
 *
 * Therefore `adapter.parse(adapter.parse(rawRef))` is byte-stable. The producer
 * must keep applying the frozen observation schema DIRECTLY to source-artifact
 * bytes; this adapter never parses source-artifact JSON, so a human-supplied
 * derived field remains invalid at the artifact boundary.
 */
export const EmbeddedFundAccountingStateSnapshotRefV1_1Schema = z
  .unknown()
  .transform((value, ctx): FundAccountingStateSnapshotRefV1_1Resolved => {
    const observation =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as { observation?: unknown }).observation
        : undefined;
    const suppliedDerived =
      typeof observation === 'object' &&
      observation !== null &&
      !Array.isArray(observation) &&
      EMBEDDED_OPENING_STATE_DERIVED_FIELD in observation
        ? {
            present: true as const,
            value: (observation as Record<string, unknown>)[EMBEDDED_OPENING_STATE_DERIVED_FIELD],
          }
        : { present: false as const };

    const candidate = suppliedDerived.present
      ? {
          ...(value as Record<string, unknown>),
          observation: Object.fromEntries(
            Object.entries(observation as Record<string, unknown>).filter(
              ([key]) => key !== EMBEDDED_OPENING_STATE_DERIVED_FIELD
            )
          ),
        }
      : value;

    const reparsed = FundAccountingStateSnapshotRefV1_1Schema.safeParse(candidate);
    if (!reparsed.success) {
      for (const issue of reparsed.error.issues) {
        ctx.addIssue(issue);
      }
      return z.NEVER;
    }

    if (
      suppliedDerived.present &&
      suppliedDerived.value !== reparsed.data.observation[EMBEDDED_OPENING_STATE_DERIVED_FIELD]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['observation', EMBEDDED_OPENING_STATE_DERIVED_FIELD],
        message:
          'Supplied lpUnreturnedContributedCapitalUsd must equal the frozen v1.1 recomputation byte-for-byte.',
      });
      return z.NEVER;
    }

    return reparsed.data;
  });

export const FinancialFactsPayloadV4Schema = FinancialFactsPayloadV3Schema.extend({
  openingAccountingState: EmbeddedFundAccountingStateSnapshotRefV1_1Schema.nullable(),
}).strict();

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ActualsAvailabilityReasonV1Schema = z.enum([
  'SOURCE_NOT_SUPPLIED',
  'COVERAGE_PARTIAL',
  'SCOPE_UNPROVEN',
  'COMMITTED_CAPITAL_UNAVAILABLE',
  'CALL_NOTICE_NOT_IMPORTED',
  'DEPLOYMENT_CATEGORY_PARTIAL',
  'VALUATION_NOT_SUPPLIED',
  'VALUATION_COVERAGE_PARTIAL',
  'RECALL_LIFECYCLE_UNAVAILABLE',
  'NAV_UNAVAILABLE',
  'PAID_IN_ZERO',
  'SETTLED_PAID_IN_UNAVAILABLE',
]);

const GovernedValueSchema = z
  .object({
    availability: z.enum(['available', 'unavailable']),
    reasonCodes: z.array(ActualsAvailabilityReasonV1Schema),
    sourceRefs: z.array(z.string().min(1)),
  })
  .strict();

function refineGovernedValue(
  value: {
    value: string | null;
    availability: 'available' | 'unavailable';
    reasonCodes: string[];
    sourceRefs: string[];
  },
  ctx: z.RefinementCtx
) {
  if (value.availability === 'available') {
    if (value.value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Available value is required.',
      });
    }
    if (value.reasonCodes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCodes'],
        message: 'Available value cannot carry reason codes.',
      });
    }
    if (value.sourceRefs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceRefs'],
        message: 'Available value requires a source reference.',
      });
    }
  } else {
    if (value.value !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Unavailable value must be null.',
      });
    }
    if (value.reasonCodes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCodes'],
        message: 'Unavailable value requires a reason code.',
      });
    }
  }
}

export const GovernedMoneyV1Schema = GovernedValueSchema.extend({
  value: MoneyDecimalStringSchema.nullable(),
})
  .strict()
  .superRefine(refineGovernedValue);

export const GovernedRatioV1Schema = GovernedValueSchema.extend({
  value: RatioDecimalStringSchema.nullable(),
})
  .strict()
  .superRefine(refineGovernedValue);

export const FinancialCapitalActualsV1Schema = z
  .object({
    ledgerCoverage: z.enum(['complete', 'partial']),
    committedCapital: GovernedMoneyV1Schema,
    calledCapitalIssued: GovernedMoneyV1Schema,
    paidInCapital: GovernedMoneyV1Schema,
    deployedCapital: GovernedMoneyV1Schema,
    initialDeployedCapital: GovernedMoneyV1Schema,
    followOnDeployedCapital: GovernedMoneyV1Schema,
    secondaryDeployedCapital: GovernedMoneyV1Schema,
    otherDeployedCapital: GovernedMoneyV1Schema,
    managementFeesPaid: GovernedMoneyV1Schema,
    otherExpensesPaid: GovernedMoneyV1Schema,
    realizedFundProceeds: GovernedMoneyV1Schema,
    distributionsToPartners: GovernedMoneyV1Schema,
    recallableDistributions: GovernedMoneyV1Schema,
    netCalledCapital: GovernedMoneyV1Schema,
    uncalledCapital: GovernedMoneyV1Schema,
    availableRecallCapacity: GovernedMoneyV1Schema,
    portfolioFmv: GovernedMoneyV1Schema,
    fundCash: GovernedMoneyV1Schema,
    otherAssets: GovernedMoneyV1Schema,
    liabilities: GovernedMoneyV1Schema,
    nav: GovernedMoneyV1Schema,
    dpi: GovernedRatioV1Schema,
    rvpi: GovernedRatioV1Schema,
    tvpi: GovernedRatioV1Schema,
  })
  .strict();

export const FinancialValuationActualsV1Schema = z
  .object({
    valuationDate: z.string().date().nullable(),
    roster: z.array(
      z
        .object({
          vehicleId: z.number().int().positive(),
          companyId: z.number().int().positive(),
        })
        .strict()
    ),
    marks: z.array(
      z
        .object({
          markId: z.number().int().positive(),
          vehicleId: z.number().int().positive(),
          companyId: z.number().int().positive(),
          positionFairValue: MoneyDecimalStringSchema,
          markSource: z.string().min(1),
          confidenceLevel: z.enum(['high', 'medium', 'low']),
          externalRefHash: Sha256Schema,
        })
        .strict()
    ),
    coverage: z.enum(['complete', 'partial', 'not_supplied']),
    missingCompanyIds: z.array(z.number().int().positive()),
  })
  .strict();

export const AdmissionReceiptCoreV1Schema = z
  .object({
    contractVersion: z.literal('actuals-pilot-publish-receipt/1.0.0'),
    operationHash: Sha256Schema,
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    coverage: z
      .object({
        ledger: z.enum(['inception_to_date', 'incremental_since_prior_head']),
        priorFactsSnapshotId: z.number().int().positive().nullable(),
        evidenceNote: z.string().min(1).max(500),
      })
      .strict(),
    admitted: z
      .object({
        ledger: z
          .object({
            sourceArtifactId: z.number().int().positive(),
            payloadSha256: Sha256Schema,
            canonicalRowsHash: Sha256Schema,
            previewHash: Sha256Schema,
            approvedRowIds: z.array(z.number().int().positive()),
            approvedCount: z.number().int().nonnegative(),
          })
          .strict(),
        valuation: z
          .object({
            sourceArtifactId: z.number().int().positive(),
            payloadSha256: Sha256Schema,
            canonicalRowsHash: Sha256Schema,
            previewHash: Sha256Schema,
            approvedMarkIds: z.array(z.number().int().positive()),
            approvedCount: z.number().int().nonnegative(),
          })
          .strict()
          .nullable(),
        importBatchId: z.string().uuid(),
      })
      .strict(),
    facts: z
      .object({
        policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_4_0),
        payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5),
        supersedesSnapshotId: z.number().int().positive().nullable(),
        knowledgeCutoff: z.string().datetime(),
      })
      .strict(),
    actor: z
      .object({
        userId: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const FinancialFactsPayloadV5Schema = FinancialFactsPayloadV4Schema.extend({
  capitalActuals: FinancialCapitalActualsV1Schema,
  valuationActuals: FinancialValuationActualsV1Schema,
  admissionReceiptCore: AdmissionReceiptCoreV1Schema,
}).strict();

export const FinancialFactsBasisRefSchema = z
  .object({
    schemaId: z.literal('financial-facts-basis-ref/1.0.0'),
    fundId: z.number().int().positive(),
    snapshotId: z.number().int().positive(),
    snapshotInputHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_4_0),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
  })
  .strict();

export type FinancialFactsPayloadV1_0_0 = z.infer<typeof FinancialFactsPayloadV1_0_0Schema>;
export type FinancialFactsPayloadV1 = z.infer<typeof FinancialFactsPayloadV1Schema>;
export type FinancialFactsPayloadV2 = z.infer<typeof FinancialFactsPayloadV2Schema>;
export type FinancialFactsPayloadV3 = z.infer<typeof FinancialFactsPayloadV3Schema>;
export type FinancialFactsPayloadV4 = z.infer<typeof FinancialFactsPayloadV4Schema>;
export type ActualsAvailabilityReasonV1 = z.infer<typeof ActualsAvailabilityReasonV1Schema>;
export type GovernedMoneyV1 = z.infer<typeof GovernedMoneyV1Schema>;
export type GovernedRatioV1 = z.infer<typeof GovernedRatioV1Schema>;
export type FinancialCapitalActualsV1 = z.infer<typeof FinancialCapitalActualsV1Schema>;
export type FinancialValuationActualsV1 = z.infer<typeof FinancialValuationActualsV1Schema>;
export type AdmissionReceiptCoreV1 = z.infer<typeof AdmissionReceiptCoreV1Schema>;
export type FinancialFactsPayloadV5 = z.infer<typeof FinancialFactsPayloadV5Schema>;
export type FinancialFactsBasisRef = z.infer<typeof FinancialFactsBasisRefSchema>;

export const FinancialFactsSnapshotInputHashPreimageV1_0_0Schema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_0_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1).optional(),
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV1_0_0Schema,
  })
  .strict();

export const FinancialFactsSnapshotInputHashPreimageSchema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_0_1),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1).optional(),
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV1Schema,
  })
  .strict();

export const FinancialFactsSnapshotInputHashPreimageV2Schema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_1_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2),
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV2Schema,
  })
  .strict();

export const FinancialFactsSnapshotInputHashPreimageV3Schema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_2_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3),
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV3Schema,
  })
  .strict();

export const FinancialFactsSnapshotInputHashPreimageV4Schema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_3_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4),
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV4Schema,
  })
  .strict();

export const FinancialFactsSnapshotInputHashPreimageV5Schema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_4_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5),
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV5Schema,
  })
  .strict();

export const PersistedFinancialFactsSnapshotInputHashPreimageSchema = z.discriminatedUnion(
  'policyVersion',
  [
    FinancialFactsSnapshotInputHashPreimageV1_0_0Schema,
    FinancialFactsSnapshotInputHashPreimageSchema,
    FinancialFactsSnapshotInputHashPreimageV2Schema,
    FinancialFactsSnapshotInputHashPreimageV3Schema,
    FinancialFactsSnapshotInputHashPreimageV4Schema,
    FinancialFactsSnapshotInputHashPreimageV5Schema,
  ]
);

export type FinancialFactsSnapshotInputHashPreimageV1_0_0 = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageV1_0_0Schema
>;
export type FinancialFactsSnapshotInputHashPreimage = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageSchema
>;
export type FinancialFactsSnapshotInputHashPreimageV2 = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageV2Schema
>;
export type FinancialFactsSnapshotInputHashPreimageV3 = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageV3Schema
>;
export type FinancialFactsSnapshotInputHashPreimageV4 = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageV4Schema
>;
export type FinancialFactsSnapshotInputHashPreimageV5 = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageV5Schema
>;
export type PersistedFinancialFactsSnapshotInputHashPreimage = z.infer<
  typeof PersistedFinancialFactsSnapshotInputHashPreimageSchema
>;

/**
 * Total for every schema-valid persisted preimage (WP-L3 section 7, R9
 * amendment): the discriminated preimage/payload Zod schemas are the
 * validation boundary for decimal strings, so the redundant decimal-leaf scan
 * (whose unanchored scientific-notation guard also matched ordinary SHA-256
 * substrings such as `EMPTY_SELECTION_SET_HASH`) is not reapplied here.
 * Canonical bytes are unchanged: both canonicalizers recursively sort object
 * keys and preserve array order.
 */
export function buildSnapshotInputHash(
  input: PersistedFinancialFactsSnapshotInputHashPreimage
): string {
  const parsed = PersistedFinancialFactsSnapshotInputHashPreimageSchema.parse(input);

  return canonicalSha256({
    fundId: parsed.fundId,
    vehicleIds: [...parsed.vehicleIds].sort((left, right) => left - right),
    asOfDate: parsed.asOfDate,
    knowledgeCutoff: parsed.knowledgeCutoff,
    policyVersion: parsed.policyVersion,
    selectionSetHash: parsed.selectionSetHash,
    payloadSchemaId:
      'payloadSchemaId' in parsed && parsed.payloadSchemaId !== undefined
        ? parsed.payloadSchemaId
        : FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1,
    payload: parsed.payload,
  });
}

export const FinancialFactsSnapshotV1_0_0Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_0_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1).optional(),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    vehicleScope: z.literal('fund_all'),
    vehicleIds: z.array(z.number().int().positive()),
    selectionSetHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    snapshotInputHash: Sha256Schema,
    consumerEvaluations: z.array(ConsumerEvaluationSchema),
    payload: FinancialFactsPayloadV1_0_0Schema,
    actorId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const FinancialFactsSnapshotV1Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_0_1),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_1).optional(),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    vehicleScope: z.literal('fund_all'),
    vehicleIds: z.array(z.number().int().positive()),
    selectionSetHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    snapshotInputHash: Sha256Schema,
    consumerEvaluations: z.array(ConsumerEvaluationSchema),
    payload: FinancialFactsPayloadV1Schema,
    actorId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const FinancialFactsSnapshotV2Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_1_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_2),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    vehicleScope: z.literal('fund_all'),
    vehicleIds: z.array(z.number().int().positive()),
    selectionSetHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    snapshotInputHash: Sha256Schema,
    consumerEvaluations: z.array(ConsumerEvaluationV2Schema),
    payload: FinancialFactsPayloadV2Schema,
    actorId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const FinancialFactsSnapshotV3Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_2_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_3),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    vehicleScope: z.literal('fund_all'),
    vehicleIds: z.array(z.number().int().positive()),
    selectionSetHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    snapshotInputHash: Sha256Schema,
    consumerEvaluations: z.array(ConsumerEvaluationV2Schema),
    payload: FinancialFactsPayloadV3Schema,
    actorId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const FinancialFactsSnapshotV4Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_3_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_4),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    vehicleScope: z.literal('fund_all'),
    vehicleIds: z.array(z.number().int().positive()),
    selectionSetHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    snapshotInputHash: Sha256Schema,
    consumerEvaluations: z.array(ConsumerEvaluationV2Schema),
    payload: FinancialFactsPayloadV4Schema,
    actorId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const FinancialFactsSnapshotV5Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_4_0),
    payloadSchemaId: z.literal(FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID_5),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    vehicleScope: z.literal('fund_all'),
    vehicleIds: z.array(z.number().int().positive()),
    selectionSetHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    snapshotInputHash: Sha256Schema,
    consumerEvaluations: z.array(ConsumerEvaluationV3Schema),
    payload: FinancialFactsPayloadV5Schema,
    actorId: z.number().int().positive().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const PersistedFinancialFactsSnapshotV1Schema = z.discriminatedUnion('policyVersion', [
  FinancialFactsSnapshotV1_0_0Schema,
  FinancialFactsSnapshotV1Schema,
  FinancialFactsSnapshotV2Schema,
  FinancialFactsSnapshotV3Schema,
  FinancialFactsSnapshotV4Schema,
  FinancialFactsSnapshotV5Schema,
]);

export type FinancialFactsSnapshotV1_0_0 = z.infer<typeof FinancialFactsSnapshotV1_0_0Schema>;
export type FinancialFactsSnapshotV1 = z.infer<typeof FinancialFactsSnapshotV1Schema>;
export type FinancialFactsSnapshotV2 = z.infer<typeof FinancialFactsSnapshotV2Schema>;
export type FinancialFactsSnapshotV3 = z.infer<typeof FinancialFactsSnapshotV3Schema>;
export type FinancialFactsSnapshotV4 = z.infer<typeof FinancialFactsSnapshotV4Schema>;
export type FinancialFactsSnapshotV5 = z.infer<typeof FinancialFactsSnapshotV5Schema>;
export type PersistedFinancialFactsSnapshotV1 = z.infer<
  typeof PersistedFinancialFactsSnapshotV1Schema
>;
