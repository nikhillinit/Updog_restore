/**
 * Sentry Configuration for Browser
 * Re-exports from centralized monitoring module for backwards compatibility
 */

import { Sentry, getIsSentryEnabled, setAnalyticsEnabled } from '@/monitoring';

/**
 * Check if Sentry is enabled
 * @deprecated Use getIsSentryEnabled from @/monitoring instead
 */
export function isSentryEnabled(): boolean {
  return getIsSentryEnabled();
}

// Re-export for backwards compatibility
export { Sentry, setAnalyticsEnabled };