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

    it('uses NO float comparison for remainders', () => {
      // This test documents that remainders are integers
      // The implementation uses (total * weightBps) % WEIGHT_SCALE
      // which is pure integer arithmetic

      const weightsBps = normalizeWeightsToBps([0.3333333, 0.3333333, 0.3333334]);
      const totalCents = 1_000_000;

      // Verify remainders are computed as integers
      for (const wbps of weightsBps) {
        const product = totalCents * wbps;
        const remainder = product % WEIGHT_SCALE;

        // Remainder must be a safe integer (no float drift)
        expect(Number.isSafeInteger(product)).toBe(true);
        expect(Number.isSafeInteger(remainder)).toBe(true);
      }
    });
  });
});
