/**
 * Power-Law MOIC Distribution Generator
 *
 * Generates realistic VC investment returns using power-law (Pareto) distributions.
 * Returns are calibrated from user-provided median and P90 percentile targets.
 *
 * Design rationale:
 * - VC returns exhibit heavy tails: most investments return <1x, few return 10x+
 * - Power-law distribution captures this: P(X > x) ~ x^(-alpha)
 * - Excel uses median + P90 as intuitive calibration points (not raw alpha/scale)
 * - Solver inverts these percentiles to derive distribution parameters
 *
 * Mathematical model:
 * - CDF: F(x) = 1 - (x_min / x)^alpha
 * - PDF: f(x) = (alpha * x_min^alpha) / x^(alpha + 1)
 * - Median: x_min * 2^(1/alpha)
 * - P90: x_min * 10^(1/alpha)
 *
 * References:
 * - Korteweg & Sorensen (2010): Power-law tails in VC returns
 * - Cochrane (2005): "The Risk and Return of Venture Capital"
 * - Press On Ventures Excel model: Median/P90 calibration approach
 */

import type { SeededRNG } from './SeededRNG';

/**
 * Power-law distribution parameters
 */
export interface PowerLawParams {
  /** Shape parameter (alpha > 1 for finite mean) */
  alpha: number;
  /** Minimum value (x_min > 0, typically 0 for total loss) */
  xMin: number;
}

/**
 * User-friendly calibration parameters (median + P90)
 */
export interface MOICCalibration {
  /** Median MOIC (50th percentile) */
  median: number;
  /** 90th percentile MOIC */
  p90: number;
}

/**
 * Validate power-law parameters
 */
export function validatePowerLawParams(params: PowerLawParams): void {
  if (params.alpha <= 1) {
    throw new Error(`Power-law alpha must be > 1 for finite mean, got ${params.alpha.toFixed(4)}`);
  }

  if (params.xMin < 0) {
    throw new Error(`Power-law xMin must be non-negative, got ${params.xMin.toFixed(4)}`);
  }

  // Warn about extreme tail behavior
  if (params.alpha < 1.5) {
    console.warn(
      `[PowerLawMOIC] Alpha ${params.alpha.toFixed(2)} produces very heavy tails (infinite variance)`
    );
  }
}

/**
 * Validate MOIC calibration parameters
 */
export function validateMOICCalibration(calibration: MOICCalibration): void {
  if (calibration.median < 0) {
    throw new Error(`Median MOIC must be non-negative, got ${calibration.median.toFixed(4)}`);
  }

  if (calibration.p90 < 0) {
    throw new Error(`P90 MOIC must be non-negative, got ${calibration.p90.toFixed(4)}`);
  }

  if (calibration.p90 < calibration.median) {
    throw new Error(
      `P90 (${calibration.p90.toFixed(2)}) must be >= median (${calibration.median.toFixed(2)})`
    );
  }

  // Sanity check: P90/median ratio shouldn't be too extreme
  const ratio = calibration.p90 / Math.max(calibration.median, 0.01);
  if (ratio > 100) {
    console.warn(`[PowerLawMOIC] P90/median ratio ${ratio.toFixed(1)}x is very high (heavy tail)`);
  }
}

/**
 * Calibrate power-law parameters from median and P90
 *
 * Solves the system using CDF inversion:
 * - CDF(x) = 1 - (x_min / x)^alpha
 * - For median (p=0.5): 0.5 = 1 - (x_min / median)^alpha  →  (x_min / median)^alpha = 0.5
 * - For P90 (p=0.9): 0.9 = 1 - (x_min / p90)^alpha  →  (x_min / p90)^alpha = 0.1
 *
 * Derivation:
 * - Divide equations: (median / p90)^alpha = 0.5 / 0.1 = 5
 * - Therefore: alpha = ln(5) / ln(median / p90) = ln(5) / ln(median/p90)
 * - Then: x_min = median * 0.5^(1/alpha)
 *
 * @param calibration - User-provided median and P90 targets
 * @returns Power-law parameters (alpha, x_min)
 */
export function calibratePowerLaw(calibration: MOICCalibration): PowerLawParams {
  validateMOICCalibration(calibration);

  // Handle degenerate case: constant distribution
  if (calibration.p90 === calibration.median) {
    return {
      alpha: 100, // Very high alpha → almost constant
      xMin: calibration.median,
    };
  }

  // Solve for alpha using inverse CDF percentile ratio
  // Inverse CDF: x = xMin / (1-p)^(1/alpha)
  // For median (p=0.5): median = xMin / 0.5^(1/alpha)
  // For P90 (p=0.9): p90 = xMin / 0.1^(1/alpha)
  // Ratio: p90/median = (0.5/0.1)^(1/alpha) = 5^(1/alpha)
  // Therefore: ln(p90/median) = (1/alpha) * ln(5)
  // Solving: alpha = ln(5) / ln(p90/median)
  const alpha = Math.log(5) / Math.log(calibration.p90 / calibration.median);

  // Solve for x_min from median CDF formula
  // (x_min / median)^alpha = 0.5  →  x_min = median * 0.5^(1/alpha)
  const xMin = calibration.median * Math.pow(0.5, 1 / alpha);

  const params = { alpha, xMin };
  validatePowerLawParams(params);

  return params;
}

/**
 * Sample from power-law distribution using inverse CDF method
 *
 * CDF: F(x) = 1 - (x_min / x)^alpha
 * Inverse CDF: F^{-1}(u) = x_min / (1 - u)^(1/alpha)
 *
 * @param params - Power-law distribution parameters
 * @param rng - Seeded RNG for reproducibility
 * @returns Random MOIC value from power-law distribution
 */
export function samplePowerLaw(params: PowerLawParams, rng: SeededRNG): number {
  const u = rng.next(); // Uniform [0, 1)

  // Inverse CDF transform
  const moic = params.xMin / Math.pow(1 - u, 1 / params.alpha);

  return moic;
}

/**
 * Calculate percentile from power-law distribution
 *
 * @param params - Power-law distribution parameters
 * @param percentile - Percentile to calculate (0 to 1)
 * @returns MOIC value at given percentile
 */
export function calculatePercentile(params: PowerLawParams, percentile: number): number {
  if (percentile < 0 || percentile > 1) {
    throw new Error(`Percentile must be in [0, 1], got ${percentile.toFixed(4)}`);
  }

  // Inverse CDF at percentile
  const moic = params.xMin / Math.pow(1 - percentile, 1 / params.alpha);

  return moic;
}

/**
 * Calculate mean MOIC from power-law distribution
 *
 * Mean = (alpha * x_min) / (alpha - 1)  [for alpha > 1]
 *
 * @param params - Power-law distribution parameters
 * @returns Expected MOIC value
 */
export function calculateMean(params: PowerLawParams): number {
  validatePowerLawParams(params);

  return (params.alpha * params.xMin) / (params.alpha - 1);
}

/**
 * Power-law MOIC generator with calibration and sampling
 */
export class PowerLawMOIC {
  private params: PowerLawParams;
  private calibration: MOICCalibration;

  /**
   * Create generator from calibration parameters
   * @param calibration - Median and P90 MOIC targets
   */
  constructor(calibration: MOICCalibration) {
    validateMOICCalibration(calibration);
    this.calibration = calibration;
    this.params = calibratePowerLaw(calibration);
  }

  /**
   * Create generator from raw power-law parameters (advanced usage)
   * @param params - Pre-computed alpha and x_min
   */
  static fromParams(params: PowerLawParams): PowerLawMOIC {
    validatePowerLawParams(params);

    // Reverse-engineer calibration from params
    const median = calculatePercentile(params, 0.5);
    const p90 = calculatePercentile(params, 0.9);

    const generator = Object.create(PowerLawMOIC.prototype) as PowerLawMOIC;
    generator.params = params;
    generator.calibration = { median, p90 };

    return generator;
  }

  /**
   * Sample random MOIC value
   * @param rng - Seeded RNG for reproducibility
   * @returns Random MOIC value from calibrated distribution
   */
  sample(rng: SeededRNG): number {
    return samplePowerLaw(this.params, rng);
  }

  /**
   * Get calibration parameters (for diagnostics)
   */
  getCalibration(): Readonly<MOICCalibration> {
    return Object.freeze({ ...this.calibration });
  }

  /**
   * Get power-law parameters (for diagnostics)
   */
  getParams(): Readonly<PowerLawParams> {
    return Object.freeze({ ...this.params });
  }

  /**
   * Calculate percentile from calibrated distribution
   * @param percentile - Percentile to calculate (0 to 1)
   */
  percentile(percentile: number): number {
    return calculatePercentile(this.params, percentile);
  }

  /**
   * Calculate mean MOIC
   */
  mean(): number {
    return calculateMean(this.params);
  }
}

/**
 * Factory function for creating MOIC generator from calibration
 */
export function createMOICGenerator(calibration: MOICCalibration): PowerLawMOIC {
  return new PowerLawMOIC(calibration);
}

/**
 * Default MOIC calibration for VC seed-stage investments
 *
 * Based on industry benchmarks with adjusted ratio for finite mean:
 * - Median: 0.8x (moderate downside)
 * - P90: 3.8x (top 10% return 3.8x+, 4.75x ratio ensures alpha > 1)
 *
 * Mathematical constraint: p90/median < 5.0 ensures alpha > 1 for finite mean
 * Source: CB Insights, Correlation Ventures data (2015-2023)
 * Note: Adjusted from 4.5x to 3.8x to ensure alpha > 1 for finite mean
 */
export const DEFAULT_SEED_CALIBRATION: MOICCalibration = {
  median: 0.8,
  p90: 3.8,
};

/**
 * Default MOIC calibration for VC late-stage investments
 *
 * Late-stage has lower variance:
 * - Median: 1.5x (less downside)
 * - P90: 3.5x (smaller upside, ~2.3x ratio for alpha > 1)
 */
export const DEFAULT_LATE_CALIBRATION: MOICCalibration = {
  median: 1.5,
  p90: 3.5,
};
