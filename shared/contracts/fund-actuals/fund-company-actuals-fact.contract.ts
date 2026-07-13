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

export type FundCompanyActualsPlanningFmvStatus = z.infer<
  typeof FundCompanyActualsPlanningFmvStatusSchema
>;
export type FundCompanyActualsCurrencyStatus = z.infer<
  typeof FundCompanyActualsCurrencyStatusSchema
>;
export type FundCompanyActualsFact = z.infer<typeof FundCompanyActualsFactSchema>;
export type FundCompanyActualsFactsResponse = z.infer<typeof FundCompanyActualsFactsResponseSchema>;
