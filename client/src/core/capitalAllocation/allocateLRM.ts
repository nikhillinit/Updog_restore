/**
 * Largest Remainder Method (LRM) Allocation
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.2:
 * - MUST use integer arithmetic (no float remainders)
 * - Uses 1e7 scale for 7-decimal weight precision
 * - Tie-break by canonical order (index in pre-sorted array)
 *
 * CRITICAL: This is the ONLY method for allocation amounts.
 * DO NOT use banker's rounding for allocations.
 *
 * CRITICAL: Uses BigInt for intermediate calculations to prevent overflow.
 * Number.MAX_SAFE_INTEGER ≈ 9e15, but product of totalCents * weight can
 * reach 1e17+ for $100M+ funds. BigInt ensures exact integer arithmetic.
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.2
 */

/**
 * Weight scale for 7-decimal precision (per CA-018 requirements).
 * Weights like 0.3333333 become 3333333 in this scale.
 *
 * NOTE: This is NOT basis points (1e4). Named WEIGHT_SCALE to avoid confusion.
 */
export const WEIGHT_SCALE = 10_000_000;

/**
 * BigInt version of WEIGHT_SCALE for safe arithmetic.
 */
const WEIGHT_SCALE_BIG = BigInt(WEIGHT_SCALE);

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
 * Normalize weights to basis points with lenient sum handling.
 *
 * For lifecycle cohorts with different date ranges, weights may not sum to 1.0
 * globally because only a subset is active at any time. This function scales
 * the weights proportionally to sum to 1.0 regardless of input sum.
 *
 * Use this when cohorts have varying lifecycles (CA-016 pattern).
 */
export function normalizeWeightsLenient(weights: number[]): number[] {
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

  // Scale proportionally to sum = WEIGHT_SCALE (no tolerance check)
  const rawBps = weights.map((w) => Math.round((w / sum) * WEIGHT_SCALE));
  const bpsSum = rawBps.reduce((a, b) => a + b, 0);

  // Adjust last element to ensure exact sum
  if (bpsSum !== WEIGHT_SCALE) {
    rawBps[rawBps.length - 1] += WEIGHT_SCALE - bpsSum;
  }

  return rawBps;
}

/**
 * Allocate total cents to cohorts using Largest Remainder Method.
 *
 * Algorithm:
 * 1. Base allocation: floor(total * weight / WEIGHT_SCALE)
 * 2. Calculate integer remainders: (total * weight) % WEIGHT_SCALE
 * 3. Sort by remainder DESC, then index ASC (canonical tie-break)
 * 4. Distribute shortfall (1 cent each) to largest remainders
 *
 * CRITICAL: Uses BigInt for intermediate calculations to prevent overflow.
 * For $100M fund with 1e7 weights: 10^10 * 10^7 = 10^17 > MAX_SAFE_INTEGER.
 *
 * @param totalCents - Total amount to allocate in cents
 * @param weightsBps - Weights in scaled units (must sum to WEIGHT_SCALE)
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

  // Validate totalCents is a safe integer
  if (!Number.isSafeInteger(totalCents)) {
    throw new Error(
      `Total cents ${totalCents} exceeds Number.MAX_SAFE_INTEGER. Use smaller values or BigInt API.`
    );
  }

  // Validate weights sum to WEIGHT_SCALE
  const weightSum = weightsBps.reduce((a, b) => a + b, 0);
  if (weightSum !== WEIGHT_SCALE) {
    throw new Error(
      `Weights must sum to ${WEIGHT_SCALE}, got ${weightSum}. Use normalizeWeightsToBps first.`
    );
  }

  // Convert to BigInt for safe intermediate calculations
  const totalBig = BigInt(totalCents);

  const allocations: number[] = [];
  const remainders: Array<{ index: number; remainder: bigint }> = [];

  // Step 1 & 2: Calculate base allocations and integer remainders using BigInt
  for (let i = 0; i < weightsBps.length; i++) {
    const weightBig = BigInt(weightsBps[i]);

    // CRITICAL: BigInt arithmetic prevents overflow
    // product can be up to 10^17 which exceeds Number.MAX_SAFE_INTEGER
    const product = totalBig * weightBig;
    const base = product / WEIGHT_SCALE_BIG; // BigInt division = floor
    const remainder = product % WEIGHT_SCALE_BIG; // BigInt modulo = exact

    // Convert base back to number (safe: base <= totalCents)
    allocations.push(Number(base));
    remainders.push({ index: i, remainder });
  }

  // Step 3: Sort by remainder DESC, then index ASC (canonical tie-break)
  // CRITICAL: BigInt comparison must return number (-1, 0, 1)
  remainders.sort((a, b) => {
    if (b.remainder > a.remainder) return 1;
    if (b.remainder < a.remainder) return -1;
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
