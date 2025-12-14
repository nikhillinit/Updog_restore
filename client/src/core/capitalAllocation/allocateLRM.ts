/**
 * Largest Remainder Method (LRM) Allocation
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.2:
 * - MUST use integer arithmetic (no float remainders)
 * - Uses 1e7 scale basis points for 7-decimal precision
 * - Tie-break by canonical order (index in pre-sorted array)
 *
 * CRITICAL: This is the ONLY method for allocation amounts.
 * DO NOT use banker's rounding for allocations.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.2
 */

/**
 * Weight scale for 7-decimal precision (per CA-018 requirements).
 * Weights like 0.3333333 become 3333333 in this scale.
 */
export const WEIGHT_SCALE = 10_000_000;

/**
 * Normalize decimal weights to integer basis points (1e7 scale).
 * Ensures sum equals exactly WEIGHT_SCALE.
 *
 * @param weights - Array of decimal weights (should sum close to 1.0)
 * @returns Array of integer basis points summing to exactly WEIGHT_SCALE
 * @throws If weights are invalid per semantic lock rules
 */
export function normalizeWeightsToBps(weights: number[]): number[] {
  if (weights.length === 0) {
    throw new Error('Weights array cannot be empty');
  }

  // Rule 1: No negative weights
  if (weights.some((w) => w < 0)) {
    throw new Error('Cohort weights cannot be negative');
  }

  const sum = weights.reduce((a, b) => a + b, 0);

  // Rule 2: Sum must be positive
  if (sum <= 0) {
    throw new Error('Sum of cohort weights must be positive');
  }

  // Rule 3: Only normalize if within 0.1% tolerance
  const tolerance = 0.001;
  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(
      `Cohort weights sum to ${sum}, which differs from 1.0 by more than ${tolerance * 100}%`
    );
  }

  // Convert to integer basis points
  const rawBps = weights.map((w) => Math.round((w / sum) * WEIGHT_SCALE));
  const bpsSum = rawBps.reduce((a, b) => a + b, 0);

  // Adjust last element to ensure exact sum = WEIGHT_SCALE
  // This handles rounding accumulation
  if (bpsSum !== WEIGHT_SCALE) {
    rawBps[rawBps.length - 1] += WEIGHT_SCALE - bpsSum;
  }

  return rawBps;
}

/**
 * Allocate total cents to cohorts using Largest Remainder Method.
 *
 * Algorithm:
 * 1. Base allocation: floor(total * weightBps / WEIGHT_SCALE)
 * 2. Calculate integer remainders: (total * weightBps) % WEIGHT_SCALE
 * 3. Sort by remainder DESC, then index ASC (canonical tie-break)
 * 4. Distribute shortfall (1 cent each) to largest remainders
 *
 * @param totalCents - Total amount to allocate in cents
 * @param weightsBps - Weights in basis points (must sum to WEIGHT_SCALE)
 * @returns Array of allocations in cents (same length as weights, sums to totalCents)
 */
export function allocateLRM(totalCents: number, weightsBps: number[]): number[] {
  if (weightsBps.length === 0) {
    return [];
  }

  if (totalCents < 0) {
    throw new Error('Total cents cannot be negative for allocation');
  }

  if (totalCents === 0) {
    return weightsBps.map(() => 0);
  }

  // Validate weights sum to WEIGHT_SCALE
  const weightSum = weightsBps.reduce((a, b) => a + b, 0);
  if (weightSum !== WEIGHT_SCALE) {
    throw new Error(
      `Weights must sum to ${WEIGHT_SCALE}, got ${weightSum}. Use normalizeWeightsToBps first.`
    );
  }

  const allocations: number[] = [];
  const remainders: Array<{ index: number; remainder: number }> = [];

  // Step 1 & 2: Calculate base allocations and integer remainders
  for (let i = 0; i < weightsBps.length; i++) {
    // CRITICAL: Integer arithmetic only - no float division
    const product = totalCents * weightsBps[i];
    const base = Math.floor(product / WEIGHT_SCALE);
    const remainder = product % WEIGHT_SCALE; // INTEGER remainder

    allocations.push(base);
    remainders.push({ index: i, remainder });
  }

  // Step 3: Sort by remainder DESC, then index ASC (canonical tie-break)
  remainders.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder; // Larger remainder first
    }
    return a.index - b.index; // Tie-break: lower index first (canonical order)
  });

  // Step 4: Distribute shortfall
  const sumBase = allocations.reduce((a, b) => a + b, 0);
  let shortfall = totalCents - sumBase;

  for (let j = 0; shortfall > 0 && j < remainders.length; j++) {
    allocations[remainders[j].index] += 1;
    shortfall--;
  }

  return allocations;
}

/**
 * Convenience function: allocate from decimal weights.
 * Combines normalization and allocation in one call.
 *
 * @param totalCents - Total amount to allocate in cents
 * @param weights - Decimal weights (should sum close to 1.0)
 * @returns Array of allocations in cents
 */
export function allocateFromDecimalWeights(totalCents: number, weights: number[]): number[] {
  const weightsBps = normalizeWeightsToBps(weights);
  return allocateLRM(totalCents, weightsBps);
}

/**
 * Verify CA-018 test case: 3 cohorts with weights summing to 1.0
 * Weights: [0.3333333, 0.3333333, 0.3333334]
 * Total: 1,000,000 cents
 * Expected: [333333, 333333, 333334]
 *
 * This function is exported for testing purposes.
 */
export function verifyCA018(): { passed: boolean; actual: number[]; expected: number[] } {
  const weights = [0.3333333, 0.3333333, 0.3333334];
  const totalCents = 1_000_000;
  const expected = [333333, 333333, 333334];

  const actual = allocateFromDecimalWeights(totalCents, weights);

  return {
    passed: actual.every((v, i) => v === expected[i]),
    actual,
    expected,
  };
}
