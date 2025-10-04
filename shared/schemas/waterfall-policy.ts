/**
 * WaterfallPolicy Schema
 * European & American waterfall distribution models
 */

import { z } from 'zod';
import Decimal from 'decimal.js';
import { ZodDecimal, ZodPercentage, ZodPositiveDecimal } from './decimal-zod';

/**
 * Waterfall tier types (in order of priority)
 */
export const WaterfallTierType = z.enum([
  'return_of_capital',    // Return LP capital first
  'preferred_return',     // LP preferred return (hurdle rate)
  'gp_catch_up',         // GP catch-up to target carry split
  'carry'                // Carried interest split
]);

export type WaterfallTierType = z.infer<typeof WaterfallTierType>;

/**
 * Waterfall tier definition
 */
export const WaterfallTierSchema = z.object({
  /** Tier type */
  tierType: WaterfallTierType,

  /** Priority (1 = highest) */
  priority: z.number().int().positive(),

  /** Rate for preferred return or carry */
  rate: ZodPercentage.optional(),

  /** Basis for rate calculation */
  basis: z.enum(['committed', 'contributed', 'preferred_basis']).optional(),

  /** GP catch-up percentage (usually 100%) */
  catchUpRate: ZodPercentage.optional()
});

export type WaterfallTier = z.infer<typeof WaterfallTierSchema>;

/**
 * GP commitment structure
 */
export const GPCommitmentSchema = z.object({
  /** GP commitment as % of fund */
  percentage: ZodPercentage,

  /** Basis for commitment */
  basis: z.enum(['committed_capital', 'management_fees', 'carry']),

  /** Whether GP commitment funded from fee offsets */
  fundedFromFees: z.boolean().default(false)
});

export type GPCommitment = z.infer<typeof GPCommitmentSchema>;

/**
 * Clawback policy
 */
export const ClawbackPolicySchema = z.object({
  /** Enable clawback provision */
  enabled: z.boolean(),

  /** Lookback period for clawback calculation (months) */
  lookbackMonths: z.number().int().positive().default(36),

  /** Require security/escrow for clawback */
  securityRequired: z.boolean().default(true),

  /** Interest rate on clawback amounts */
  interestRate: ZodPercentage.default(new Decimal(0))
});

export type ClawbackPolicy = z.infer<typeof ClawbackPolicySchema>;

/**
 * Base waterfall policy
 */
const BaseWaterfallPolicySchema = z.object({
  /** Policy identifier */
  id: z.string(),

  /** Human-readable name */
  name: z.string(),

  /** Waterfall tiers (ordered by priority) */
  tiers: z.array(WaterfallTierSchema).min(1),

  /** Preferred return rate (hurdle) */
  preferredReturnRate: ZodPercentage,

  /** GP commitment structure */
  gpCommitment: GPCommitmentSchema.optional(),

  /** Clawback policy */
  clawback: ClawbackPolicySchema.optional(),

  /** Basis for hurdle rate calculation */
  hurdleRateBasis: z.enum(['committed', 'contributed']).default('committed'),

  /** Use cumulative calculations across all periods */
  cumulativeCalculations: z.boolean().default(true)
}).refine(
  (data) => {
    // Validate tier priorities are unique
    const priorities = data.tiers.map(t => t.priority);
    const uniquePriorities = new Set(priorities);
    return priorities.length === uniquePriorities.size;
  },
  {
    message: 'Waterfall tier priorities must be unique',
    path: ['tiers']
  }
);

/**
 * European waterfall (fund-level)
 * All capital returned and preferred return met before any carry
 */
export const EuropeanWaterfallSchema = BaseWaterfallPolicySchema.extend({
  type: z.literal('european')
});

export type EuropeanWaterfall = z.infer<typeof EuropeanWaterfallSchema>;

/**
 * American waterfall (deal-by-deal)
 * Carry distributed on individual exits
 */
export const AmericanWaterfallSchema = BaseWaterfallPolicySchema.extend({
  type: z.literal('american')
});

export type AmericanWaterfall = z.infer<typeof AmericanWaterfallSchema>;

/**
 * Discriminated union of waterfall policies
 */
export const WaterfallPolicySchema = z.discriminatedUnion('type', [
  EuropeanWaterfallSchema,
  AmericanWaterfallSchema
]);

export type WaterfallPolicy = z.infer<typeof WaterfallPolicySchema>;

/**
 * Distribution allocation result
 */
export interface DistributionAllocation {
  lpDistribution: Decimal;
  gpDistribution: Decimal;
  totalDistributed: Decimal;
  breakdown: Array<{
    tier: WaterfallTierType;
    amount: Decimal;
    lpAmount: Decimal;
    gpAmount: Decimal;
  }>;
}

/**
 * Calculate European waterfall distribution
 */
export function calculateEuropeanWaterfall(
  policy: EuropeanWaterfall,
  totalDistributions: Decimal,
  contributedCapital: Decimal,
  cumulativeLPDistributions: Decimal,
  cumulativeGPDistributions: Decimal
): DistributionAllocation {
  const breakdown: DistributionAllocation['breakdown'] = [];
  let remaining = totalDistributions;
  let lpTotal = new Decimal(0);
  let gpTotal = new Decimal(0);

  // Sort tiers by priority
  const sortedTiers = [...policy.tiers].sort((a, b) => a.priority - b.priority);

  for (const tier of sortedTiers) {
    if (remaining.lte(0)) break;

    switch (tier.tierType) {
      case 'return_of_capital': {
        // Return contributed capital to LPs
        const unreturned = contributedCapital.minus(cumulativeLPDistributions);
        const allocation = Decimal.min(remaining, unreturned);

        lpTotal = lpTotal.plus(allocation);
        remaining = remaining.minus(allocation);

        breakdown.push({
          tier: tier.tierType,
          amount: allocation,
          lpAmount: allocation,
          gpAmount: new Decimal(0)
        });
        break;
      }

      case 'preferred_return': {
        // Calculate preferred return on contributed capital
        const targetPreferred = contributedCapital.times(policy.preferredReturnRate);
        const preferredPaid = cumulativeLPDistributions.minus(contributedCapital);
        const preferredDue = Decimal.max(
          new Decimal(0),
          targetPreferred.minus(preferredPaid)
        );
        const allocation = Decimal.min(remaining, preferredDue);

        lpTotal = lpTotal.plus(allocation);
        remaining = remaining.minus(allocation);

        breakdown.push({
          tier: tier.tierType,
          amount: allocation,
          lpAmount: allocation,
          gpAmount: new Decimal(0)
        });
        break;
      }

      case 'gp_catch_up': {
        // GP catches up to target carry percentage
        const catchUpRate = tier.catchUpRate || new Decimal(1);
        const allocation = Decimal.min(remaining, remaining.times(catchUpRate));

        gpTotal = gpTotal.plus(allocation);
        remaining = remaining.minus(allocation);

        breakdown.push({
          tier: tier.tierType,
          amount: allocation,
          lpAmount: new Decimal(0),
          gpAmount: allocation
        });
        break;
      }

      case 'carry': {
        // Split remaining between LP and GP based on carry rate
        const carryRate = tier.rate || new Decimal(0.2); // Default 20%
        const gpCarry = remaining.times(carryRate);
        const lpCarry = remaining.minus(gpCarry);

        lpTotal = lpTotal.plus(lpCarry);
        gpTotal = gpTotal.plus(gpCarry);
        remaining = new Decimal(0);

        breakdown.push({
          tier: tier.tierType,
          amount: remaining,
          lpAmount: lpCarry,
          gpAmount: gpCarry
        });
        break;
      }
    }
  }

  return {
    lpDistribution: lpTotal,
    gpDistribution: gpTotal,
    totalDistributed: lpTotal.plus(gpTotal),
    breakdown
  };
}

/**
 * Calculate American waterfall distribution (deal-by-deal)
 */
export function calculateAmericanWaterfall(
  policy: AmericanWaterfall,
  exitProceeds: Decimal,
  dealCost: Decimal
): DistributionAllocation {
  const breakdown: DistributionAllocation['breakdown'] = [];
  let remaining = exitProceeds;
  let lpTotal = new Decimal(0);
  let gpTotal = new Decimal(0);

  // Sort tiers by priority
  const sortedTiers = [...policy.tiers].sort((a, b) => a.priority - b.priority);

  for (const tier of sortedTiers) {
    if (remaining.lte(0)) break;

    switch (tier.tierType) {
      case 'return_of_capital': {
        // Return deal cost
        const allocation = Decimal.min(remaining, dealCost);

        lpTotal = lpTotal.plus(allocation);
        remaining = remaining.minus(allocation);

        breakdown.push({
          tier: tier.tierType,
          amount: allocation,
          lpAmount: allocation,
          gpAmount: new Decimal(0)
        });
        break;
      }

      case 'preferred_return': {
        // Preferred return on deal
        const targetPreferred = dealCost.times(policy.preferredReturnRate);
        const allocation = Decimal.min(remaining, targetPreferred);

        lpTotal = lpTotal.plus(allocation);
        remaining = remaining.minus(allocation);

        breakdown.push({
          tier: tier.tierType,
          amount: allocation,
          lpAmount: allocation,
          gpAmount: new Decimal(0)
        });
        break;
      }

      case 'gp_catch_up': {
        // GP catch-up
        const catchUpRate = tier.catchUpRate || new Decimal(1);
        const allocation = Decimal.min(remaining, remaining.times(catchUpRate));

        gpTotal = gpTotal.plus(allocation);
        remaining = remaining.minus(allocation);

        breakdown.push({
          tier: tier.tierType,
          amount: allocation,
          lpAmount: new Decimal(0),
          gpAmount: allocation
        });
        break;
      }

      case 'carry': {
        // Carry split
        const carryRate = tier.rate || new Decimal(0.2);
        const gpCarry = remaining.times(carryRate);
        const lpCarry = remaining.minus(gpCarry);

        lpTotal = lpTotal.plus(lpCarry);
        gpTotal = gpTotal.plus(gpCarry);

        breakdown.push({
          tier: tier.tierType,
          amount: remaining,
          lpAmount: lpCarry,
          gpAmount: gpCarry
        });

        remaining = new Decimal(0);
        break;
      }
    }
  }

  return {
    lpDistribution: lpTotal,
    gpDistribution: gpTotal,
    totalDistributed: lpTotal.plus(gpTotal),
    breakdown
  };
}
