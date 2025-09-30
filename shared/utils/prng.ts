/**
 * Pseudo-Random Number Generator (PRNG) for deterministic simulations
 *
 * Implements a Linear Congruential Generator (LCG) with proper seeding
 * for reproducible Monte Carlo simulations.
 *
 * WARNING: This is NOT cryptographically secure and should ONLY be used
 * for simulation purposes where reproducibility is required.
 *
 * @example
 * ```ts
 * const prng = new PRNG(12345);
 * const randomValue = prng.next(); // 0 <= randomValue < 1
 * ```
 */
export class PRNG {
  private state: number;

  // LCG parameters (Numerical Recipes)
  private readonly a = 1664525;
  private readonly c = 1013904223;
  private readonly m = 4294967296; // 2^32

  /**
   * Create a new PRNG instance
   * @param seed - Initial seed value (must be non-negative integer)
   */
  constructor(seed: number = Date.now()) {
    if (seed < 0 || !Number.isInteger(seed)) {
      throw new Error(`Invalid PRNG seed: ${seed}. Must be non-negative integer.`);
    }
    this.state = seed % this.m;
  }

  /**
   * Generate next random number in sequence
   * @returns Random number in range [0, 1)
   */
  next(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state / this.m;
  }

  /**
   * Generate random number using Box-Muller transform for normal distribution
   * @param mean - Mean of the normal distribution
   * @param stdDev - Standard deviation of the normal distribution
   * @returns Random number from normal distribution
   */
  nextNormal(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.next();
    const u2 = this.next();

    // Box-Muller transform
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Generate random number from log-normal distribution
   * @param mean - Mean of the underlying normal distribution
   * @param stdDev - Standard deviation of the underlying normal distribution
   * @returns Random number from log-normal distribution
   */
  nextLogNormal(mean: number = 0, stdDev: number = 1): number {
    return Math.exp(this.nextNormal(mean, stdDev));
  }

  /**
   * Generate random number from triangular distribution
   * @param min - Minimum value
   * @param max - Maximum value
   * @param mode - Mode (peak) value
   * @returns Random number from triangular distribution
   */
  nextTriangular(min: number, max: number, mode: number): number {
    const u = this.next();
    const f = (mode - min) / (max - min);

    if (u < f) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  /**
   * Generate random number from beta distribution (simplified)
   * @param alpha - Shape parameter alpha
   * @param beta - Shape parameter beta
   * @param min - Minimum value (default 0)
   * @param max - Maximum value (default 1)
   * @returns Random number from beta distribution
   */
  nextBeta(alpha: number, beta: number, min: number = 0, max: number = 1): number {
    const gamma1 = this.nextGamma(alpha);
    const gamma2 = this.nextGamma(beta);
    const betaSample = gamma1 / (gamma1 + gamma2);
    return min + betaSample * (max - min);
  }

  /**
   * Generate random number from gamma distribution (simplified)
   * @param shape - Shape parameter (must be > 0)
   * @returns Random number from gamma distribution
   */
  private nextGamma(shape: number): number {
    if (shape < 1) {
      return this.nextGamma(shape + 1) * Math.pow(this.next(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    // Marsaglia and Tsang method
    while (true) {
      let x: number;
      let v: number;

      do {
        x = this.nextNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = this.next();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Reset PRNG to initial state with new seed
   * @param seed - New seed value
   */
  reset(seed: number): void {
    if (seed < 0 || !Number.isInteger(seed)) {
      throw new Error(`Invalid PRNG seed: ${seed}. Must be non-negative integer.`);
    }
    this.state = seed % this.m;
  }

  /**
   * Get current state (for debugging/testing)
   */
  getState(): number {
    return this.state;
  }
}

/**
 * Create a PRNG instance with optional seed
 * @param seed - Optional seed value
 * @returns New PRNG instance
 */
export function createPRNG(seed?: number): PRNG {
  return new PRNG(seed);
}