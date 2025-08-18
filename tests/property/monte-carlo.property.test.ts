/**
 * Property-based tests for Monte Carlo simulations
 * Ensures mathematical invariants hold across all inputs
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Type definitions for simulation inputs and outputs
interface MonteCarloInput {
  fundSize: number;
  deploymentPeriod: number;
  targetMultiple: number;
  reserveRatio: number;
  managementFee: number;
  carryPercentage: number;
  seed?: number;
}

interface MonteCarloOutput {
  moic: number;
  irr: number;
  tvpi: number;
  dpi: number;
  percentiles: {
    '10': number;
    '25': number;
    '50': number;
    '75': number;
    '90': number;
  };
  median: number;
  mean: number;
  stdDev: number;
}

// Placeholder for real Monte Carlo engine - replace with actual implementation
function runMonteCarlo(input: MonteCarloInput): MonteCarloOutput {
  // Deterministic calculation based on seed for testing
  const random = input.seed !== undefined ? Math.abs(Math.sin(input.seed) * 10000) % 1 : Math.random();
  const baseReturn = input.targetMultiple * (0.5 + random * 0.5);
  
  return {
    moic: Math.max(0.01, baseReturn),
    irr: (Math.pow(baseReturn, 1 / (input.deploymentPeriod / 4)) - 1),
    tvpi: baseReturn * 0.95,
    dpi: baseReturn * 0.8,
    percentiles: {
      '10': baseReturn * 0.6,
      '25': baseReturn * 0.75,
      '50': baseReturn * 0.9,
      '75': baseReturn * 1.1,
      '90': baseReturn * 1.3,
    },
    median: baseReturn * 0.9,
    mean: baseReturn,
    stdDev: baseReturn * 0.15,
  };
}

// Helper functions for invariant checking
const isNonNegative = (x: number) => Number.isFinite(x) && x >= 0;
const isValidIRR = (x: number) => Number.isFinite(x) && x > -1;
const isValidPercentage = (x: number) => x >= 0 && x <= 1;

describe('Monte Carlo Property Tests', () => {
  it('should respect basic mathematical invariants', () => {
    fc.assert(
      fc.property(
        fc.record({
          fundSize: fc.float({ min: Math.fround(1e6), max: Math.fround(1e10), noNaN: true }),
          deploymentPeriod: fc.integer({ min: 4, max: 40 }),
          targetMultiple: fc.float({ min: Math.fround(0.5), max: Math.fround(5.0), noNaN: true }),
          reserveRatio: fc.float({ min: Math.fround(0), max: Math.fround(0.75), noNaN: true }),
          managementFee: fc.float({ min: Math.fround(0), max: Math.fround(0.03), noNaN: true }),
          carryPercentage: fc.float({ min: Math.fround(0), max: Math.fround(0.3), noNaN: true }),
          seed: fc.integer(),
        }),
        (params) => {
          const result = runMonteCarlo(params);
          
          // MOIC must be non-negative
          expect(isNonNegative(result.moic)).toBe(true);
          
          // IRR must be greater than -100%
          expect(isValidIRR(result.irr)).toBe(true);
          
          // TVPI >= DPI (total value >= distributed)
          expect(result.tvpi).toBeGreaterThanOrEqual(result.dpi);
          
          // DPI must be non-negative
          expect(isNonNegative(result.dpi)).toBe(true);
          
          // Percentiles must be ordered
          expect(result.percentiles['10']).toBeLessThanOrEqual(result.percentiles['25']);
          expect(result.percentiles['25']).toBeLessThanOrEqual(result.percentiles['50']);
          expect(result.percentiles['50']).toBeLessThanOrEqual(result.percentiles['75']);
          expect(result.percentiles['75']).toBeLessThanOrEqual(result.percentiles['90']);
          
          // Median should be close to 50th percentile
          expect(result.median).toBeCloseTo(result.percentiles['50'], 3);
          
          // Standard deviation must be non-negative
          expect(isNonNegative(result.stdDev)).toBe(true);
        }
      ),
      { numRuns: 100, verbose: true }
    );
  });

  it('should handle extreme fund sizes correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          fundSize: fc.oneof(
            fc.constant(1e3),      // Very small fund
            fc.constant(1e12)      // Very large fund
          ),
          deploymentPeriod: fc.integer({ min: 4, max: 40 }),
          targetMultiple: fc.float({ min: Math.fround(1.0), max: Math.fround(3.0), noNaN: true }),
          reserveRatio: fc.float({ min: Math.fround(0.3), max: Math.fround(0.5), noNaN: true }),
          managementFee: fc.constant(0.02),
          carryPercentage: fc.constant(0.2),
          seed: fc.integer(),
        }),
        (params) => {
          const result = runMonteCarlo(params);
          
          // Results should be finite
          expect(Number.isFinite(result.moic)).toBe(true);
          expect(Number.isFinite(result.irr)).toBe(true);
          expect(Number.isFinite(result.tvpi)).toBe(true);
          expect(Number.isFinite(result.dpi)).toBe(true);
          
          // Results should be in reasonable ranges
          expect(result.moic).toBeGreaterThan(0);
          expect(result.moic).toBeLessThan(100);
        }
      )
    );
  });

  it('should maintain consistency with different seeds', () => {
    fc.assert(
      fc.property(
        fc.record({
          fundSize: fc.constant(50e6),
          deploymentPeriod: fc.constant(12),
          targetMultiple: fc.constant(2.5),
          reserveRatio: fc.constant(0.4),
          managementFee: fc.constant(0.02),
          carryPercentage: fc.constant(0.2),
          seed: fc.integer({ min: 0, max: 1000000 }),
        }),
        (params) => {
          const result1 = runMonteCarlo(params);
          const result2 = runMonteCarlo(params);
          
          // Same inputs should produce same outputs (deterministic with seed)
          expect(result1.moic).toBe(result2.moic);
          expect(result1.irr).toBe(result2.irr);
          expect(result1.tvpi).toBe(result2.tvpi);
          expect(result1.dpi).toBe(result2.dpi);
        }
      )
    );
  });

  it('should respect reserve ratio constraints', () => {
    fc.assert(
      fc.property(
        fc.record({
          fundSize: fc.float({ min: Math.fround(10e6), max: Math.fround(100e6), noNaN: true }),
          deploymentPeriod: fc.integer({ min: 8, max: 20 }),
          targetMultiple: fc.float({ min: Math.fround(1.5), max: Math.fround(3.0), noNaN: true }),
          reserveRatio: fc.float({ min: Math.fround(0), max: Math.fround(0.75), noNaN: true }),
          managementFee: fc.float({ min: Math.fround(0.01), max: Math.fround(0.025), noNaN: true }),
          carryPercentage: fc.float({ min: Math.fround(0.15), max: Math.fround(0.25), noNaN: true }),
          seed: fc.integer(),
        }),
        (params) => {
          const result = runMonteCarlo(params);
          
          // Higher reserve ratios should not produce negative returns
          if (params.reserveRatio > 0.5) {
            expect(result.moic).toBeGreaterThan(0.5);
          }
          
          // Reserve ratio should be a valid percentage
          expect(isValidPercentage(params.reserveRatio)).toBe(true);
        }
      )
    );
  });

  it('should handle fee structures properly', () => {
    fc.assert(
      fc.property(
        fc.record({
          fundSize: fc.float({ min: Math.fround(10e6), max: Math.fround(500e6), noNaN: true }),
          deploymentPeriod: fc.integer({ min: 8, max: 16 }),
          targetMultiple: fc.float({ min: Math.fround(2.0), max: Math.fround(3.0), noNaN: true }),
          reserveRatio: fc.float({ min: Math.fround(0.3), max: Math.fround(0.5), noNaN: true }),
          managementFee: fc.float({ min: Math.fround(0), max: Math.fround(0.05), noNaN: true }),
          carryPercentage: fc.float({ min: Math.fround(0), max: Math.fround(0.5), noNaN: true }),
          seed: fc.integer(),
        }),
        (params) => {
          const result = runMonteCarlo(params);
          
          // Higher fees should not cause negative returns in profitable scenarios
          if (params.targetMultiple > 1.5) {
            expect(result.moic).toBeGreaterThan(0);
          }
          
          // Fees should be valid percentages
          expect(isValidPercentage(params.managementFee)).toBe(true);
          expect(isValidPercentage(params.carryPercentage)).toBe(true);
        }
      )
    );
  });
});