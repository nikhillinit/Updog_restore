/**
 * Three-Component Correlation Structure for Scenario Generation
 *
 * Prevents unrealistic scenarios by modeling realistic correlation between investments:
 * 1. Macro regime shock (40-60%): Shared across all investments (e.g., market crash, IPO window)
 * 2. Bucket systematic (20-30%): Shared within bucket (e.g., sector trends, stage dynamics)
 * 3. Idiosyncratic (20-30%): Investment-specific randomness
 *
 * Formula: Z_{b,s} = sqrt(w_macro) * Z_macro + sqrt(w_bucket) * Z_bucket_b + sqrt(w_idio) * Z_idio_{b,s}
 * where w_macro + w_bucket + w_idio = 1 (variance decomposition)
 *
 * Design rationale:
 * - Without correlation: Portfolio appears artificially diversified (law of large numbers kicks in too strongly)
 * - With correlation: Realistic tail risk emerges (market crashes affect entire portfolio)
 * - Bucket systematic: Captures sector/stage co-movement without forcing identical outcomes
 */

import type { SeededRNG } from './SeededRNG';

export interface CorrelationWeights {
  /** Macro regime weight (recommended: 0.4-0.6) */
  macro: number;
  /** Bucket systematic weight (recommended: 0.2-0.3) */
  systematic: number;
  /** Idiosyncratic weight (recommended: 0.2-0.3) */
  idiosyncratic: number;
}

/**
 * Validate correlation weights sum to 1.0 (variance decomposition)
 */
export function validateCorrelationWeights(weights: CorrelationWeights): void {
  const sum = weights.macro + weights.systematic + weights.idiosyncratic;
  const epsilon = 1e-6;

  if (Math.abs(sum - 1.0) > epsilon) {
    throw new Error(
      `Correlation weights must sum to 1.0, got ${sum.toFixed(6)} ` +
        `(macro: ${weights.macro}, systematic: ${weights.systematic}, idiosyncratic: ${weights.idiosyncratic})`
    );
  }

  if (weights.macro < 0 || weights.systematic < 0 || weights.idiosyncratic < 0) {
    throw new Error('All correlation weights must be non-negative');
  }

  // Warn about extreme configurations
  if (weights.macro < 0.3 || weights.macro > 0.7) {
    console.warn(
      `[CorrelationStructure] Macro weight ${weights.macro.toFixed(2)} outside recommended range [0.3, 0.7]`
    );
  }
}

/**
 * Generate correlated normal random variables for scenario simulation
 *
 * Uses Cholesky-like decomposition approach:
 * Z = sqrt(w1)*Z1 + sqrt(w2)*Z2 + sqrt(w3)*Z3
 *
 * This ensures:
 * - Var(Z) = w1 + w2 + w3 = 1 (when weights sum to 1)
 * - Cov(Z_i, Z_j) = w_macro (for different buckets)
 * - Cov(Z_ib, Z_jb) = w_macro + w_bucket (within same bucket)
 */
export class CorrelationStructure {
  private weights: CorrelationWeights;
  private sqrtWeights: {
    macro: number;
    systematic: number;
    idiosyncratic: number;
  };

  constructor(weights: CorrelationWeights) {
    validateCorrelationWeights(weights);
    this.weights = weights;

    // Pre-compute square roots for performance
    this.sqrtWeights = {
      macro: Math.sqrt(weights.macro),
      systematic: Math.sqrt(weights.systematic),
      idiosyncratic: Math.sqrt(weights.idiosyncratic),
    };
  }

  /**
   * Generate correlated shocks for a single scenario across all buckets
   *
   * @param numBuckets - Number of investment buckets
   * @param rng - Seeded RNG for reproducibility
   * @returns Array of correlated standard normal shocks (one per bucket)
   */
  generateScenarioShocks(numBuckets: number, rng: SeededRNG): number[] {
    // Step 1: Sample macro regime shock (shared by all buckets)
    const macroShock = rng.nextGaussian(0, 1);

    // Step 2: Sample bucket systematic shocks (one per bucket)
    const bucketShocks = Array.from({ length: numBuckets }, () => rng.nextGaussian(0, 1));

    // Step 3: Sample idiosyncratic shocks (one per bucket)
    const idioShocks = Array.from({ length: numBuckets }, () => rng.nextGaussian(0, 1));

    // Step 4: Combine shocks using variance decomposition
    const correlatedShocks = bucketShocks.map((bucketShock, b) => {
      const idioShock = idioShocks[b];
      if (idioShock === undefined) {
        throw new Error(`Missing idiosyncratic shock for bucket ${b}`);
      }
      return (
        this.sqrtWeights.macro * macroShock +
        this.sqrtWeights.systematic * bucketShock +
        this.sqrtWeights.idiosyncratic * idioShock
      );
    });

    return correlatedShocks;
  }

  /**
   * Generate full scenario matrix with correlation structure
   *
   * @param numBuckets - Number of investment buckets
   * @param numScenarios - Number of scenarios to simulate
   * @param rng - Seeded RNG for reproducibility
   * @returns S x B matrix of correlated shocks (scenarios x buckets)
   */
  generateCorrelatedMatrix(numBuckets: number, numScenarios: number, rng: SeededRNG): number[][] {
    const matrix: number[][] = [];

    for (let s = 0; s < numScenarios; s++) {
      matrix.push(this.generateScenarioShocks(numBuckets, rng));
    }

    return matrix;
  }

  /**
   * Get correlation weights (for diagnostics/logging)
   */
  getWeights(): Readonly<CorrelationWeights> {
    return Object.freeze({ ...this.weights });
  }

  /**
   * Calculate theoretical correlation between two buckets
   *
   * Same bucket: Cor(Z_ib, Z_jb) = w_macro + w_bucket
   * Different buckets: Cor(Z_ib, Z_jc) = w_macro
   */
  getTheoreticalCorrelation(sameBucket: boolean): number {
    if (sameBucket) {
      return this.weights.macro + this.weights.systematic;
    } else {
      return this.weights.macro;
    }
  }
}

/**
 * Default correlation weights based on VC industry empirics
 *
 * Rationale:
 * - Macro (50%): VC returns heavily influenced by macro regime (IPO windows, interest rates, risk appetite)
 * - Systematic (25%): Sector/stage trends create moderate co-movement within buckets
 * - Idiosyncratic (25%): Significant company-specific variation (team, product, execution)
 *
 * Sources:
 * - Korteweg & Sorensen (2010): "Risk and Return Characteristics of Venture Capital-Backed Entrepreneurial Companies"
 * - Cochrane (2005): "The Risk and Return of Venture Capital"
 */
export const DEFAULT_CORRELATION_WEIGHTS: CorrelationWeights = {
  macro: 0.5,
  systematic: 0.25,
  idiosyncratic: 0.25,
};

/**
 * Create correlation structure with validation
 */
export function createCorrelationStructure(
  weights: CorrelationWeights = DEFAULT_CORRELATION_WEIGHTS
): CorrelationStructure {
  return new CorrelationStructure(weights);
}
