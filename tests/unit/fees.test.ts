/**
 * Unit tests for fee calculation utilities
 *
 * Tests the unit discipline system for fee calculations to prevent
 * the critical P0 bug where percentages were mistaken for fractions.
 */

import { describe, it, expect } from 'vitest';
import {
  committedFeeDragFraction,
  committedFeeDragPctFromTiers,
  type FeeTier,
} from '@/lib/fees';
import { type Fraction } from '@shared/units';

describe('Fee Calculations - Unit Discipline', () => {
  describe('committedFeeDragFraction()', () => {
    it('returns correct fraction for simple 2% annual fee over 10 years', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 120, // 10 years
        },
      ];

      const result = committedFeeDragFraction(tiers);

      // 2% annual * 10 years = 20% total = 0.20 as fraction
      expect(result).toBe(0.20);

      // Verify it's a proper Fraction type (can be used in calculations)
      const investableCapital = 100_000_000;
      const netCapital = investableCapital * (1 - result);
      expect(netCapital).toBe(80_000_000);
    });

    it('returns correct fraction for step-down tiers (2% → 1.5%)', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-initial',
          name: 'Management Fee (2%)',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 60, // 5 years
        },
        {
          id: 'tier-step',
          name: 'Management Fee (1.5%)',
          percentage: 1.5,
          startMonth: 61,
          endMonth: 120, // 5 years
        },
      ];

      const result = committedFeeDragFraction(tiers);

      // (2% * 5 years) + (1.5% * 5 years) = 10% + 7.5% = 17.5% = 0.175
      expect(result).toBeCloseTo(0.175, 4);
    });

    it('returns correct fraction for institutional step-down (2.5% → 2% → 1.5%)', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-ramp',
          name: 'Management Fee (2.5%)',
          percentage: 2.5,
          startMonth: 1,
          endMonth: 24, // 2 years
        },
        {
          id: 'tier-standard',
          name: 'Management Fee (2%)',
          percentage: 2.0,
          startMonth: 25,
          endMonth: 60, // 3 years
        },
        {
          id: 'tier-final',
          name: 'Management Fee (1.5%)',
          percentage: 1.5,
          startMonth: 61,
          endMonth: 120, // 5 years
        },
      ];

      const result = committedFeeDragFraction(tiers);

      // (2.5% * 2 years) + (2% * 3 years) + (1.5% * 5 years)
      // = 5% + 6% + 7.5% = 18.5% = 0.185
      expect(result).toBeCloseTo(0.185, 4);
    });

    it('returns 0 for empty tiers', () => {
      const result = committedFeeDragFraction([]);
      expect(result).toBe(0);
    });

    it('returns Fraction type that can be used in calculations without /100', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 120,
        },
      ];

      const feeDrag: Fraction = committedFeeDragFraction(tiers);
      const fundSize = 100_000_000;

      // This should work directly without /100
      const netCapital = fundSize * (1 - feeDrag);

      expect(netCapital).toBe(80_000_000);

      // Should NOT need this (this would be wrong):
      // const wrongCalculation = fundSize * (1 - feeDrag / 100); // Would give 99,800,000
    });

    it('handles partial fund terms correctly', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: undefined, // No end month = until fund term
        },
      ];

      // 5-year fund
      const result = committedFeeDragFraction(tiers, 60);
      expect(result).toBeCloseTo(0.10, 4); // 2% * 5 years = 10%
    });
  });

  describe('committedFeeDragPctFromTiers() - backward compatibility', () => {
    it('still returns percentage (not fraction) for backward compatibility', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 120,
        },
      ];

      const result = committedFeeDragPctFromTiers(tiers);

      // Should return 20 (percentage), not 0.20 (fraction)
      expect(result).toBe(20);
    });

    it('requires /100 for use in calculations', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 120,
        },
      ];

      const feeDragPct = committedFeeDragPctFromTiers(tiers);
      const fundSize = 100_000_000;

      // Old way - requires /100
      const netCapital = fundSize * (1 - feeDragPct / 100);
      expect(netCapital).toBe(80_000_000);

      // Without /100 would give wrong result
      const wrongCalculation = fundSize * (1 - feeDragPct);
      expect(wrongCalculation).toBe(-1_900_000_000); // Clearly wrong!
    });
  });

  describe('Unit mismatch prevention', () => {
    it('demonstrates the P0 bug scenario and how new function prevents it', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 120,
        },
      ];

      const fundSize = 100_000_000;

      // OLD CODE (buggy if you forget /100):
      const oldPct = committedFeeDragPctFromTiers(tiers); // Returns 20
      const oldWrongResult = fundSize * (1 - oldPct); // Forgets /100 - BUG!
      expect(oldWrongResult).toBe(-1_900_000_000); // Disaster!

      const oldCorrectResult = fundSize * (1 - oldPct / 100); // Correct
      expect(oldCorrectResult).toBe(80_000_000);

      // NEW CODE (type-safe):
      const newFraction = committedFeeDragFraction(tiers); // Returns 0.20 as Fraction
      const newResult = fundSize * (1 - newFraction); // Always correct!
      expect(newResult).toBe(80_000_000);

      // The Fraction type forces you to use it correctly
    });
  });

  describe('Real-world scenarios', () => {
    it('calculates fee drag for typical seed fund', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.5,
          startMonth: 1,
          endMonth: 120,
        },
      ];

      const feeDrag = committedFeeDragFraction(tiers);
      const fundSize = 50_000_000;
      const investableCapital = fundSize * (1 - feeDrag);

      // 2.5% * 10 years = 25% drag
      expect(feeDrag).toBe(0.25);
      expect(investableCapital).toBe(37_500_000);
    });

    it('calculates fee drag for growth fund with early step-down', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Investment Period Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 48, // 4 years
        },
        {
          id: 'tier-2',
          name: 'Harvest Period Fee',
          percentage: 1.0,
          startMonth: 49,
          endMonth: 144, // Extended to 12 years
        },
      ];

      const feeDrag = committedFeeDragFraction(tiers);

      // With default 120-month (10-year) fund term:
      // (2% * 4 years) + (1% * 6 years) = 8% + 6% = 14%
      // (Tier 2 is capped at month 120, not 144)
      expect(feeDrag).toBeCloseTo(0.14, 4);
    });
  });

  describe('Edge cases', () => {
    it('handles zero-percentage tiers', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'No Fee Period',
          percentage: 0,
          startMonth: 1,
          endMonth: 120,
        },
      ];

      const result = committedFeeDragFraction(tiers);
      expect(result).toBe(0);
    });

    it('handles very short fund terms', () => {
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Management Fee',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 12,
        },
      ];

      const result = committedFeeDragFraction(tiers, 12);

      // 2% * 1 year = 2% = 0.02
      expect(result).toBeCloseTo(0.02, 4);
    });

    it('handles overlapping tier correction', () => {
      // This tests that the function handles tiers correctly
      // even if they might have edge cases in start/end months
      const tiers: FeeTier[] = [
        {
          id: 'tier-1',
          name: 'Period 1',
          percentage: 2.0,
          startMonth: 1,
          endMonth: 60,
        },
        {
          id: 'tier-2',
          name: 'Period 2',
          percentage: 1.5,
          startMonth: 61, // Starts right after period 1
          endMonth: 120,
        },
      ];

      const result = committedFeeDragFraction(tiers);
      expect(result).toBeCloseTo(0.175, 4);
    });
  });
});
