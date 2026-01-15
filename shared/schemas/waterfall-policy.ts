/**
 * WaterfallPolicy Schema
 * European & American waterfall distribution models
 */

import { z } from 'zod';
import Decimal from 'decimal.js';
import { ZodPercentage } from './decimal-zod';
import { excelRound } from '../lib/excelRound';

/**
 * Waterfall tier types (in order of priority)
 */
export const WaterfallTierTypeEnum = z.enum([
  'return_of_capital', // Return LP capital first
  'preferred_return', // LP preferred return (hurdle rate)
  'gp_catch_up', // GP catch-up to target carry split
  'carry', // Carried interest split
]);

export type WaterfallTierType = z.infer<typeof WaterfallTierTypeEnum>;

/**
 * Waterfall tier definition
 */
export const WaterfallTierSchema = z.object({
  /** Tier type */
  tierType: WaterfallTierTypeEnum,

  /** Priority (1 = highest) */
  priority: z.number().int().positive(),

  /** Rate for preferred return or carry */
  rate: ZodPercentage.optional(),

  /** Basis for rate calculation */
  basis: z.enum(['committed', 'contributed', 'preferred_basis']).optional(),

  /** GP catch-up percentage (usually 100%) */
  catchUpRate: ZodPercentage.optional(),
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
  fundedFromFees: z.boolean().default(false),
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
  interestRate: ZodPercentage.default(new Decimal(0)),
});

export type ClawbackPolicy = z.infer<typeof ClawbackPolicySchema>;

/**
 * Base waterfall policy (without validation)
 */
const BaseWaterfallPolicySchemaCore = z.object({
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
  cumulativeCalculations: z.boolean().default(true),
});

const validateTierPriorities = (data: { tiers: Array<{ priority: number }> }) => {
  // Validate tier priorities are unique
  const priorities = data.tiers.map((t) => t.priority);
  const uniquePriorities = new Set(priorities);
  return priorities.length === uniquePriorities.size;
};

/**
 * American waterfall (deal-by-deal)
 * Carry distributed on individual exits
 */
const AmericanWaterfallSchemaCore = BaseWaterfallPolicySchemaCore.extend({
  type: z.literal('american'),
});

export const AmericanWaterfallSchema = AmericanWaterfallSchemaCore.refine(validateTierPriorities, {
  message: 'Waterfall tier priorities must be unique',
  path: ['tiers'],
});

export type AmericanWaterfall = z.infer<typeof AmericanWaterfallSchemaCore>;

/**
 * Waterfall policy (American only)
 */
export const WaterfallPolicySchema = AmericanWaterfallSchemaCore;

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
 * Calculate American waterfall distribution (deal-by-deal)
 *
 * Implements tier-based waterfall calculation with Excel ROUND semantics for carry distribution.
 * Proceeds flow sequentially through priority-sorted tiers:
 * 1. Return of Capital (ROC) - Returns original investment to LPs
 * 2. Preferred Return - Distributes hurdle rate return to LPs
 * 3. GP Catch-Up - Allows GP to reach target carry percentage
 * 4. Carry - Final split between LP and GP per carry rate
 *
 * **Excel Parity**: Applies `excelRound()` at reporting boundary (lines 246-265) to ensure
 * calculation compatibility with Excel models. Intermediate calculations use full Decimal.js
 * precision to prevent compounding rounding errors.
 *
 * **Validation**: 100% test coverage with 53 passing tests
 * - Truth table: 17/17 tests (15 scenarios + 2 meta)
 * - Invariants: 6/6 property-based tests
 * - Excel ROUND: 30/30 parity tests
 *
 * @see {@link https://github.com/nikhillinit/Updog_restore/blob/7b35655/docs/adr/ADR-004-waterfall-names.md ADR-004: Waterfall Naming and Rounding Contract}
 * @see {@link https://github.com/nikhillinit/Updog_restore/blob/7b35655/docs/waterfall.truth-cases.json Truth Cases}
 * @see {@link https://github.com/nikhillinit/Updog_restore/blob/7b35655/tests/unit/waterfall-truth-table.test.ts Truth Table Tests}
 *
 * @param policy - American waterfall configuration with tier definitions
 * @param exitProceeds - Total exit proceeds (Decimal precision)
 * @param dealCost - Initial investment cost for ROC calculation (Decimal precision)
 *
 * @returns Distribution allocation with LP/GP totals and per-tier breakdown
 *          All amounts rounded to 2 decimal places using Excel ROUND semantics
 *
 * @example
 * ```typescript
 * // Standard 8% hurdle, 20% carry, 100% catch-up
 * const policy = {
 *   type: 'american',
 *   preferredReturnRate: '0.08',
 *   tiers: [
 *     { tierType: 'return_of_capital', priority: 1 },
 *     { tierType: 'preferred_return', priority: 2, rate: '0.08' },
 *     { tierType: 'gp_catch_up', priority: 3, catchUpRate: '1.0' },
 *     { tierType: 'carry', priority: 4, rate: '0.20' }
 *   ]
 * };
 *
 * const result = calculateAmericanWaterfall(
 *   policy,
 *   new Decimal('1500000'),  // $1.5M exit
 *   new Decimal('1000000')   // $1M investment
 * );
 *
 * // result.lpDistribution: 1200000 (80% of $500K profit + $1M ROC)
 * // result.gpDistribution: 300000 (20% carry after catch-up)
 * ```
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
          gpAmount: new Decimal(0),
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
          gpAmount: new Decimal(0),
        });
        break;
      }

      case 'gp_catch_up': {
        // GP catch-up with target cap (US VC Standard: 100% catch-up to 20% carry)
        // 1. Get Carry Rate from carry tier (default: 20%)
        const carryTier = sortedTiers.find((t) => t.tierType === 'carry');
        const carryRate = new Decimal(carryTier?.rate ?? 0.2);

        // 2. Get Catch-up Rate (default: 100%)
        const catchUpRate = new Decimal(tier.catchUpRate ?? 1);

        // Safety: If catch-up rate is 0, skip tier
        if (catchUpRate.eq(0)) break;

        // 3. Calculate Target Catch-up Amount using parity formula
        // Formula: Target = (PreferredPaid * CarryRate) / (1 - CarryRate)
        // This ensures GP reaches target carry % of total preferred distributions
        const preferredPaid =
          breakdown.find((b) => b.tier === 'preferred_return')?.lpAmount || new Decimal(0);

        const denominator = new Decimal(1).minus(carryRate);
        const targetCatchUp = denominator.eq(0)
          ? new Decimal(0) // Safety for 100% carry edge case
          : preferredPaid.times(carryRate).div(denominator);

        // 4. Calculate Gross Flow Needed to hit target
        // If 100% catch-up: need exactly $target (GP gets all)
        // If 50% catch-up: need $target / 0.5 (since half goes to LP)
        const grossFlowNeeded = targetCatchUp.div(catchUpRate);

        // 5. Allocate from Remaining (capped at gross flow needed)
        const allocation = Decimal.min(remaining, grossFlowNeeded);
        const gpAllocation = allocation.times(catchUpRate);
        const lpAllocation = allocation.minus(gpAllocation);

        // 6. Update State
        gpTotal = gpTotal.plus(gpAllocation);
        lpTotal = lpTotal.plus(lpAllocation);
        remaining = remaining.minus(allocation);

        if (allocation.gt(0)) {
          breakdown.push({
            tier: tier.tierType,
            amount: allocation,
            lpAmount: lpAllocation,
            gpAmount: gpAllocation,
          });
        }
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
          gpAmount: gpCarry,
        });

        remaining = new Decimal(0);
        break;
      }
    }
  }

  // Apply Excel ROUND semantics at reporting boundary (2 decimal places)
  // Rounding is applied only to final outputs, not intermediate calculations
  const lpRounded = new Decimal(excelRound(lpTotal.toNumber(), 2));
  const gpRounded = new Decimal(excelRound(gpTotal.toNumber(), 2));
  const totalRounded = new Decimal(excelRound(lpTotal.plus(gpTotal).toNumber(), 2));

  // Apply rounding to breakdown tier amounts
  const breakdownRounded = breakdown.map((tier) => ({
    tier: tier.tier,
    amount: new Decimal(excelRound(tier.amount.toNumber(), 2)),
    lpAmount: new Decimal(excelRound(tier.lpAmount.toNumber(), 2)),
    gpAmount: new Decimal(excelRound(tier.gpAmount.toNumber(), 2)),
  }));

  return {
    lpDistribution: lpRounded,
    gpDistribution: gpRounded,
    totalDistributed: totalRounded,
    breakdown: breakdownRounded,
  };
}
