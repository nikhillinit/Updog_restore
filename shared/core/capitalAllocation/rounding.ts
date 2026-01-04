/**
 * Banker's Rounding (Half-to-Even) Implementation
 *
 * Per CA-SEMANTIC-LOCK.md Section 4.1:
 * - NO epsilon comparisons (0.5 is exactly representable in IEEE-754)
 * - Applied ONLY for dollars→cents conversion and percent-derived scalars
 * - NEVER applied to allocation amounts (use LRM instead)
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 4.1
 */

/**
 * Banker's rounding for positive numbers.
 * Rounds to nearest integer; ties go to nearest EVEN integer.
 *
 * NOTE: 0.5 is exactly representable in IEEE-754, so strict comparison is safe
 * if upstream doesn't manufacture float noise.
 */
export function bankersRoundPositive(x: number): number {
  if (x < 0) {
    throw new Error('bankersRoundPositive requires non-negative input');
  }

  const n = Math.floor(x);
  const frac = x - n;

  if (frac < 0.5) return n;
  if (frac > 0.5) return n + 1;
  // Exactly 0.5 - round to nearest even
  return n % 2 === 0 ? n : n + 1;
}

/**
 * Symmetric banker's rounding for any number (positive or negative).
 * Handles negative values correctly for CA-019 capital recalls.
 *
 * Examples:
 *   bankersRoundSymmetric(2.5) → 2   (tie → even)
 *   bankersRoundSymmetric(3.5) → 4   (tie → even)
 *   bankersRoundSymmetric(-2.5) → -2 (tie → even magnitude)
 *   bankersRoundSymmetric(-3.5) → -4 (tie → even magnitude)
 */
export function bankersRoundSymmetric(x: number): number {
  if (x === 0) return 0;
  return Math.sign(x) * bankersRoundPositive(Math.abs(x));
}

/**
 * Convert dollars to integer cents using banker's rounding.
 * This is the canonical entry point for dollar→cent conversion.
 */
export function dollarsToCents(dollars: number): number {
  return bankersRoundSymmetric(dollars * 100);
}

/**
 * Convert cents to dollars (no rounding needed, exact division).
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/**
 * Round a percentage-derived scalar to cents.
 * Used for effective_buffer, target_reserve, etc.
 *
 * Example: effectiveBuffer = roundPercentDerivedToCents(commitment * targetPct)
 */
export function roundPercentDerivedToCents(value: number): number {
  return bankersRoundSymmetric(value);
}
