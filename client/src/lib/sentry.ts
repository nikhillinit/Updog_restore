/**
 * Sentry Configuration for Browser
 * Respects DNT and user opt-out preferences
 * Environment-specific DSN configuration
 */

import * as Sentry from '@sentry/browser';

// Check Do Not Track setting
const isDNT = typeof navigator !== 'undefined' && 
  (navigator.doNotTrack === '1' || 
   (navigator as any).msDoNotTrack === '1' ||
   (window as any).doNotTrack === '1');

// Check user opt-out preference
const isOptedOut = typeof localStorage !== 'undefined' && 
  localStorage.getItem('analyticsOptOut') === '1';

// Check if Sentry DSN is configured
const sentryDSN = import.meta.env.VITE_SENTRY_DSN;

// Initialize Sentry only if allowed and configured
if (!isDNT && !isOptedOut && sentryDSN) {
  Sentry.init({
    dsn: sentryDSN,
    environment: import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_GIT_SHA || 'unknown',
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE || '0.1'),
    
    // Performance monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    
    // Session replay sampling
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Privacy: Scrub sensitive data
    beforeSend(event, hint) {
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
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
  return !isDNT && !isOptedOut && !!sentryDSN;
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

export { Sentry };