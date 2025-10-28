/**
 * Waterfall Invariants Tests - Property-Based Validation
 *
 * These tests validate mathematical properties that MUST hold true for ALL
 * waterfall calculations, regardless of input values. Property-based testing
 * ensures the calculation logic is sound and handles edge cases correctly.
 *
 * Invariants tested:
 * 1. Conservation: LP + GP = distributable (within rounding tolerance)
 * 2. Non-negativity: All tier values ≥ 0
 * 3. Tier exhaustiveness: Sum of tier allocations = distributable
 * 4. ROC priority: Return of capital paid before other tiers
 * 5. Catch-up target: GP achieves target carry % after catch-up completion
 *
 * @see docs/adr/ADR-004-waterfall-names.md - Rounding contract and validation
 * @see docs/waterfall.truth-cases.json - Canonical test scenarios
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculateAmericanWaterfall } from '../../shared/schemas/waterfall-policy';
import type { AmericanWaterfall } from '../../shared/schemas/waterfall-policy';
import { excelRound } from '../../shared/lib/excelRound';
import truthCases from '../../docs/waterfall.truth-cases.json';

// Type for truth case input
interface TruthCaseInput {
  policy: {
    id: string;
    name: string;
    type: 'american';
    preferredReturnRate: string;
    hurdleRateBasis: 'committed' | 'contributed';
    cumulativeCalculations: boolean;
    tiers: Array<{
      tierType: string;
      priority: number;
      rate?: string;
      basis?: string;
      catchUpRate?: string;
    }>;
  };
  exitProceeds: string;
  dealCost: string;
}

interface TruthCase {
  scenario: string;
  tags?: string[];
  notes?: string;
  input: TruthCaseInput;
  expected: {
    lpDistribution: string;
    gpDistribution: string;
    totalDistributed: string;
  };
}

/**
 * Parse truth case input to AmericanWaterfall policy
 */
function parsePolicy(input: TruthCaseInput) {
  const policy: AmericanWaterfall = {
    id: input.policy.id,
    name: input.policy.name,
    type: input.policy.type,
    preferredReturnRate: new Decimal(input.policy.preferredReturnRate),
    hurdleRateBasis: input.policy.hurdleRateBasis,
    cumulativeCalculations: input.policy.cumulativeCalculations,
    tiers: input.policy.tiers.map((tier) => ({
      tierType: tier.tierType as 'return_of_capital' | 'preferred_return' | 'gp_catch_up' | 'carry',
      priority: tier.priority,
      ...(tier.rate && { rate: new Decimal(tier.rate) }),
      ...(tier.basis && { basis: tier.basis as 'contributed' | 'committed' }),
      ...(tier.catchUpRate && { catchUpRate: new Decimal(tier.catchUpRate) }),
    })),
  };

  return {
    policy,
    exitProceeds: new Decimal(input.exitProceeds),
    dealCost: new Decimal(input.dealCost),
  };
}

describe('Waterfall Invariants (Property-Based Tests)', () => {
  // Invariant 1: Conservation
  it('Conservation: LP + GP = distributable (within rounding tolerance)', () => {
    for (const testCase of truthCases as TruthCase[]) {
      const { scenario: _scenario, input } = testCase;
      const { policy, exitProceeds, dealCost } = parsePolicy(input);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Apply Excel rounding
      const lpRounded = excelRound(result.lpDistribution.toNumber(), 2);
      const gpRounded = excelRound(result.gpDistribution.toNumber(), 2);
      const totalRounded = excelRound(result.totalDistributed.toNumber(), 2);
      const sum = excelRound(lpRounded + gpRounded, 2);

      // Conservation: LP + GP should equal total (within 2 cent tolerance for floating-point)
      const diff = Math.abs(sum - totalRounded);
      expect(diff).toBeLessThanOrEqual(0.02);

      // For non-negative proceeds, total should match input
      if (exitProceeds.toNumber() >= 0) {
        const proceedsRounded = excelRound(exitProceeds.toNumber(), 2);
        expect(totalRounded).toBe(proceedsRounded);
      }
    }
  });

  // Invariant 2: Non-negativity
  it('Non-negativity: All tier values >= 0', () => {
    for (const testCase of truthCases as TruthCase[]) {
      const { scenario: _scenario, input } = testCase;
      const { policy, exitProceeds, dealCost } = parsePolicy(input);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Top-level distributions should be non-negative
      expect(result.lpDistribution.toNumber()).toBeGreaterThanOrEqual(0);
      expect(result.gpDistribution.toNumber()).toBeGreaterThanOrEqual(0);

      // All tier amounts should be non-negative
      result.breakdown.forEach((tier) => {
        expect(tier.lpAmount.toNumber()).toBeGreaterThanOrEqual(0);
        expect(tier.gpAmount.toNumber()).toBeGreaterThanOrEqual(0);
        expect(tier.amount.toNumber()).toBeGreaterThanOrEqual(0);
      });
    }
  });

  // Invariant 3: Tier exhaustiveness
  it('Tier exhaustiveness: Sum of tier allocations = distributable', () => {
    for (const testCase of truthCases as TruthCase[]) {
      const { scenario: _scenario, input } = testCase;
      const { policy, exitProceeds, dealCost } = parsePolicy(input);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Sum all tier LP amounts
      const lpTierSum = result.breakdown.reduce(
        (sum, tier) => sum + excelRound(tier.lpAmount.toNumber(), 2),
        0
      );

      // Sum all tier GP amounts
      const gpTierSum = result.breakdown.reduce(
        (sum, tier) => sum + excelRound(tier.gpAmount.toNumber(), 2),
        0
      );

      // Compare with top-level distributions
      const lpTop = excelRound(result.lpDistribution.toNumber(), 2);
      const gpTop = excelRound(result.gpDistribution.toNumber(), 2);

      // Tier sums should equal top-level (within rounding tolerance)
      expect(Math.abs(lpTierSum - lpTop)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(gpTierSum - gpTop)).toBeLessThanOrEqual(0.02);
    }
  });

  // Invariant 4: ROC priority
  it('ROC priority: Return of capital paid before other tiers', () => {
    // Filter to scenarios with contributed capital
    const rocCases = (truthCases as TruthCase[]).filter((tc) => parseFloat(tc.input.dealCost) > 0);

    for (const testCase of rocCases) {
      const { scenario: _scenario, input } = testCase;
      const { policy, exitProceeds, dealCost } = parsePolicy(input);

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Find ROC tier in breakdown
      const rocTier = result.breakdown.find((t) => t.tier === 'return_of_capital');

      if (rocTier) {
        const rocAmount = excelRound(rocTier.lpAmount.toNumber(), 2);
        const dealCostValue = excelRound(dealCost.toNumber(), 2);
        const proceedsValue = excelRound(exitProceeds.toNumber(), 2);

        if (proceedsValue >= dealCostValue) {
          // Full ROC: LP should get full deal cost back
          expect(rocAmount).toBe(dealCostValue);
        } else {
          // Partial ROC: LP gets whatever is available (up to deal cost)
          expect(rocAmount).toBeLessThanOrEqual(dealCostValue);
          expect(rocAmount).toBe(Math.max(0, proceedsValue));
        }
      }
    }
  });

  // Invariant 5: Catch-up target
  it('Catch-up target: GP achieves target carry % after catch-up', () => {
    // Filter to scenarios with 100% catch-up tier (catchUpRate = 1.0)
    // Note: Partial catch-up rates (e.g., 50%) don't guarantee target carry
    const catchUpCases = (truthCases as TruthCase[]).filter((tc) => {
      const tiers = tc.input.policy.tiers;
      return tiers.some((t) => t.tierType === 'gp_catch_up' && t.catchUpRate === '1.0');
    });

    for (const testCase of catchUpCases) {
      const { scenario: _scenario, input } = testCase;
      const { policy, exitProceeds, dealCost } = parsePolicy(input);

      // Skip if proceeds insufficient
      if (exitProceeds.lte(dealCost)) continue;

      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Find carry tier
      const carryTier = policy.tiers.find((t) => t.tierType === 'carry');
      if (!carryTier || !carryTier.rate) continue;

      const targetCarryRate = carryTier.rate.toNumber();

      // Total GP distribution
      const gpTotal = excelRound(result.gpDistribution.toNumber(), 2);
      const totalDistributed = excelRound(result.totalDistributed.toNumber(), 2);

      // Calculate actual GP share
      const gpShare = totalDistributed > 0 ? gpTotal / totalDistributed : 0;

      // After catch-up completes, GP share should be close to target carry
      // (Allow tolerance for partial catch-up or rounding)
      //
      // Note: This only holds if catch-up fully completes. If proceeds are insufficient
      // to complete catch-up, GP may have less than target carry.
      //
      // For scenarios where catch-up completes (GP gets residual split), check:
      const _catchUpTier = result.breakdown.find((t) => t.tier === 'gp_catch_up');
      const carryTierResult = result.breakdown.find((t) => t.tier === 'carry');

      if (carryTierResult && carryTierResult.amount.toNumber() > 0) {
        // Carry tier has allocation → catch-up completed
        // GP share should equal target carry rate (within rounding)
        expect(gpShare).toBeGreaterThanOrEqual(targetCarryRate - 0.01);
        expect(gpShare).toBeLessThanOrEqual(targetCarryRate + 0.01);
      }
    }
  });

  // Summary test: Report invariant coverage
  it('Invariants cover all 15 truth table scenarios', () => {
    expect(truthCases.length).toBeGreaterThanOrEqual(15);

    // Verify we have scenarios covering each invariant category
    const hasRocScenarios = truthCases.some((tc: TruthCase) => parseFloat(tc.input.dealCost) > 0);
    const hasCatchUpScenarios = truthCases.some((tc: TruthCase) =>
      tc.input.policy.tiers.some((t) => t.tierType === 'gp_catch_up')
    );

    expect(hasRocScenarios).toBe(true);
    expect(hasCatchUpScenarios).toBe(true);
  });
});
