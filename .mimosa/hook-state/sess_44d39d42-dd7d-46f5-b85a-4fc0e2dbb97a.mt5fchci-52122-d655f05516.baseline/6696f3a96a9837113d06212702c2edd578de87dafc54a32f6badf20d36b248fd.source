/**
 * PRNG Unit Tests - Standalone validation
 */

import { describe, it, expect } from 'vitest';
import { PRNG } from '../../../shared/utils/prng';

describe('PRNG Implementation', () => {
  it('should generate deterministic sequence with seed', () => {
    const prng1 = new PRNG(12345);
    const prng2 = new PRNG(12345);

    const sequence1 = Array.from({ length: 100 }, () => prng1.next());
    const sequence2 = Array.from({ length: 100 }, () => prng2.next());

    expect(sequence1).toEqual(sequence2);
  });

  it('should generate different sequences with different seeds', () => {
    const prng1 = new PRNG(12345);
    const prng2 = new PRNG(54321);

    const sequence1 = Array.from({ length: 100 }, () => prng1.next());
    const sequence2 = Array.from({ length: 100 }, () => prng2.next());

    expect(sequence1).not.toEqual(sequence2);
  });

  it('should not modify global Math.random', () => {
    const originalRandom = Math.random;
    const prng = new PRNG(12345);

    // Use PRNG
    prng.next();
    prng.nextNormal(0, 1);

    // Math.random should still be the original function
    expect(Math.random).toBe(originalRandom);

    // Math.random should still generate different values
    const r1 = Math.random();
    const r2 = Math.random();
    expect(r1).not.toBe(r2);
  });

  it('should generate normal distribution with correct properties', () => {
    const prng = new PRNG(12345);
    const samples = Array.from({ length: 10000 }, () => prng.nextNormal(100, 15));

    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);

    expect(mean).toBeCloseTo(100, 0); // Mean should be close to 100
    expect(stdDev).toBeCloseTo(15, 0); // StdDev should be close to 15
  });

  it('should allow reset to reproduce sequence', () => {
    const prng = new PRNG(12345);

    const sequence1 = Array.from({ length: 10 }, () => prng.next());

    prng.reset(12345);
    const sequence2 = Array.from({ length: 10 }, () => prng.next());

    expect(sequence1).toEqual(sequence2);
  });
});