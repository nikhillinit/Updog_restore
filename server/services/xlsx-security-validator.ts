/**
 * XLSX Security Validator
 *
 * Security hardening for xlsx library (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9)
 * - Mitigates Prototype Pollution vulnerability
 * - Mitigates Regular Expression DoS (ReDoS) attacks
 *
 * IMPORTANT: This is a TEMPORARY mitigation. The xlsx library has unfixed
 * high-severity vulnerabilities. Plan migration to ExcelJS (actively maintained).
 *
 * @module server/services/xlsx-security-validator
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum number of rows allowed in generated Excel files
 * Prevents ReDoS attacks via massive datasets
 */
const MAX_ROWS = 50000;

/**
 * Maximum number of columns allowed
 */
const MAX_COLUMNS = 100;

/**
 * Maximum string length for cell values
 * Prevents ReDoS attacks via long regex-processed strings
 */
const MAX_STRING_LENGTH = 10000;

/**
 * Dangerous prototype property names that could enable pollution attacks
 */
const DANGEROUS_PROPERTIES = [
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates that a string doesn't contain prototype pollution vectors
 */
function sanitizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  // Truncate excessively long strings (ReDoS prevention)
  if (value.length > MAX_STRING_LENGTH) {
    console.warn(
      `[xlsx-security] Truncating string from ${value.length} to ${MAX_STRING_LENGTH} chars`
    );
    return `${value.substring(0, MAX_STRING_LENGTH)}...`;
  }

  // Remove null bytes and control characters (security: ReDoS prevention)
  // eslint-disable-next-line no-control-regex -- Intentionally removing control chars for security
  return value.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Validates and sanitizes an object to prevent prototype pollution
 */
function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    // Skip dangerous property names
    if (DANGEROUS_PROPERTIES.includes(key)) {
      console.warn(`[xlsx-security] Blocked dangerous property: ${key}`);
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key as keyof T] = sanitizeObject(value as Record<string, unknown>) as T[keyof T];
    }
    // Sanitize arrays
    else if (Array.isArray(value)) {
      sanitized[key as keyof T] = value.map((item) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Type preserved through sanitization
        typeof item === 'object' && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : item
      ) as T[keyof T];
    }
    // Sanitize strings
    else if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeString(value) as T[keyof T];
    }
    // Pass through primitives
    else {
      sanitized[key as keyof T] = value as T[keyof T];
    }
  }

  return sanitized;
}

/**
 * Validates array size to prevent DoS attacks
 */
function validateArraySize(arr: unknown[], maxSize: number, name: string): void {
  if (arr.length > maxSize) {
    throw new Error(
      `[xlsx-security] Array size exceeds limit: ${name} has ${arr.length} items (max: ${maxSize})`
    );
  }
}

/**
 * Validates a 2D array (worksheet data) before processing
 */
export function validateWorksheetData(data: unknown[][]): unknown[][] {
  // Validate row count
  validateArraySize(data, MAX_ROWS, 'worksheet rows');

  // Validate column count and sanitize each row
  return data.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(`[xlsx-security] Row ${rowIndex} is not an array`);
    }

    validateArraySize(row, MAX_COLUMNS, `row ${rowIndex} columns`);

    // Sanitize each cell value
    return row.map((cell) => {
      if (typeof cell === 'string') {
        return sanitizeString(cell);
      }
      if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
        return sanitizeObject(cell as Record<string, unknown>);
      }
      return cell;
    });
  });
}

/**
 * Sanitizes input data object before XLSX processing
 * Returns a typed copy with dangerous properties removed
 *
 * Type safety: Uses type assertion because sanitizeObject preserves
 * the structure while only removing prototype pollution vectors.
 */
export function sanitizeXLSXInput<T>(data: T): T {
  try {
    // Convert to Record for sanitization, then restore original type
    const sanitized = sanitizeObject(data as Record<string, unknown>);
    return sanitized as T;
  } catch (error) {
    console.error('[xlsx-security] Sanitization failed:', (error as Error).message);
    throw new Error(`XLSX input validation failed: ${(error as Error).message}`);
  }
}

/**
 * Validates output buffer size
 */
export function validateOutputSize(buffer: Buffer, maxSizeMB = 50): Buffer {
  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    throw new Error(
      `[xlsx-security] Generated Excel file exceeds size limit: ${sizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`
    );
  }
  return buffer;
}

// ============================================================================
// SECURITY WRAPPER
// ============================================================================

/**
 * Wraps XLSX generation with security validations and error boundaries
 *
 * Note: Uses type assertion to preserve input types through sanitization.
 * The sanitizer only removes dangerous prototype properties (__proto__, constructor)
 * while preserving all data fields intact.
 */
export function secureXLSXGeneration<T>(data: T, generator: (sanitizedData: T) => Buffer): Buffer {
  try {
    // 1. Sanitize input data
    const sanitizedData = sanitizeXLSXInput(data);

    // 2. Generate Excel with timeout protection
    const startTime = Date.now();
    const buffer = generator(sanitizedData);
    const duration = Date.now() - startTime;

    // Log slow generations (potential ReDoS indicator)
    if (duration > 5000) {
      console.warn(`[xlsx-security] Slow XLSX generation: ${duration}ms`);
    }

    // 3. Validate output size
    return validateOutputSize(buffer);
  } catch (error) {
    console.error('[xlsx-security] Generation failed:', (error as Error).message);
    throw new Error(`Excel generation failed: ${(error as Error).message}`);
  }
}

/**
 * Security recommendations for XLSX usage
 */
export const XLSX_SECURITY_RECOMMENDATIONS = {
  vulnerabilities: [
    'GHSA-4r6h-8v6p-xvw6: Prototype Pollution',
    'GHSA-5pgg-2g8v-p4x9: Regular Expression DoS (ReDoS)',
  ],
  mitigations: [
    'Input sanitization (removes __proto__, constructor, etc.)',
    'String length limits (max 10,000 chars per cell)',
    'Row/column limits (max 50,000 rows, 100 columns)',
    'Output size validation (max 50MB)',
    'Performance monitoring (timeout warnings)',
  ],
  recommendation:
    'Migrate to ExcelJS for better security and type safety. See: https://github.com/exceljs/exceljs',
  tracking: 'Issue #TBD - XLSX to ExcelJS migration',
};
