/**
 * Centralized monitoring wrapper with compile-time exclusion
 * This module provides a Sentry-compatible API that can be completely
 * excluded from the production bundle when VITE_SENTRY_DSN is not set
 */

// Check Do Not Track setting
const isDNT = typeof navigator !== 'undefined' && 
  (navigator.doNotTrack === '1' || 
   (navigator as any).msDoNotTrack === '1' ||
   (window as any).doNotTrack === '1');

// Check user opt-out preference
const isOptedOut = typeof localStorage !== 'undefined' && 
  localStorage.getItem('analyticsOptOut') === '1';

// Compile-time flag set by Vite based on VITE_SENTRY_DSN
declare const __SENTRY__: boolean;

// Type definitions for when Sentry is excluded
interface MockScope {
  setMeasurement: (_key: string, value: number) => void;
  setTag: (_key: string, value: string) => void;
  setContext: (_key: string, value: any) => void;
  setUser: (_user: any) => void;
  setLevel: (_level: string) => void;
}

interface MockSentry {
  init: (options?: any) => void;
  captureException: (_error: any, context?: any) => string;
  captureMessage: (_message: string, level?: string) => string;
  addBreadcrumb: (_breadcrumb: any) => void;
  withScope: (_callback: (_scope: MockScope) => void) => void;
  setUser: (_user: any) => void;
  setTag: (_key: string, value: string) => void;
  setContext: (_key: string, value: any) => void;
  configureScope: (_callback: (_scope: MockScope) => void) => void;
  browserTracingIntegration: () => any;
  replayIntegration: (options?: any) => any;
}

// No-op implementations when Sentry is excluded
const noopScope: MockScope = {
  setMeasurement: () => {},
  setTag: () => {},
  setContext: () => {},
  setUser: () => {},
  setLevel: () => {},
};

const noopSentry: MockSentry = {
  init: () => {},
  captureException: () => 'noop',
  captureMessage: () => 'noop',
  addBreadcrumb: () => {},
  withScope: (callback: any) => callback(noopScope),
  setUser: () => {},
  setTag: () => {},
  setContext: () => {},
  configureScope: (callback: any) => callback(noopScope),
  browserTracingIntegration: () => ({}),
  replayIntegration: () => ({}),
};

// Export Sentry conditionally based on compile-time flag
let Sentry: MockSentry = noopSentry;
let isSentryEnabled = false;

// Only load real Sentry if compile-time flag is true
// DISABLED: Sentry is not configured (no VITE_SENTRY_DSN)
// When Sentry is needed, install @sentry/browser and uncomment below
/*
if (typeof __SENTRY__ !== 'undefined' && __SENTRY__ && !isDNT && !isOptedOut) {
  // Dynamic import to enable code splitting - but ONLY if flag is true
  import('@sentry/browser').then((SentryModule: any) => {
    const sentryDSN = import.meta.env.VITE_SENTRY_DSN;
    if (sentryDSN) {
      SentryModule.init({
        dsn: sentryDSN,
        environment: import.meta.env.MODE || 'development',
        release: import.meta.env.VITE_GIT_SHA || 'unknown',
        tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE || '0.1'),
        
        // Performance monitoring
        integrations: [
          SentryModule.browserTracingIntegration(),
          SentryModule.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
        
        // Session replay sampling
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        
        // Privacy: Scrub sensitive data
        beforeSend(event: any, _hint: any) {
          // Remove PII from URLs
          if (event.request?.url) {
            event.request.url = event.request.url.replace(/\/users\/\d+/g, '/users/[id]');
          }
          
          // Remove email addresses
          if (event.extra) {
            const stringified = JSON.stringify(event.extra);
            const scrubbed = stringified.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
            event.extra = JSON.parse(scrubbed);
          }
          
          return event;
        },
        
        // Ignore specific errors
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'Non-Error promise rejection captured',
          /extension\//i,
          /^chrome:\/\//i,
        ],
      });
      
      // Replace the no-op with real Sentry
      Sentry = SentryModule as any;
      isSentryEnabled = true;
      
      // Also set on window for vitals.ts compatibility
      (window as any).Sentry = SentryModule;
    }
  });
}
*/

/**
 * Check if Sentry is enabled
 */
export function getIsSentryEnabled(): boolean {
  return isSentryEnabled;
}

/**
 * Enable/disable analytics (including Sentry)
 * @param enabled - Whether to enable analytics
 */
export function setAnalyticsEnabled(enabled: boolean): void {
  if (enabled) {
    localStorage.removeItem('analyticsOptOut');
  } else {
    localStorage.setItem('analyticsOptOut', '1');
  }
  
  // Reload to apply changes
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

// Export the conditional Sentry instance
export { Sentry };
export default Sentry;