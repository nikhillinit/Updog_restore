/**
 * Waterfall Truth Table Tests - American Waterfall with Tier-Based API
 *
 * These tests validate the `calculateAmericanWaterfall()` function against
 * 15 canonical scenarios covering baseline, edge cases, and stress tests.
 *
 * Truth cases are mechanically validated against JSON schema (AJV) to ensure
 * structural consistency before execution.
 *
 * Excel ROUND semantics are applied at reporting boundaries (not mid-calculation)
 * to ensure parity with Excel-based financial models.
 *
 * @see docs/waterfall.truth-cases.json - Canonical test scenarios
 * @see docs/schemas/waterfall-truth-case.schema.json - AJV schema
 * @see docs/adr/ADR-004-waterfall-names.md - Rounding contract and validation
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculateAmericanWaterfall } from '../../shared/schemas/waterfall-policy';
import type { AmericanWaterfall, WaterfallTierType } from '../../shared/schemas/waterfall-policy';
import { excelRound } from '../../shared/lib/excelRound';
import { validate } from '../utils/validate-truth-cases';
import truthCases from '../../docs/waterfall.truth-cases.json';

// Type definitions for truth case structure
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

interface TruthCaseExpected {
  lpDistribution: string;
  gpDistribution: string;
  totalDistributed: string;
  breakdown?: Array<{
    tier: string;
    lpAmount: string;
    gpAmount: string;
  }>;
}

interface TruthCase {
  scenario: string;
  tags?: string[];
  notes?: string;
  input: TruthCaseInput;
  expected: TruthCaseExpected;
}

/**
 * Convert JSON truth case input to AmericanWaterfall policy type
 * Handles Decimal conversions and type coercion
 */
function parsePolicyInput(input: TruthCaseInput): {
  policy: AmericanWaterfall;
  exitProceeds: Decimal;
  dealCost: Decimal;
} {
  const policy: AmericanWaterfall = {
    id: input.policy.id,
    name: input.policy.name,
    type: input.policy.type,
    preferredReturnRate: new Decimal(input.policy.preferredReturnRate),
    hurdleRateBasis: input.policy.hurdleRateBasis,
    cumulativeCalculations: input.policy.cumulativeCalculations,
    tiers: input.policy.tiers.map((tier) => ({
      tierType: tier.tierType as WaterfallTierType,
      priority: tier.priority,
      ...(tier.rate !== undefined && { rate: new Decimal(tier.rate) }),
      ...(tier.basis !== undefined && {
        basis: tier.basis as 'committed' | 'contributed' | 'preferred_basis',
      }),
      ...(tier.catchUpRate !== undefined && { catchUpRate: new Decimal(tier.catchUpRate) }),
    })),
  };

  return {
    policy,
    exitProceeds: new Decimal(input.exitProceeds),
    dealCost: new Decimal(input.dealCost),
  };
}

describe('Waterfall Truth Table (American, Tier-Based API)', () => {
  // Validate JSON schema before running tests
  it('truth cases JSON passes schema validation (AJV)', () => {
    expect(() => validate(truthCases)).not.toThrow();
  });

  // Run each canonical scenario
  truthCases.forEach((testCase: TruthCase) => {
    const { scenario, tags, notes, input, expected } = testCase;

    it(`${scenario}: ${notes || tags?.join(', ')}`, () => {
      // Parse input and convert to Decimal types
      const { policy, exitProceeds, dealCost } = parsePolicyInput(input);

      // Execute waterfall calculation (production code)
      const result = calculateAmericanWaterfall(policy, exitProceeds, dealCost);

      // Apply Excel rounding at reporting boundary (2 decimal places)
      const lpActual = excelRound(result.lpDistribution.toNumber(), 2);
      const gpActual = excelRound(result.gpDistribution.toNumber(), 2);
      const totalActual = excelRound(result.totalDistributed.toNumber(), 2);

      // Parse expected values
      const lpExpected = parseFloat(expected.lpDistribution);
      const gpExpected = parseFloat(expected.gpDistribution);
      const totalExpected = parseFloat(expected.totalDistributed);

      // Assertions: Top-level distribution
      expect(lpActual).toBe(lpExpected);
      expect(gpActual).toBe(gpExpected);
      expect(totalActual).toBe(totalExpected);

      // Invariant: Conservation (LP + GP = total distributed)
      // Note: Due to rounding at reporting boundaries, individual rounded amounts
      // may not sum exactly to rounded total (acceptable rounding artifact)
      // Tolerance accounts for floating-point precision (0.02 = 2 cents max deviation)
      const sumCheck = excelRound(lpActual + gpActual, 2);
      const conservationTolerance = Math.abs(sumCheck - totalActual) <= 0.02;
      expect(conservationTolerance).toBe(true);

      // Invariant: Total distributed = exit proceeds (for non-negative proceeds)
      // Note: Implementation returns 0 for negative proceeds (early break when remaining <= 0)
      const proceedsValue = parseFloat(input.exitProceeds);
      if (proceedsValue >= 0) {
        const proceedsExpected = excelRound(proceedsValue, 2);
        expect(totalActual).toBe(proceedsExpected);
      }

      // Breakdown validation (if provided in expected)
      if (expected.breakdown) {
        // Check tier count matches
        expect(result.breakdown).toHaveLength(expected.breakdown.length);

        // Validate each tier allocation
        expected.breakdown.forEach((expectedTier, idx) => {
          const actualTier = result.breakdown[idx];

          // Tier type should match
          expect(actualTier.tier).toBe(expectedTier.tier);

          // Apply Excel rounding to tier amounts
          const lpTierActual = excelRound(actualTier.lpAmount.toNumber(), 2);
          const gpTierActual = excelRound(actualTier.gpAmount.toNumber(), 2);

          const lpTierExpected = parseFloat(expectedTier.lpAmount);
          const gpTierExpected = parseFloat(expectedTier.gpAmount);

          expect(lpTierActual).toBe(lpTierExpected);
          expect(gpTierActual).toBe(gpTierExpected);
        });

        // Invariant: Sum of tier breakdowns = top-level distributions
        const lpTierSum = result.breakdown.reduce(
          (sum, tier) => sum + excelRound(tier.lpAmount.toNumber(), 2),
          0
        );
        const gpTierSum = result.breakdown.reduce(
          (sum, tier) => sum + excelRound(tier.gpAmount.toNumber(), 2),
          0
        );

        expect(excelRound(lpTierSum, 2)).toBe(lpExpected);
        expect(excelRound(gpTierSum, 2)).toBe(gpExpected);
      }
    });
  });

  // Summary test: Report coverage
  it('truth table covers all required categories', () => {
    const allTags = truthCases.flatMap((tc: TruthCase) => tc.tags || []);
    const tagSet = new Set(allTags);

    // Required categories per Phase 3 plan
    const requiredCategories = [
      'baseline',
      'rounding',
      'catch-up',
      'policy-toggle',
      'stress',
      'edge-case',
    ];

    requiredCategories.forEach((category) => {
      expect(tagSet.has(category)).toBe(true);
    });

    // Report total scenarios
    expect(truthCases.length).toBeGreaterThanOrEqual(15);
  });
});
