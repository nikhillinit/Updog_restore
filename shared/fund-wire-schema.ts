import { z } from 'zod';
import { nonNegative, percent100, bounded01 } from './schema-helpers';

// Enhanced follow-on rule schema for capital-first modeling
export const FollowOnRuleSchema = z.object({
  from: z.enum(['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus']),
  to: z.enum(['preseed', 'seed', 'series_a', 'series_b', 'series_c', 'series_dplus']),
  mode: z.enum(['fixed_check', 'maintain_ownership']),
  participationPct: percent100(), // 0-100%
  fixedAmount: z.number().positive().optional(), // if fixed_check mode
  targetOwnershipPct: percent100().optional(), // if maintain_ownership mode
  nextRoundSize: z.number().positive().optional(), // for ownership calculations
});

// Stage allocation schema
export const StageAllocationSchema = z.object({
  id: z.string(),
  category: z.string().min(1),
  percentage: percent100(),
});

// Stage progression schema with validation constraints
export const StageSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  graduationRate: percent100(), // percentage
  exitRate: percent100(), // percentage
});

// Core fund wire schema with optimistic locking
export const fundModelWireSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(), // Optimistic locking version
  name: z.string().min(1),
  currency: z.literal('USD'),
  waterfall: z.literal('american'),
  model_version: z.number().int().default(1),
  state: z.object({
    foundation: z.object({
      startDate: z.string(),
      termMonths: z.number().nullable(),
    }),
    capital: z.object({
      totalCommitment: z.number().positive(),
    }),
    fees: z.object({
      managementFee: bounded01(), // decimal (e.g., 0.02 = 2%)
      carryPercentage: bounded01(), // decimal (e.g., 0.20 = 20%)
    }),
    investmentStrategy: z.object({
      allocations: z.array(StageAllocationSchema),
      stages: z.array(StageSchema),
    }),
    followOnRules: z.array(FollowOnRuleSchema).optional(),
  }),
})
.refine(
  (data) => {
    // Validation: Allocation sum ≤ 100%
    const totalAllocation = data.state.investmentStrategy.allocations
      .reduce((sum, alloc) => sum + alloc.percentage, 0);
    return totalAllocation <= 100.01; // Allow tiny floating point tolerance
  },
  {
    message: "Total allocation percentages cannot exceed 100%",
    path: ["state", "investmentStrategy", "allocations"],
  }
)
.refine(
  (data) => {
    // Validation: Each stage graduation + exit ≤ 100%
    return data.state.investmentStrategy.stages.every(stage =>
      (stage.graduationRate + stage.exitRate) <= 100.01 // Floating point tolerance
    );
  },
  {
    message: "For each stage, graduation rate + exit rate cannot exceed 100%",
    path: ["state", "investmentStrategy", "stages"],
  }
)
.refine(
  (data) => {
    // Validation: Last stage graduation rate must be 0
    const stages = data.state.investmentStrategy.stages;
    if (stages.length > 0) {
      const lastStage = stages[stages.length - 1];
      return lastStage?.graduationRate === 0;
    }
    return true;
  },
  {
    message: "Last stage must have graduation rate of 0% (final stage)",
    path: ["state", "investmentStrategy", "stages"],
  }
);

export type FundModelWire = z.infer<typeof fundModelWireSchema>;
export type FollowOnRule = z.infer<typeof FollowOnRuleSchema>;
export type StageAllocation = z.infer<typeof StageAllocationSchema>;
export type Stage = z.infer<typeof StageSchema>;

// Helper function for capital-first follow-on calculations
export function initialCountBalanced(
  budgetStage: number,
  initialCheck: number,
  gradPct: number,
  partPct: number,
  followOnPerDeal: number
): number {
  const g = (gradPct / 100) * (partPct / 100);
  const denom = initialCheck + g * followOnPerDeal;
  return denom > 0 ? budgetStage / denom : 0; // fractional is OK, guards division by zero
}

// Validation helper for demo safety
export function validateFundModelSafe(data: unknown): { success: boolean; data?: FundModelWire; error?: string } {
  try {
    const result = fundModelWireSchema.safeParse(data);
    if (!result.success) {
      return {
        success: false,
        error: `Validation failed: ${result.error.message}`
      };
    }
    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    return {
      success: false,
      error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}