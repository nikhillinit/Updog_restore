/**
 * Headers utility to handle Express string | string[] header types
 * Centralizes header access pattern for type safety
 */

interface RequestHeaders {
  [key: string]: string | string[] | undefined;
}

/**
 * Safely extract a single header value from Express request headers
 * Handles the string | string[] | undefined type properly
 */
export function header(
  headers: RequestHeaders, 
  name: string
): string | undefined {
  const value = headers[name.toLowerCase()];
  
  if (Array.isArray(value)) {
    return value[0]; // Take first value if array
  }
  
  return value;
}

/**
 * Get authorization header token (Bearer token)
 */
export function getAuthToken(headers: RequestHeaders): string | null {
  const authHeader = header(headers, 'authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}

/**
 * Get user agent string
 */
export function getUserAgent(headers: RequestHeaders): string | undefined {
  return header(headers, 'user-agent');
}