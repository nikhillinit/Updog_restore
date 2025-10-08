/**
 * Reallocation Utility Functions
 *
 * Helper functions for reallocation feature calculations and validations.
 */

import { formatCents } from './units';
import type {
  ReallocationPreviewResponse,
  ReallocationWarning,
  ReallocationDelta,
} from '@/types/reallocation';

/**
 * Check if preview response has blocking errors
 *
 * Blocking errors prevent commit and include:
 * - Cap exceeded
 * - Negative allocation
 * - Invalid company
 *
 * @param previewData - Preview response from API
 * @returns True if there are blocking errors
 */
export function hasBlockingErrors(
  previewData: ReallocationPreviewResponse | null
): boolean {
  if (!previewData) return false;

  // Check validation errors
  if (!previewData.validation.is_valid) {
    return true;
  }

  // Check for error-severity warnings
  const hasErrorWarnings = previewData.warnings.some(
    (warning) => warning.severity === 'error'
  );

  return hasErrorWarnings;
}

/**
 * Get blocking error messages
 *
 * @param previewData - Preview response from API
 * @returns Array of error messages
 */
export function getBlockingErrors(
  previewData: ReallocationPreviewResponse | null
): string[] {
  if (!previewData) return [];

  const errors: string[] = [];

  // Add validation errors
  if (!previewData.validation.is_valid) {
    errors.push(...previewData.validation.errors);
  }

  // Add error-severity warnings
  previewData.warnings
    .filter((warning) => warning.severity === 'error')
    .forEach((warning) => errors.push(warning.message));

  return errors;
}

/**
 * Format delta with sign and color indicator
 *
 * @param deltaCents - Delta in cents
 * @param options - Formatting options
 * @returns Formatted delta string with sign
 */
export function formatDelta(
  deltaCents: number,
  options: { compact?: boolean; showSign?: boolean } = {}
): string {
  const { compact = false, showSign = true } = options;

  const sign = deltaCents > 0 ? '+' : deltaCents < 0 ? '-' : '';
  const absValue = Math.abs(deltaCents);

  const formatted = formatCents(absValue, { compact });

  return showSign && sign ? `${sign}${formatted}` : formatted;
}

/**
 * Get color class for delta value
 *
 * @param deltaCents - Delta in cents
 * @returns Tailwind color class
 */
export function getDeltaColorClass(deltaCents: number): string {
  if (deltaCents > 0) return 'text-green-600';
  if (deltaCents < 0) return 'text-red-600';
  return 'text-gray-500';
}

/**
 * Get delta icon based on status
 *
 * @param status - Delta status
 * @returns Icon character
 */
export function getDeltaIcon(
  status: 'increased' | 'decreased' | 'unchanged'
): string {
  switch (status) {
    case 'increased':
      return '↑';
    case 'decreased':
      return '↓';
    case 'unchanged':
      return '→';
  }
}

/**
 * Format percentage change
 *
 * @param percent - Percentage value
 * @returns Formatted percentage string with sign
 */
export function formatPercentChange(percent: number): string {
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * Get warning icon based on severity
 *
 * @param severity - Warning severity
 * @returns Icon character
 */
export function getWarningIcon(severity: 'warning' | 'error'): string {
  return severity === 'error' ? '❌' : '⚠️';
}

/**
 * Get warning badge variant based on severity
 *
 * @param severity - Warning severity
 * @returns Badge variant
 */
export function getWarningBadgeVariant(
  severity: 'warning' | 'error'
): 'default' | 'destructive' | 'secondary' {
  return severity === 'error' ? 'destructive' : 'secondary';
}

/**
 * Sort deltas by absolute value (largest first)
 *
 * @param deltas - Array of deltas
 * @returns Sorted array
 */
export function sortDeltasByMagnitude(
  deltas: ReallocationDelta[]
): ReallocationDelta[] {
  return [...deltas].sort(
    (a, b) => Math.abs(b.delta_cents) - Math.abs(a.delta_cents)
  );
}

/**
 * Group warnings by severity
 *
 * @param warnings - Array of warnings
 * @returns Warnings grouped by severity
 */
export function groupWarningsBySeverity(warnings: ReallocationWarning[]): {
  errors: ReallocationWarning[];
  warnings: ReallocationWarning[];
} {
  return {
    errors: warnings.filter((w) => w.severity === 'error'),
    warnings: warnings.filter((w) => w.severity === 'warning'),
  };
}

/**
 * Calculate total allocation change
 *
 * @param deltas - Array of deltas
 * @returns Total delta in cents
 */
export function calculateTotalDelta(deltas: ReallocationDelta[]): number {
  return deltas.reduce((sum, delta) => sum + delta.delta_cents, 0);
}

/**
 * Check if reallocation is ready for commit
 *
 * @param previewData - Preview response
 * @param reason - Commit reason
 * @returns True if ready to commit
 */
export function canCommit(
  previewData: ReallocationPreviewResponse | null,
  reason: string
): boolean {
  if (!previewData) return false;
  if (!reason.trim()) return false;
  if (hasBlockingErrors(previewData)) return false;

  // Ensure there are actual changes
  const hasChanges = previewData.deltas.some(
    (delta) => delta.status !== 'unchanged'
  );

  return hasChanges;
}
