/**
 * URL Validation Utility
 * 
 * Provides secure URL validation to prevent malicious URL schemes
 */

/**
 * Validate URL and ensure it uses safe protocols (http/https only)
 * @param url - The URL to validate
 * @returns true if URL is valid and uses http/https protocol
 */
export const isValidUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
};
