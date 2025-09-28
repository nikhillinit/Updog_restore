/**
 * Input Sanitization Utilities
 *
 * Comprehensive input validation and sanitization for:
 * - XSS prevention
 * - SQL injection prevention
 * - NoSQL injection prevention
 * - Path traversal prevention
 * - Data type validation
 * - Financial data sanitization
 * - File upload validation
 */

// DOMPurify not available in server environment, using built-in sanitization
// import validator from 'validator';
import { logValidationError, securityLogger } from './logger.js';

// =============================================================================
// SANITIZATION CONFIGURATION
// =============================================================================

interface SanitizationOptions {
  allowedTags?: string[];
  allowedAttributes?: string[];
  maxLength?: number;
  trimWhitespace?: boolean;
  removeEmptyStrings?: boolean;
  normalizeUnicode?: boolean;
  strictMode?: boolean;
}

const DEFAULT_SANITIZATION_OPTIONS: SanitizationOptions = {
  allowedTags: [], // No HTML tags allowed by default
  allowedAttributes: [],
  maxLength: 10000,
  trimWhitespace: true,
  removeEmptyStrings: true,
  normalizeUnicode: true,
  strictMode: true
};

// Dangerous patterns to detect and block
const DANGEROUS_PATTERNS = [
  // XSS patterns
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /on\w+\s*=/gi,
  /style\s*=.*expression\s*\(/gi,

  // SQL injection patterns
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
  /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
  /('|\"|`|;|--|\|\/\*|\*\/)/g,

  // NoSQL injection patterns
  /(\$where|\$ne|\$in|\$nin|\$gt|\$lt|\$gte|\$lte|\$exists|\$regex)/gi,

  // Path traversal patterns
  /(\.\.[\/\\]|[\/\\]\.\.|%2e%2e%2f|%2e%2e%5c|\.\.\/|\.\.\\)/gi,

  // Command injection patterns
  /(\||&|;|`|\$\(|\${|<|>)/g,

  // LDAP injection patterns
  /(\*|\(|\)|\\|\/|null|\0)/g
];

// =============================================================================
// CORE SANITIZATION FUNCTIONS
// =============================================================================

/**
 * Sanitize a string value with comprehensive security checks
 */
export function sanitizeString(
  value: unknown,
  options: SanitizationOptions = {}
): string {
  if (typeof value !== 'string') {
    if (value === null || value === undefined) return '';
    value = String(value);
  }

  const opts = { ...DEFAULT_SANITIZATION_OPTIONS, ...options };
  let sanitized = value as string;

  try {
    // Basic cleanup
    if (opts.trimWhitespace) {
      sanitized = sanitized.trim();
    }

    if (opts.removeEmptyStrings && sanitized.length === 0) {
      return '';
    }

    // Unicode normalization
    if (opts.normalizeUnicode) {
      sanitized = sanitized.normalize('NFC');
    }

    // Length validation
    if (opts.maxLength && sanitized.length > opts.maxLength) {
      if (opts.strictMode) {
        throw new Error(`Input exceeds maximum length of ${opts.maxLength} characters`);
      }
      sanitized = sanitized.substring(0, opts.maxLength);
    }

    // Basic HTML sanitization - strip all HTML tags for security
    // In a production environment, consider using a proper HTML sanitization library
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Check for dangerous patterns
    if (opts.strictMode) {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(sanitized)) {
          throw new Error(`Input contains potentially dangerous content: ${pattern.source}`);
        }
      }
    } else {
      // Remove dangerous patterns
      for (const pattern of DANGEROUS_PATTERNS) {
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Additional encoding for special characters
    sanitized = validator.escape(sanitized);

    return sanitized;

  } catch (error) {
    securityLogger.error('String sanitization failed', {
      originalValue: typeof value === 'string' ? value.substring(0, 100) : String(value),
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (opts.strictMode) {
      throw error;
    }

    return ''; // Return empty string if sanitization fails in non-strict mode
  }
}

/**
 * Sanitize numeric input with range validation
 */
export function sanitizeNumber(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
    finite?: boolean;
    positive?: boolean;
  } = {}
): number {
  let num: number;

  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    // Remove any non-numeric characters except decimal point and minus sign
    const cleaned = value.replace(/[^0-9.-]/g, '');
    num = parseFloat(cleaned);
  } else {
    throw new Error('Value cannot be converted to number');
  }

  // Validation checks
  if (isNaN(num)) {
    throw new Error('Value is not a valid number');
  }

  if (options.finite && !isFinite(num)) {
    throw new Error('Value must be finite');
  }

  if (options.integer && !Number.isInteger(num)) {
    throw new Error('Value must be an integer');
  }

  if (options.positive && num <= 0) {
    throw new Error('Value must be positive');
  }

  if (options.min !== undefined && num < options.min) {
    throw new Error(`Value must be at least ${options.min}`);
  }

  if (options.max !== undefined && num > options.max) {
    throw new Error(`Value must be at most ${options.max}`);
  }

  return num;
}

/**
 * Sanitize financial amounts with proper validation
 */
export function sanitizeFinancialAmount(value: unknown): number {
  return sanitizeNumber(value, {
    min: 0,
    max: 1e12, // $1 trillion max
    finite: true
  });
}

/**
 * Sanitize percentage values
 */
export function sanitizePercentage(value: unknown, as100Based: boolean = false): number {
  const max = as100Based ? 100 : 1;
  return sanitizeNumber(value, {
    min: 0,
    max,
    finite: true
  });
}

/**
 * Sanitize email addresses
 */
export function sanitizeEmail(value: unknown): string {
  const str = sanitizeString(value, { maxLength: 254 });

  if (!validator.isEmail(str)) {
    throw new Error('Invalid email address format');
  }

  return validator.normalizeEmail(str) || str;
}

/**
 * Sanitize URLs
 */
export function sanitizeURL(value: unknown, options: {
  protocols?: string[];
  requireTLD?: boolean;
  requireProtocol?: boolean;
} = {}): string {
  const str = sanitizeString(value, { maxLength: 2048 });

  const opts = {
    protocols: options.protocols || ['http', 'https'],
    require_tld: options.requireTLD !== false,
    require_protocol: options.requireProtocol !== false
  };

  if (!validator.isURL(str, opts)) {
    throw new Error('Invalid URL format');
  }

  return str;
}

/**
 * Sanitize file paths to prevent directory traversal
 */
export function sanitizeFilePath(value: unknown): string {
  const str = sanitizeString(value, { maxLength: 255 });

  // Remove path traversal attempts
  const cleaned = str.replace(/\.\.[\/\\]/g, '').replace(/[\/\\]/g, '_');

  // Remove potentially dangerous characters
  const safe = cleaned.replace(/[<>:"|?*\0]/g, '');

  if (safe !== str) {
    securityLogger.warn('File path sanitization applied', {
      original: str,
      sanitized: safe
    });
  }

  return safe;
}

// =============================================================================
// OBJECT SANITIZATION
// =============================================================================

/**
 * Recursively sanitize an object
 */
export function sanitizeObject(
  obj: unknown,
  options: SanitizationOptions & {
    maxDepth?: number;
    allowedKeys?: string[];
    blockedKeys?: string[];
  } = {}
): any {
  const opts = { ...DEFAULT_SANITIZATION_OPTIONS, ...options };
  const maxDepth = opts.maxDepth || 10;

  function sanitizeRecursive(value: any, depth: number = 0): any {
    if (depth > maxDepth) {
      throw new Error('Object nesting too deep');
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return sanitizeString(value, opts);
    }

    if (typeof value === 'number') {
      return sanitizeNumber(value, { finite: true });
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitizeRecursive(item, depth + 1));
    }

    if (typeof value === 'object') {
      const sanitized: any = {};

      for (const [key, val] of Object.entries(value)) {
        const sanitizedKey = sanitizeString(key, { maxLength: 100 });

        // Check key allowlist/blocklist
        if (opts.allowedKeys && !opts.allowedKeys.includes(sanitizedKey)) {
          continue;
        }

        if (opts.blockedKeys && opts.blockedKeys.includes(sanitizedKey)) {
          continue;
        }

        sanitized[sanitizedKey] = sanitizeRecursive(val, depth + 1);
      }

      return sanitized;
    }

    // For other types, convert to string and sanitize
    return sanitizeString(String(value), opts);
  }

  return sanitizeRecursive(obj);
}

// =============================================================================
// MONTE CARLO SPECIFIC SANITIZATION
// =============================================================================

/**
 * Sanitize Monte Carlo simulation configuration
 */
export function sanitizeMonteCarloConfig(config: any): any {
  if (!config || typeof config !== 'object') {
    throw new Error('Monte Carlo configuration must be an object');
  }

  const sanitized: any = {};

  // Fund ID validation
  if (config.fundId !== undefined) {
    sanitized.fundId = sanitizeNumber(config.fundId, {
      integer: true,
      positive: true,
      max: 999999999
    });
  }

  // Simulation runs validation
  if (config.runs !== undefined) {
    sanitized.runs = sanitizeNumber(config.runs, {
      integer: true,
      min: 100,
      max: 50000
    });
  }

  // Time horizon validation
  if (config.timeHorizonYears !== undefined) {
    sanitized.timeHorizonYears = sanitizeNumber(config.timeHorizonYears, {
      integer: true,
      min: 1,
      max: 15
    });
  }

  // Portfolio size validation
  if (config.portfolioSize !== undefined) {
    sanitized.portfolioSize = sanitizeNumber(config.portfolioSize, {
      integer: true,
      positive: true,
      max: 1000
    });
  }

  // Baseline ID validation
  if (config.baselineId !== undefined) {
    sanitized.baselineId = sanitizeString(config.baselineId, {
      maxLength: 36 // UUID length
    });

    // Validate UUID format
    if (!validator.isUUID(sanitized.baselineId)) {
      throw new Error('Invalid baseline ID format');
    }
  }

  return sanitized;
}

/**
 * Sanitize financial distribution parameters
 */
export function sanitizeDistributionParams(params: any): any {
  if (!params || typeof params !== 'object') {
    throw new Error('Distribution parameters must be an object');
  }

  const sanitized: any = {};

  // Sanitize IRR parameters
  if (params.irr) {
    sanitized.irr = {
      mean: sanitizeNumber(params.irr.mean, { min: -1, max: 10, finite: true }),
      volatility: sanitizeNumber(params.irr.volatility, { min: 0.01, max: 5, finite: true })
    };
  }

  // Sanitize multiple parameters
  if (params.multiple) {
    sanitized.multiple = {
      mean: sanitizeNumber(params.multiple.mean, { min: 0, max: 100, finite: true }),
      volatility: sanitizeNumber(params.multiple.volatility, { min: 0.01, max: 10, finite: true })
    };
  }

  // Sanitize DPI parameters
  if (params.dpi) {
    sanitized.dpi = {
      mean: sanitizeNumber(params.dpi.mean, { min: 0, max: 5, finite: true }),
      volatility: sanitizeNumber(params.dpi.volatility, { min: 0.01, max: 2, finite: true })
    };
  }

  return sanitized;
}

// =============================================================================
// VALIDATION ERROR HANDLING
// =============================================================================

export class SanitizationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public originalValue?: any,
    public sanitizedValue?: any
  ) {
    super(message);
    this.name = 'SanitizationError';
  }
}

/**
 * Create a sanitization middleware that validates and sanitizes request data
 */
export function createSanitizationMiddleware(options: {
  sanitizeBody?: boolean;
  sanitizeQuery?: boolean;
  sanitizeParams?: boolean;
  strictMode?: boolean;
  customSanitizers?: Record<string, (value: any) => any>;
} = {}) {
  return (req: any, res: any, next: any) => {
    try {
      const opts = {
        sanitizeBody: true,
        sanitizeQuery: true,
        sanitizeParams: true,
        strictMode: true,
        ...options
      };

      // Sanitize request body
      if (opts.sanitizeBody && req.body) {
        req.body = sanitizeObject(req.body, {
          strictMode: opts.strictMode,
          maxDepth: 5
        });

        // Apply custom sanitizers
        if (opts.customSanitizers) {
          for (const [field, sanitizer] of Object.entries(opts.customSanitizers)) {
            if (req.body[field] !== undefined) {
              req.body[field] = sanitizer(req.body[field]);
            }
          }
        }
      }

      // Sanitize query parameters
      if (opts.sanitizeQuery && req.query) {
        req.query = sanitizeObject(req.query, {
          strictMode: opts.strictMode,
          maxDepth: 3
        });
      }

      // Sanitize route parameters
      if (opts.sanitizeParams && req.params) {
        req.params = sanitizeObject(req.params, {
          strictMode: opts.strictMode,
          maxDepth: 2
        });
      }

      next();

    } catch (error) {
      logValidationError(
        'request_sanitization',
        { body: req.body, query: req.query, params: req.params },
        error instanceof Error ? error.message : 'Unknown sanitization error',
        { path: req.path, method: req.method }
      );

      res.status(400).json({
        error: 'Invalid input data',
        message: error instanceof Error ? error.message : 'Request contains invalid data',
        field: error instanceof SanitizationError ? error.field : undefined
      });
    }
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a value contains any dangerous patterns
 */
export function containsDangerousContent(value: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Get sanitization statistics for monitoring
 */
export function getSanitizationStats() {
  return {
    dangerousPatterns: DANGEROUS_PATTERNS.length,
    defaultMaxLength: DEFAULT_SANITIZATION_OPTIONS.maxLength,
    strictModeEnabled: DEFAULT_SANITIZATION_OPTIONS.strictMode
  };
}

/**
 * Validate and sanitize a specific field type
 */
export const fieldSanitizers = {
  fundName: (value: unknown) => sanitizeString(value, { maxLength: 255 }),
  sector: (value: unknown) => sanitizeString(value, { maxLength: 50 }),
  amount: (value: unknown) => sanitizeFinancialAmount(value),
  percentage: (value: unknown) => sanitizePercentage(value),
  email: (value: unknown) => sanitizeEmail(value),
  url: (value: unknown) => sanitizeURL(value),
  uuid: (value: unknown) => {
    const str = sanitizeString(value, { maxLength: 36 });
    if (!validator.isUUID(str)) {
      throw new Error('Invalid UUID format');
    }
    return str;
  }
};

export default {
  sanitizeString,
  sanitizeNumber,
  sanitizeObject,
  sanitizeFinancialAmount,
  sanitizePercentage,
  sanitizeEmail,
  sanitizeURL,
  sanitizeFilePath,
  sanitizeMonteCarloConfig,
  sanitizeDistributionParams,
  createSanitizationMiddleware,
  containsDangerousContent,
  getSanitizationStats,
  fieldSanitizers,
  SanitizationError
};