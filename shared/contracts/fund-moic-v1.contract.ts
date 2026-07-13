import { z } from 'zod';

import {
  FundCompanyActualsCurrencyStatusSchema,
  FundCompanyActualsPlanningFmvStatusSchema,
  Sha256Schema,
} from './fund-actuals/fund-company-actuals-fact.contract';
import { DecimalStringSchema } from './lp-reporting/cash-flow-event.contract';
import { StructuredWarningSchema } from './provenance-envelope.contract';

export const FundMoicRankabilitySchema = z.enum(['actionable', 'indicative', 'not_actionable']);

export const FundMoicFactsBasisReasonSchema = z.enum([
  'planning_fmv_active',
  'planning_fmv_stale',
  'legacy_current_valuation_fallback',
  'valuation_unavailable',
  'currency_blocked',
  'planned_reserves_zero',
  'exit_probability_missing',
  'reserve_exit_multiple_missing',
]);

export const FundMoicFactsBasisV1Schema = z
  .object({
    rankability: FundMoicRankabilitySchema,
    reasons: z.array(FundMoicFactsBasisReasonSchema),
    observedInitialInvestment: DecimalStringSchema,
    observedFollowOnInvestment: DecimalStringSchema,
    observedTotalInvestment: DecimalStringSchema,
    valuationAnchor: z
      .object({
        kind: z.enum(['planning_fmv', 'legacy_current_valuation', 'none']),
        value: DecimalStringSchema.nullable(),
        asOfDate: z.string().date().nullable(),
      })
      .strict(),
    planningFmvStatus: FundCompanyActualsPlanningFmvStatusSchema,
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    factsInputHash: Sha256Schema.nullable(),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

export const FundMoicRankingsProvenanceV1Schema = z
  .object({
    source: z.literal('portfolio_companies'),
    calculation: z.literal('reserves_moic_rankings'),
    metricBasis: z.literal('planned_reserves'),
    sourceRecordCount: z.number().int().min(0),
  })
  .strict();

export const FundMoicReservesMoicV1Schema = z
  .object({
    value: z.number().nullable(),
    description: z.string(),
    formula: z.string(),
  })
  .strict();

export const FundMoicRankingItemV1Schema = z
  .object({
    rank: z.number().int().positive(),
    investmentId: z.string(),
    investmentName: z.string(),
    reservesMoic: FundMoicReservesMoicV1Schema,
    factsBasis: FundMoicFactsBasisV1Schema.nullable(),
  })
  .strict();

export type FundMoicRankingsProvenanceV1 = z.infer<typeof FundMoicRankingsProvenanceV1Schema>;
export type FundMoicReservesMoicV1 = z.infer<typeof FundMoicReservesMoicV1Schema>;
export type FundMoicFactsBasisV1 = z.infer<typeof FundMoicFactsBasisV1Schema>;
export type FundMoicRankingItemV1 = z.infer<typeof FundMoicRankingItemV1Schema>;

export const FundMoicRankingsResponseV1Schema = z
  .object({
    fundId: z.number().int().positive(),
    provenance: FundMoicRankingsProvenanceV1Schema,
    rankings: z.array(FundMoicRankingItemV1Schema),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type FundMoicRankingsResponseV1 = z.infer<typeof FundMoicRankingsResponseV1Schema>;
