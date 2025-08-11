/**
 * Safe, opt-in telemetry for migrations and feature usage
 * 
 * Usage:
 * - logMigration({ fromVersion: 'legacy', stages: 3 })
 * - logFeature('fundStore', { action: 'init' })
 * 
 * Control via env vars:
 * - VITE_TRACK_MIGRATIONS=1 enables migration logging
 * - VITE_TRACK_FEATURES=1 enables feature logging
 */

type LogLevel = 'info' | 'warn' | 'error';

interface TelemetryEvent {
  timestamp: string;
  category: string;
  event: string;
  data?: Record<string, unknown>;
}

const getEnvFlag = (name: string): boolean => {
  try {
    return (import.meta as any).env?.[name] === '1';
  } catch {
    return false;
  }
};

const createEvent = (category: string, event: string, data?: Record<string, unknown>): TelemetryEvent => ({
  timestamp: new Date().toISOString(),
  category,
  event,
  data
});

const safeLog = (level: LogLevel, event: TelemetryEvent) => {
  if (typeof console === 'undefined') return;
  
  const message = `[${event.category}] ${event.event}`;
  const payload = event.data ? JSON.stringify(event.data) : '';
  
  switch (level) {
    case 'info':
      console.info(message, payload);
      break;
    case 'warn':
      console.warn(message, payload);
      break;
    case 'error':
      console.error(message, payload);
      break;
  }
};

/**
 * Log migration events (localStorage upgrades, schema changes, etc.)
 * Only logs when VITE_TRACK_MIGRATIONS=1
 */
export const logMigration = (data: Record<string, unknown>) => {
  if (!getEnvFlag('VITE_TRACK_MIGRATIONS')) return;
  
  const event = createEvent('migration', 'upgrade', data);
  safeLog('info', event);
  
  // Hook for analytics/monitoring (extend as needed)
  if (typeof window !== 'undefined' && (window as any).__analytics) {
    try {
      (window as any).__analytics.track('Migration', event);
    } catch (e) {
      // Fail silently - analytics should never break the app
    }
  }
};

/**
 * Log feature usage (A/B tests, feature flags, etc.)
 * Only logs when VITE_TRACK_FEATURES=1
 */
export const logFeature = (feature: string, data?: Record<string, unknown>) => {
  if (!getEnvFlag('VITE_TRACK_FEATURES')) return;
  
  const event = createEvent('feature', feature, data);
  safeLog('info', event);
  
  // Hook for analytics/monitoring (extend as needed)
  if (typeof window !== 'undefined' && (window as any).__analytics) {
    try {
      (window as any).__analytics.track('Feature', event);
    } catch (e) {
      // Fail silently - analytics should never break the app
    }
  }
};

/**
 * Log errors with context (useful for debugging migrations)
 * Always logs to console, but respects telemetry flags for external reporting
 */
export const logError = (error: Error, context?: Record<string, unknown>) => {
  const event = createEvent('error', error.name, {
    message: error.message,
    stack: error.stack,
    ...context
  });
  
  safeLog('error', event);
  
  // Report to external services only if telemetry is enabled
  if (getEnvFlag('VITE_TRACK_MIGRATIONS') || getEnvFlag('VITE_TRACK_FEATURES')) {
    if (typeof window !== 'undefined' && (window as any).__analytics) {
      try {
        (window as any).__analytics.track('Error', event);
      } catch (e) {
        // Fail silently - analytics should never break the app
      }
    }
  }
};

/**
 * Development helper - shows telemetry status
 */
export const debugTelemetry = () => {
  console.table({
    migrations: getEnvFlag('VITE_TRACK_MIGRATIONS'),
    features: getEnvFlag('VITE_TRACK_FEATURES'),
    analyticsAvailable: typeof window !== 'undefined' && !!(window as any).__analytics
  });
};

// Development helper - expose to window in dev mode
if (getEnvFlag('VITE_DEV') || (import.meta as any).env?.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    (window as any).__telemetry = { 
      logMigration, 
      logFeature, 
      logError, 
      debugTelemetry 
    };
  }
}
