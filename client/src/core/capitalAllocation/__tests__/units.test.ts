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
  SCALE_INFERENCE_THRESHOLD,
  MISMATCH_RATIO_THRESHOLD,
  inferUnitScale,
  inferUnitScaleType,
  toCentsWithInference,
  fromCentsWithInference,
  detectUnitMismatch,
  validateUnitConsistency,
  normalizeFieldsToCents,
  validateAndNormalizeCAInput,
} from '../units';

describe('Unit Inference and Mismatch Detection', () => {
  describe('inferUnitScale', () => {
    it('returns MILLION for small values (< 10,000)', () => {
      expect(inferUnitScale(100)).toBe(MILLION);
      expect(inferUnitScale(1000)).toBe(MILLION);
      expect(inferUnitScale(9999)).toBe(MILLION);
    });

    it('returns 1 for large values (>= 10,000)', () => {
      expect(inferUnitScale(10000)).toBe(1);
      expect(inferUnitScale(100000)).toBe(1);
      expect(inferUnitScale(100000000)).toBe(1);
    });

    it('handles boundary case exactly at threshold', () => {
      expect(inferUnitScale(SCALE_INFERENCE_THRESHOLD - 1)).toBe(MILLION);
      expect(inferUnitScale(SCALE_INFERENCE_THRESHOLD)).toBe(1);
    });

    it('handles zero', () => {
      expect(inferUnitScale(0)).toBe(MILLION); // 0 < 10,000
    });
  });

  describe('inferUnitScaleType', () => {
    it('returns "millions" for small values', () => {
      expect(inferUnitScaleType(100)).toBe('millions');
    });

    it('returns "dollars" for large values', () => {
      expect(inferUnitScaleType(100000)).toBe('dollars');
    });
  });

  describe('toCentsWithInference', () => {
    it('converts $M values to cents', () => {
      // commitment=100 ($M scale), value=5 → 5M → 500,000,000 cents
      expect(toCentsWithInference(5, 100)).toBe(500_000_000);
    });

    it('converts raw dollar values to cents', () => {
      // commitment=100,000,000 (raw $), value=5,000,000 → 500,000,000 cents
      expect(toCentsWithInference(5_000_000, 100_000_000)).toBe(500_000_000);
    });

    it('handles zero', () => {
      expect(toCentsWithInference(0, 100)).toBe(0);
    });
  });

  describe('fromCentsWithInference', () => {
    it('converts cents back to $M', () => {
      expect(fromCentsWithInference(500_000_000, 100)).toBe(5);
    });

    it('converts cents back to raw dollars', () => {
      expect(fromCentsWithInference(500_000_000, 100_000_000)).toBe(5_000_000);
    });

    it('round-trips correctly', () => {
      const original = 12.34;
      const commitment = 100;
      const cents = toCentsWithInference(original, commitment);
      const roundTrip = fromCentsWithInference(cents, commitment);

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
