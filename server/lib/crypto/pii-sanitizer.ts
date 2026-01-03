/**
 * PII Sanitization for Safe Logging
 *
 * Redacts sensitive personally identifiable information (PII) from logs
 * to prevent accidental exposure of LP data in error messages.
 *
 * Redacted Fields:
 * - Email addresses (full redaction)
 * - Tax IDs (SSN, EIN patterns)
 * - Phone numbers
 * - Full names (in specific contexts)
 * - Addresses
 * - Credit card numbers
 *
 * Usage:
 * ```typescript
 * const safeError = sanitizeForLogging(error);
 * console.error('LP API error:', safeError);
 * ```
 *
 * @module server/lib/crypto/pii-sanitizer
 */

/**
 * PII patterns to redact
 */
const PII_PATTERNS = {
  // Email: user@example.com -> [EMAIL_REDACTED]
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,

  // Tax ID: 123-45-6789 or 12-3456789 -> [TAX_ID_REDACTED]
  taxId: /\b\d{2,3}-?\d{2}-?\d{4,5}\b/g,

  // Phone: (123) 456-7890, 123-456-7890, etc -> [PHONE_REDACTED]
  phone: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,

  // Credit card: 4111-1111-1111-1111 -> [CARD_REDACTED]
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,

  // IP addresses (may contain PII in some contexts)
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

/**
 * Field names that may contain PII (case-insensitive)
 */
const PII_FIELD_NAMES = [
  'email',
  'contactEmail',
  'contactemail',
  'taxId',
  'taxid',
  'taxIdEncrypted',
  'taxidencrypted',
  'name',
  'lpName',
  'lpname',
  'contactName',
  'contactname',
  'address',
  'contactPhone',
  'contactphone',
  'phone',
  'ssn',
  'ein',
  'password',
  'token',
  'secret',
  'apiKey',
  'apikey',
];

/**
 * Sanitize a string by redacting PII patterns
 */
function sanitizeString(value: string): string {
  let sanitized = value;

  sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL_REDACTED]');
  sanitized = sanitized.replace(PII_PATTERNS.taxId, '[TAX_ID_REDACTED]');
  sanitized = sanitized.replace(PII_PATTERNS.phone, '[PHONE_REDACTED]');
  sanitized = sanitized.replace(PII_PATTERNS.creditCard, '[CARD_REDACTED]');
  sanitized = sanitized.replace(PII_PATTERNS.ip, '[IP_REDACTED]');

  return sanitized;
}

/**
 * Check if field name indicates PII
 */
function isPIIField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PII_FIELD_NAMES.some((piiField) => lowerKey.includes(piiField.toLowerCase()));
}

/**
 * Sanitize an object by redacting PII fields
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isPIIField(key)) {
      // Completely redact known PII fields
      sanitized[key] = '[PII_REDACTED]';
    } else if (typeof value === 'string') {
      // Sanitize string values for pattern-based PII
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      // Recursively sanitize arrays
      sanitized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : typeof item === 'string'
            ? sanitizeString(item)
            : item
      );
    } else if (value && typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      // Pass through other types unchanged
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize error objects for safe logging
 *
 * Removes PII from:
 * - Error messages
 * - Stack traces
 * - Custom error properties
 *
 * @param error - Error object or any value
 * @returns Sanitized version safe for logging
 *
 * @example
 * ```typescript
 * try {
 *   await createLP({ email: 'john@example.com' });
 * } catch (error) {
 *   console.error('LP creation failed:', sanitizeForLogging(error));
 * }
 * ```
 */
export function sanitizeForLogging(error: unknown): unknown {
  if (error instanceof Error) {
    // Create sanitized error copy
    const sanitizedError: Record<string, unknown> = {
      name: error.name,
      message: sanitizeString(error.message),
    };

    // Sanitize stack trace
    if ('stack' in error && typeof error.stack === 'string') {
      sanitizedError['stack'] = sanitizeString(error.stack);
    }

    // Sanitize custom properties
    const errorObj = error as unknown as Record<string, unknown>;
    for (const key in errorObj) {
      if (
        key !== 'name' &&
        key !== 'message' &&
        key !== 'stack' &&
        Object.prototype.hasOwnProperty.call(errorObj, key)
      ) {
        const value = errorObj[key];
        if (typeof value === 'string') {
          sanitizedError[key] = sanitizeString(value);
        } else if (value && typeof value === 'object') {
          sanitizedError[key] = sanitizeObject(value as Record<string, unknown>);
        } else {
          sanitizedError[key] = value;
        }
      }
    }

    return sanitizedError;
  } else if (typeof error === 'string') {
    return sanitizeString(error);
  } else if (error && typeof error === 'object') {
    return sanitizeObject(error as Record<string, unknown>);
  }

  return error;
}

/**
 * Create a sanitized error message for API responses
 *
 * @param error - Error object
 * @returns Safe, generic error message suitable for API responses
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeString(error.message);
  } else if (typeof error === 'string') {
    return sanitizeString(error);
  }

  return 'An error occurred while processing your request';
}

/**
 * Redact specific PII from request bodies for logging
 *
 * Use this before logging request bodies that may contain LP data.
 *
 * @param body - Request body object
 * @returns Sanitized copy of request body
 */
export function sanitizeRequestBody(body: unknown): unknown {
  if (body && typeof body === 'object') {
    return sanitizeObject(body as Record<string, unknown>);
  }
  return body;
}
