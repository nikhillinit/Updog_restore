import { z } from 'zod';

import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';
import { ProvenanceEnvelopeSchema, StructuredWarningSchema } from '../provenance-envelope.contract';

const PositiveIdSchema = z.number().int().positive();
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateSchema = z.string().date();
const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const FundCompanyActualsPlanningFmvStatusSchema = z.enum([
  'none',
  'active',
  'superseded',
  'stale',
  'blocked',
]);

export const FundCompanyActualsCurrencyStatusSchema = z.enum([
  'base_currency',
  'mismatch_blocked',
  'unknown',
]);

export const FundCompanyActualsSupersedeLineageSchema = z
  .object({
    roundId: PositiveIdSchema,
    supersedesRoundId: PositiveIdSchema.nullable(),
  })
  .strict();

export const FundCompanyActualsFactSchema = z
  .object({
    fundId: PositiveIdSchema,
    companyId: PositiveIdSchema,
    companyName: z.string().min(1),
    investmentIds: z.array(PositiveIdSchema),
    activeRoundIds: z.array(PositiveIdSchema),
    approvedPlanningFmvMarkId: PositiveIdSchema.nullable(),
    planningFmvStatus: FundCompanyActualsPlanningFmvStatusSchema,
    initialInvestmentAmount: DecimalStringSchema,
    followOnInvestmentAmount: DecimalStringSchema,
    amountOnlyNonEquityAmount: DecimalStringSchema,
    latestRoundDate: IsoDateSchema.nullable(),
    latestRoundValuation: DecimalStringSchema.nullable(),
    latestPlanningFmvDate: IsoDateSchema.nullable(),
    latestPlanningFmvValue: DecimalStringSchema.nullable(),
    currency: CurrencyCodeSchema,
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    supersedeLineage: z.array(FundCompanyActualsSupersedeLineageSchema),
    warnings: z.array(StructuredWarningSchema),
    provenance: ProvenanceEnvelopeSchema,
    inputHash: Sha256Schema,
  })
  .strict();

export const FundCompanyActualsFactsQuerySchema = z
  .object({
    asOfDate: IsoDateSchema.optional(),
  })
  .strict();

export const FundCompanyActualsFactsResponseSchema = z
  .object({
    fundId: PositiveIdSchema,
    asOfDate: IsoDateSchema,
    facts: z.array(FundCompanyActualsFactSchema),
    inputHash: Sha256Schema,
    generatedAt: z.string().datetime(),
  })
  .strict();

export const FundCompanyActualsMonetaryFactsV1Schema = z.discriminatedUnion('availability', [
  z
    .object({
      availability: z.literal('available'),
      reasonCodes: z.array(z.literal('DEPLOYMENT_CATEGORY_UNMAPPED')).length(0),
      sourceCashFlowEventIds: z.array(PositiveIdSchema),
    })
    .strict(),
  z
    .object({
      availability: z.literal('unavailable'),
      reasonCodes: z.array(z.literal('DEPLOYMENT_CATEGORY_UNMAPPED')).min(1),
      sourceCashFlowEventIds: z.array(PositiveIdSchema).min(1),
    })
    .strict(),
]);

/** Payload 6 keeps independent round metadata and admits money only from effective actuals. */
export const FundCompanyActualsFactV2Schema = FundCompanyActualsFactSchema.extend({
  initialInvestmentAmount: DecimalStringSchema.nullable(),
  followOnInvestmentAmount: DecimalStringSchema.nullable(),
  amountOnlyNonEquityAmount: DecimalStringSchema.nullable(),
  monetaryFacts: FundCompanyActualsMonetaryFactsV1Schema,
})
  .strict()
  .superRefine((value, ctx) => {
    const amounts = [
      value.initialInvestmentAmount,
      value.followOnInvestmentAmount,
      value.amountOnlyNonEquityAmount,
    ];
    const available = value.monetaryFacts.availability === 'available';
    if (amounts.some((amount) => (available ? amount === null : amount !== null))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monetaryFacts'],
        message:
          'Company monetary amounts must be present exactly when monetary facts are available.',
      });
    }
  });

export const FundCompanyActualsFactsResponseV2Schema = FundCompanyActualsFactsResponseSchema.extend(
  {
    facts: z.array(FundCompanyActualsFactV2Schema),
  }
).strict();

export type FundCompanyActualsPlanningFmvStatus = z.infer<
  typeof FundCompanyActualsPlanningFmvStatusSchema
>;
export type FundCompanyActualsCurrencyStatus = z.infer<
  typeof FundCompanyActualsCurrencyStatusSchema
>;
export type FundCompanyActualsFact = z.infer<typeof FundCompanyActualsFactSchema>;
export type FundCompanyActualsFactsResponse = z.infer<typeof FundCompanyActualsFactsResponseSchema>;
export type FundCompanyActualsMonetaryFactsV1 = z.infer<
  typeof FundCompanyActualsMonetaryFactsV1Schema
>;
export type FundCompanyActualsFactV2 = z.infer<typeof FundCompanyActualsFactV2Schema>;
export type FundCompanyActualsFactsResponseV2 = z.infer<
  typeof FundCompanyActualsFactsResponseV2Schema
>;
