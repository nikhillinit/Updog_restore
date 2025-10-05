/**
 * Metric Formatting Utilities
 *
 * Consistent formatting for fund performance metrics across the UI.
 * Handles null values appropriately to avoid misleading displays.
 */

/**
 * Format DPI (Distributions to Paid-In Capital)
 * Returns "N/A" when no distributions have been recorded
 *
 * @param dpi - DPI value (null when no distributions)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "1.25x" or "N/A")
 */
export function formatDPI(dpi: number | null, decimals: number = 2): string {
  if (dpi === null) {
    return 'N/A';
  }
  return `${dpi.toFixed(decimals)}x`;
}

/**
 * Get tooltip text explaining DPI value or null state
 *
 * @param dpi - DPI value (null when no distributions)
 * @param totalDistributions - Total cash distributed (optional, for detail)
 * @param totalCalled - Total capital called (optional, for detail)
 * @returns Tooltip explanation string
 */
export function getDPITooltip(
  dpi: number | null,
  totalDistributions?: number,
  totalCalled?: number
): string {
  if (dpi === null) {
    return 'No distributions have been recorded yet. DPI will be calculated once the fund makes distributions to LPs.';
  }

  if (totalDistributions !== undefined && totalCalled !== undefined) {
    return `Distributions to Paid-In Capital: $${(totalDistributions / 1_000_000).toFixed(2)}M / $${(totalCalled / 1_000_000).toFixed(2)}M = ${dpi.toFixed(2)}x`;
  }

  return `Distributions to Paid-In Capital: ${dpi.toFixed(2)}x`;
}

/**
 * Format multiple (TVPI, RVPI, etc.)
 *
 * @param value - Multiple value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "2.50x")
 */
export function formatMultiple(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}x`;
}

/**
 * Format IRR as percentage
 *
 * @param irr - IRR value as decimal (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string (e.g., "15.00%")
 */
export function formatIRR(irr: number, decimals: number = 2): string {
  return `${(irr * 100).toFixed(decimals)}%`;
}

/**
 * Format currency in millions
 *
 * @param value - Dollar amount
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string (e.g., "$50.0M")
 */
export function formatCurrencyM(value: number, decimals: number = 1): string {
  return `$${(value / 1_000_000).toFixed(decimals)}M`;
}
