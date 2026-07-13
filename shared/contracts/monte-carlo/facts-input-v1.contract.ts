import { z } from 'zod';

import {
  FundCompanyActualsCurrencyStatusSchema,
  FundCompanyActualsPlanningFmvStatusSchema,
  Sha256Schema,
} from '../fund-actuals/fund-company-actuals-fact.contract';
import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';
import { StructuredWarningSchema } from '../provenance-envelope.contract';

export const FactsMonteCarloCompanyV1Schema = z
  .object({
    companyId: z.number().int().positive(),
    observedInitialInvestment: DecimalStringSchema.nullable(),
    observedFollowOnInvestment: DecimalStringSchema.nullable(),
    planningFmv: DecimalStringSchema.nullable(),
    planningFmvStatus: FundCompanyActualsPlanningFmvStatusSchema,
    stage: z.string().min(1).nullable(),
    sector: z.string().min(1).nullable(),
    trustState: z.enum(['LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED']),
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

export const FactsMonteCarloInputV1Schema = z
  .object({
    contractVersion: z.literal('monte-carlo-facts-input-v1'),
    fundId: z.number().int().positive(),
    asOfDate: z.string().date(),
    factsInputHash: Sha256Schema,
    sourceFactsInputHash: Sha256Schema,
    companies: z.array(FactsMonteCarloCompanyV1Schema),
  })
  .strict();

export type FactsMonteCarloCompanyV1 = z.infer<typeof FactsMonteCarloCompanyV1Schema>;
export type FactsMonteCarloInputV1 = z.infer<typeof FactsMonteCarloInputV1Schema>;
