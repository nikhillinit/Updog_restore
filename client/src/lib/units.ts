/**
 * Units and Precision Utilities
 *
 * Centralized conversion functions to prevent precision errors.
 *
 * **Critical Context:**
 * - Previous 100× MOIC error was caused by inconsistent decimal/bps handling
 * - ALL monetary values are stored in cents (integer)
 * - ALL percentages are stored in basis points (bps, integer)
 * - ALL MOIC values are stored in basis points (2.5x = 25,000 bps)
 * - Format to human-readable units ONLY at display boundaries
 *
 * **Enforcement:**
 * - This module is a hard dependency for all adapters and validators
 * - Import these helpers at API boundaries
 * - Never use raw decimals in calculations
 * - All tests must use these helpers to ensure precision
 */

// ============================================================================
// MONETARY CONVERSIONS (Dollars ↔ Cents)
// ============================================================================

/**
 * Convert dollars to cents (storage format)
 *
 * @param dollars - Dollar amount (e.g., 1000000.50)
 * @returns Integer cents (e.g., 100000050)
 *
 * @example
 * dollarsToCents(1000000.50) // => 100000050
 * dollarsToCents(0.01)       // => 1
 * dollarsToCents(0.005)      // => 1 (rounds to nearest cent)
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars (display format)
 *
 * @param cents - Integer cents (e.g., 100000050)
 * @returns Dollar amount (e.g., 1000000.50)
 *
 * @example
 * centsToDollars(100000050) // => 1000000.50
 * centsToDollars(1)         // => 0.01
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

// ============================================================================
// PERCENTAGE CONVERSIONS (Decimal ↔ Basis Points)
// ============================================================================

/**
 * Convert percentage (0-100 scale) to basis points (storage format)
 *
 * @param percent - Percentage (e.g., 35 for 35%)
 * @returns Integer basis points (e.g., 3500)
 *
 * @example
 * percentToBps(35)    // => 3500
 * percentToBps(0.5)   // => 50
 * percentToBps(100)   // => 10000
 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/**
 * Convert decimal (0-1 scale) to basis points (storage format)
 *
 * @param decimal - Decimal (e.g., 0.35 for 35%)
 * @returns Integer basis points (e.g., 3500)
 *
 * @example
 * decimalToBps(0.35)  // => 3500
 * decimalToBps(0.005) // => 50
 * decimalToBps(1.0)   // => 10000
 */
export function decimalToBps(decimal: number): number {
  return Math.round(decimal * 10_000);
}

/**
 * Convert basis points to decimal (calculation format)
 *
 * @param bps - Integer basis points (e.g., 3500)
 * @returns Decimal (e.g., 0.35)
 *
 * @example
 * bpsToDecimal(3500)  // => 0.35
 * bpsToDecimal(50)    // => 0.005
 * bpsToDecimal(10000) // => 1.0
 */
export function bpsToDecimal(bps: number): number {
  return bps / 10_000;
}

/**
 * Convert basis points to percentage (display format)
 *
 * @param bps - Integer basis points (e.g., 3500)
 * @returns Percentage (e.g., 35)
 *
 * @example
 * bpsToPercent(3500)  // => 35
 * bpsToPercent(50)    // => 0.5
 * bpsToPercent(10000) // => 100
 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

// ============================================================================
// MOIC CONVERSIONS (Multiplier ↔ Basis Points)
// ============================================================================

/**
 * Convert MOIC multiplier to basis points (storage format)
 *
 * **CRITICAL:** This prevents the 100× MOIC error
 * - 2.5x MOIC = 25,000 bps (NOT 2.5 or 250)
 * - 10x MOIC = 100,000 bps (NOT 10 or 1000)
 *
 * @param moic - MOIC multiplier (e.g., 2.5 for 2.5x)
 * @returns Integer basis points (e.g., 25000)
 *
 * @example
 * moicToBps(2.5)  // => 25000
 * moicToBps(10)   // => 100000
 * moicToBps(0.5)  // => 5000
 */
export function moicToBps(moic: number): number {
  return Math.round(moic * 10_000);
}

/**
 * Convert basis points to MOIC multiplier (display format)
 *
 * @param bps - Integer basis points (e.g., 25000)
 * @returns MOIC multiplier (e.g., 2.5)
 *
 * @example
 * bpsToMoic(25000)  // => 2.5
 * bpsToMoic(100000) // => 10
 * bpsToMoic(5000)   // => 0.5
 */
export function bpsToMoic(bps: number): number {
  return bps / 10_000;
}

// ============================================================================
// VALIDATED CONVERSIONS (with Bounds Checking)
// ============================================================================

/**
 * Convert dollars to cents with validation
 *
 * @param dollars - Dollar amount
 * @param options - Validation options
 * @returns Validated integer cents
 * @throws Error if value is invalid or out of bounds
 *
 * @example
 * dollarsToCentsValidated(1000000) // => 100000000
 * dollarsToCentsValidated(-100)    // throws Error
 */
export function dollarsToCentsValidated(
  dollars: number,
  options: { min?: number; max?: number; allowNegative?: boolean } = {}
): number {
  const { min = 0, max = Number.MAX_SAFE_INTEGER / 100, allowNegative = false } = options;

  if (!Number.isFinite(dollars)) {
    throw new Error(`Invalid dollar amount: ${dollars}`);
  }

  if (!allowNegative && dollars < 0) {
    throw new Error(`Dollar amount cannot be negative: ${dollars}`);
  }

  if (dollars < min) {
    throw new Error(`Dollar amount ${dollars} is below minimum ${min}`);
  }

  if (dollars > max) {
    throw new Error(`Dollar amount ${dollars} exceeds maximum ${max}`);
  }

  const cents = Math.round(dollars * 100);

  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Dollar amount ${dollars} converts to unsafe integer: ${cents}`);
  }

  return cents;
}

/**
 * Convert percent to basis points with validation
 *
 * @param percent - Percentage (0-100 scale)
 * @param options - Validation options
 * @returns Validated integer basis points
 * @throws Error if value is invalid or out of bounds
 *
 * @example
 * percentToBpsValidated(35)   // => 3500
 * percentToBpsValidated(150)  // throws Error (if max=100)
 */
export function percentToBpsValidated(
  percent: number,
  options: { min?: number; max?: number } = {}
): number {
  const { min = 0, max = 100 } = options;

  if (!Number.isFinite(percent)) {
    throw new Error(`Invalid percentage: ${percent}`);
  }

  if (percent < min) {
    throw new Error(`Percentage ${percent} is below minimum ${min}%`);
  }

  if (percent > max) {
    throw new Error(`Percentage ${percent} exceeds maximum ${max}%`);
  }

  return Math.round(percent * 100);
}

/**
 * Convert MOIC to basis points with validation
 *
 * @param moic - MOIC multiplier
 * @param options - Validation options
 * @returns Validated integer basis points
 * @throws Error if value is invalid or out of bounds
 *
 * @example
 * moicToBpsValidated(2.5)    // => 25000
 * moicToBpsValidated(-1)     // throws Error
 * moicToBpsValidated(1000)   // throws Error (if max=100)
 */
export function moicToBpsValidated(
  moic: number,
  options: { min?: number; max?: number } = {}
): number {
  const { min = 0, max = 100 } = options;

  if (!Number.isFinite(moic)) {
    throw new Error(`Invalid MOIC: ${moic}`);
  }

  if (moic < min) {
    throw new Error(`MOIC ${moic}x is below minimum ${min}x`);
  }

  if (moic > max) {
    throw new Error(`MOIC ${moic}x exceeds maximum ${max}x`);
  }

  return Math.round(moic * 10_000);
}

// ============================================================================
// CLAMPING UTILITIES
// ============================================================================

/**
 * Clamp a value to stay within bounds
 *
 * @param value - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 *
 * @example
 * clamp(150, 0, 100)  // => 100
 * clamp(-10, 0, 100)  // => 0
 * clamp(50, 0, 100)   // => 50
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Clamp basis points to 0-10000 range (0-100%)
 *
 * @param bps - Basis points to clamp
 * @returns Clamped basis points
 *
 * @example
 * clampBps(15000)  // => 10000
 * clampBps(-100)   // => 0
 * clampBps(5000)   // => 5000
 */
export function clampBps(bps: number): number {
  return clamp(bps, 0, 10_000);
}

/**
 * Clamp percentage to 0-100 range
 *
 * @param percent - Percentage to clamp
 * @returns Clamped percentage
 *
 * @example
 * clampPercent(150)  // => 100
 * clampPercent(-10)  // => 0
 * clampPercent(50)   // => 50
 */
export function clampPercent(percent: number): number {
  return clamp(percent, 0, 100);
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format cents as currency string
 *
 * @param cents - Integer cents
 * @param options - Formatting options
 * @returns Formatted currency string
 *
 * @example
 * formatCents(100000050)                    // => "$1,000,000.50"
 * formatCents(100000050, { compact: true }) // => "$1M"
 */
export function formatCents(
  cents: number,
  options: { compact?: boolean; decimals?: number; currency?: string } = {}
): string {
  const { compact = false, decimals = 2, currency = 'USD' } = options;
  const dollars = centsToDollars(cents);

  if (compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(dollars);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(dollars);
}

/**
 * Format basis points as percentage string
 *
 * @param bps - Integer basis points
 * @param options - Formatting options
 * @returns Formatted percentage string
 *
 * @example
 * formatBps(3500)                      // => "35.00%"
 * formatBps(3500, { decimals: 1 })     // => "35.0%"
 * formatBps(50, { decimals: 2 })       // => "0.50%"
 */
export function formatBps(
  bps: number,
  options: { decimals?: number } = {}
): string {
  const { decimals = 2 } = options;
  const percent = bpsToPercent(bps);
  return `${percent.toFixed(decimals)}%`;
}

/**
 * Format MOIC basis points as multiplier string
 *
 * @param bps - Integer basis points
 * @param options - Formatting options
 * @returns Formatted multiplier string
 *
 * @example
 * formatMoic(25000)                    // => "2.5x"
 * formatMoic(100000, { decimals: 1 })  // => "10.0x"
 * formatMoic(5000, { decimals: 2 })    // => "0.50x"
 */
export function formatMoic(
  bps: number,
  options: { decimals?: number } = {}
): string {
  const { decimals = 2 } = options;
  const moic = bpsToMoic(bps);
  return `${moic.toFixed(decimals)}x`;
}
