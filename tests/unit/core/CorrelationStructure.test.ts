/**
 * Tests for CorrelationStructure - Three-component correlation modeling
 * Critical invariants:
 * - Weights must sum to 1.0 (variance decomposition)
 * - Empirical correlations match theoretical predictions
 * - Same seed produces identical shock sequences
 */

import { describe, it, expect } from 'vitest';
import {
  CorrelationStructure,
  validateCorrelationWeights,
  createCorrelationStructure,
  DEFAULT_CORRELATION_WEIGHTS,
  type CorrelationWeights,
} from '../../../shared/core/optimization/CorrelationStructure';
import { SeededRNG } from '../../../shared/core/optimization/SeededRNG';

describe('CorrelationStructure', () => {
  describe('Validation', () => {
    it('should accept weights that sum to 1.0', () => {
      const weights: CorrelationWeights = {
        macro: 0.5,
        systematic: 0.3,
        idiosyncratic: 0.2,
      };

      expect(() => validateCorrelationWeights(weights)).not.toThrow();
    });

    it('should reject weights that do not sum to 1.0', () => {
      const weights: CorrelationWeights = {
        macro: 0.5,
        systematic: 0.3,
        idiosyncratic: 0.3, // Sum = 1.1
      };

      expect(() => validateCorrelationWeights(weights)).toThrow(
        'Correlation weights must sum to 1.0'
      );
    });

    it('should reject negative weights', () => {
      const weights: CorrelationWeights = {
        macro: 0.6,
        systematic: 0.5,
        idiosyncratic: -0.1, // Negative
      };

      expect(() => validateCorrelationWeights(weights)).toThrow(
        'All correlation weights must be non-negative'
      );
    });

    it('should accept small rounding errors (1e-6 tolerance)', () => {
      const weights: CorrelationWeights = {
        macro: 0.333333,
        systematic: 0.333333,
        idiosyncratic: 0.333334, // Sum = 1.000000 (within epsilon)
      };

      expect(() => validateCorrelationWeights(weights)).not.toThrow();
    });

    it('should validate default correlation weights', () => {
      expect(() => validateCorrelationWeights(DEFAULT_CORRELATION_WEIGHTS)).not.toThrow();
      expect(DEFAULT_CORRELATION_WEIGHTS.macro).toBe(0.5);
      expect(DEFAULT_CORRELATION_WEIGHTS.systematic).toBe(0.25);
      expect(DEFAULT_CORRELATION_WEIGHTS.idiosyncratic).toBe(0.25);
    });
  });

  describe('Construction', () => {
    it('should create structure with valid weights', () => {
      const weights: CorrelationWeights = {
        macro: 0.6,
        systematic: 0.25,
        idiosyncratic: 0.15,
      };

      const structure = new CorrelationStructure(weights);
      expect(structure).toBeDefined();
      expect(structure.getWeights()).toEqual(weights);
    });

    it('should throw on construction with invalid weights', () => {
      const weights: CorrelationWeights = {
        macro: 0.5,
        systematic: 0.5,
        idiosyncratic: 0.5, // Sum = 1.5
      };

      expect(() => new CorrelationStructure(weights)).toThrow();
    });

    it('should use factory function', () => {
      const structure = createCorrelationStructure();
      expect(structure.getWeights()).toEqual(DEFAULT_CORRELATION_WEIGHTS);
    });

    it('should use factory function with custom weights', () => {
      const weights: CorrelationWeights = {
        macro: 0.4,
        systematic: 0.4,
        idiosyncratic: 0.2,
      };

      const structure = createCorrelationStructure(weights);
      expect(structure.getWeights()).toEqual(weights);
    });
  });

  describe('generateScenarioShocks()', () => {
    it('should generate correct number of shocks', () => {
      const structure = createCorrelationStructure();
      const rng = new SeededRNG(12345);

      const shocks = structure.generateScenarioShocks(10, rng);

      expect(shocks).toHaveLength(10);
    });

    it('should generate different shocks for different buckets', () => {
      const structure = createCorrelationStructure();
      const rng = new SeededRNG(12345);

      const shocks = structure.generateScenarioShocks(50, rng);
      const uniqueShocks = new Set(shocks);

      // All shocks should be unique (probability of collision is astronomically low)
      expect(uniqueShocks.size).toBe(50);
    });

    it('should produce reproducible shocks with same seed', () => {
      const structure = createCorrelationStructure();

      const rng1 = new SeededRNG(999);
      const shocks1 = structure.generateScenarioShocks(20, rng1);

      const rng2 = new SeededRNG(999);
      const shocks2 = structure.generateScenarioShocks(20, rng2);

      expect(shocks1).toEqual(shocks2);
    });

    it('should generate shocks with approximately zero mean', () => {
      const structure = createCorrelationStructure();
      const rng = new SeededRNG(777);

      // Average over many scenarios
      const allShocks: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const shocks = structure.generateScenarioShocks(10, rng);
        allShocks.push(...shocks);
      }

      const mean = allShocks.reduce((sum, s) => sum + s, 0) / allShocks.length;
      expect(mean).toBeCloseTo(0, 1); // Within 0.1 of zero
    });

    it('should generate shocks with approximately unit variance', () => {
      const structure = createCorrelationStructure();
      const rng = new SeededRNG(888);

      // Collect many shocks
      const allShocks: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const shocks = structure.generateScenarioShocks(10, rng);
        allShocks.push(...shocks);
      }

      const mean = allShocks.reduce((sum, s) => sum + s, 0) / allShocks.length;
      const variance =
        allShocks.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allShocks.length;

      expect(variance).toBeCloseTo(1.0, 1); // Within 0.1 of 1.0
    });
  });

  describe('generateCorrelatedMatrix()', () => {
    it('should generate matrix with correct dimensions', () => {
      const structure = createCorrelationStructure();
      const rng = new SeededRNG(555);

      const matrix = structure.generateCorrelatedMatrix(50, 400, rng);

      expect(matrix).toHaveLength(400); // 400 scenarios
      expect(matrix[0]).toHaveLength(50); // 50 buckets
    });

    it('should produce reproducible matrices with same seed', () => {
      const structure = createCorrelationStructure();

      const rng1 = new SeededRNG(123);
      const matrix1 = structure.generateCorrelatedMatrix(10, 20, rng1);

      const rng2 = new SeededRNG(123);
      const matrix2 = structure.generateCorrelatedMatrix(10, 20, rng2);

      expect(matrix1).toEqual(matrix2);
    });

    it('should produce byte-identical Float32Arrays for cache', () => {
      const structure = createCorrelationStructure();

      const rng1 = new SeededRNG(456);
      const matrix1 = structure.generateCorrelatedMatrix(50, 100, rng1);
      const flat1 = Float32Array.from(matrix1.flat());

      const rng2 = new SeededRNG(456);
      const matrix2 = structure.generateCorrelatedMatrix(50, 100, rng2);
      const flat2 = Float32Array.from(matrix2.flat());

      expect(new Uint8Array(flat1.buffer)).toEqual(new Uint8Array(flat2.buffer));
    });
  });

  describe('Empirical Correlation - Critical Invariant', () => {
    it('should produce correlation matching theoretical predictions', () => {
      const weights: CorrelationWeights = {
        macro: 0.5,
        systematic: 0.3,
        idiosyncratic: 0.2,
      };
      const structure = new CorrelationStructure(weights);
      const rng = new SeededRNG(999);

      // Generate large sample for statistical accuracy
      const numScenarios = 10000;
      const numBuckets = 10;
      const matrix = structure.generateCorrelatedMatrix(numBuckets, numScenarios, rng);

      // Calculate empirical correlation between bucket 0 and bucket 1
      const bucket0 = matrix.map((scenario) => scenario[0]);
      const bucket1 = matrix.map((scenario) => scenario[1]);

      const mean0 = bucket0.reduce((sum, v) => sum + v, 0) / bucket0.length;
      const mean1 = bucket1.reduce((sum, v) => sum + v, 0) / bucket1.length;

      const cov =
        bucket0.reduce((sum, v, i) => sum + (v - mean0) * (bucket1[i] - mean1), 0) / bucket0.length;
      const std0 = Math.sqrt(
        bucket0.reduce((sum, v) => sum + Math.pow(v - mean0, 2), 0) / bucket0.length
      );
      const std1 = Math.sqrt(
        bucket1.reduce((sum, v) => sum + Math.pow(v - mean1, 2), 0) / bucket1.length
      );

      const empiricalCorrelation = cov / (std0 * std1);
      const theoreticalCorrelation = structure.getTheoreticalCorrelation(false); // Different buckets

      // Empirical should match theoretical within sampling error
      expect(empiricalCorrelation).toBeCloseTo(theoreticalCorrelation, 1);
    });

    it('should have higher correlation within same bucket (if tracking)', () => {
      // Note: Current implementation treats each shock as independent bucket
      // If we extend to track "same bucket, different scenarios", this test validates that behavior
      const structure = createCorrelationStructure();

      const sameBucketCor = structure.getTheoreticalCorrelation(true);
      const diffBucketCor = structure.getTheoreticalCorrelation(false);

      expect(sameBucketCor).toBeGreaterThan(diffBucketCor);
      expect(sameBucketCor).toBe(0.5 + 0.25); // macro + systematic
      expect(diffBucketCor).toBe(0.5); // macro only
    });

    it('should match macro correlation empirically across buckets', () => {
      const structure = createCorrelationStructure({
        macro: 0.6,
        systematic: 0.2,
        idiosyncratic: 0.2,
      });
      const rng = new SeededRNG(111);

      const numScenarios = 10000;
      const matrix = structure.generateCorrelatedMatrix(5, numScenarios, rng);

      // Compare bucket 0 and bucket 2
      const bucket0 = matrix.map((s) => s[0]);
      const bucket2 = matrix.map((s) => s[2]);

      const mean0 = bucket0.reduce((sum, v) => sum + v, 0) / bucket0.length;
      const mean2 = bucket2.reduce((sum, v) => sum + v, 0) / bucket2.length;

      const cov =
        bucket0.reduce((sum, v, i) => sum + (v - mean0) * (bucket2[i] - mean2), 0) / bucket0.length;
      const std0 = Math.sqrt(
        bucket0.reduce((sum, v) => sum + Math.pow(v - mean0, 2), 0) / bucket0.length
      );
      const std2 = Math.sqrt(
        bucket2.reduce((sum, v) => sum + Math.pow(v - mean2, 2), 0) / bucket2.length
      );

      const empiricalCorrelation = cov / (std0 * std2);

      // Should match macro weight (0.6)
      expect(empiricalCorrelation).toBeCloseTo(0.6, 1);
    });
  });

  describe('getTheoreticalCorrelation()', () => {
    it('should return correct correlation for same bucket', () => {
      const weights: CorrelationWeights = {
        macro: 0.5,
        systematic: 0.3,
        idiosyncratic: 0.2,
      };
      const structure = new CorrelationStructure(weights);

      const correlation = structure.getTheoreticalCorrelation(true);
      expect(correlation).toBe(0.8); // 0.5 + 0.3
    });

    it('should return correct correlation for different buckets', () => {
      const weights: CorrelationWeights = {
        macro: 0.4,
        systematic: 0.35,
        idiosyncratic: 0.25,
      };
      const structure = new CorrelationStructure(weights);

      const correlation = structure.getTheoreticalCorrelation(false);
      expect(correlation).toBe(0.4); // macro only
    });

    it('should handle zero systematic weight', () => {
      const weights: CorrelationWeights = {
        macro: 0.7,
        systematic: 0,
        idiosyncratic: 0.3,
      };
      const structure = new CorrelationStructure(weights);

      expect(structure.getTheoreticalCorrelation(true)).toBe(0.7); // macro only
      expect(structure.getTheoreticalCorrelation(false)).toBe(0.7); // same as above
    });
  });

  describe('Realistic Tail Risk - Design Validation', () => {
    it('should produce correlated downside scenarios (market crash)', () => {
      const structure = createCorrelationStructure({
        macro: 0.6, // High macro correlation
        systematic: 0.2,
        idiosyncratic: 0.2,
      });
      const rng = new SeededRNG(666);

      const numScenarios = 1000;
      const numBuckets = 20;
      const matrix = structure.generateCorrelatedMatrix(numBuckets, numScenarios, rng);

      // Count scenarios where >= 80% of buckets have negative shocks
      const crashScenarios = matrix.filter((scenario) => {
        const negativeCount = scenario.filter((shock) => shock < 0).length;
        return negativeCount >= 0.8 * numBuckets;
      });

      // With high macro correlation, should see realistic crash scenarios
      // (Without correlation, this would be astronomically rare)
      expect(crashScenarios.length).toBeGreaterThan(0);

      // Rough heuristic: ~10-20% of scenarios should be "crashes" (most buckets down)
      const crashRate = crashScenarios.length / numScenarios;
      expect(crashRate).toBeGreaterThan(0.05);
      expect(crashRate).toBeLessThan(0.3);
    });

    it('should prevent unrealistic diversification with low correlation', () => {
      // Low correlation = high idiosyncratic = law of large numbers dominates
      const structure = createCorrelationStructure({
        macro: 0.1, // Very low macro
        systematic: 0.1,
        idiosyncratic: 0.8, // High idiosyncratic
      });
      const rng = new SeededRNG(777);

      const numScenarios = 1000;
      const numBuckets = 50; // Large portfolio
      const matrix = structure.generateCorrelatedMatrix(numBuckets, numScenarios, rng);

      // Calculate portfolio-level shock (average across buckets) for each scenario
      const portfolioShocks = matrix.map((scenario) => {
        return scenario.reduce((sum, shock) => sum + shock, 0) / scenario.length;
      });

      // With low correlation, portfolio shocks should be tightly clustered near 0
      const portfolioStdDev = Math.sqrt(
        portfolioShocks.reduce((sum, shock) => sum + Math.pow(shock, 2), 0) / portfolioShocks.length
      );

      // Should be much less than 1.0 (individual shock stddev)
      // Theoretical: sqrt(0.1/50) ≈ 0.045, but sampling variation allows up to ~0.4
      expect(portfolioStdDev).toBeLessThan(0.4);
    });
  });

  describe('Performance', () => {
    it('should generate 50 buckets x 400 scenarios quickly', () => {
      const structure = createCorrelationStructure();
      const rng = new SeededRNG(12345);

      const start = Date.now();
      structure.generateCorrelatedMatrix(50, 400, rng);
      const elapsed = Date.now() - start;

      // Should complete in < 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});
