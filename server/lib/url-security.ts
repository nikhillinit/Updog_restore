/**
 * URL Security Validation
 * Ensures production environments only use HTTPS
 */

/**
 * Validates that a URL uses HTTPS in production environments
 * Allows http://localhost and http://127.0.0.1 for development/testing
 *
 * @param urlString - The URL to validate
 * @param context - Description of where this URL is used (for error messages)
 * @param nodeEnv - Current NODE_ENV (defaults to process.env.NODE_ENV)
 * @throws Error if production environment uses non-HTTPS URL
 */
export function assertSecureURL(
  urlString: string,
  context: string,
  nodeEnv: string = process.env.NODE_ENV || 'development'
): URL {
  const url = new URL(urlString);

  // In production, enforce HTTPS
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    // Allow exceptions for loopback addresses only
    const isLoopback =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1';

    if (!isLoopback) {
      throw new Error(
        `Security: ${context} must use HTTPS in production. Got: ${url.protocol}//${url.host}`
      );
    }

    // Even loopback should warn in production
    console.warn(
      `⚠️  WARNING: ${context} using HTTP loopback in production: ${url.href}`
    );
  }

  return url;
}

/**
 * Validates multiple URLs for security
 */
export function assertSecureURLs(
  urls: Array<{ url: string; context: string }>,
  nodeEnv?: string
): void {
  for (const { url, context } of urls) {
    assertSecureURL(url, context, nodeEnv);
  }
}

/**
 * Helper to validate CORS origins
 */
export function validateCORSOrigins(origins: string, nodeEnv: string = process.env.NODE_ENV || 'development'): void {
  const originList = origins.split(',').map(o => o.trim());

  for (const origin of originList) {
    // Skip wildcard check - will be caught by config validation
    if (origin === '*') continue;

    try {
      assertSecureURL(origin, 'CORS origin', nodeEnv);
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Invalid CORS origin: ${origin}. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
