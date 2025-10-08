/**
 * Sentry Configuration for Node.js Server
 * Environment-specific configuration with privacy controls
 */

import * as Sentry from '@sentry/node';

const sentryDSN = process.env['SENTRY_DSN'];

if (sentryDSN) {
  Sentry.init({
    dsn: sentryDSN,
    environment: process.env['NODE_ENV'] || 'development',
    release: process.env['GIT_SHA'] || 'unknown',
    tracesSampleRate: Number(process.env['SENTRY_TRACES_RATE'] || '0.1'),
    
    // Performance monitoring
    integrations: [
      Sentry.httpIntegration(),
    ],
    
    // Privacy: Scrub sensitive data
    beforeSend(event: Sentry.ErrorEvent) {
      // Remove auth headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-auth-token'];
      }
      
      // Remove database connection strings
      if (event.extra) {
        const stringified = JSON.stringify(event.extra);
        const scrubbed = stringified
          .replace(/postgresql:\/\/[^@]+@[^/]+/g, 'postgresql://[redacted]')
          .replace(/redis:\/\/[^@]+@[^/]+/g, 'redis://[redacted]');
        event.extra = JSON.parse(scrubbed);
      }
      
      return event;
    },
    
    // Ignore specific errors
    ignoreErrors: [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ],
  });
}

export function isSentryEnabled(): boolean {
  return !!sentryDSN;
}

export { Sentry };