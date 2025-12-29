import Decimal from 'decimal.js';

/**
 * Decimal Math Utilities (Shared)
 *
 * Provides high-precision financial calculations using Decimal.js to eliminate
 * floating-point errors. All internal calculations use 20-digit precision;
 * rounding happens only at export/display boundaries.
 *
 * Policy: See docs/rounding-policy.md
 */

// =====================
// GLOBAL CONFIGURATION
// =====================

// Configure Decimal.js globally for financial precision
Decimal.set({
  precision: 20, // 20-digit precision for intermediates
  rounding: Decimal.ROUND_HALF_UP, // Standard rounding (0.5 rounds up)
});

// =====================
// EXPORT/DISPLAY ROUNDING
// =====================

/**
 * Round currency values for export/display (2 decimal places)
 *
 * @example
 * roundCurrency(1234567.891) // => 1234567.89
 * roundCurrency(new Decimal('1234567.895')) // => 1234567.90
 */
export function roundCurrency(value: Decimal | number): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Round ratios (TVPI, DPI, multiples) for export/display (4 decimal places)
 *
 * @example
 * roundRatio(2.54321) // => 2.5432
 * roundRatio(new Decimal('1.99999')) // => 2.0000
 */
export function roundRatio(value: Decimal | number): number {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Round percentages for display (2 decimal places, shown as %)
 *
 * Note: Input is expected as decimal (e.g., 0.1575 for 15.75%)
 * Output is the percentage value (e.g., 15.75)
 *
 * @example
 * roundPercent(0.1575) // => 15.75
 * roundPercent(new Decimal('0.025')) // => 2.50
 */
export function roundPercent(value: Decimal | number): number {
  return new Decimal(value).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Format for CSV export (preserve precision, round at boundary)
 *
 * Returns string with appropriate decimal places for CSV export
 *
 * @example
 * formatForCSV(1234567.89, 'currency') // => "1234567.89"
 * formatForCSV(2.5432, 'ratio') // => "2.5432"
 * formatForCSV(0.1575, 'percent') // => "15.75"
 */
export function formatForCSV(value: Decimal | number, type: 'currency' | 'ratio' | 'percent'): string {
  switch (type) {
    case 'currency':
      return roundCurrency(value).toFixed(2);
    case 'ratio':
      return roundRatio(value).toFixed(4);
    case 'percent':
      return roundPercent(value).toFixed(2);
  }
}

// =====================
// CALCULATION HELPERS
// =====================

/**
 * Safe division with fallback
 *
 * Returns 0 if denominator is zero (avoids division by zero errors)
 *
 * @example
 * safeDivide(100, 50) // => 2
 * safeDivide(100, 0) // => 0
 */
export function safeDivide(numerator: Decimal | number, denominator: Decimal | number): Decimal {
  const denom = new Decimal(denominator);
  if (denom.isZero()) {
    return new Decimal(0);
  }
  return new Decimal(numerator).dividedBy(denom);
}

/**
 * Sum an array of Decimal or number values
 *
 * @example
 * sum([1, 2, 3]) // => Decimal(6)
 * sum([new Decimal('0.1'), new Decimal('0.2')]) // => Decimal(0.3)
 */
export function sum(values: readonly (Decimal | number)[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0));
}

/**
 * Calculate cumulative sum of array
 *
 * Returns array of same length with cumulative sums
 *
 * @example
 * cumulativeSum([1, 2, 3]) // => [Decimal(1), Decimal(3), Decimal(6)]
 */
export function cumulativeSum(values: readonly (Decimal | number)[]): Decimal[] {
  const result: Decimal[] = [];
  let cumulative = new Decimal(0);

  for (const value of values) {
    cumulative = cumulative.plus(value);
    result.push(cumulative);
  }

  return result;
}

// =====================
// VALIDATION HELPERS
// =====================

/**
 * Check if value is within tolerance of target
 *
 * Useful for parity testing with floating-point tolerances
 *
 * @example
 * isWithinTolerance(1.0001, 1.0, 0.001) // => true
 * isWithinTolerance(1.002, 1.0, 0.001) // => false
 */
export function isWithinTolerance(
  value: Decimal | number,
  target: Decimal | number,
  tolerance: number
): boolean {
  const diff = new Decimal(value).minus(target).abs();
  return diff.lte(tolerance);
}

/**
 * Assert value equals target within tolerance
 *
 * Throws error if values are not within tolerance
 * Used in invariant tests
 */
export function assertWithinTolerance(
  value: Decimal | number,
  target: Decimal | number,
  tolerance: number,
  context?: string
): void {
  if (!isWithinTolerance(value, target, tolerance)) {
    const diff = new Decimal(value).minus(target);
    const message = context
      ? `${context}: Expected ${target}, got ${value} (diff: ${diff})`
      : `Expected ${target}, got ${value} (diff: ${diff})`;
    throw new Error(message);
  }
}

// =====================
// TYPE GUARDS
// =====================

/**
 * Check if value is a Decimal instance
 */
export function isDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal;
}

/**
 * Convert to Decimal safely
 *
 * Returns Decimal instance, converting from number/string if needed
 */
export function toDecimal(value: Decimal | number | string): Decimal {
  if (isDecimal(value)) {
    return value;
  }
  return new Decimal(value);
}

// =====================
// EXPORTS
// =====================

// Re-export Decimal for convenience
export { Decimal };
