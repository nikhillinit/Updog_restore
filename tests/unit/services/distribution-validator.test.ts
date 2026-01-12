/**
 * Distribution Validator Tests
 *
 * Tests for Monte Carlo distribution validation service.
 * Ensures percentile monotonicity, bound consistency, and metric-specific constraints.
 */

import { describe, it, expect } from 'vitest';
import {
  DistributionValidator,
  validateDistribution,
  createDistributionValidator,
  type MetricType,
} from '../../../server/services/distribution-validator';
import type { PerformanceDistribution } from '../../../server/services/monte-carlo-engine';

// Helper to create test distributions
function createTestDistribution(
  overrides: Partial<PerformanceDistribution> = {}
): PerformanceDistribution {
  return {
    scenarios: [],
    percentiles: { p5: 0.1, p25: 0.15, p50: 0.2, p75: 0.25, p95: 0.3, ...overrides.percentiles },
    statistics: {
      mean: 0.2,
      standardDeviation: 0.05,
      min: 0.05,
      max: 0.35,
      ...overrides.statistics,
    },
    confidenceIntervals: {
      ci68: [0.15, 0.25] as [number, number],
      ci95: [0.1, 0.3] as [number, number],
      ...overrides.confidenceIntervals,
    },
    ...overrides,
  };
}

describe('Distribution Validator', () => {
  describe('validateDistribution', () => {
    describe('valid distributions', () => {
      it('should pass with valid monotonic percentiles', () => {
        const dist = createTestDistribution();
        const result = validateDistribution(dist, 'irr');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should pass for valid TVPI distribution', () => {
        const dist = createTestDistribution({
          percentiles: { p5: 0.8, p25: 1.2, p50: 1.8, p75: 2.5, p95: 3.5 },
          statistics: { mean: 1.8, standardDeviation: 0.5, min: 0.5, max: 5.0 },
        });
        const result = validateDistribution(dist, 'tvpi');
        expect(result.valid).toBe(true);
      });
    });

    describe('non-monotonic percentiles', () => {
      it('should fail when P5 > P25', () => {
        const dist = createTestDistribution({
          percentiles: { p5: 0.3, p25: 0.1, p50: 0.15, p75: 0.25, p95: 0.4 },
        });
        const result = validateDistribution(dist, 'irr');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('monotonicity'))).toBe(true);
      });

      it('should fail when P50 > P75', () => {
        const dist = createTestDistribution({
          percentiles: { p5: 0.1, p25: 0.15, p50: 0.4, p75: 0.25, p95: 0.5 },
        });
        const result = validateDistribution(dist, 'multiple');
        expect(result.valid).toBe(false);
      });
    });

    describe('min/max bounds', () => {
      it('should fail when min > mean', () => {
        const dist = createTestDistribution({
          statistics: { mean: 0.2, standardDeviation: 0.05, min: 0.5, max: 0.6 },
        });
        const result = validateDistribution(dist, 'irr');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Min') && e.includes('Mean'))).toBe(true);
      });
    });

    describe('metric-specific constraints', () => {
      it('should fail for negative multiple', () => {
        const dist = createTestDistribution({
          statistics: { mean: 1.5, standardDeviation: 0.5, min: -0.5, max: 3.0 },
        });
        const result = validateDistribution(dist, 'multiple');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
      });

      it('should allow negative IRR (valid loss scenario)', () => {
        const dist = createTestDistribution({
          percentiles: { p5: -0.3, p25: -0.1, p50: 0.05, p75: 0.15, p95: 0.3 },
          statistics: { mean: 0.05, standardDeviation: 0.15, min: -0.5, max: 0.5 },
        });
        const result = validateDistribution(dist, 'irr');
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('DistributionValidator class', () => {
    it('should create validator with default configs', () => {
      const validator = new DistributionValidator();
      expect(validator).toBeDefined();
    });

    it('should validate batch of distributions', () => {
      const validator = new DistributionValidator();
      const distributions = {
        irr: createTestDistribution(),
        multiple: createTestDistribution({
          percentiles: { p5: 1.0, p25: 1.5, p50: 2.0, p75: 2.5, p95: 3.0 },
          statistics: { mean: 2.0, standardDeviation: 0.5, min: 0.5, max: 4.0 },
        }),
      } as Record<MetricType, PerformanceDistribution>;

      const result = validator.validateBatch(distributions);
      expect(result.allValid).toBe(true);
    });

    it('should report errors in batch validation', () => {
      const validator = new DistributionValidator();
      const distributions = {
        irr: createTestDistribution(),
        multiple: createTestDistribution({
          statistics: { mean: 2.0, standardDeviation: 0.5, min: -0.5, max: 4.0 }, // negative min for multiple
        }),
      } as Record<MetricType, PerformanceDistribution>;

      const result = validator.validateBatch(distributions);
      expect(result.allValid).toBe(false);
      expect(result.totalErrors).toBeGreaterThan(0);
    });

    it('should support isValid quick check', () => {
      const validator = new DistributionValidator();
      const dist = createTestDistribution();
      expect(validator.isValid(dist, 'irr')).toBe(true);
    });
  });

  describe('createDistributionValidator factory', () => {
    it('should create validator with custom configs', () => {
      const validator = createDistributionValidator({
        irr: { expectedRange: { min: -0.5, max: 1.0 } },
      });
      expect(validator).toBeDefined();
    });
  });
});
