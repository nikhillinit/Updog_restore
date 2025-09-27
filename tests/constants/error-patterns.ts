/**
 * Common error patterns to detect React churn/hydration issues
 * Used by both unit tests and E2E tests for consistency
 */

export const REACT_CHURN_PATTERNS = /(maximum update depth|getsnapshot.*cached|too many re-renders|hydration)/i;

export const CRITICAL_ERROR_PATTERNS = [
  /maximum update depth/i,
  /getsnapshot.*cached/i,
  /too many re-renders/i,
  /hydration/i,
  /act\(\)/i,
];

/**
 * Check if a log message contains any critical React errors
 */
export function containsCriticalError(log: string): boolean {
  return CRITICAL_ERROR_PATTERNS.some(pattern => pattern.test(log));
}

/**
 * Filter logs to only critical errors
 */
export function filterCriticalErrors(logs: string[]): string[] {
  return logs.filter(containsCriticalError);
}