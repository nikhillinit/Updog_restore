/**
 * Unit Inference and Mismatch Detection Tests
 *
 * Per CA-SEMANTIC-LOCK.md Section 3.4.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 3.4
 */

import { describe, it, expect } from 'vitest';
import {
  MILLION,
  SCALE_MILLIONS_THRESHOLD,
  SCALE_RAW_THRESHOLD,
  MISMATCH_RATIO_THRESHOLD,
  inferUnitScale,
  inferUnitScaleType,
  toCentsWithInference,
  fromCentsWithInference,
  fromCentsWithCommitmentInference,
  fromCentsWithScale,
  detectUnitMismatch,
  validateUnitConsistency,
  normalizeFieldsToCents,
  validateAndNormalizeCAInput,
} from '../units';

describe('Unit Inference and Mismatch Detection', () => {
  describe('inferUnitScale', () => {
    it('returns MILLION for clear small values (< SCALE_MILLIONS_THRESHOLD)', () => {
      expect(inferUnitScale(100)).toBe(MILLION);
      expect(inferUnitScale(500)).toBe(MILLION);
      expect(inferUnitScale(999)).toBe(MILLION);
    });

    it('returns 1 for clear large values (>= SCALE_RAW_THRESHOLD)', () => {
      expect(inferUnitScale(10_000_000)).toBe(1);
      expect(inferUnitScale(100_000_000)).toBe(1);
      expect(inferUnitScale(1_000_000_000)).toBe(1);
    });

    it('handles boundary cases at thresholds', () => {
      // Just below SCALE_MILLIONS_THRESHOLD → millions
      expect(inferUnitScale(SCALE_MILLIONS_THRESHOLD - 1)).toBe(MILLION);
      // At or above SCALE_RAW_THRESHOLD → raw dollars
      expect(inferUnitScale(SCALE_RAW_THRESHOLD)).toBe(1);
    });

    it('throws for zero or negative values', () => {
      expect(() => inferUnitScale(0)).toThrow('Invalid commitment amount');
      expect(() => inferUnitScale(-100)).toThrow('Invalid commitment amount');
    });

    it('throws for ambiguous zone (1K - 10M) without explicit config', () => {
      // Values in the ambiguous range should fail-fast
      expect(() => inferUnitScale(5_000)).toThrow('ambiguous');
      expect(() => inferUnitScale(50_000)).toThrow('ambiguous');
      expect(() => inferUnitScale(500_000)).toThrow('ambiguous');
      expect(() => inferUnitScale(5_000_000)).toThrow('ambiguous');
    });

    it('honors explicit units config in ambiguous zone', () => {
      // With explicit config, ambiguous zone works
      expect(inferUnitScale(50_000, 'millions')).toBe(MILLION);
      expect(inferUnitScale(50_000, 'raw')).toBe(1);
    });

    it('honors explicit units config even in clear zones', () => {
      // Explicit config overrides inference
      expect(inferUnitScale(100, 'raw')).toBe(1); // Would normally be millions
      expect(inferUnitScale(100_000_000, 'millions')).toBe(MILLION); // Would normally be raw
    });
  });

  describe('inferUnitScaleType', () => {
    it('returns "millions" for clear small values', () => {
      expect(inferUnitScaleType(100)).toBe('millions');
      expect(inferUnitScaleType(500)).toBe('millions');
    });

    it('returns "dollars" for clear large values', () => {
      expect(inferUnitScaleType(10_000_000)).toBe('dollars');
      expect(inferUnitScaleType(100_000_000)).toBe('dollars');
    });

    it('throws for ambiguous zone values', () => {
      expect(() => inferUnitScaleType(100_000)).toThrow('ambiguous');
    });

    it('honors explicit units config', () => {
      expect(inferUnitScaleType(50_000, 'millions')).toBe('millions');
      expect(inferUnitScaleType(50_000, 'raw')).toBe('dollars');
    });
  });

  describe('toCentsWithInference', () => {
    it('converts $M values to cents using MILLION scale', () => {
      // With unitScale=MILLION: value=5 → 5 * 1,000,000 = 5M → 500,000,000 cents
      expect(toCentsWithInference(5, MILLION)).toBe(500_000_000);
    });

    it('converts raw dollar values to cents using scale=1', () => {
      // With unitScale=1: value=5,000,000 → 5,000,000 * 1 = 5M → 500,000,000 cents
      expect(toCentsWithInference(5_000_000, 1)).toBe(500_000_000);
    });

    it('handles zero', () => {
      expect(toCentsWithInference(0, MILLION)).toBe(0);
    });

    it('uses banker rounding for half values', () => {
      // 5.005 * MILLION = 5,005,000 dollars = 500,500,000 cents (exact)
      expect(toCentsWithInference(5.005, MILLION)).toBe(500_500_000);
      // 5.0055 * MILLION = 5,005,500 dollars = 500,550,000 cents (exact)
      expect(toCentsWithInference(5.0055, MILLION)).toBe(500_550_000);
    });

    it('demonstrates half-to-even tie-breaking (banker rounding)', () => {
      // True half-cent tests: verify tie-to-even behavior
      // 12.345 dollars = 1234.5 cents → rounds to 1234 (even)
      expect(toCentsWithInference(12.345, 1)).toBe(1234);
      // 12.355 dollars = 1235.5 cents → rounds to 1236 (even)
      expect(toCentsWithInference(12.355, 1)).toBe(1236);
      // 12.365 dollars = 1236.5 cents → rounds to 1236 (even)
      expect(toCentsWithInference(12.365, 1)).toBe(1236);
      // 12.375 dollars = 1237.5 cents → rounds to 1238 (even)
      expect(toCentsWithInference(12.375, 1)).toBe(1238);
    });
  });

  describe('fromCentsWithCommitmentInference (deprecated)', () => {
    it('converts cents back to $M using commitment-based inference', () => {
      // Uses commitment=100 to infer MILLION scale
      expect(fromCentsWithCommitmentInference(500_000_000, 100)).toBe(5);
      // Alias also works
      expect(fromCentsWithInference(500_000_000, 100)).toBe(5);
    });

    it('converts cents back to raw dollars using commitment-based inference', () => {
      // Uses commitment=100,000,000 to infer scale=1
      expect(fromCentsWithCommitmentInference(500_000_000, 100_000_000)).toBe(5_000_000);
    });

    it('supports explicit units in ambiguous zone', () => {
      // commitment=50,000 is in ambiguous zone, but explicit units resolve it
      expect(fromCentsWithCommitmentInference(500_000_000, 50_000, 'millions')).toBe(5);
      expect(fromCentsWithCommitmentInference(500_000_000, 50_000, 'raw')).toBe(5_000_000);
    });
  });

  describe('fromCentsWithScale (preferred)', () => {
    it('converts cents back to $M using explicit MILLION scale', () => {
      expect(fromCentsWithScale(500_000_000, MILLION)).toBe(5);
    });

    it('converts cents back to raw dollars using explicit scale=1', () => {
      expect(fromCentsWithScale(500_000_000, 1)).toBe(5_000_000);
    });

    it('round-trips correctly with explicit scale', () => {
      const original = 12.34;
      const unitScale = MILLION;
      const cents = toCentsWithInference(original, unitScale);
      const roundTrip = fromCentsWithScale(cents, unitScale);

      // May have minor precision loss due to rounding
      expect(roundTrip).toBeCloseTo(original, 2);
    });
  });

  describe('detectUnitMismatch', () => {
    it('returns false for same-scale values', () => {
      expect(detectUnitMismatch(100, 50)).toBe(false);
      expect(detectUnitMismatch(1000000, 500000)).toBe(false);
    });

    it('returns true for vastly different scales', () => {
      // 100 vs 100,000,000 → ratio = 1,000,000 > 100,000 threshold
      expect(detectUnitMismatch(100, 100_000_000)).toBe(true);
    });

    it('returns false for values just under threshold', () => {
      // ratio of 99,999 should be OK
      expect(detectUnitMismatch(1, 99_999)).toBe(false);
    });

    it('returns true for values just over threshold', () => {
      // ratio of 100,001 should trigger
      expect(detectUnitMismatch(1, 100_001)).toBe(true);
    });

    it('returns false when either value is zero', () => {
      expect(detectUnitMismatch(0, 100)).toBe(false);
      expect(detectUnitMismatch(100, 0)).toBe(false);
    });

    it('handles order independence', () => {
      expect(detectUnitMismatch(1, 1_000_000)).toBe(detectUnitMismatch(1_000_000, 1));
    });

    it('handles negative values correctly (for recalls)', () => {
      // Negative values should be compared by absolute value
      expect(detectUnitMismatch(-100, 50)).toBe(false);
      expect(detectUnitMismatch(100, -50)).toBe(false);
      expect(detectUnitMismatch(-100, -50)).toBe(false);
      // Large mismatch should still be detected with negatives
      expect(detectUnitMismatch(-100, 100_000_000)).toBe(true);
      expect(detectUnitMismatch(100, -100_000_000)).toBe(true);
    });
  });

  describe('validateUnitConsistency', () => {
    it('passes for consistent units', () => {
      expect(() =>
        validateUnitConsistency({
          commitment: 100,
          minCashBuffer: 5,
          contribution: 10,
        })
      ).not.toThrow();
    });

    it('throws for mismatched units', () => {
      expect(() =>
        validateUnitConsistency({
          commitment: 100, // $M scale
          minCashBuffer: 5_000_000, // raw dollars (mismatch!)
        })
      ).toThrow('Unit mismatch');
    });

    it('ignores null/undefined fields', () => {
      expect(() =>
        validateUnitConsistency({
          commitment: 100,
          minCashBuffer: null,
          contribution: undefined,
        })
      ).not.toThrow();
    });

    it('ignores zero values', () => {
      expect(() =>
        validateUnitConsistency({
          commitment: 100,
          minCashBuffer: 0,
        })
      ).not.toThrow();
    });

    it('uses specified reference field', () => {
      expect(() =>
        validateUnitConsistency(
          {
            commitment: 100_000_000,
            minCashBuffer: 5_000_000,
          },
          'minCashBuffer'
        )
      ).not.toThrow();
    });
  });

  describe('normalizeFieldsToCents', () => {
    it('normalizes all fields to cents', () => {
      const result = normalizeFieldsToCents(
        {
          commitment: 100,
          buffer: 5,
          contribution: 10,
        },
        100
      );

      expect(result.commitment).toBe(10_000_000_000); // 100M in cents
      expect(result.buffer).toBe(500_000_000); // 5M in cents
      expect(result.contribution).toBe(1_000_000_000); // 10M in cents
    });

    it('handles null/undefined as zero', () => {
      const result = normalizeFieldsToCents(
        {
          commitment: 100,
          buffer: null,
          contribution: undefined,
        },
        100
      );

      expect(result.buffer).toBe(0);
      expect(result.contribution).toBe(0);
    });
  });

  describe('validateAndNormalizeCAInput', () => {
    it('validates and normalizes for $M scale', () => {
      const result = validateAndNormalizeCAInput(100, 5, 0.2);

      expect(result.unitScale).toBe('millions');
      expect(result.unitScaleMultiplier).toBe(MILLION);
      expect(result.commitmentCents).toBe(10_000_000_000); // 100M in cents
      expect(result.minCashBufferCents).toBe(500_000_000); // 5M in cents
      expect(result.targetReserveCents).toBe(2_000_000_000); // 20M in cents
    });

    it('validates and normalizes for raw dollar scale', () => {
      const result = validateAndNormalizeCAInput(100_000_000, 5_000_000, 0.2);

      expect(result.unitScale).toBe('dollars');
      expect(result.unitScaleMultiplier).toBe(1);
      expect(result.commitmentCents).toBe(10_000_000_000); // 100M in cents
      expect(result.minCashBufferCents).toBe(500_000_000); // 5M in cents
      expect(result.targetReserveCents).toBe(2_000_000_000); // 20M in cents
    });

    it('throws on unit mismatch', () => {
      expect(() =>
        validateAndNormalizeCAInput(100, 5_000_000, 0.2) // 100 ($M) vs 5M (raw $)
      ).toThrow('Unit mismatch');
    });

    it('handles null buffer', () => {
      const result = validateAndNormalizeCAInput(100, null, 0.2);

      expect(result.minCashBufferCents).toBe(0);
    });

    it('handles null target percentage', () => {
      const result = validateAndNormalizeCAInput(100, 5, null);

      expect(result.targetReserveCents).toBe(0);
    });
  });

  describe('Truth Case Scenarios', () => {
    it('handles CA-001: commitment=100 ($M scale)', () => {
      const commitment = 100;
      const minCashBuffer = 1;
      const targetReservePct = 0.2;

      const result = validateAndNormalizeCAInput(commitment, minCashBuffer, targetReservePct);

      // commitment=100M → 10B cents
      expect(result.commitmentCents).toBe(10_000_000_000);
      // buffer=1M → 100M cents
      expect(result.minCashBufferCents).toBe(100_000_000);
      // target=20M → 2B cents
      expect(result.targetReserveCents).toBe(2_000_000_000);
    });

    it('handles CA-007: commitment=$100M (raw dollars in truth case)', () => {
      // CA-007 uses larger numbers that could be in raw dollars
      // But based on truth case structure, it's still $M scale
      const commitment = 100;

      expect(inferUnitScaleType(commitment)).toBe('millions');
    });
  });
});
