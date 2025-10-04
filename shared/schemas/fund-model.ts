import { z } from 'zod';

/**
 * Fund Model Schemas (FROZEN for Iteration A)
 *
 * This file defines the complete input/output contract for the deterministic
 * fund calculation engine. These schemas are FROZEN and should not be modified
 * without a corresponding engine version bump and migration strategy.
 *
 * Version: 1.0.0
 * Last Modified: 2025-10-03
 */

// =====================
// STAGE DEFINITIONS
// =====================

export const StageSchema = z.enum([
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'growth',
]);
export type Stage = z.infer<typeof StageSchema>;

export const StageAllocationSchema = z.object({
  stage: StageSchema,
  allocationPct: z.number().min(0).max(1)
    .describe('Allocation percentage (0.0 to 1.0)'),
});

export type StageAllocation = z.infer<typeof StageAllocationSchema>;

// =====================
// INPUTS (FROZEN API)
// =====================

export const FundModelInputsSchema = z.object({
  // Fund basics
  fundSize: z.number().positive()
    .describe('Total committed capital in dollars'),

  periodLengthMonths: z.number().int().positive()
    .describe('Length of each period in months (e.g., 3 for quarterly)'),

  // Capital call (LOCKED to upfront in Iteration A)
  capitalCallMode: z.literal('upfront')
    .describe('Capital call mode - LOCKED to "upfront" (100% at period 0)'),

  // Fees (management only, with duration limit)
  managementFeeRate: z.number().min(0).max(0.05)
    .describe('Annual management fee as % of committed capital (e.g., 0.02 = 2%)'),

  managementFeeYears: z.number().int().positive().default(10)
    .describe('Number of years to charge management fees (typically 10)'),

  // Stage allocations
  stageAllocations: z.array(StageAllocationSchema)
    .min(1)
    .describe('Allocation of fund across stages - must sum to 100%'),

  // Reserve pool
  reservePoolPct: z.number().min(0).max(0.5)
    .describe('Reserve pool as % of fund size (carved from stage allocations)'),

  // Investment parameters
  averageCheckSizes: z.record(StageSchema, z.number().positive())
    .describe('Average initial check size per stage in dollars'),

  graduationRates: z.record(StageSchema, z.number().min(0).max(1))
    .describe('Per-period graduation rate to next stage (0.0 to 1.0)'),

  exitRates: z.record(StageSchema, z.number().min(0).max(1))
    .describe('Per-period exit rate (0.0 to 1.0)'),

  monthsToGraduate: z.record(StageSchema, z.number().int().positive())
    .describe('Average months to graduate to next stage'),

  monthsToExit: z.record(StageSchema, z.number().int().positive())
    .describe('Average months to exit from stage'),
}).superRefine((inputs, ctx) => {

  // =====================
  // FEASIBILITY CONSTRAINT 1: Stage allocations sum to 100%
  // =====================
  const allocSum = inputs.stageAllocations.reduce((s, a) => s + a.allocationPct, 0);
  if (Math.abs(allocSum - 1.0) > 1e-6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Stage allocations must sum to 100%. Current sum: ${(allocSum * 100).toFixed(2)}%. Reserve pool is carved from these allocations.`,
      path: ['stageAllocations'],
    });
  }

  // =====================
  // FEASIBILITY CONSTRAINT 2: Check sizes ≤ stage allocations
  // =====================
  inputs.stageAllocations.forEach((stage, idx) => {
    const stageCapital = inputs.fundSize * stage.allocationPct;
    const avgCheck = inputs.averageCheckSizes[stage.stage];

    if (!avgCheck) return; // Skip if check size not defined

    if (avgCheck > stageCapital) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Average check size for ${stage.stage} ($${(avgCheck / 1e6).toFixed(2)}M) exceeds stage allocation ($${(stageCapital / 1e6).toFixed(2)}M). At least one investment must be possible.`,
        path: ['averageCheckSizes', stage.stage],
      });
    }
  });

  // =====================
  // FEASIBILITY CONSTRAINT 3: Minimum companies per stage
  // =====================
  inputs.stageAllocations.forEach((stage, idx) => {
    const stageCapital = inputs.fundSize * stage.allocationPct * (1 - inputs.reservePoolPct);
    const avgCheck = inputs.averageCheckSizes[stage.stage];

    if (!avgCheck) return;

    const numCompanies = Math.floor(stageCapital / avgCheck);

    if (numCompanies < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stage allocation for ${stage.stage} ($${(stageCapital / 1e6).toFixed(2)}M after reserves) is too small for average check size ($${(avgCheck / 1e6).toFixed(2)}M). Increase stage allocation or reduce check size.`,
        path: ['stageAllocations', idx],
      });
    }
  });

  // =====================
  // FEASIBILITY CONSTRAINT 4: Total initial investments ≤ deployable capital
  // =====================
  const maxManagementFees = inputs.fundSize * inputs.managementFeeRate * inputs.managementFeeYears;
  const deployableCapital = inputs.fundSize - maxManagementFees;

  const totalInitialInvestments = inputs.stageAllocations.reduce((sum, stage) => {
    const stageCapital = inputs.fundSize * stage.allocationPct * (1 - inputs.reservePoolPct);
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    if (!avgCheck) return sum;
    const numCompanies = Math.floor(stageCapital / avgCheck);
    return sum + (numCompanies * avgCheck);
  }, 0);

  if (totalInitialInvestments > deployableCapital) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Total initial investments ($${(totalInitialInvestments / 1e6).toFixed(2)}M) exceed deployable capital ($${(deployableCapital / 1e6).toFixed(2)}M after ${inputs.managementFeeYears} years of fees). Reduce check sizes or adjust allocations.`,
      path: ['averageCheckSizes'],
    });
  }

  // =====================
  // FEASIBILITY CONSTRAINT 5: Graduation time < Exit time
  // =====================
  const stages = inputs.stageAllocations.map(s => s.stage);
  stages.forEach(stage => {
    const gradTime = inputs.monthsToGraduate[stage];
    const exitTime = inputs.monthsToExit[stage];

    if (gradTime && exitTime && gradTime >= exitTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Graduation time for ${stage} (${gradTime} months) must be less than exit time (${exitTime} months).`,
        path: ['monthsToGraduate', stage],
      });
    }
  });

  // =====================
  // WARNING: Reserve pool sanity check
  // =====================
  if (inputs.reservePoolPct > 0.5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Reserve pool (${(inputs.reservePoolPct * 100).toFixed(0)}%) is unusually high. Typical range: 20-40%.`,
      path: ['reservePoolPct'],
      fatal: false, // Warning only
    });
  }

  // =====================
  // WARNING: Preliminary reserve capacity check
  // =====================
  const estimatedReserveNeed = inputs.stageAllocations.reduce((sum, stage) => {
    const stageCapital = inputs.fundSize * stage.allocationPct * (1 - inputs.reservePoolPct);
    const avgCheck = inputs.averageCheckSizes[stage.stage];
    if (!avgCheck) return sum;
    const numCompanies = Math.floor(stageCapital / avgCheck);
    const estimatedFollowOn = avgCheck * 2; // Heuristic: 2x initial check
    return sum + (numCompanies * estimatedFollowOn);
  }, 0);

  const reservePool = inputs.fundSize * inputs.reservePoolPct;

  if (estimatedReserveNeed > reservePool * 1.2) { // 20% buffer
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Estimated reserve need ($${(estimatedReserveNeed / 1e6).toFixed(2)}M at 2x initial checks) may exceed reserve pool ($${(reservePool / 1e6).toFixed(2)}M). Consider increasing reservePoolPct.`,
      path: ['reservePoolPct'],
      fatal: false, // Warning only
    });
  }
});

export type FundModelInputs = z.infer<typeof FundModelInputsSchema>;

// =====================
// OUTPUTS
// =====================

export const PeriodResultSchema = z.object({
  periodIndex: z.number().int().nonnegative(),
  periodStart: z.string().datetime()
    .describe('ISO 8601 date string'),
  periodEnd: z.string().datetime()
    .describe('ISO 8601 date string'),

  // Cash flows (all fields required for invariants)
  contributions: z.number().nonnegative()
    .describe('Capital called from LPs this period'),

  investments: z.number().nonnegative()
    .describe('Capital deployed into companies this period'),

  managementFees: z.number().nonnegative()
    .describe('Management fees paid this period'),

  exitProceeds: z.number().nonnegative()
    .describe('Cash received from company exits this period'),

  distributions: z.number().nonnegative()
    .describe('Cash distributed to LPs this period'),

  unrealizedPnl: z.number()
    .describe('Mark-to-market gains/losses (can be negative)'),

  // Ending balances
  nav: z.number().nonnegative()
    .describe('Net Asset Value end-of-period'),

  // Performance metrics
  tvpi: z.number().nonnegative()
    .describe('Total Value to Paid-In: (cumulative distributions + NAV) / cumulative contributions'),

  dpi: z.number().nonnegative()
    .describe('Distributions to Paid-In: cumulative distributions / cumulative contributions'),

  irrAnnualized: z.number()
    .describe('Internal Rate of Return (XIRR, annualized %)'),
});

export type PeriodResult = z.infer<typeof PeriodResultSchema>;

export const CompanyResultSchema = z.object({
  companyId: z.string(),
  stageAtEntry: StageSchema,
  initialInvestment: z.number().nonnegative(),
  followOnInvestment: z.number().nonnegative(),
  totalInvested: z.number().nonnegative(),
  ownershipAtExit: z.number().min(0).max(1),
  exitBucket: z.enum(['failure', 'acquired', 'ipo', 'secondary']),
  exitValue: z.number().nonnegative(),
  proceedsToFund: z.number().nonnegative(),
});

export type CompanyResult = z.infer<typeof CompanyResultSchema>;

export const FundModelOutputsSchema = z.object({
  periodResults: z.array(PeriodResultSchema),
  companyLedger: z.array(CompanyResultSchema),
  kpis: z.object({
    tvpi: z.number().nonnegative()
      .describe('Total Value to Paid-In: (cumulative distributions + ending NAV) / cumulative contributions'),

    dpi: z.number().nonnegative()
      .describe('Distributions to Paid-In: cumulative distributions / cumulative contributions'),

    irrAnnualized: z.number()
      .describe('Internal Rate of Return (XIRR, annualized %)'),
  }),
});

export type FundModelOutputs = z.infer<typeof FundModelOutputsSchema>;
