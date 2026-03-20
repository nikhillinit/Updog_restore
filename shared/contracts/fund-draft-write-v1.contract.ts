/**
 * FundDraftWriteV1 -- Canonical write contract for PUT /api/funds/:id/draft
 *
 * Full-replace PUT semantics: missing fields mean "not set".
 * All sub-schemas use deep .strict() to reject unknown keys.
 *
 * Source types: fundStore.ts:1-171 (FundState and related types)
 *
 * @unit fundSize ambiguous -- client stores dollars, but adapter may need
 *       conversion in Phase 2A. For now, pass through as-is.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas (deep .strict())
// ---------------------------------------------------------------------------

const StrategyStageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    graduate: z.number(), // %
    exit: z.number(), // %
    months: z.number().int().min(1),
  })
  .strict();

const LPClassSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    targetAllocation: z.number(),
    managementFeeRate: z.number().optional(),
    carriedInterest: z.number().optional(),
    preferredReturn: z.number().optional(),
  })
  .strict();

const LPSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    commitment: z.number(),
    lpClassId: z.string().optional(),
    type: z.enum(['institutional', 'family-office', 'fund-of-funds', 'individual', 'other']),
  })
  .strict();

const WaterfallTierSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    preferredReturn: z.number().optional(),
    catchUp: z.number().optional(),
    gpSplit: z.number(),
    lpSplit: z.number(),
    condition: z.enum(['irr', 'moic', 'none']).optional(),
    conditionValue: z.number().optional(),
  })
  .strict();

const FeeTierSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    percentage: z.number(),
    feeBasis: z.enum([
      'committed_capital',
      'called_capital_period',
      'gross_cumulative_called',
      'net_cumulative_called',
      'cumulative_invested',
      'fair_market_value',
      'unrealized_investments',
    ]),
    startMonth: z.number(),
    endMonth: z.number().optional(),
    recyclingPercentage: z.number().optional(),
  })
  .strict();

const FeeProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    feeTiers: z.array(FeeTierSchema),
  })
  .strict();

const FundExpenseSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    monthlyAmount: z.number(),
    startMonth: z.number(),
    endMonth: z.number().optional(),
  })
  .strict();

const SectorProfileSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    targetPercentage: z.number().min(0).max(100),
    description: z.string().optional(),
  })
  .strict();

const AllocationSchema = z
  .object({
    id: z.string(),
    category: z.string().min(1),
    percentage: z.number().min(0).max(100),
    description: z.string().optional(),
  })
  .strict();

const PipelineStageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    roundSize: z.number(),
    valuation: z.number(),
    valuationType: z.enum(['pre', 'post']),
    esopPct: z.number(),
    graduationRate: z.number(),
    exitRate: z.number(),
    exitValuation: z.number(),
    monthsToGraduate: z.number(),
    monthsToExit: z.number(),
  })
  .strict();

const PipelineProfileSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    stages: z.array(PipelineStageSchema),
  })
  .strict();

const CapitalStageAllocationSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    pct: z.number(),
  })
  .strict();

const CapitalPlanAllocationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sectorProfileId: z.string().optional(),
    entryRound: z.string(),
    capitalAllocationPct: z.number(),
    initialCheckStrategy: z.enum(['amount', 'ownership']),
    initialCheckAmount: z.number().optional(),
    initialOwnershipPct: z.number().optional(),
    followOnStrategy: z.enum(['amount', 'maintain_ownership']),
    followOnAmount: z.number().optional(),
    followOnParticipationPct: z.number(),
    investmentHorizonMonths: z.number(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Uniqueness refinement helper
// ---------------------------------------------------------------------------
function uniqueIds<T extends z.ZodTypeAny>(schema: z.ZodArray<T>, label: string) {
  return schema.refine(
    (items: Array<{ id?: string }>) => {
      const ids = items.map((i) => i.id).filter(Boolean);
      return ids.length === new Set(ids).size;
    },
    { message: `Duplicate id found in ${label}` }
  );
}

// ---------------------------------------------------------------------------
// Main draft write schema
// ---------------------------------------------------------------------------

export const FundDraftWriteV1Schema = z
  .object({
    // Required
    fundName: z.string().min(1, 'Fund name is required'),

    // Fund Basics (all optional -- missing = "not set")
    fundSize: z.number().optional(),
    vintageYear: z.number().int().optional(),
    managementFeeRate: z.number().optional(),
    carriedInterest: z.number().optional(),
    establishmentDate: z.string().optional(),
    isEvergreen: z.boolean().optional(),
    fundLife: z.number().optional(),
    investmentPeriod: z.number().optional(),
    gpCommitment: z.number().optional(),

    // Capital Structure
    lpClasses: uniqueIds(z.array(LPClassSchema), 'lpClasses').optional(),
    lps: uniqueIds(z.array(LPSchema), 'lps').optional(),

    // Investment Strategy
    stages: uniqueIds(z.array(StrategyStageSchema), 'stages').optional(),
    sectorProfiles: uniqueIds(z.array(SectorProfileSchema), 'sectorProfiles').optional(),
    allocations: uniqueIds(z.array(AllocationSchema), 'allocations').optional(),
    followOnChecks: z.object({ A: z.number(), B: z.number(), C: z.number() }).strict().optional(),

    // Capital Plan
    capitalStageAllocations: uniqueIds(
      z.array(CapitalStageAllocationSchema),
      'capitalStageAllocations'
    ).optional(),
    capitalPlanAllocations: uniqueIds(
      z.array(CapitalPlanAllocationSchema),
      'capitalPlanAllocations'
    ).optional(),

    // Investment Pipeline
    pipelineProfiles: uniqueIds(z.array(PipelineProfileSchema), 'pipelineProfiles').optional(),

    // Distributions & Carry
    waterfallType: z.enum(['american', 'hybrid']).optional(),
    waterfallTiers: uniqueIds(z.array(WaterfallTierSchema), 'waterfallTiers').optional(),
    recyclingEnabled: z.boolean().optional(),
    recyclingType: z.enum(['exits', 'fees', 'both']).optional(),
    recyclingCap: z.number().optional(),
    recyclingPeriod: z.number().optional(),
    exitRecyclingRate: z.number().optional(),
    mgmtFeeRecyclingRate: z.number().optional(),
    allowFutureRecycling: z.boolean().optional(),

    // Fees & Expenses
    feeProfiles: uniqueIds(z.array(FeeProfileSchema), 'feeProfiles').optional(),
    fundExpenses: uniqueIds(z.array(FundExpenseSchema), 'fundExpenses').optional(),
  })
  .strict();

export type FundDraftWriteV1 = z.infer<typeof FundDraftWriteV1Schema>;
