/**
 * Centralized Money/Precision Utilities
 *
 * Single source of truth for decimal precision, rounding, and formatting across the platform.
 * Uses Decimal.js for arbitrary-precision arithmetic to avoid floating-point errors.
 *
 * @module shared/lib/money
 */

import Decimal from 'decimal.js';

/**
 * Global Decimal.js configuration
 * - precision: 28 digits (enough for financial calculations)
 * - rounding: ROUND_HALF_UP (standard banker's rounding)
 */
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Create a Decimal from any numeric value
 * Convenience wrapper to ensure consistent construction
 */
export const d = (n: Decimal.Value): Decimal => new Decimal(n);

/**
 * Round a Decimal to a specific number of decimal places
 *
 * @param n - Value to round
 * @param places - Decimal places (default: 6)
 * @returns Rounded Decimal
 */
export const roundP = (n: Decimal.Value, places = 6): Decimal =>
  d(n).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);

/**
 * Per-metric rounding precision standards
 * These define how many decimal places to show for each metric type
 */
export const MetricPrecision = {
  /** IRR: 1 basis point (0.01%) = 4 decimal places */
  IRR: 4,

  /** MOIC/TVPI/DPI/RVPI: 2 decimal places (e.g., 2.54x) */
  MULTIPLE: 2,

  /** Currency: cents precision (2 decimal places) */
  CURRENCY: 2,

  /** Percentages: 2 decimal places (e.g., 45.67%) */
  PERCENTAGE: 2,

  /** Rates (allocation, deployment): 2 decimal places */
  RATE: 2,

  /** Internal calculations: 6 decimal places for intermediate steps */
  INTERNAL: 6,
} as const;

/**
 * Round IRR to basis point precision
 * Example: 0.24567 → 0.2457 (24.57%)
 */
export const roundIRR = (irr: Decimal.Value): Decimal =>
  roundP(irr, MetricPrecision.IRR);

/**
 * Round MOIC/multiples to 2 decimal places
 * Example: 2.54678 → 2.55
 */
export const roundMultiple = (multiple: Decimal.Value): Decimal =>
  roundP(multiple, MetricPrecision.MULTIPLE);

/**
 * Round currency to cents
 * Example: 1234567.894 → 1234567.89
 */
export const roundCurrency = (amount: Decimal.Value): Decimal =>
  roundP(amount, MetricPrecision.CURRENCY);

/**
 * Round percentage to 2 decimal places
 * Example: 0.45678 → 0.46 (46%)
 */
export const roundPercentage = (pct: Decimal.Value): Decimal =>
  roundP(pct, MetricPrecision.PERCENTAGE);

/**
 * Format a numeric value according to metric type
 *
 * @param value - Numeric value to format
 * @param type - Metric type for appropriate rounding
 * @returns Formatted string
 *
 * @example
 * formatMetric(0.2456, 'irr') // "24.56%"
 * formatMetric(2.546, 'multiple') // "2.55x"
 * formatMetric(1234567.89, 'currency') // "$1,234,567.89"
 */
export function formatMetric(
  value: number | null | undefined,
  type: 'irr' | 'multiple' | 'currency' | 'percentage'
): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (!Number.isFinite(value)) {
    return '—';
  }

  switch (type) {
    case 'irr':
      return `${roundIRR(value).mul(100).toFixed(MetricPrecision.IRR)}%`;

    case 'multiple':
      return `${roundMultiple(value).toFixed(MetricPrecision.MULTIPLE)}x`;

    case 'currency':
      return `$${roundCurrency(value)
        .toNumber()
        .toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

    case 'percentage':
      return `${roundPercentage(value).mul(100).toFixed(MetricPrecision.PERCENTAGE)}%`;

    default:
      return String(value);
  }
}

/**
 * Safe division that returns null instead of Infinity or NaN
 *
 * @param numerator - Top of fraction
 * @param denominator - Bottom of fraction
 * @returns Result or null if invalid
 */
export function safeDivide(
  numerator: Decimal.Value,
  denominator: Decimal.Value
): Decimal | null {
  const denom = d(denominator);
  if (denom.isZero()) {
    return null;
  }
  const result = d(numerator).div(denom);
  if (!result.isFinite()) {
    return null;
  }
  return result;
}

/**
 * Calculate percentage change between two values
 *
 * @param oldValue - Starting value
 * @param newValue - Ending value
 * @returns Percentage change (e.g., 0.15 for 15% increase)
 */
export function percentageChange(
  oldValue: Decimal.Value,
  newValue: Decimal.Value
): Decimal | null {
  const old = d(oldValue);
  if (old.isZero()) {
    return null; // Can't calculate % change from zero
  }
  return d(newValue).minus(old).div(old);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: Decimal.Value, min: Decimal.Value, max: Decimal.Value): Decimal {
  const v = d(value);
  const minD = d(min);
  const maxD = d(max);
  if (v.lt(minD)) return minD;
  if (v.gt(maxD)) return maxD;
  return v;
}

/**
 * Sum an array of Decimal values
 */
export function sum(values: Decimal.Value[]): Decimal {
  return values.reduce((acc, v) => acc.plus(d(v)), d(0));
}

/**
 * Type guard to check if a value is a valid Decimal
 */
export function isValidDecimal(value: unknown): value is Decimal {
  return value instanceof Decimal && value.isFinite();
}

/**
 * Export Decimal class for direct use
 */
export { Decimal };
