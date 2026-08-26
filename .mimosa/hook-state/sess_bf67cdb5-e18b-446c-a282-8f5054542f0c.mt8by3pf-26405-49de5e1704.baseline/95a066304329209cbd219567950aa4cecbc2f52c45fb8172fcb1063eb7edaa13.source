/**
 * Distribution Validator
 *
 * Task 2.7: Validates probabilistic distribution outputs for sanity.
 * Ensures Monte Carlo results are mathematically valid.
 *
 * Validation Rules:
 * 1. No impossible negatives where not meaningful
 * 2. Percentiles monotonic: P5 <= P25 <= P50 <= P75 <= P95
 * 3. Mean within reasonable bounds
 * 4. Standard deviation positive
 * 5. Confidence intervals properly ordered
 */

import type { PerformanceDistribution } from './monte-carlo-engine';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type MetricType = 'irr' | 'multiple' | 'dpi' | 'tvpi' | 'totalValue';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metricType: MetricType;
}

export interface DistributionValidationConfig {
  metricType: MetricType;
  allowNegative: boolean; // IRR can be negative, multiples cannot
  expectedRange: {
    min: number;
    max: number;
  };
  name: string;
}

export interface BatchValidationResult {
  allValid: boolean;
  results: Record<MetricType, ValidationResult>;
  totalErrors: number;
  totalWarnings: number;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_CONFIGS: Record<MetricType, DistributionValidationConfig> = {
  irr: {
    metricType: 'irr',
    allowNegative: true,
    expectedRange: { min: -1.0, max: 2.0 }, // -100% to +200%
    name: 'Internal Rate of Return',
  },
  multiple: {
    metricType: 'multiple',
    allowNegative: false,
    expectedRange: { min: 0, max: 20 }, // 0x to 20x
    name: 'Investment Multiple',
  },
  dpi: {
    metricType: 'dpi',
    allowNegative: false,
    expectedRange: { min: 0, max: 10 }, // 0x to 10x
    name: 'Distributed to Paid-In',
  },
  tvpi: {
    metricType: 'tvpi',
    allowNegative: false,
    expectedRange: { min: 0, max: 20 }, // 0x to 20x
    name: 'Total Value to Paid-In',
  },
  totalValue: {
    metricType: 'totalValue',
    allowNegative: false,
    expectedRange: { min: 0, max: 1e12 }, // Up to $1T
    name: 'Total Value',
  },
};

// ============================================================================
// DISTRIBUTION VALIDATOR CLASS
// ============================================================================

export class DistributionValidator {
  private configs: Record<MetricType, DistributionValidationConfig>;

  constructor(customConfigs?: Partial<Record<MetricType, Partial<DistributionValidationConfig>>>) {
    this.configs = { ...DEFAULT_CONFIGS };

    // Apply custom configurations
    if (customConfigs) {
      for (const [metric, overrides] of Object.entries(customConfigs)) {
        if (overrides) {
          this.configs[metric as MetricType] = {
            ...this.configs[metric as MetricType],
            ...overrides,
          };
        }
      }
    }
  }

  /**
   * Validate a single performance distribution
   */
  validateDistribution(dist: PerformanceDistribution, metricType: MetricType): ValidationResult {
    const config = this.configs[metricType];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate percentile monotonicity
    const monotonicityResult = this.validatePercentileMonotonicity(dist.percentiles, config.name);
    errors.push(...monotonicityResult.errors);
    warnings.push(...monotonicityResult.warnings);

    // 2. Validate non-negativity (if required)
    if (!config.allowNegative) {
      const negativityResult = this.validateNonNegativity(dist, config.name);
      errors.push(...negativityResult.errors);
      warnings.push(...negativityResult.warnings);
    }

    // 3. Validate mean is within expected range
    const rangeResult = this.validateRange(dist.statistics.mean, config);
    errors.push(...rangeResult.errors);
    warnings.push(...rangeResult.warnings);

    // 4. Validate standard deviation is positive
    if (dist.statistics.standardDeviation < 0) {
      errors.push(
        `${config.name}: Standard deviation is negative (${dist.statistics.standardDeviation})`
      );
    }

    // 5. Validate confidence intervals
    const ciResult = this.validateConfidenceIntervals(dist.confidenceIntervals, config.name);
    errors.push(...ciResult.errors);
    warnings.push(...ciResult.warnings);

    // 6. Validate min <= mean <= max
    const boundsResult = this.validateStatisticsBounds(dist.statistics, config.name);
    errors.push(...boundsResult.errors);
    warnings.push(...boundsResult.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metricType,
    };
  }

  /**
   * Validate multiple distributions at once
   */
  validateBatch(distributions: Record<MetricType, PerformanceDistribution>): BatchValidationResult {
    const results: Record<MetricType, ValidationResult> = {} as Record<
      MetricType,
      ValidationResult
    >;
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const [metric, dist] of Object.entries(distributions)) {
      const metricType = metric as MetricType;
      const result = this.validateDistribution(dist, metricType);
      results[metricType] = result;
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
    }

    return {
      allValid: totalErrors === 0,
      results,
      totalErrors,
      totalWarnings,
    };
  }

  /**
   * Quick check if distribution is valid (no detailed errors)
   */
  isValid(dist: PerformanceDistribution, metricType: MetricType): boolean {
    return this.validateDistribution(dist, metricType).valid;
  }

  // ============================================================================
  // PRIVATE VALIDATION METHODS
  // ============================================================================

  private validatePercentileMonotonicity(
    percentiles: PerformanceDistribution['percentiles'],
    metricName: string
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // P5 <= P25 <= P50 <= P75 <= P95
    if (percentiles.p5 > percentiles.p25) {
      errors.push(
        `${metricName}: P5 (${percentiles.p5}) > P25 (${percentiles.p25}) violates monotonicity`
      );
    }
    if (percentiles.p25 > percentiles.p50) {
      errors.push(
        `${metricName}: P25 (${percentiles.p25}) > P50 (${percentiles.p50}) violates monotonicity`
      );
    }
    if (percentiles.p50 > percentiles.p75) {
      errors.push(
        `${metricName}: P50 (${percentiles.p50}) > P75 (${percentiles.p75}) violates monotonicity`
      );
    }
    if (percentiles.p75 > percentiles.p95) {
      errors.push(
        `${metricName}: P75 (${percentiles.p75}) > P95 (${percentiles.p95}) violates monotonicity`
      );
    }

    return { errors, warnings };
  }

  private validateNonNegativity(
    dist: PerformanceDistribution,
    metricName: string
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (dist.statistics.min < 0) {
      errors.push(`${metricName}: Minimum value (${dist.statistics.min}) is negative`);
    }

    if (dist.percentiles.p5 < 0) {
      warnings.push(`${metricName}: P5 (${dist.percentiles.p5}) is negative`);
    }

    return { errors, warnings };
  }

  private validateRange(
    mean: number,
    config: DistributionValidationConfig
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (mean < config.expectedRange.min) {
      errors.push(
        `${config.name}: Mean (${mean}) below expected minimum (${config.expectedRange.min})`
      );
    }
    if (mean > config.expectedRange.max) {
      errors.push(
        `${config.name}: Mean (${mean}) above expected maximum (${config.expectedRange.max})`
      );
    }

    return { errors, warnings };
  }

  private validateConfidenceIntervals(
    ci: PerformanceDistribution['confidenceIntervals'],
    metricName: string
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // CI lower should be less than CI upper
    if (ci.ci68[0] >= ci.ci68[1]) {
      errors.push(`${metricName}: CI68 lower (${ci.ci68[0]}) >= upper (${ci.ci68[1]})`);
    }
    if (ci.ci95[0] >= ci.ci95[1]) {
      errors.push(`${metricName}: CI95 lower (${ci.ci95[0]}) >= upper (${ci.ci95[1]})`);
    }

    // CI68 should be narrower than or equal to CI95
    const ci68Width = ci.ci68[1] - ci.ci68[0];
    const ci95Width = ci.ci95[1] - ci.ci95[0];
    if (ci68Width > ci95Width) {
      warnings.push(`${metricName}: CI68 width (${ci68Width}) > CI95 width (${ci95Width})`);
    }

    return { errors, warnings };
  }

  private validateStatisticsBounds(
    stats: PerformanceDistribution['statistics'],
    metricName: string
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // min <= mean <= max
    if (stats.min > stats.mean) {
      errors.push(`${metricName}: Min (${stats.min}) > Mean (${stats.mean})`);
    }
    if (stats.mean > stats.max) {
      errors.push(`${metricName}: Mean (${stats.mean}) > Max (${stats.max})`);
    }

    return { errors, warnings };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createDistributionValidator(
  customConfigs?: Partial<Record<MetricType, Partial<DistributionValidationConfig>>>
): DistributionValidator {
  return new DistributionValidator(customConfigs);
}

// ============================================================================
// STANDALONE VALIDATION FUNCTION
// ============================================================================

/**
 * Standalone function for quick distribution validation
 */
export function validateDistribution(
  dist: PerformanceDistribution,
  metricType: MetricType
): ValidationResult {
  const validator = new DistributionValidator();
  return validator.validateDistribution(dist, metricType);
}
