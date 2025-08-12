/**
 * Safe, opt-in telemetry for migrations and feature usage
 * 
 * Enhanced with ring buffer storage and live updates:
 * - Limited to 200 events max (prevents localStorage bloat)
 * - CustomEvent dispatch for same-tab live updates
 * - Batched beacon sending for performance
 * 
 * Usage:
 * - logMigration({ fromVersion: 'legacy', stages: 3 })
 * - logFeature('fundStore', { action: 'init' })
 * - readTelemetry() // Get all events for dashboard
 * 
 * Control via env vars:
 * - VITE_TRACK_MIGRATIONS=1 enables migration logging
 * - VITE_TRACK_FEATURES=1 enables feature logging
 */

type LogLevel = 'info' | 'warn' | 'error';

export interface TelemetryEvent {
  t: number; // timestamp as number for smaller storage
  category: string;
  event: string;
  ok?: boolean; // quick success/failure flag
  meta?: Record<string, unknown>; // additional data
}

const STORAGE_KEY = '__telemetry_events';
const MAX_EVENTS = 200;

const getEnvFlag = (name: string): boolean => {
  try {
    return (import.meta as any).env?.[name] === '1';
  } catch {
    return false;
  }
};

/**
 * Emit telemetry event to ring buffer with live updates
 */
export function emitTelemetry(event: Omit<TelemetryEvent, 't'>): void {
  try {
    const fullEvent: TelemetryEvent = { ...event, t: Date.now() };
    
    // Read existing buffer
    const buffer: TelemetryEvent[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    
    // Add event and maintain ring buffer
    buffer.push(fullEvent);
    while (buffer.length > MAX_EVENTS) {
      buffer.shift();
    }
    
    // Save back to storage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
    
    // Notify listeners for live updates
    window.dispatchEvent(new CustomEvent('telemetry:append', { detail: fullEvent }));
    
    // Console logging for development
    const message = `[${event.category}] ${event.event}`;
    const payload = event.meta ? JSON.stringify(event.meta) : '';
    console.info(message, payload);
    
  } catch (e) {
    // Fail silently - telemetry should never break the app
    console.warn('Telemetry emission failed:', e);
  }
}

/**
 * Read all telemetry events from ring buffer
 */
export function readTelemetry(): TelemetryEvent[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    console.warn('Failed to read telemetry:', e);
    return [];
  }
}

/**
 * Log migration events (localStorage upgrades, schema changes, etc.)
 * Only logs when VITE_TRACK_MIGRATIONS=1
 */
export const logMigration = (data: Record<string, unknown>) => {
  if (!getEnvFlag('VITE_TRACK_MIGRATIONS')) return;
  
  emitTelemetry({
    category: 'migration',
    event: 'upgrade',
    ok: true,
    meta: data
  });
  
  // Hook for analytics/monitoring (extend as needed)
  if (typeof window !== 'undefined' && (window as any).__analytics) {
    try {
      (window as any).__analytics.track('Migration', { category: 'migration', event: 'upgrade', data });
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
  
  emitTelemetry({
    category: 'feature',
    event: feature,
    ok: true,
    meta: data
  });
  
  // Hook for analytics/monitoring (extend as needed)
  if (typeof window !== 'undefined' && (window as any).__analytics) {
    try {
      (window as any).__analytics.track('Feature', { feature, data });
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
  emitTelemetry({
    category: 'error',
    event: error.name,
    ok: false,
    meta: {
      message: error.message,
      stack: error.stack,
      ...context
    }
  });
  
  // Report to external services only if telemetry is enabled
  if (getEnvFlag('VITE_TRACK_MIGRATIONS') || getEnvFlag('VITE_TRACK_FEATURES')) {
    if (typeof window !== 'undefined' && (window as any).__analytics) {
      try {
        (window as any).__analytics.track('Error', { error: error.name, context });
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
