import { z } from 'zod';

import {
  FundCompanyActualsCurrencyStatusSchema,
  FundCompanyActualsPlanningFmvStatusSchema,
  FundCompanyActualsSupersedeLineageSchema,
} from '../fund-actuals/fund-company-actuals-fact.contract';
import { DecimalStringSchema } from '../lp-reporting/cash-flow-event.contract';
import { StructuredWarningSchema } from '../provenance-envelope.contract';

const IntegerCentStringSchema = z.string().regex(/^-?\d+$/);

export const AllocationDriftComparisonV1Schema = z
  .object({
    basis: z.enum(['deployed_reserves_vs_observed_follow_on', 'legacy_invested_vs_observed_total']),
    state: z.enum(['exact', 'drifted', 'unavailable']),
    planCents: IntegerCentStringSchema,
    actualCents: IntegerCentStringSchema.nullable(),
    deltaCents: IntegerCentStringSchema.nullable(),
    relativeDelta: DecimalStringSchema.nullable(),
    material: z.boolean(),
    subCentRemainder: DecimalStringSchema.nullable(),
    unavailableReason: z.enum(['currency_blocked', 'facts_failed', 'facts_missing']).nullable(),
  })
  .strict();

export const AllocationCompanyActualsDriftV1Schema = z
  .object({
    contractVersion: z.literal('allocation-actuals-drift-v1'),
    companyId: z.number().int().positive(),
    asOfDate: z.string().date(),
    allocationVersion: z.number().int().positive(),
    lastAllocationAt: z.string().datetime().nullable(),
    factsInputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    trustState: z.enum(['LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED']),
    planningFmvStatus: FundCompanyActualsPlanningFmvStatusSchema,
    currencyStatus: FundCompanyActualsCurrencyStatusSchema,
    activeRoundIds: z.array(z.number().int().positive()),
    supersedeLineage: z.array(FundCompanyActualsSupersedeLineageSchema),
    comparisons: z.array(AllocationDriftComparisonV1Schema).length(2),
    warnings: z.array(StructuredWarningSchema),
  })
  .strict();

export type AllocationDriftComparisonV1 = z.infer<typeof AllocationDriftComparisonV1Schema>;
export type AllocationCompanyActualsDriftV1 = z.infer<typeof AllocationCompanyActualsDriftV1Schema>;
