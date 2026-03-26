import type { Metric } from 'web-vitals';
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';
import { Sentry } from '@/monitoring';
import { logger } from '@/lib/logger';

interface VitalMetric extends Omit<Metric, 'navigationType'> {
  navigationType?: string;
  delta: number;
}

interface PrivacySettings {
  telemetryOptOut?: boolean;
}

declare global {
  interface Window {
    getVitalsSnapshot?: typeof getVitalsSnapshot;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPrivacySettings(value: unknown): value is PrivacySettings {
  return typeof value === 'object' && value !== null;
}

function readPrivacySettings(): PrivacySettings | null {
  const raw = localStorage.getItem('privacy-settings');
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isPrivacySettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function ensureCorrelationId(): string {
  const existingCorrelationId = sessionStorage.getItem('cid');
  if (existingCorrelationId) {
    return existingCorrelationId;
  }

  const newCorrelationId = crypto.randomUUID();
  sessionStorage.setItem('cid', newCorrelationId);
  return newCorrelationId;
}

/**
 * Check if telemetry is allowed based on privacy settings
 */
function isTelemetryAllowed(): boolean {
  // Check DNT header respect
  if (navigator.doNotTrack === '1') {
    return false;
  }

  // Check user opt-out preference
  const privacySettings = readPrivacySettings();
  if (privacySettings?.telemetryOptOut === true) {
    return false;
  }

  // Check if RUM v2 is enabled and should validate
  if (import.meta.env.VITE_ENABLE_RUM_V2 === '1') {
    // Additional v2 checks can go here
    return true;
  }

  return true;
}

/**
 * Send Core Web Vitals to monitoring backends
 */
function sendToAnalytics(metric: VitalMetric) {
  // Privacy check - short circuit if telemetry disabled
  if (!isTelemetryAllowed()) {
    if (import.meta.env.DEV) {
      logger.debug('web_vital_skipped', {
        reason: 'privacy-disabled',
        name: metric.name,
      });
    }
    return;
  }

  // Get or create correlation ID
  const cid = ensureCorrelationId();

  const body = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    pathname: window.location.pathname,
    timestamp: Date.now(), // Use numeric timestamp for v2 validation
    release: import.meta.env.VITE_GIT_SHA || 'unknown',
    env: import.meta.env.MODE,
    cid,
  };

  // Send to Sentry as custom measurement (if privacy allows)
  Sentry.withScope((scope) => {
    scope.setMeasurement(`webvital.${metric.name.toLowerCase()}`, metric.value);

    // Also send as breadcrumb for observability
    Sentry.addBreadcrumb({
      message: `Web Vital: ${metric.name.toLowerCase()}`,
      level: 'info',
      data: {
        value: metric.value,
        rating: metric.rating,
      },
    });
  });

  // Send to backend RUM endpoint
  if (typeof navigator.sendBeacon === 'function') {
    const url = '/metrics/rum';
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
  } else {
    // Fallback for older browsers
    fetch('/metrics/rum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch((error: unknown) => {
      logger.warn('web_vital_transport_failed', {
        name: metric.name,
        error: getErrorMessage(error),
      });
    });
  }

  // Log to console in development
  if (import.meta.env.DEV) {
    logger.debug('web_vital', {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
    });
  }
}

/**
 * Initialize Web Vitals collection
 */
export function startVitals() {
  // Core Web Vitals
  onLCP(sendToAnalytics); // Largest Contentful Paint
  onINP(sendToAnalytics); // Interaction to Next Paint (replaces FID)
  onCLS(sendToAnalytics); // Cumulative Layout Shift

  // Additional metrics
  onFCP(sendToAnalytics); // First Contentful Paint
  onTTFB(sendToAnalytics); // Time to First Byte

  // Custom performance marks
  if (window.performance && window.performance.mark) {
    // Mark when React app is interactive
    window.addEventListener('load', () => {
      window.performance.mark('app-interactive');

      // Measure time to interactive
      window.performance.measure('time-to-interactive', 'navigationStart', 'app-interactive');
      const measure = window.performance.getEntriesByName('time-to-interactive')[0];

      if (measure) {
        sendToAnalytics({
          name: 'TTI',
          value: measure.duration,
          rating:
            measure.duration < 3800
              ? 'good'
              : measure.duration < 7300
                ? 'needs-improvement'
                : 'poor',
          id: `tti-${Date.now()}`,
          entries: [],
          navigationType: 'navigate',
        } as unknown as VitalMetric);
      }
    });
  }

  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Report tasks longer than 50ms as potential issues
          if (entry.duration > 50) {
            Sentry.addBreadcrumb({
              category: 'performance',
              message: `Long task detected: ${entry.duration}ms`,
              level: entry.duration > 100 ? 'warning' : 'info',
              data: {
                duration: entry.duration,
                startTime: entry.startTime,
                name: entry.name,
              },
            });
          }
        }
      });

      observer.observe({ entryTypes: ['longtask'] });
    } catch (error: unknown) {
      logger.warn('long_task_observer_not_supported', {
        error: getErrorMessage(error),
      });
    }
  }

  if (import.meta.env.DEV) {
    logger.debug('web_vitals_initialized');
  }
}

/**
 * Get current Web Vitals snapshot (for debugging)
 */
export function getVitalsSnapshot() {
  const vitals: Record<string, number | null> = {
    lcp: null,
    inp: null,
    cls: null,
    fcp: null,
    ttfb: null,
  };

  // Collect current values (note: these are cumulative)
  onLCP(
    (metric) => {
      vitals['lcp'] = metric.value;
    },
    { reportAllChanges: false }
  );
  onINP(
    (metric) => {
      vitals['inp'] = metric.value;
    },
    { reportAllChanges: false }
  );
  onCLS(
    (metric) => {
      vitals['cls'] = metric.value;
    },
    { reportAllChanges: false }
  );
  onFCP(
    (metric) => {
      vitals['fcp'] = metric.value;
    },
    { reportAllChanges: false }
  );
  onTTFB(
    (metric) => {
      vitals['ttfb'] = metric.value;
    },
    { reportAllChanges: false }
  );

  return vitals;
}

// Expose for debugging in console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.getVitalsSnapshot = getVitalsSnapshot;
}
