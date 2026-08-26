/**
 * Money & Number Formatting Utilities
 *
 * CRITICAL CONVENTION: All monetary values are stored as WHOLE US DOLLARS (integers).
 * No cents, no decimals, no unit ambiguity.
 *
 * Examples:
 * - $250M fund = 250_000_000 (stored)
 * - $3.5M round = 3_500_000 (stored)
 * - 2.5% fee = 2.5 (stored as percentage 0-100)
 */

/**
 * Format whole dollars with commas, no decimals
 *
 * @param value - Amount in whole dollars
 * @returns Formatted string (e.g., "250,000,000")
 *
 * @example
 * formatUSD(250000000) // "250,000,000"
 * formatUSD(0) // "0"
 * formatUSD(null) // ""
 */
export function formatUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/**
 * Parse USD string to whole dollars
 * REJECTS decimals - returns null for invalid input
 *
 * @param input - User input string (may contain commas, spaces, $)
 * @returns Whole dollar amount or null if invalid
 *
 * @example
 * parseUSDStrict("250,000,000") // 250000000
 * parseUSDStrict("$250M") // null (no unit parsing)
 * parseUSDStrict("250.50") // null (no decimals allowed)
 * parseUSDStrict("") // null
 */
export function parseUSDStrict(input: string): number | null {
  if (!input || input === '' || input === '-') {
    return null;
  }

  // Remove commas, spaces, dollar signs
  const cleaned = input.replace(/[,\s$]/g, '');

  // REJECT decimals
  if (cleaned.includes('.')) {
    return null;
  }

  // Must be digits only
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  const num = Number(cleaned);

  // Must be safe integer (avoid floating point issues)
  if (!Number.isSafeInteger(num)) {
    return null;
  }

  return num;
}

/**
 * Calculate percentage of dollar amount
 * Rounds to whole dollars
 *
 * @param amountUSD - Amount in whole dollars
 * @param pct - Percentage (0-100 scale)
 * @returns Whole dollar amount
 *
 * @example
 * pctOfDollars(100_000_000, 2.5) // 2_500_000 (2.5% of $100M)
 * pctOfDollars(50_000_000, 20) // 10_000_000 (20% of $50M)
 */
export function pctOfDollars(amountUSD: number, pct: number): number {
  return Math.round(amountUSD * (pct / 100));
}

/**
 * Format percentage value (0-100 scale)
 *
 * @param value - Percentage value
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "2.5")
 *
 * @example
 * formatPct(2.5) // "2.5"
 * formatPct(20, 0) // "20"
 * formatPct(null) // ""
 */
export function formatPct(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }

  return value.toFixed(decimals);
}

/**
 * Parse percentage string to number (0-100 scale)
 *
 * @param input - User input string
 * @param min - Minimum value (default: 0)
 * @param max - Maximum value (default: 100)
 * @returns Percentage value or null if invalid
 *
 * @example
 * parsePct("2.5") // 2.5
 * parsePct("150") // null (exceeds max)
 * parsePct("-5") // null (below min)
 */
export function parsePct(input: string, min: number = 0, max: number = 100): number | null {
  if (!input || input === '' || input === '-') {
    return null;
  }

  const num = Number(input);

  if (!Number.isFinite(num)) {
    return null;
  }

  if (num < min || num > max) {
    return null;
  }

  return num;
}

/**
 * Format dollar amount in short form (M, K, B)
 * Used for compact displays (charts, summaries)
 *
 * @param value - Amount in whole dollars
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "$250M", "$3.5M", "$750K")
 *
 * @example
 * formatUSDShort(250_000_000) // "$250M"
 * formatUSDShort(3_500_000) // "$3.5M"
 * formatUSDShort(750_000) // "$750K"
 * formatUSDShort(1_000) // "$1K"
 */
export function formatUSDShort(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }

  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(decimals)}B`;
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(decimals)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(decimals)}K`;
  }

  return `$${value}`;
}

/**
 * Validate that a number is a whole dollar amount
 *
 * @param value - Value to check
 * @returns True if valid whole dollar amount
 */
export function isWholeUSD(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Sum array of dollar amounts, ensuring result is whole dollars
 *
 * @param amounts - Array of dollar amounts
 * @returns Total in whole dollars
 *
 * @example
 * sumUSD([1_000_000, 2_500_000, 500_000]) // 4_000_000
 */
export function sumUSD(amounts: number[]): number {
  return Math.round(amounts.reduce((sum, amt) => sum + amt, 0));
}
