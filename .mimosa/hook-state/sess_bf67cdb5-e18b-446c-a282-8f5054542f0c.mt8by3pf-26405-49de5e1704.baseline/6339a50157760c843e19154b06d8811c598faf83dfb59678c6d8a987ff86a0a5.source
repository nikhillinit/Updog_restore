/**
 * US Early-Stage VC Waterfall Standard Tests
 *
 * Validates GP catch-up behavior against US VC industry standard:
 * - 8% preferred return (hurdle)
 * - 20% carried interest
 * - 100% GP catch-up to target carry percentage
 *
 * The catch-up target formula:
 *   targetCatchUp = (preferredPaid * carryRate) / (1 - carryRate)
 *
 * This ensures GP reaches exactly carryRate% of total profits after catch-up.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateAmericanWaterfall,
  type AmericanWaterfall,
  type WaterfallTierType,
} from '../../shared/schemas/waterfall-policy';

describe('US Early-Stage VC Waterfall (Standard 8/20)', () => {
  const createStandardPolicy = (overrides?: Partial<AmericanWaterfall>): AmericanWaterfall => ({
    id: 'us-vc-standard',
    name: 'US VC Standard',
    type: 'american',
    preferredReturnRate: new Decimal(0.08),
    hurdleRateBasis: 'contributed',
    cumulativeCalculations: true,
    tiers: [
      { tierType: 'return_of_capital' as WaterfallTierType, priority: 1 },
      { tierType: 'preferred_return' as WaterfallTierType, priority: 2, rate: new Decimal(0.08) },
      { tierType: 'gp_catch_up' as WaterfallTierType, priority: 3, catchUpRate: new Decimal(1) },
      { tierType: 'carry' as WaterfallTierType, priority: 4, rate: new Decimal(0.2) },
    ],
    ...overrides,
  });

  describe('GP Catch-up Target Cap', () => {
    it('caps GP catch-up at parity target for standard 20% carry', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_500_000);

      // Expected calculation:
      // 1. ROC: $1M to LP
      // 2. Pref (8%): $80K to LP
      // 3. Catch-up target: $80K * 0.20 / 0.80 = $20K to GP
      // 4. Remaining: $400K split 80/20 = LP $320K, GP $80K
      // Totals: LP = $1M + $80K + $320K = $1.4M, GP = $20K + $80K = $100K

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      expect(result.lpDistribution.toNumber()).toBeCloseTo(1_400_000, 0);
      expect(result.gpDistribution.toNumber()).toBeCloseTo(100_000, 0);

      // Verify GP gets exactly 20% of profits ($500K * 0.20 = $100K)
      const profit = exitProceeds.minus(dealCost);
      const gpPercentOfProfit = result.gpDistribution.div(profit);
      expect(gpPercentOfProfit.toNumber()).toBeCloseTo(0.2, 2);
    });

    it('handles large exits correctly - GP gets ~20% of profits, not 99%', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(10_000_000);
      const exitProceeds = new Decimal(100_000_000);

      // Expected calculation:
      // 1. ROC: $10M to LP
      // 2. Pref (8%): $800K to LP
      // 3. Catch-up target: $800K * 0.20 / 0.80 = $200K to GP
      // 4. Remaining: $89M split 80/20 = LP $71.2M, GP $17.8M
      // Totals: LP = $10M + $0.8M + $71.2M = $82M, GP = $0.2M + $17.8M = $18M

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // GP should get approximately 20% of $90M profits = $18M
      const profit = exitProceeds.minus(dealCost);
      const expectedGp = profit.times(0.2);

      expect(result.gpDistribution.toNumber()).toBeCloseTo(expectedGp.toNumber(), -4); // Within $10K
      expect(result.lpDistribution.toNumber()).toBeCloseTo(82_000_000, -4);

      // Critical: GP should NOT get 99% of profits (the bug)
      const gpPercentOfProfit = result.gpDistribution.div(profit);
      expect(gpPercentOfProfit.toNumber()).toBeLessThan(0.25); // Must be close to 20%, not 99%
    });

    it('verifies parity formula: GP/(LP_pref + GP) = carry_rate', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_500_000);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Find catch-up and preferred breakdown entries
      const catchUpEntry = result.breakdown.find((b) => b.tier === 'gp_catch_up');
      const prefEntry = result.breakdown.find((b) => b.tier === 'preferred_return');

      if (catchUpEntry && prefEntry) {
        // Parity check: GP_catchup / (LP_pref + GP_catchup) should equal carry_rate
        const gpCatchUp = catchUpEntry.gpAmount;
        const lpPref = prefEntry.lpAmount;
        const parityRatio = gpCatchUp.div(lpPref.plus(gpCatchUp));

        expect(parityRatio.toNumber()).toBeCloseTo(0.2, 2); // Should be 20%
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles zero hurdle (no preferred return)', () => {
      const policy = createStandardPolicy({
        preferredReturnRate: new Decimal(0),
        tiers: [
          { tierType: 'return_of_capital' as WaterfallTierType, priority: 1 },
          { tierType: 'preferred_return' as WaterfallTierType, priority: 2, rate: new Decimal(0) },
          {
            tierType: 'gp_catch_up' as WaterfallTierType,
            priority: 3,
            catchUpRate: new Decimal(1),
          },
          { tierType: 'carry' as WaterfallTierType, priority: 4, rate: new Decimal(0.2) },
        ],
      });

      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_500_000);

      // With zero hurdle: no preferred, so catch-up target = 0
      // All $500K profit goes to carry split 80/20
      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // GP should get 20% of $500K = $100K (no catch-up needed)
      expect(result.gpDistribution.toNumber()).toBeCloseTo(100_000, 0);
      expect(result.lpDistribution.toNumber()).toBeCloseTo(1_400_000, 0);
    });

    it('handles 50% partial catch-up rate', () => {
      const policy = createStandardPolicy({
        tiers: [
          { tierType: 'return_of_capital' as WaterfallTierType, priority: 1 },
          {
            tierType: 'preferred_return' as WaterfallTierType,
            priority: 2,
            rate: new Decimal(0.08),
          },
          {
            tierType: 'gp_catch_up' as WaterfallTierType,
            priority: 3,
            catchUpRate: new Decimal(0.5),
          }, // 50% catch-up
          { tierType: 'carry' as WaterfallTierType, priority: 4, rate: new Decimal(0.2) },
        ],
      });

      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_200_000);

      // With 50% catch-up: GP gets 50% of catch-up distributions, LP gets 50%
      // Catch-up target still $20K for GP, but needs $40K gross flow
      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Verify catch-up entry has both LP and GP amounts
      const catchUpEntry = result.breakdown.find((b) => b.tier === 'gp_catch_up');
      if (catchUpEntry) {
        expect(catchUpEntry.lpAmount.toNumber()).toBeGreaterThan(0);
        expect(catchUpEntry.gpAmount.toNumber()).toBeGreaterThan(0);
      }
    });

    it('handles insufficient proceeds for full catch-up', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_090_000); // Only $10K above hurdle

      // ROC: $1M, Pref: $80K, Remaining: $10K
      // Catch-up target: $20K, but only $10K available
      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // GP should get all $10K remaining (partial catch-up)
      const catchUpEntry = result.breakdown.find((b) => b.tier === 'gp_catch_up');
      expect(catchUpEntry?.gpAmount.toNumber()).toBe(10_000);

      // No carry tier should be reached
      const carryEntry = result.breakdown.find((b) => b.tier === 'carry');
      expect(carryEntry).toBeUndefined();
    });
  });

  describe('Invariants', () => {
    it('total distributed equals exit proceeds', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(2_000_000);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      expect(result.totalDistributed.toNumber()).toBeCloseTo(exitProceeds.toNumber(), 0);
    });

    it('LP + GP equals total distributed', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_500_000);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      const sum = result.lpDistribution.plus(result.gpDistribution);
      expect(sum.toNumber()).toBeCloseTo(result.totalDistributed.toNumber(), 0);
    });

    it('breakdown tier amounts sum to total', () => {
      const policy = createStandardPolicy();
      const dealCost = new Decimal(1_000_000);
      const exitProceeds = new Decimal(1_500_000);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      const breakdownSum = result.breakdown.reduce(
        (sum, entry) => sum.plus(entry.amount),
        new Decimal(0)
      );

      expect(breakdownSum.toNumber()).toBeCloseTo(result.totalDistributed.toNumber(), 0);
    });
  });
});
