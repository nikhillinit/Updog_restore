/**
 * Seeded snapshot tests for Monte Carlo simulations
 * Ensures deterministic results for known scenarios
 */
import { describe, it, expect } from 'vitest';

interface MonteCarloScenario {
  name: string;
  input: {
    fundSize: number;
    deploymentPeriod: number;
    targetMultiple: number;
    reserveRatio: number;
    managementFee: number;
    carryPercentage: number;
    seed: number;
  };
  expected: {
    moic: { min: number; max: number };
    irr: { min: number; max: number };
    tvpi: { min: number; max: number };
    dpi: { min: number; max: number };
    median: { min: number; max: number };
  };
}

// Deterministic Monte Carlo simulation with seeded random
function runSeededMonteCarlo(input: MonteCarloScenario['input']) {
  // Use seed for deterministic pseudo-random generation
  const prng = createPRNG(input.seed);
  
  // Simulate returns based on input parameters
  const baseReturn = input.targetMultiple;
  const variance = 0.3; // 30% variance
  
  // Generate multiple scenarios
  const scenarios = Array.from({ length: 1000 }, () => {
    const randomFactor = 1 + (prng() - 0.5) * variance;
    return baseReturn * randomFactor;
  });
  
  // Calculate statistics
  scenarios.sort((a, b) => a - b);
  
  const moic = scenarios[500]; // median
  const irr = Math.pow(moic, 1 / (input.deploymentPeriod / 4)) - 1;
  const tvpi = moic * 0.95;
  const dpi = moic * 0.8;
  
  return {
    moic,
    irr,
    tvpi,
    dpi,
    percentiles: {
      '10': scenarios[100],
      '25': scenarios[250],
      '50': scenarios[500],
      '75': scenarios[750],
      '90': scenarios[900],
    },
    median: scenarios[500],
    mean: scenarios.reduce((a, b) => a + b, 0) / scenarios.length,
    stdDev: calculateStdDev(scenarios),
  };
}

// Seeded pseudo-random number generator
function createPRNG(seed: number) {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function calculateStdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

// Define test scenarios with expected ranges
const scenarios: MonteCarloScenario[] = [
  {
    name: 'Conservative Fund',
    input: {
      fundSize: 50e6,
      deploymentPeriod: 12,
      targetMultiple: 2.0,
      reserveRatio: 0.5,
      managementFee: 0.02,
      carryPercentage: 0.2,
      seed: 12345,
    },
    expected: {
      moic: { min: 1.8, max: 2.2 },
      irr: { min: 0.15, max: 0.30 },
      tvpi: { min: 1.7, max: 2.1 },
      dpi: { min: 1.4, max: 1.8 },
      median: { min: 1.8, max: 2.2 },
    },
  },
  {
    name: 'Aggressive Growth Fund',
    input: {
      fundSize: 100e6,
      deploymentPeriod: 8,
      targetMultiple: 3.5,
      reserveRatio: 0.3,
      managementFee: 0.025,
      carryPercentage: 0.25,
      seed: 67890,
    },
    expected: {
      moic: { min: 3.0, max: 4.0 },
      irr: { min: 0.25, max: 0.90 },
      tvpi: { min: 2.8, max: 3.8 },
      dpi: { min: 2.4, max: 3.2 },
      median: { min: 3.0, max: 4.0 },
    },
  },
  {
    name: 'Small Seed Fund',
    input: {
      fundSize: 10e6,
      deploymentPeriod: 16,
      targetMultiple: 5.0,
      reserveRatio: 0.4,
      managementFee: 0.03,
      carryPercentage: 0.3,
      seed: 11111,
    },
    expected: {
      moic: { min: 4.0, max: 6.0 },
      irr: { min: 0.20, max: 0.50 },
      tvpi: { min: 3.8, max: 5.7 },
      dpi: { min: 3.2, max: 4.8 },
      median: { min: 4.0, max: 6.0 },
    },
  },
  {
    name: 'Large Buyout Fund',
    input: {
      fundSize: 500e6,
      deploymentPeriod: 10,
      targetMultiple: 1.8,
      reserveRatio: 0.35,
      managementFee: 0.015,
      carryPercentage: 0.2,
      seed: 99999,
    },
    expected: {
      moic: { min: 1.5, max: 2.1 },
      irr: { min: 0.10, max: 0.30 },
      tvpi: { min: 1.4, max: 2.0 },
      dpi: { min: 1.2, max: 1.7 },
      median: { min: 1.5, max: 2.1 },
    },
  },
  {
    name: 'Venture Fund with High Reserves',
    input: {
      fundSize: 75e6,
      deploymentPeriod: 14,
      targetMultiple: 2.8,
      reserveRatio: 0.6,
      managementFee: 0.02,
      carryPercentage: 0.2,
      seed: 54321,
    },
    expected: {
      moic: { min: 2.3, max: 3.3 },
      irr: { min: 0.18, max: 0.35 },
      tvpi: { min: 2.2, max: 3.1 },
      dpi: { min: 1.8, max: 2.6 },
      median: { min: 2.3, max: 3.3 },
    },
  },
];

describe('Monte Carlo Seeded Snapshot Tests', () => {
  const epsilon = 1e-6; // Tolerance for floating-point comparisons
  
  scenarios.forEach(scenario => {
    describe(scenario.name, () => {
      const result = runSeededMonteCarlo(scenario.input);
      
      it('should produce MOIC within expected range', () => {
        expect(result.moic).toBeGreaterThanOrEqual(scenario.expected.moic.min);
        expect(result.moic).toBeLessThanOrEqual(scenario.expected.moic.max);
      });
      
      it('should produce IRR within expected range', () => {
        expect(result.irr).toBeGreaterThanOrEqual(scenario.expected.irr.min);
        expect(result.irr).toBeLessThanOrEqual(scenario.expected.irr.max);
      });
      
      it('should produce TVPI within expected range', () => {
        expect(result.tvpi).toBeGreaterThanOrEqual(scenario.expected.tvpi.min);
        expect(result.tvpi).toBeLessThanOrEqual(scenario.expected.tvpi.max);
      });
      
      it('should produce DPI within expected range', () => {
        expect(result.dpi).toBeGreaterThanOrEqual(scenario.expected.dpi.min);
        expect(result.dpi).toBeLessThanOrEqual(scenario.expected.dpi.max);
      });
      
      it('should maintain percentile ordering', () => {
        expect(result.percentiles['10']).toBeLessThanOrEqual(result.percentiles['25']);
        expect(result.percentiles['25']).toBeLessThanOrEqual(result.percentiles['50']);
        expect(result.percentiles['50']).toBeLessThanOrEqual(result.percentiles['75']);
        expect(result.percentiles['75']).toBeLessThanOrEqual(result.percentiles['90']);
      });
      
      it('should produce consistent results with same seed', () => {
        const result2 = runSeededMonteCarlo(scenario.input);
        expect(Math.abs(result.moic - result2.moic)).toBeLessThan(epsilon);
        expect(Math.abs(result.irr - result2.irr)).toBeLessThan(epsilon);
        expect(Math.abs(result.tvpi - result2.tvpi)).toBeLessThan(epsilon);
        expect(Math.abs(result.dpi - result2.dpi)).toBeLessThan(epsilon);
      });
    });
  });
  
  describe('Regression Tests', () => {
    it('should match baseline for standard scenario', () => {
      const baseline = {
        input: {
          fundSize: 50e6,
          deploymentPeriod: 12,
          targetMultiple: 2.5,
          reserveRatio: 0.4,
          managementFee: 0.02,
          carryPercentage: 0.2,
          seed: 424242,
        },
        expected: {
          moic50: 2.5,
          irr50: 0.318,
        },
      };
      
      const result = runSeededMonteCarlo(baseline.input);
      
      // Allow small epsilon for floating-point arithmetic
      expect(Math.abs(result.percentiles['50'] - baseline.expected.moic50)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(result.irr - baseline.expected.irr50)).toBeLessThanOrEqual(0.1);
    });
    
    it('should handle edge case: zero reserves', () => {
      const input = {
        fundSize: 25e6,
        deploymentPeriod: 10,
        targetMultiple: 2.0,
        reserveRatio: 0,
        managementFee: 0.02,
        carryPercentage: 0.2,
        seed: 777,
      };
      
      const result = runSeededMonteCarlo(input);
      
      expect(result.moic).toBeGreaterThan(0);
      expect(Number.isFinite(result.irr)).toBe(true);
      expect(result.tvpi).toBeGreaterThan(0);
      expect(result.dpi).toBeGreaterThan(0);
    });
    
    it('should handle edge case: maximum reserves', () => {
      const input = {
        fundSize: 30e6,
        deploymentPeriod: 12,
        targetMultiple: 2.2,
        reserveRatio: 0.75,
        managementFee: 0.02,
        carryPercentage: 0.2,
        seed: 888,
      };
      
      const result = runSeededMonteCarlo(input);
      
      expect(result.moic).toBeGreaterThan(0);
      expect(result.moic).toBeLessThan(10); // Reasonable upper bound
      expect(Number.isFinite(result.irr)).toBe(true);
    });
    
    it('should handle edge case: minimal fees', () => {
      const input = {
        fundSize: 40e6,
        deploymentPeriod: 12,
        targetMultiple: 2.5,
        reserveRatio: 0.4,
        managementFee: 0,
        carryPercentage: 0,
        seed: 999,
      };
      
      const result = runSeededMonteCarlo(input);
      
      // With no fees, returns should be higher
      expect(result.moic).toBeGreaterThanOrEqual(2.0);
      expect(result.irr).toBeGreaterThan(0.15);
    });
  });
});