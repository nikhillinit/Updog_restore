/**
 * Type-safe unit discipline system for VC fund modeling
 *
 * Prevents unit mismatch bugs by using branded types for:
 * - Fractions (0-1)
 * - Percentages (0-100)
 * - Basis Points (0-10000)
 * - Dollars (USD amounts)
 */

// ============================================================================
// Branded Types
// ============================================================================

export type Fraction = number & { __brand: 'Fraction_0to1' };
export type Percentage = number & { __brand: 'Percentage_0to100' };
export type BasisPoints = number & { __brand: 'BPS_0to10000' };
export type Dollars = number & { __brand: 'Dollars' };

// ============================================================================
// Runtime Validators
// ============================================================================

/**
 * Validates and converts a number to a Fraction (0-1 range)
 * @throws {TypeError} If value is not finite or outside [0,1]
 */
export const asFraction = (n: number): Fraction => {
  if (!Number.isFinite(n)) {
    throw new TypeError(`Expected finite fraction, got ${n}`);
  }
  if (n < 0 || n > 1) {
    throw new TypeError(`Expected fraction [0,1], got ${n}`);
  }
  return n as Fraction;
};

/**
 * Validates and converts a number to a Percentage (0-100 range)
 * @throws {TypeError} If value is not finite or outside [0,100]
 */
export const asPercentage = (n: number): Percentage => {
  if (!Number.isFinite(n)) {
    throw new TypeError(`Expected finite percentage, got ${n}`);
  }
  if (n < 0 || n > 100) {
    throw new TypeError(`Expected percentage [0,100], got ${n}`);
  }
  return n as Percentage;
};

/**
 * Validates and converts a number to Basis Points (0-10000 range)
 * @throws {TypeError} If value is not finite or outside [0,10000]
 */
export const asBasisPoints = (n: number): BasisPoints => {
  if (!Number.isFinite(n)) {
    throw new TypeError(`Expected finite basis points, got ${n}`);
  }
  if (n < 0 || n > 10000) {
    throw new TypeError(`Expected basis points [0,10000], got ${n}`);
  }
  return n as BasisPoints;
};

/**
 * Validates and converts a number to Dollars
 * @throws {TypeError} If value is not finite or negative
 */
export const asDollars = (n: number): Dollars => {
  if (!Number.isFinite(n)) {
    throw new TypeError(`Expected finite dollar amount, got ${n}`);
  }
  if (n < 0) {
    throw new TypeError(`Expected non-negative dollar amount, got ${n}`);
  }
  return n as Dollars;
};

// ============================================================================
// Conversions
// ============================================================================

/**
 * Converts a Fraction to a Percentage
 * @example fractionToPct(asFraction(0.25)) => 25%
 */
export const fractionToPct = (f: Fraction): Percentage => {
  return asPercentage(f * 100);
};

/**
 * Converts a Percentage to a Fraction
 * @example pctToFraction(asPercentage(25)) => 0.25
 */
export const pctToFraction = (p: Percentage): Fraction => {
  return asFraction(p / 100);
};

/**
 * Converts Basis Points to a Fraction
 * @example bpsToFraction(asBasisPoints(250)) => 0.025
 */
export const bpsToFraction = (bps: BasisPoints): Fraction => {
  return asFraction(bps / 10000);
};

/**
 * Converts a Fraction to Basis Points
 * @example fractionToBps(asFraction(0.025)) => 250 bps
 */
export const fractionToBps = (f: Fraction): BasisPoints => {
  return asBasisPoints(f * 10000);
};

/**
 * Converts a Percentage to Basis Points
 * @example pctToBps(asPercentage(2.5)) => 250 bps
 */
export const pctToBps = (p: Percentage): BasisPoints => {
  return asBasisPoints(p * 100);
};

/**
 * Converts Basis Points to a Percentage
 * @example bpsToPct(asBasisPoints(250)) => 2.5%
 */
export const bpsToPct = (bps: BasisPoints): Percentage => {
  return asPercentage(bps / 100);
};

// ============================================================================
// Display Formatters
// ============================================================================

/**
 * Formats a Percentage for display
 * @param p - Percentage to format
 * @param decimals - Number of decimal places (default: 2)
 * @example formatPct(asPercentage(25.5)) => "25.50%"
 */
export const formatPct = (p: Percentage, decimals: number = 2): string => {
  return `${p.toFixed(decimals)}%`;
};

/**
 * Formats a Fraction as a percentage for display
 * @param f - Fraction to format
 * @param decimals - Number of decimal places (default: 2)
 * @example formatFractionAsPct(asFraction(0.255)) => "25.50%"
 */
export const formatFractionAsPct = (f: Fraction, decimals: number = 2): string => {
  return formatPct(fractionToPct(f), decimals);
};

/**
 * Formats Basis Points for display
 * @param bps - Basis points to format
 * @param decimals - Number of decimal places (default: 0)
 * @example formatBps(asBasisPoints(250)) => "250 bps"
 */
export const formatBps = (bps: BasisPoints, decimals: number = 0): string => {
  return `${bps.toFixed(decimals)} bps`;
};

/**
 * Formats Dollars for display with compact notation for large amounts
 * @param d - Dollar amount to format
 * @param compact - Whether to use compact notation (default: true)
 * @example formatDollars(asDollars(2500000)) => "$2.5M"
 * @example formatDollars(asDollars(1234.56), false) => "$1,234.56"
 */
export const formatDollars = (d: Dollars, compact: boolean = true): string => {
  if (compact && d >= 1_000_000_000) {
    return `$${(d / 1_000_000_000).toFixed(1)}B`;
  }
  if (compact && d >= 1_000_000) {
    return `$${(d / 1_000_000).toFixed(1)}M`;
  }
  if (compact && d >= 1_000) {
    return `$${(d / 1_000).toFixed(1)}K`;
  }

  return `$${d.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Checks if a number can be safely converted to a Fraction
 */
export const isFraction = (n: number): n is Fraction => {
  return Number.isFinite(n) && n >= 0 && n <= 1;
};

/**
 * Checks if a number can be safely converted to a Percentage
 */
export const isPercentage = (n: number): n is Percentage => {
  return Number.isFinite(n) && n >= 0 && n <= 100;
};

/**
 * Checks if a number can be safely converted to Basis Points
 */
export const isBasisPoints = (n: number): n is BasisPoints => {
  return Number.isFinite(n) && n >= 0 && n <= 10000;
};

/**
 * Checks if a number can be safely converted to Dollars
 */
export const isDollars = (n: number): n is Dollars => {
  return Number.isFinite(n) && n >= 0;
};
