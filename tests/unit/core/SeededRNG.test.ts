/**
 * Tests for SeededRNG - Xorshift32 deterministic random number generator
 * Critical invariant: Same seed MUST produce identical sequences
 */

import { describe, it, expect } from 'vitest';
import {
  SeededRNG,
  deriveSeed,
  createSeededRNG,
} from '../../../shared/core/optimization/SeededRNG';

describe('SeededRNG', () => {
  describe('Construction', () => {
    it('should create RNG with valid seed', () => {
      const rng = new SeededRNG(12345);
      expect(rng).toBeDefined();
      expect(rng.getState()).toBe(12345);
    });

    it('should reject zero seed', () => {
      expect(() => new SeededRNG(0)).toThrow('SeededRNG seed must be a non-zero integer');
    });

    it('should reject non-integer seed', () => {
      expect(() => new SeededRNG(3.14)).toThrow('SeededRNG seed must be a non-zero integer');
    });

    it('should handle large seeds (32-bit unsigned)', () => {
      const largeSeed = 0xffffffff; // 2^32 - 1
      const rng = new SeededRNG(largeSeed);
      expect(rng.getState()).toBe(largeSeed);
    });
  });

  describe('Reproducibility - Critical Invariant', () => {
    it('should generate identical sequences with same seed', () => {
      const rng1 = new SeededRNG(42);
      const rng2 = new SeededRNG(42);

      const sequence1 = Array.from({ length: 100 }, () => rng1.next());
      const sequence2 = Array.from({ length: 100 }, () => rng2.next());

      expect(sequence1).toEqual(sequence2);
    });

    it('should generate different sequences with different seeds', () => {
      const rng1 = new SeededRNG(42);
      const rng2 = new SeededRNG(43);

      const sequence1 = Array.from({ length: 100 }, () => rng1.next());
      const sequence2 = Array.from({ length: 100 }, () => rng2.next());

      expect(sequence1).not.toEqual(sequence2);
    });

    it('should reproduce sequence after reset', () => {
      const rng = new SeededRNG(123);
      const sequence1 = Array.from({ length: 50 }, () => rng.next());

      rng.reset(123);
      const sequence2 = Array.from({ length: 50 }, () => rng.next());

      expect(sequence1).toEqual(sequence2);
    });

    it('should generate byte-identical output for matrix cache', () => {
      const config = { buckets: 50, scenarios: 400, seed: 12345 };

      const rng1 = new SeededRNG(config.seed);
      const matrix1 = Float32Array.from({ length: 20000 }, () => rng1.next());

      const rng2 = new SeededRNG(config.seed);
      const matrix2 = Float32Array.from({ length: 20000 }, () => rng2.next());

      // Verify byte-identical output
      expect(new Uint8Array(matrix1.buffer)).toEqual(new Uint8Array(matrix2.buffer));
    });
  });

  describe('next() - Uniform distribution', () => {
    it('should generate values in [0, 1)', () => {
      const rng = new SeededRNG(999);
      const values = Array.from({ length: 1000 }, () => rng.next());

      values.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      });
    });

    it('should have reasonable distribution properties', () => {
      const rng = new SeededRNG(777);
      const values = Array.from({ length: 10000 }, () => rng.next());

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

      // Uniform [0,1) has mean=0.5, variance=1/12≈0.083
      expect(mean).toBeCloseTo(0.5, 1);
      expect(variance).toBeCloseTo(1 / 12, 1);
    });

    it('should not repeat within 10k samples (period >> 10k)', () => {
      const rng = new SeededRNG(555);
      const values = Array.from({ length: 10000 }, () => rng.next());
      const uniqueValues = new Set(values);

      // Should have very high uniqueness (collisions possible but rare)
      expect(uniqueValues.size).toBeGreaterThan(9900);
    });
  });

  describe('nextInt() - Integer sampling', () => {
    it('should generate integers in [min, max] inclusive', () => {
      const rng = new SeededRNG(333);
      const values = Array.from({ length: 1000 }, () => rng.nextInt(1, 6));

      values.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(6);
        expect(Number.isInteger(v)).toBe(true);
      });
    });

    it('should cover all possible values in range', () => {
      const rng = new SeededRNG(222);
      const values = Array.from({ length: 1000 }, () => rng.nextInt(1, 5));
      const unique = new Set(values);

      expect(unique.size).toBe(5); // Should see 1, 2, 3, 4, 5
      expect(unique.has(1)).toBe(true);
      expect(unique.has(5)).toBe(true);
    });

    it('should handle single-value range', () => {
      const rng = new SeededRNG(111);
      const values = Array.from({ length: 100 }, () => rng.nextInt(7, 7));

      values.forEach((v) => expect(v).toBe(7));
    });
  });

  describe('nextGaussian() - Normal distribution', () => {
    it('should generate values with correct mean and stddev', () => {
      const rng = new SeededRNG(888);
      const values = Array.from({ length: 10000 }, () => rng.nextGaussian(100, 15));

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      expect(mean).toBeCloseTo(100, 0); // Within 1 unit
      expect(stdDev).toBeCloseTo(15, 0); // Within 1 unit
    });

    it('should use default parameters (0, 1)', () => {
      const rng = new SeededRNG(666);
      const values = Array.from({ length: 5000 }, () => rng.nextGaussian());

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

      expect(mean).toBeCloseTo(0, 0);
      expect(Math.sqrt(variance)).toBeCloseTo(1, 0);
    });
  });

  describe('sample() - Array sampling', () => {
    it('should sample elements uniformly', () => {
      const rng = new SeededRNG(444);
      const array = ['A', 'B', 'C', 'D', 'E'];
      const samples = Array.from({ length: 1000 }, () => rng.sample(array));

      const counts = samples.reduce(
        (acc, val) => {
          acc[val] = (acc[val] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      // Each element should appear ~200 times (±50)
      Object.values(counts).forEach((count) => {
        expect(count).toBeGreaterThan(150);
        expect(count).toBeLessThan(250);
      });
    });

    it('should only return array elements', () => {
      const rng = new SeededRNG(555);
      const array = [10, 20, 30];
      const samples = Array.from({ length: 100 }, () => rng.sample(array));

      samples.forEach((s) => expect(array).toContain(s));
    });
  });

  describe('shuffle() - Fisher-Yates', () => {
    it('should shuffle array in-place', () => {
      const rng = new SeededRNG(777);
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const array = [...original];

      const shuffled = rng.shuffle(array);

      expect(shuffled).toBe(array); // Same reference
      expect(shuffled).not.toEqual(original); // Different order (high probability)
      expect([...shuffled].sort((a, b) => a - b)).toEqual(original); // Same elements
    });

    it('should produce different permutations with different seeds', () => {
      const rng1 = new SeededRNG(1);
      const rng2 = new SeededRNG(2);

      const array1 = [1, 2, 3, 4, 5];
      const array2 = [1, 2, 3, 4, 5];

      rng1.shuffle(array1);
      rng2.shuffle(array2);

      expect(array1).not.toEqual(array2);
    });

    it('should produce same permutation with same seed', () => {
      const rng1 = new SeededRNG(999);
      const rng2 = new SeededRNG(999);

      const array1 = [1, 2, 3, 4, 5, 6, 7, 8];
      const array2 = [1, 2, 3, 4, 5, 6, 7, 8];

      rng1.shuffle(array1);
      rng2.shuffle(array2);

      expect(array1).toEqual(array2);
    });
  });

  describe('deriveSeed() - FNV-1a hashing', () => {
    it('should derive deterministic seed from string', () => {
      const seed1 = deriveSeed('test-config-123');
      const seed2 = deriveSeed('test-config-123');

      expect(seed1).toBe(seed2);
      expect(seed1).toBeGreaterThan(0);
    });

    it('should derive different seeds from different strings', () => {
      const seed1 = deriveSeed('config-A');
      const seed2 = deriveSeed('config-B');

      expect(seed1).not.toBe(seed2);
    });

    it('should never return zero', () => {
      // FNV-1a of empty string is FNV_OFFSET, not zero
      const seed = deriveSeed('');
      expect(seed).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      const seed1 = deriveSeed('hello-世界');
      const seed2 = deriveSeed('hello-世界');

      expect(seed1).toBe(seed2);
      expect(seed1).toBeGreaterThan(0);
    });

    it('should be sensitive to character order', () => {
      const seed1 = deriveSeed('abc');
      const seed2 = deriveSeed('cba');

      expect(seed1).not.toBe(seed2);
    });
  });

  describe('createSeededRNG() - Configuration-based seeding', () => {
    it('should create RNG from config object', () => {
      const config = { buckets: 50, scenarios: 400, recycling: true };
      const rng = createSeededRNG(config);

      expect(rng).toBeInstanceOf(SeededRNG);
      expect(rng.getState()).toBeGreaterThan(0);
    });

    it('should produce same RNG for identical configs', () => {
      const config1 = { a: 1, b: 2, c: 3 };
      const config2 = { a: 1, b: 2, c: 3 };

      const rng1 = createSeededRNG(config1);
      const rng2 = createSeededRNG(config2);

      expect(rng1.getState()).toBe(rng2.getState());

      const seq1 = Array.from({ length: 10 }, () => rng1.next());
      const seq2 = Array.from({ length: 10 }, () => rng2.next());
      expect(seq1).toEqual(seq2);
    });

    it('should handle key order differences (canonical JSON)', () => {
      const config1 = { z: 3, y: 2, x: 1 };
      const config2 = { x: 1, y: 2, z: 3 };

      const rng1 = createSeededRNG(config1);
      const rng2 = createSeededRNG(config2);

      // Should produce same seed despite different key order
      expect(rng1.getState()).toBe(rng2.getState());
    });

    it('should produce different RNGs for different configs', () => {
      const config1 = { param: 'A' };
      const config2 = { param: 'B' };

      const rng1 = createSeededRNG(config1);
      const rng2 = createSeededRNG(config2);

      expect(rng1.getState()).not.toBe(rng2.getState());
    });
  });

  describe('Performance', () => {
    it('should generate 1M random numbers quickly', () => {
      const rng = new SeededRNG(12345);
      const start = Date.now();

      for (let i = 0; i < 1_000_000; i++) {
        rng.next();
      }

      const elapsed = Date.now() - start;
      // Should complete in < 100ms on modern hardware
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Cache Validity Scenario', () => {
    it('should enable byte-identical matrix reconstruction', () => {
      // Simulate scenario matrix generation with same config
      const matrixConfig = {
        buckets: 50,
        scenarios: 400,
        recycling: { enabled: true, sameBucketOnly: true },
        correlation: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
      };

      const seed = deriveSeed(JSON.stringify(matrixConfig, Object.keys(matrixConfig).sort()));

      // First generation
      const rng1 = new SeededRNG(seed);
      const matrix1 = new Float32Array(50 * 400);
      for (let i = 0; i < matrix1.length; i++) {
        matrix1[i] = rng1.next() * 10; // MOIC values 0-10x
      }

      // Second generation (cache miss scenario)
      const rng2 = new SeededRNG(seed);
      const matrix2 = new Float32Array(50 * 400);
      for (let i = 0; i < matrix2.length; i++) {
        matrix2[i] = rng2.next() * 10;
      }

      // Matrices must be byte-identical
      expect(new Uint8Array(matrix1.buffer)).toEqual(new Uint8Array(matrix2.buffer));
    });
  });
});
