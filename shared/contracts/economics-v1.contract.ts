import { z } from 'zod';

const RatioSchema = z.number().min(0).max(1);
const NonNegativeMoneySchema = z.number().nonnegative();
const PositiveYearSchema = z.number().int().positive();

export const EconomicsFeeBasisSchema = z.enum([
  'committed_capital',
  'called_capital_cumulative',
  'called_capital_net_of_returns',
  'invested_capital',
  'fair_market_value',
  'unrealized_cost',
]);

export const TimelineAssumptionsV1Schema = z
  .object({
    fundLifeYears: PositiveYearSchema,
    period: z.literal('annual'),
    vintageYear: z.number().int().optional(),
  })
  .strict();

export const EconomicsFeeTierV1Schema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    rate: RatioSchema,
    basis: EconomicsFeeBasisSchema,
    startYear: PositiveYearSchema,
    endYear: PositiveYearSchema.optional(),
    recyclingEligiblePct: RatioSchema.optional(),
  })
  .strict()
  .superRefine((tier, ctx) => {
    if (tier.endYear != null && tier.endYear < tier.startYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endYear'],
        message: 'endYear must be greater than or equal to startYear',
      });
    }
  });

export const FeeModelAssumptionsV1Schema = z
  .object({
    source: z.enum(['legacy_fee_profiles', 'economics_override']),
    tiers: z.array(EconomicsFeeTierV1Schema).optional(),
    defaultRate: RatioSchema.optional(),
    defaultBasis: EconomicsFeeBasisSchema.optional(),
  })
  .strict();

export const EconomicsExpenseV1Schema = z
  .object({
    id: z.string().min(1),
    category: z.string().min(1),
    amount: NonNegativeMoneySchema,
    startYear: PositiveYearSchema,
    endYear: PositiveYearSchema.optional(),
    growthRate: z.number().min(-1).optional(),
  })
  .strict()
  .superRefine((expense, ctx) => {
    if (expense.endYear != null && expense.endYear < expense.startYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endYear'],
        message: 'endYear must be greater than or equal to startYear',
      });
    }
  });

export const ExpenseModelAssumptionsV1Schema = z
  .object({
    source: z.enum(['legacy_fund_expenses', 'economics_override']),
    annualExpenses: z.array(EconomicsExpenseV1Schema).optional(),
    orgExpenseCap: NonNegativeMoneySchema.optional(),
    orgExpenseCapType: z.enum(['absolute', 'pct_of_commitments']).optional(),
  })
  .strict();

export const CohortExitModelV1Schema = z
  .object({
    exitDistributionByYear: z.array(RatioSchema),
    grossMultiple: z.number().nonnegative(),
    lossRatio: RatioSchema,
    lossDistributionByYear: z.array(RatioSchema).optional(),
  })
  .strict();

export const DealExitV1Schema = z
  .object({
    dealId: z.string().min(1),
    investmentYear: PositiveYearSchema,
    exitYear: PositiveYearSchema,
    costBasis: NonNegativeMoneySchema,
    exitProceeds: NonNegativeMoneySchema,
    writeOff: z.boolean().optional(),
  })
  .strict();

export const ExitModelAssumptionsV1Schema = z
  .object({
    mode: z.enum(['cohort', 'deal']),
    cohort: CohortExitModelV1Schema.optional(),
    deals: z.array(DealExitV1Schema).optional(),
  })
  .strict()
  .superRefine((model, ctx) => {
    if (model.mode === 'cohort' && model.cohort == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cohort'],
        message: 'cohort exit model is required when mode is cohort',
      });
    }
    if (model.mode === 'deal' && (!model.deals || model.deals.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deals'],
        message: 'at least one deal exit is required when mode is deal',
      });
    }
  });

export const RecyclingAssumptionsV1Schema = z
  .object({
    enabled: z.boolean(),
    sources: z.array(z.enum(['management_fees', 'exit_proceeds'])),
    capPctOfCommitments: RatioSchema,
    eligibleThroughYear: PositiveYearSchema.optional(),
    exitProceedsRecyclePct: RatioSchema.optional(),
    timing: z.enum(['before_waterfall', 'after_waterfall']),
  })
  .strict();

export const WaterfallAssumptionsV1Schema = z
  .object({
    type: z.literal('american'),
    carryPct: RatioSchema,
    hurdleRate: RatioSchema,
    prefType: z.enum(['compounded', 'simple', 'none']),
    prefCompounding: z.literal('annual'),
    prefCatchUp: z.boolean(),
    catchUpRate: RatioSchema,
    catchUpTargetCarryPct: RatioSchema,
    clawbackEnabled: z.boolean(),
    clawbackTrigger: z.enum(['final_liquidation', 'annual_true_up', 'both']),
    escrowPct: RatioSchema,
    feeOffsetTreatment: z.enum(['none', 'reduce_carry', 'reduce_management_fees', 'separate']),
  })
  .strict();

export const GPCommitmentAssumptionsV1Schema = z
  .object({
    commitmentPct: RatioSchema.optional(),
    commitmentAmount: NonNegativeMoneySchema.optional(),
    participatesInInvestmentReturns: z.boolean().default(true),
    callSchedule: z.array(RatioSchema).optional(),
  })
  .strict();

export const EconomicsAssumptionsV1Schema = z
  .object({
    version: z.literal('v1'),
    timeline: TimelineAssumptionsV1Schema.optional(),
    feeModel: FeeModelAssumptionsV1Schema.optional(),
    expenseModel: ExpenseModelAssumptionsV1Schema.optional(),
    exitModel: ExitModelAssumptionsV1Schema.optional(),
    recyclingModel: RecyclingAssumptionsV1Schema.optional(),
    waterfallModel: WaterfallAssumptionsV1Schema.optional(),
    gpCommitmentModel: GPCommitmentAssumptionsV1Schema.optional(),
  })
  .strict();

const InvariantErrorCodeSchema = z.enum([
  'PERIOD_CASH_RECONCILIATION_FAILED',
  'DISTRIBUTION_RECONCILIATION_FAILED',
  'NEGATIVE_REMAINING_PROCEEDS',
  'INVALID_INPUT',
]);

export const EconomicsInvariantReportV1Schema = z
  .object({
    passed: z.boolean(),
    tolerance: z.number().positive(),
    errors: z.array(
      z
        .object({
          year: z.number().int().positive().optional(),
          code: InvariantErrorCodeSchema,
          message: z.string(),
          delta: z.number().optional(),
        })
        .strict()
    ),
  })
  .strict();

export const EconomicsAnnualRowV1Schema = z
  .object({
    year: z.number().int().positive(),
    lpCapitalCalls: NonNegativeMoneySchema,
    gpCommitmentCalls: NonNegativeMoneySchema,
    grossExitProceeds: NonNegativeMoneySchema,
    beginningCash: z.number(),
    investments: NonNegativeMoneySchema,
    feesPaidToManager: NonNegativeMoneySchema,
    expensesPaid: NonNegativeMoneySchema,
    recycledProceeds: NonNegativeMoneySchema,
    endingCash: z.number(),
    lpDistributions: NonNegativeMoneySchema,
    gpInvestmentDistributions: NonNegativeMoneySchema,
    gpCarryDistributed: NonNegativeMoneySchema,
    gpCarryEscrowed: NonNegativeMoneySchema,
    gpCarryReleasedFromEscrow: NonNegativeMoneySchema,
    clawbackPaid: NonNegativeMoneySchema,
    grossNav: NonNegativeMoneySchema,
    lpNetNav: NonNegativeMoneySchema,
    /** DPI multiple (dimensionless, e.g. 1.5x), not currency */
    dpi: z.number().nonnegative(),
    /** RVPI multiple (dimensionless, e.g. 0.8x), not currency */
    rvpi: z.number().nonnegative(),
    /** TVPI multiple (dimensionless, e.g. 2.3x), not currency */
    tvpi: z.number().nonnegative(),
    conservationDelta: z.number(),
  })
  .strict();

export const EconomicsSummaryV1Schema = z
  .object({
    grossIrr: z.number().nullable(),
    lpNetIrr: z.number().nullable(),
    gpNetIrr: z.number().nullable(),
    totalLpPaidIn: NonNegativeMoneySchema,
    totalGpCommitmentCalled: NonNegativeMoneySchema,
    totalManagementFees: NonNegativeMoneySchema,
    totalExpenses: NonNegativeMoneySchema,
    totalRecycled: NonNegativeMoneySchema,
    totalLpDistributions: NonNegativeMoneySchema,
    totalGpInvestmentDistributions: NonNegativeMoneySchema,
    totalGpCarryDistributed: NonNegativeMoneySchema,
    totalGpFeeIncome: NonNegativeMoneySchema,
    finalDpi: NonNegativeMoneySchema,
    finalRvpi: NonNegativeMoneySchema,
    finalTvpi: NonNegativeMoneySchema,
    finalClawbackDue: NonNegativeMoneySchema,
    maxEscrowAvailable: NonNegativeMoneySchema,
    netGpCarryAfterClawback: z.number(),
  })
  .strict();

export const EconomicsResultV1Schema = z
  .object({
    version: z.literal('v1'),
    annual: z.array(EconomicsAnnualRowV1Schema),
    summary: EconomicsSummaryV1Schema,
    checks: EconomicsInvariantReportV1Schema,
  })
  .strict();

export const EconomicsResultReasonCodeSchema = z.enum([
  'ECONOMICS_DISABLED',
  'ECONOMICS_NOT_CONFIGURED',
  'ECONOMICS_SNAPSHOT_PENDING',
  'ECONOMICS_INPUT_INVALID',
  'ECONOMICS_ENGINE_FAILED',
  'ECONOMICS_INVARIANT_FAILED',
  'ECONOMICS_STALE_CONFIG_VERSION',
]);

export type EconomicsFeeBasis = z.infer<typeof EconomicsFeeBasisSchema>;
export type EconomicsAssumptionsV1 = z.infer<typeof EconomicsAssumptionsV1Schema>;
export type EconomicsFeeTierV1 = z.infer<typeof EconomicsFeeTierV1Schema>;
export type EconomicsExpenseV1 = z.infer<typeof EconomicsExpenseV1Schema>;
export type EconomicsResultV1 = z.infer<typeof EconomicsResultV1Schema>;
export type EconomicsSummaryV1 = z.infer<typeof EconomicsSummaryV1Schema>;
export type EconomicsAnnualRowV1 = z.infer<typeof EconomicsAnnualRowV1Schema>;
export type EconomicsInvariantReportV1 = z.infer<typeof EconomicsInvariantReportV1Schema>;
export type EconomicsResultReasonCode = z.infer<typeof EconomicsResultReasonCodeSchema>;
