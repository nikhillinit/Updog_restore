/**
 * Canonical financial-facts snapshot contract.
 *
 * D21 snapshot resolution: GET surfaces serve the latest persisted accepted
 * snapshot and its knowledgeCutoff. Reads never create snapshots. Creation is
 * limited to explicit POST commands and deterministic post-commit triggers.
 */
import { z } from 'zod';

import { FundCompanyActualsFactsResponseSchema } from './fund-actuals/fund-company-actuals-fact.contract';
import { ConsumerEvaluationSchema } from './financial-facts-consumer-policies';
import { FinancialProvenanceSchema } from './financial-provenance.contract';
import { ProvenanceEnvelopeSchema } from './provenance-envelope.contract';
import { canonicalSha256 } from '../lib/canonical-hash';
import { canonicalizeDecimalLeaves, MoneyDecimalStringSchema } from '../lib/decimal-string';

export const FINANCIAL_FACTS_POLICY_VERSION_1_0_0 = 'financial-facts-policy/1.0.0' as const;
export const FINANCIAL_FACTS_POLICY_VERSION_1_0_1 = 'financial-facts-policy/1.0.1' as const;
export const FINANCIAL_FACTS_POLICY_VERSION = FINANCIAL_FACTS_POLICY_VERSION_1_0_1;
export const FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID = 'financial-facts-payload/1' as const;

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
    code: z.enum(['NON_USD_CASH_FLOW_EXCLUDED', 'VALUATION_MARK_STALE']),
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

export type FinancialFactsPayloadV1_0_0 = z.infer<typeof FinancialFactsPayloadV1_0_0Schema>;
export type FinancialFactsPayloadV1 = z.infer<typeof FinancialFactsPayloadV1Schema>;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const FinancialFactsSnapshotInputHashPreimageV1_0_0Schema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleIds: z.array(z.number().int().positive()),
    asOfDate: z.string().date(),
    knowledgeCutoff: z.string().datetime(),
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_0_0),
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
    selectionSetHash: Sha256Schema,
    payload: FinancialFactsPayloadV1Schema,
  })
  .strict();

export const PersistedFinancialFactsSnapshotInputHashPreimageSchema = z.discriminatedUnion(
  'policyVersion',
  [
    FinancialFactsSnapshotInputHashPreimageV1_0_0Schema,
    FinancialFactsSnapshotInputHashPreimageSchema,
  ]
);

export type FinancialFactsSnapshotInputHashPreimageV1_0_0 = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageV1_0_0Schema
>;
export type FinancialFactsSnapshotInputHashPreimage = z.infer<
  typeof FinancialFactsSnapshotInputHashPreimageSchema
>;
export type PersistedFinancialFactsSnapshotInputHashPreimage = z.infer<
  typeof PersistedFinancialFactsSnapshotInputHashPreimageSchema
>;

export function buildSnapshotInputHash(
  input: PersistedFinancialFactsSnapshotInputHashPreimage
): string {
  const parsed = PersistedFinancialFactsSnapshotInputHashPreimageSchema.parse(input);
  const preimage = canonicalizeDecimalLeaves({
    fundId: parsed.fundId,
    vehicleIds: [...parsed.vehicleIds].sort((left, right) => left - right),
    asOfDate: parsed.asOfDate,
    knowledgeCutoff: parsed.knowledgeCutoff,
    policyVersion: parsed.policyVersion,
    selectionSetHash: parsed.selectionSetHash,
    payloadSchemaId: FINANCIAL_FACTS_PAYLOAD_SCHEMA_ID,
    payload: parsed.payload,
  });

  return canonicalSha256(preimage);
}

export const FinancialFactsSnapshotV1_0_0Schema = z
  .object({
    policyVersion: z.literal(FINANCIAL_FACTS_POLICY_VERSION_1_0_0),
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

export const PersistedFinancialFactsSnapshotV1Schema = z.discriminatedUnion('policyVersion', [
  FinancialFactsSnapshotV1_0_0Schema,
  FinancialFactsSnapshotV1Schema,
]);

export type FinancialFactsSnapshotV1_0_0 = z.infer<typeof FinancialFactsSnapshotV1_0_0Schema>;
export type FinancialFactsSnapshotV1 = z.infer<typeof FinancialFactsSnapshotV1Schema>;
export type PersistedFinancialFactsSnapshotV1 = z.infer<
  typeof PersistedFinancialFactsSnapshotV1Schema
>;
