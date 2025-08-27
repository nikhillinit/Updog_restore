import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.warn('Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_GIT_SHA || 'unknown',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true, // Privacy: mask all text
        blockAllMedia: false,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE || (import.meta.env.PROD ? '0.05' : '1.0')),
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/api\.fundsplatform\.com/,
    ],
    
    // Session Replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% when error occurs
    
    // Error sampling
    sampleRate: Number(import.meta.env.VITE_SENTRY_ERROR_RATE || '1.0'),
    
    // Release Health
    autoSessionTracking: true,
    sendDefaultPii: false, // Privacy: don't send PII
    
    // Filtering
    beforeSend(event, hint) {
      // Strip sensitive data
      if (event.request) {
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['x-api-key'];
          delete event.request.headers['cookie'];
        }
        if (event.request.cookies) {
          event.request.cookies = undefined;
        }
      }
      // Filter out non-actionable errors
      const error = hint.originalException;
      
      // Skip network errors that are expected
      if (error && error instanceof Error) {
        if (error.message?.includes('Network request failed')) {
          return null;
        }
        if (error.message?.includes('ResizeObserver loop')) {
          return null; // Browser quirk, not actionable
        }
      }
      
      // Add user context if available
      const userId = localStorage.getItem('userId');
      if (userId) {
        event.user = { id: userId };
      }
      
      // Add custom context
      event.contexts = {
        ...event.contexts,
        custom: {
          feature_flags: localStorage.getItem('feature_flags'),
          api_version: import.meta.env.VITE_API_VERSION,
        },
      };
      
      return event;
    },
    
    // Breadcrumb filtering
    beforeBreadcrumb(breadcrumb) {
      // Don't log console.debug breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null;
      }
      
      // Enhance navigation breadcrumbs
      if (breadcrumb.category === 'navigation') {
        breadcrumb.data = {
          ...breadcrumb.data,
          timestamp: new Date().toISOString(),
        };
      }
      
      return breadcrumb;
    },
  });
  
  // Set initial user context
  const userId = localStorage.getItem('userId');
  const userEmail = localStorage.getItem('userEmail');
  if (userId) {
    Sentry.setUser({
      id: userId,
      email: userEmail || undefined,
    });
  }
  
  // Set correlation ID for request tracing
  const cid = sessionStorage.getItem('cid') || crypto.randomUUID();
  sessionStorage.setItem('cid', cid);
  
  // Set initial tags
  Sentry.setTag('app_version', import.meta.env.VITE_APP_VERSION || 'unknown');
  Sentry.setTag('browser', navigator.userAgent);
  Sentry.setTag('correlation_id', cid);
  
  console.log('Sentry initialized successfully');
}