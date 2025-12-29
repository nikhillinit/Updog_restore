/**
 * Distribution Sanity Validation Test Suite
 *
 * Task 2.7: Validates probabilistic distribution outputs for sanity.
 *
 * Key validations:
 * 1. No impossible negatives where not meaningful
 * 2. Percentiles monotonic: P5 <= P25 <= P50 <= P75 <= P95
 * 3. Mean within reasonable bounds
 * 4. Standard deviation positive
 * 5. Confidence intervals properly ordered
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DistributionValidator,
  createDistributionValidator,
  validateDistribution,
} from '../../../server/services/distribution-validator';
import type { PerformanceDistribution } from '../../../server/services/monte-carlo-engine';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createValidDistribution = (
  overrides: Partial<PerformanceDistribution> = {}
): PerformanceDistribution => ({
  scenarios: [1, 2, 3, 4, 5],
  percentiles: {
    p5: 0.5,
    p25: 1.0,
    p50: 2.0,
    p75: 3.0,
    p95: 4.5,
    ...overrides.percentiles,
  },
  statistics: {
    mean: 2.2,
    standardDeviation: 1.1,
    min: 0.3,
    max: 5.0,
    ...overrides.statistics,
  },
  confidenceIntervals: {
    ci68: [1.1, 3.3],
    ci95: [0.0, 4.4],
    ...overrides.confidenceIntervals,
  },
});

const createInvalidMonotonicDistribution = (): PerformanceDistribution => ({
  scenarios: [1, 2, 3],
  percentiles: {
    p5: 3.0, // INVALID: should be lowest
    p25: 2.0,
    p50: 1.0, // INVALID: lower than P25
    p75: 2.5,
    p95: 4.0,
  },
  statistics: {
    mean: 2.0,
    standardDeviation: 1.0,
    min: 0.5,
    max: 4.5,
  },
  confidenceIntervals: {
    ci68: [1.0, 3.0],
    ci95: [0.0, 4.0],
  },
});

const createNegativeMultipleDistribution = (): PerformanceDistribution => ({
  scenarios: [-0.5, 1, 2],
  percentiles: {
    p5: -0.3, // INVALID for multiples
    p25: 0.5,
    p50: 1.5,
    p75: 2.5,
    p95: 3.5,
  },
  statistics: {
    mean: 1.5,
    standardDeviation: 1.2,
    min: -0.5, // INVALID for multiples
    max: 4.0,
  },
  confidenceIntervals: {
    ci68: [0.3, 2.7],
    ci95: [-0.9, 3.9],
  },
});

// =============================================================================
// VALIDATOR INITIALIZATION TESTS
// =============================================================================

describe('Distribution Sanity Validation - Initialization', () => {
  it('should create validator with default configs', () => {
    const validator = new DistributionValidator();
    expect(validator).toBeDefined();
  });

  it('should create validator with custom configs', () => {
    const validator = new DistributionValidator({
      multiple: {
        expectedRange: { min: 0, max: 50 },
      },
    });
    expect(validator).toBeDefined();
  });

  it('should create validator via factory function', () => {
    const validator = createDistributionValidator();
    expect(validator).toBeDefined();
  });
});

// =============================================================================
// PERCENTILE MONOTONICITY TESTS
// =============================================================================

describe('Distribution Sanity Validation - Percentile Monotonicity', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should pass valid monotonic percentiles', () => {
    const dist = createValidDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when P5 > P25', () => {
    const dist = createValidDistribution({
      percentiles: { p5: 2.0, p25: 1.0, p50: 2.5, p75: 3.0, p95: 4.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('P5') && e.includes('P25'))).toBe(true);
  });

  it('should fail when P25 > P50', () => {
    const dist = createValidDistribution({
      percentiles: { p5: 0.5, p25: 3.0, p50: 2.0, p75: 3.5, p95: 4.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('P25') && e.includes('P50'))).toBe(true);
  });

  it('should fail when P50 > P75', () => {
    const dist = createValidDistribution({
      percentiles: { p5: 0.5, p25: 1.0, p50: 4.0, p75: 3.0, p95: 4.5 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('P50') && e.includes('P75'))).toBe(true);
  });

  it('should fail when P75 > P95', () => {
    const dist = createValidDistribution({
      percentiles: { p5: 0.5, p25: 1.0, p50: 2.0, p75: 5.0, p95: 4.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('P75') && e.includes('P95'))).toBe(true);
  });

  it('should fail with multiple monotonicity violations', () => {
    const dist = createInvalidMonotonicDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

// =============================================================================
// NON-NEGATIVITY TESTS
// =============================================================================

describe('Distribution Sanity Validation - Non-Negativity', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should pass positive distributions for multiples', () => {
    const dist = createValidDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
  });

  it('should fail negative minimum for multiples', () => {
    const dist = createNegativeMultipleDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('should allow negative values for IRR', () => {
    const dist = createValidDistribution({
      percentiles: { p5: -0.2, p25: -0.1, p50: 0.1, p75: 0.2, p95: 0.3 },
      statistics: { mean: 0.05, standardDeviation: 0.15, min: -0.3, max: 0.4 },
    });
    const result = validator.validateDistribution(dist, 'irr');

    // Should be valid because IRR can be negative
    expect(result.valid).toBe(true);
  });

  it('should fail negative minimum for TVPI', () => {
    const dist = createValidDistribution({
      statistics: { mean: 1.5, standardDeviation: 0.5, min: -0.1, max: 3.0 },
    });
    const result = validator.validateDistribution(dist, 'tvpi');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('should fail negative minimum for DPI', () => {
    const dist = createValidDistribution({
      statistics: { mean: 0.5, standardDeviation: 0.3, min: -0.2, max: 1.5 },
    });
    const result = validator.validateDistribution(dist, 'dpi');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });
});

// =============================================================================
// RANGE VALIDATION TESTS
// =============================================================================

describe('Distribution Sanity Validation - Range', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should pass mean within expected range', () => {
    const dist = createValidDistribution({
      statistics: { mean: 2.0, standardDeviation: 1.0, min: 0.5, max: 4.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
  });

  it('should fail mean above expected maximum', () => {
    const dist = createValidDistribution({
      statistics: { mean: 25.0, standardDeviation: 5.0, min: 15.0, max: 35.0 },
      percentiles: { p5: 16.0, p25: 20.0, p50: 25.0, p75: 30.0, p95: 34.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('above expected maximum'))).toBe(true);
  });

  it('should fail IRR mean below -100%', () => {
    const dist = createValidDistribution({
      statistics: { mean: -1.5, standardDeviation: 0.5, min: -2.0, max: -1.0 },
      percentiles: { p5: -1.9, p25: -1.6, p50: -1.5, p75: -1.3, p95: -1.1 },
    });
    const result = validator.validateDistribution(dist, 'irr');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('below expected minimum'))).toBe(true);
  });
});

// =============================================================================
// STANDARD DEVIATION TESTS
// =============================================================================

describe('Distribution Sanity Validation - Standard Deviation', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should pass positive standard deviation', () => {
    const dist = createValidDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
  });

  it('should fail negative standard deviation', () => {
    const dist = createValidDistribution({
      statistics: { mean: 2.0, standardDeviation: -1.0, min: 0.5, max: 4.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Standard deviation is negative'))).toBe(true);
  });
});

// =============================================================================
// CONFIDENCE INTERVAL TESTS
// =============================================================================

describe('Distribution Sanity Validation - Confidence Intervals', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should pass valid confidence intervals', () => {
    const dist = createValidDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
  });

  it('should fail when CI68 lower >= upper', () => {
    const dist = createValidDistribution({
      confidenceIntervals: { ci68: [3.0, 2.0], ci95: [0.0, 5.0] },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CI68'))).toBe(true);
  });

  it('should fail when CI95 lower >= upper', () => {
    const dist = createValidDistribution({
      confidenceIntervals: { ci68: [1.0, 3.0], ci95: [4.0, 2.0] },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('CI95'))).toBe(true);
  });

  it('should warn when CI68 wider than CI95', () => {
    const dist = createValidDistribution({
      confidenceIntervals: { ci68: [0.0, 5.0], ci95: [1.0, 3.0] },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    // This is a warning, not an error
    expect(result.warnings.some((w) => w.includes('CI68 width'))).toBe(true);
  });
});

// =============================================================================
// STATISTICS BOUNDS TESTS
// =============================================================================

describe('Distribution Sanity Validation - Statistics Bounds', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should pass when min <= mean <= max', () => {
    const dist = createValidDistribution();
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
  });

  it('should fail when min > mean', () => {
    const dist = createValidDistribution({
      statistics: { mean: 1.0, standardDeviation: 0.5, min: 2.0, max: 4.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Min') && e.includes('Mean'))).toBe(true);
  });

  it('should fail when mean > max', () => {
    const dist = createValidDistribution({
      statistics: { mean: 5.0, standardDeviation: 0.5, min: 0.5, max: 3.0 },
    });
    const result = validator.validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Mean') && e.includes('Max'))).toBe(true);
  });
});

// =============================================================================
// BATCH VALIDATION TESTS
// =============================================================================

describe('Distribution Sanity Validation - Batch Validation', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should validate multiple distributions', () => {
    // Create distributions with appropriate values for each metric type
    const distributions = {
      irr: createValidDistribution({
        percentiles: { p5: 0.05, p25: 0.1, p50: 0.15, p75: 0.2, p95: 0.3 },
        statistics: { mean: 0.15, standardDeviation: 0.08, min: 0.02, max: 0.35 },
        confidenceIntervals: { ci68: [0.07, 0.23], ci95: [-0.01, 0.31] },
      }),
      multiple: createValidDistribution({
        percentiles: { p5: 0.8, p25: 1.5, p50: 2.5, p75: 3.5, p95: 5.0 },
        statistics: { mean: 2.5, standardDeviation: 1.2, min: 0.5, max: 6.0 },
        confidenceIntervals: { ci68: [1.3, 3.7], ci95: [0.1, 4.9] },
      }),
      dpi: createValidDistribution({
        percentiles: { p5: 0.1, p25: 0.3, p50: 0.5, p75: 0.8, p95: 1.2 },
        statistics: { mean: 0.5, standardDeviation: 0.3, min: 0.05, max: 1.5 },
        confidenceIntervals: { ci68: [0.2, 0.8], ci95: [-0.1, 1.1] },
      }),
      tvpi: createValidDistribution({
        percentiles: { p5: 0.8, p25: 1.2, p50: 1.8, p75: 2.5, p95: 4.0 },
        statistics: { mean: 1.8, standardDeviation: 0.9, min: 0.5, max: 5.0 },
        confidenceIntervals: { ci68: [0.9, 2.7], ci95: [0.0, 3.6] },
      }),
      totalValue: createValidDistribution({
        percentiles: { p5: 10e6, p25: 30e6, p50: 50e6, p75: 80e6, p95: 150e6 },
        statistics: { mean: 55e6, standardDeviation: 40e6, min: 5e6, max: 200e6 },
        confidenceIntervals: { ci68: [15e6, 95e6], ci95: [-25e6, 135e6] },
      }),
    };

    const result = validator.validateBatch(distributions);

    expect(result.allValid).toBe(true);
    expect(result.totalErrors).toBe(0);
  });

  it('should report all errors from batch', () => {
    const distributions = {
      irr: createValidDistribution(),
      multiple: createInvalidMonotonicDistribution(),
      dpi: createNegativeMultipleDistribution(),
      tvpi: createValidDistribution(),
      totalValue: createValidDistribution(),
    };

    const result = validator.validateBatch(distributions);

    expect(result.allValid).toBe(false);
    expect(result.totalErrors).toBeGreaterThan(0);
  });

  it('should return individual results for each metric', () => {
    const distributions = {
      irr: createValidDistribution(),
      multiple: createValidDistribution(),
      dpi: createValidDistribution(),
      tvpi: createValidDistribution(),
      totalValue: createValidDistribution(),
    };

    const result = validator.validateBatch(distributions);

    expect(result.results.irr).toBeDefined();
    expect(result.results.multiple).toBeDefined();
    expect(result.results.dpi).toBeDefined();
    expect(result.results.tvpi).toBeDefined();
    expect(result.results.totalValue).toBeDefined();
  });
});

// =============================================================================
// STANDALONE FUNCTION TESTS
// =============================================================================

describe('Distribution Sanity Validation - Standalone Function', () => {
  it('should validate using standalone function', () => {
    const dist = createValidDistribution();
    const result = validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(true);
    expect(result.metricType).toBe('multiple');
  });

  it('should detect errors using standalone function', () => {
    const dist = createInvalidMonotonicDistribution();
    const result = validateDistribution(dist, 'multiple');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// IS VALID SHORTCUT TESTS
// =============================================================================

describe('Distribution Sanity Validation - isValid Shortcut', () => {
  let validator: DistributionValidator;

  beforeEach(() => {
    validator = new DistributionValidator();
  });

  it('should return true for valid distribution', () => {
    const dist = createValidDistribution();
    expect(validator.isValid(dist, 'multiple')).toBe(true);
  });

  it('should return false for invalid distribution', () => {
    const dist = createInvalidMonotonicDistribution();
    expect(validator.isValid(dist, 'multiple')).toBe(false);
  });
});
