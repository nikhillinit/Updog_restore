/**
 * Seeded Random Number Generator using Xorshift32 algorithm
 *
 * Provides deterministic, reproducible random number generation for scenario simulation.
 * Critical for cache validity - same seed must produce identical sequences.
 *
 * Algorithm: Xorshift32 by George Marsaglia
 * Period: 2^32 - 1 (4.29 billion values before repeating)
 * Speed: ~10x faster than Math.random()
 * Quality: Passes basic statistical tests (Diehard, TestU01 SmallCrush)
 *
 * Reference: https://www.jstatsoft.org/article/view/v008i14
 */

export class SeededRNG {
  private state: number;

  /**
   * Initialize RNG with a seed value
   * @param seed - 32-bit unsigned integer seed (1 to 2^32-1)
   * @throws Error if seed is 0 (Xorshift32 requirement)
   */
  constructor(seed: number) {
    if (seed === 0 || !Number.isInteger(seed)) {
      throw new Error('SeededRNG seed must be a non-zero integer');
    }
    // Ensure 32-bit unsigned integer
    this.state = seed >>> 0;
  }

  /**
   * Generate next random number in [0, 1)
   * Uses Xorshift32 algorithm with standard shift parameters (13, 17, 5)
   */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0; // Keep as 32-bit unsigned
    // Convert to [0, 1) by dividing by 2^32
    return this.state / 0x100000000;
  }

  /**
   * Generate random integer in [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random number from normal distribution (Box-Muller transform)
   * @param mean - Distribution mean (default: 0)
   * @param stdDev - Standard deviation (default: 1)
   */
  nextGaussian(mean = 0, stdDev = 1): number {
    // Box-Muller transform using polar method
    const u1 = this.next();
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Sample from array with uniform probability
   */
  sample<T>(array: T[]): T {
    const index = this.nextInt(0, array.length - 1);
    return array[index];
  }

  /**
   * Shuffle array in-place using Fisher-Yates algorithm
   * Returns the same array (mutated)
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Reset RNG to initial state with new seed
   */
  reset(seed: number): void {
    if (seed === 0 || !Number.isInteger(seed)) {
      throw new Error('SeededRNG seed must be a non-zero integer');
    }
    this.state = seed >>> 0;
  }

  /**
   * Get current internal state (for debugging/testing)
   */
  getState(): number {
    return this.state;
  }
}

/**
 * Derive deterministic seed from string input
 * Uses FNV-1a hash algorithm (32-bit)
 *
 * @param input - Any string (e.g., JSON.stringify(config))
 * @returns 32-bit unsigned integer seed (never 0)
 */
export function deriveSeed(input: string): number {
  // FNV-1a constants
  const FNV_PRIME = 16777619;
  const FNV_OFFSET = 2166136261;

  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  // Ensure non-zero (Xorshift32 requirement)
  const seed = hash >>> 0 || 1;
  return seed;
}

/**
 * Create SeededRNG from configuration object
 * Produces deterministic seed from canonical JSON representation
 *
 * @param config - Any JSON-serializable configuration object
 * @returns SeededRNG instance with deterministic seed
 */
export function createSeededRNG(config: unknown): SeededRNG {
  // Canonicalize config: sorted keys, stable JSON
  const canonical = JSON.stringify(config, Object.keys(config as object).sort());
  const seed = deriveSeed(canonical);
  return new SeededRNG(seed);
}
