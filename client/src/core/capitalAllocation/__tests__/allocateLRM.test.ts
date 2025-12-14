/**
 * Largest Remainder Method (LRM) Allocation Tests
 *
 * Tests the deterministic allocation algorithm per CA-SEMANTIC-LOCK.md Section 4.2.
 * CA-018 verification is the critical test case.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.2
 */

import { describe, it, expect } from 'vitest';
import {
  WEIGHT_SCALE,
  normalizeWeightsToBps,
  allocateLRM,
  allocateFromDecimalWeights,
  verifyCA018,
} from '../allocateLRM';

describe('Largest Remainder Method (LRM)', () => {
  describe('normalizeWeightsToBps', () => {
    it('normalizes weights summing to exactly 1.0', () => {
      const weights = [0.6, 0.4];
      const bps = normalizeWeightsToBps(weights);

      expect(bps).toHaveLength(2);
      expect(bps[0]).toBe(6_000_000); // 60%
      expect(bps[1]).toBe(4_000_000); // 40%
      expect(bps.reduce((a, b) => a + b, 0)).toBe(WEIGHT_SCALE);
    });

    it('normalizes weights summing close to 1.0 (within 0.1%)', () => {
      const weights = [0.333, 0.333, 0.334]; // sum = 1.0
      const bps = normalizeWeightsToBps(weights);

      expect(bps.reduce((a, b) => a + b, 0)).toBe(WEIGHT_SCALE);
    });

    it('handles 7-decimal precision (CA-018 weights)', () => {
      const weights = [0.3333333, 0.3333333, 0.3333334];
      const bps = normalizeWeightsToBps(weights);

      expect(bps).toHaveLength(3);
      expect(bps.reduce((a, b) => a + b, 0)).toBe(WEIGHT_SCALE);
      // Third weight should be slightly larger
      expect(bps[2]).toBeGreaterThan(bps[0]);
    });

    it('throws on negative weights', () => {
      expect(() => normalizeWeightsToBps([0.5, -0.5])).toThrow('negative');
    });

    it('throws on zero sum', () => {
      expect(() => normalizeWeightsToBps([0, 0])).toThrow('positive');
    });

    it('throws on weights too far from 1.0 (> 0.1%)', () => {
      expect(() => normalizeWeightsToBps([0.5, 0.4])).toThrow('0.1%');
    });

    it('throws on empty array', () => {
      expect(() => normalizeWeightsToBps([])).toThrow('empty');
    });

    it('handles single weight of 1.0', () => {
      const bps = normalizeWeightsToBps([1.0]);
      expect(bps).toEqual([WEIGHT_SCALE]);
    });
  });

  describe('allocateLRM', () => {
    it('allocates evenly divisible amounts', () => {
      const weightsBps = [5_000_000, 5_000_000]; // 50/50
      const allocations = allocateLRM(1000, weightsBps);

      expect(allocations).toEqual([500, 500]);
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(1000);
    });

    it('distributes remainder to largest remainder', () => {
      // 60/40 split of 101 cents
      // Base: floor(101 * 0.6) = 60, floor(101 * 0.4) = 40 → sum = 100
      // Shortfall = 1
      // Remainders: 101*0.6 - 60 = 0.6, 101*0.4 - 40 = 0.4
      // Larger remainder (0.6) gets +1
      const weightsBps = [6_000_000, 4_000_000];
      const allocations = allocateLRM(101, weightsBps);

      expect(allocations).toEqual([61, 40]);
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(101);
    });

    it('uses canonical tie-break (lower index first)', () => {
      // Equal weights with odd total
      const weightsBps = [5_000_000, 5_000_000];
      const allocations = allocateLRM(101, weightsBps);

      // Both have same remainder, so first cohort (index 0) gets +1
      expect(allocations).toEqual([51, 50]);
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(101);
    });

    it('handles zero total', () => {
      const weightsBps = [5_000_000, 5_000_000];
      const allocations = allocateLRM(0, weightsBps);

      expect(allocations).toEqual([0, 0]);
    });

    it('handles empty weights', () => {
      const allocations = allocateLRM(100, []);
      expect(allocations).toEqual([]);
    });

    it('throws on negative total', () => {
      expect(() => allocateLRM(-100, [WEIGHT_SCALE])).toThrow('negative');
    });

    it('throws on weights not summing to WEIGHT_SCALE', () => {
      expect(() => allocateLRM(100, [5_000_000, 4_000_000])).toThrow('sum');
    });

    it('handles large amounts (fund-scale)', () => {
      // $100M in cents = 10,000,000,000 cents
      const totalCents = 10_000_000_000;
      const weightsBps = [3_333_333, 3_333_333, 3_333_334]; // ~33.33% each
      const allocations = allocateLRM(totalCents, weightsBps);

      // All should sum to total
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);
    });

    it('throws on unsafe integer total', () => {
      // Number.MAX_SAFE_INTEGER + 1 is not a safe integer
      const unsafeTotal = Number.MAX_SAFE_INTEGER + 1;
      expect(() => allocateLRM(unsafeTotal, [WEIGHT_SCALE])).toThrow('MAX_SAFE_INTEGER');
    });
  });

  describe('BigInt Overflow Safety (CRITICAL)', () => {
    /**
     * These tests verify that BigInt prevents overflow for large fund sizes.
     * The old number-based implementation would overflow for:
     * - product = totalCents * weightsBps
     * - With $100M fund and 1e7 weights: 10^10 * 10^7 = 10^17
     * - Number.MAX_SAFE_INTEGER ≈ 9×10^15
     *
     * Without BigInt, allocation would be WRONG for funds > $9M.
     */

    it('$100M fund with thirds split (overflow case)', () => {
      // $100M = 10 billion cents
      // product = 10^10 * 3.33×10^6 ≈ 3.33×10^16 > MAX_SAFE_INTEGER
      const totalCents = 10_000_000_000; // $100M
      const weightsBps = [3_333_333, 3_333_333, 3_333_334];

      const allocations = allocateLRM(totalCents, weightsBps);

      // Verify exact conservation
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);

      // Verify expected values (calculated via BigInt externally)
      // floor(10^10 * 3333333 / 10^7) = floor(3.333333×10^9) = 3333333000
      // floor(10^10 * 3333334 / 10^7) = floor(3.333334×10^9) = 3333334000
      expect(allocations[0]).toBe(3_333_333_000);
      expect(allocations[1]).toBe(3_333_333_000);
      expect(allocations[2]).toBe(3_333_334_000);
    });

    it('$1B fund with equal split (extreme overflow case)', () => {
      // $1B = 100 billion cents
      // product = 10^11 * 5×10^6 = 5×10^17 >> MAX_SAFE_INTEGER
      const totalCents = 100_000_000_000; // $1B
      const weightsBps = [5_000_000, 5_000_000]; // 50/50

      const allocations = allocateLRM(totalCents, weightsBps);

      // Verify conservation
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);

      // Verify 50/50 split
      expect(allocations[0]).toBe(50_000_000_000);
      expect(allocations[1]).toBe(50_000_000_000);
    });

    it('$10B fund with complex split (maximum practical overflow)', () => {
      // $10B = 1 trillion cents
      // product = 10^12 * 10^7 = 10^19 >>> MAX_SAFE_INTEGER
      const totalCents = 1_000_000_000_000; // $10B
      const weightsBps = [2_500_000, 2_500_000, 2_500_000, 2_500_000]; // 25% each

      const allocations = allocateLRM(totalCents, weightsBps);

      // Verify conservation
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);

      // Verify 25% each = $2.5B each
      expect(allocations[0]).toBe(250_000_000_000);
      expect(allocations[1]).toBe(250_000_000_000);
      expect(allocations[2]).toBe(250_000_000_000);
      expect(allocations[3]).toBe(250_000_000_000);
    });

    it('$100M with odd split produces correct remainder distribution', () => {
      const totalCents = 10_000_000_001; // $100M + 1 cent (odd)
      const weightsBps = [5_000_000, 5_000_000]; // 50/50

      const allocations = allocateLRM(totalCents, weightsBps);

      // Verify conservation
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);

      // With equal weights and odd total, first cohort gets extra cent
      expect(allocations[0]).toBe(5_000_000_001);
      expect(allocations[1]).toBe(5_000_000_000);
    });

    it('is deterministic at scale (10 runs of $100M)', () => {
      const totalCents = 10_000_000_000;
      const weights = [0.3333333, 0.3333333, 0.3333334];

      const results: number[][] = [];
      for (let i = 0; i < 10; i++) {
        results.push(allocateFromDecimalWeights(totalCents, weights));
      }

      // All results must be identical
      const first = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(first);
      }
    });
  });

  describe('allocateFromDecimalWeights', () => {
    it('combines normalization and allocation', () => {
      const allocations = allocateFromDecimalWeights(1000, [0.6, 0.4]);

      expect(allocations).toEqual([600, 400]);
    });

    it('handles 3-way split with remainder', () => {
      // 1/3 each of 100
      const allocations = allocateFromDecimalWeights(100, [0.333, 0.333, 0.334]);

      expect(allocations.reduce((a, b) => a + b, 0)).toBe(100);
    });
  });

  describe('CA-018 Verification (CRITICAL)', () => {
    /**
     * CA-018 Truth Case Verification
     *
     * This is the CRITICAL test case per CA-SEMANTIC-LOCK.md.
     * Weights: [0.3333333, 0.3333333, 0.3333334]
     * Total: 1,000,000 cents
     * Expected: [333333, 333333, 333334]
     *
     * The third cohort has the largest weight (0.3333334 > 0.3333333),
     * so it gets the extra cent from the remainder.
     */
    it('passes CA-018 verification', () => {
      const result = verifyCA018();

      expect(result.passed).toBe(true);
      expect(result.actual).toEqual(result.expected);
    });

    it('allocates CA-018 manually', () => {
      const weights = [0.3333333, 0.3333333, 0.3333334];
      const totalCents = 1_000_000;

      const allocations = allocateFromDecimalWeights(totalCents, weights);

      // Verify each allocation
      expect(allocations[0]).toBe(333333);
      expect(allocations[1]).toBe(333333);
      expect(allocations[2]).toBe(333334);

      // Verify sum
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);
    });

    it('is deterministic (10 runs produce identical results)', () => {
      const weights = [0.3333333, 0.3333333, 0.3333334];
      const totalCents = 1_000_000;

      const results: number[][] = [];
      for (let i = 0; i < 10; i++) {
        results.push(allocateFromDecimalWeights(totalCents, weights));
      }

      // All results should be identical
      const first = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(first);
      }
    });
  });

  describe('Determinism', () => {
    it('produces identical results for same inputs (stress test)', () => {
      const testCases = [
        { total: 1000, weights: [0.5, 0.5] },
        { total: 999, weights: [0.333, 0.333, 0.334] },
        { total: 10000000, weights: [0.25, 0.25, 0.25, 0.25] },
        { total: 1, weights: [0.1, 0.2, 0.3, 0.4] },
      ];

      for (const tc of testCases) {
        const results: number[][] = [];
        for (let i = 0; i < 5; i++) {
          results.push(allocateFromDecimalWeights(tc.total, tc.weights));
        }

        const first = results[0];
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toEqual(first);
        }
      }
    });

    it('uses BigInt for intermediate arithmetic (no float)', () => {
      // This test documents that the implementation uses BigInt
      // to prevent overflow for large fund sizes.
      //
      // The implementation uses:
      //   const product = BigInt(total) * BigInt(weightBps);
      //   const base = product / WEIGHT_SCALE_BIG;
      //   const remainder = product % WEIGHT_SCALE_BIG;
      //
      // This is pure integer arithmetic with no float drift.

      const weightsBps = normalizeWeightsToBps([0.3333333, 0.3333333, 0.3333334]);
      const totalCents = 10_000_000_000; // $100M - would overflow without BigInt

      // This should NOT throw and should produce deterministic results
      const allocations = allocateLRM(totalCents, weightsBps);

      // Verify conservation
      expect(allocations.reduce((a, b) => a + b, 0)).toBe(totalCents);

      // Verify all allocations are safe integers
      for (const alloc of allocations) {
        expect(Number.isSafeInteger(alloc)).toBe(true);
      }
    });
  });
});
