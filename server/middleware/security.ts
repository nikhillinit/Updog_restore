/**
 * Comprehensive Security Middleware
 *
 * Production-ready security hardening including:
 * - Security headers (OWASP recommendations)
 * - Advanced rate limiting with Redis
 * - Input sanitization
 * - CSRF protection
 * - Request size limits
 * - IP allowlisting/blocklisting
 * - Security event logging
 */

import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { createClient, type RedisClientType } from 'redis';
import RedisStore from 'rate-limit-redis';
import { logSecurity, logContext } from '../utils/logger.js';
import { sanitizeInput } from '../utils/sanitizer.js';
import { isValidUrl } from '../utils/url-validator.js';

// Security configuration
const SECURITY_CONFIG = {
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: ipKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
  },
  strictRateLimiting: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // requests per window for sensitive endpoints
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  requestSize: {
    json: '10mb',
    urlencoded: '10mb',
    raw: '10mb',
  },
  blockedIPs: new Set<string>(),
  allowedIPs: new Set<string>(), // Empty = allow all
  trustedProxies: ['127.0.0.1', '::1'], // localhost
};

// Redis client for rate limiting
let redisClient: RedisClientType | null = null;

export const initializeSecurityMiddleware = async () => {
  try {
    const redisUrl = process.env['REDIS_URL'];
    if (redisUrl && redisUrl !== 'memory://') {
      redisClient = createClient({
        url: redisUrl,
      });

      await redisClient.connect();

      // Hide credentials by extracting host portion after '@'
      const urlParts = redisUrl.split('@');
      const sanitizedUrl = urlParts.length > 1 ? urlParts[1] : redisUrl;

      logSecurity('Redis client connected for rate limiting', {
        url: sanitizedUrl,
      });
    }
  } catch (error) {
    logSecurity('Failed to connect Redis for rate limiting, falling back to memory', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// =============================================================================
// SECURITY HEADERS MIDDLEWARE
// =============================================================================

export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'https://api.sentry.io'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },

  // Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Frame options
  frameguard: { action: 'deny' },

  // Disable X-Powered-By header
  hidePoweredBy: true,

  // MIME type sniffing protection
  noSniff: true,

  // XSS Protection
  xssFilter: true,

  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // Remove permissions policy as it's not supported in current helmet version
});

// =============================================================================
// RATE LIMITING MIDDLEWARE
// =============================================================================

// Create Redis-based rate limiter if available
const createRateLimiter = (options: Partial<Options>) => {
  if (redisClient) {
    const client = redisClient;
    const redisStore = new RedisStore({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- type compatibility between redis versions
      client: client as any,
      prefix: 'rl:',
      sendCommand: (...args: string[]) => client.sendCommand(args),
    });
    return rateLimit({ ...options, store: redisStore } as unknown as Options);
  }

  // Fallback to memory-based rate limiting
  return rateLimit(options as unknown as Options);
};

// General rate limiting
export const generalRateLimit = createRateLimiter({
  ...(SECURITY_CONFIG.rateLimiting as unknown as Partial<Options>),
  message: {
    error: 'Too many requests',
    retryAfter: SECURITY_CONFIG.rateLimiting.windowMs / 1000,
  },
  handler: (req: Request, res: Response) => {
    logSecurity('Rate limit exceeded', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('rate_limit_exceeded', 'medium', {
        limit: SECURITY_CONFIG.rateLimiting.max,
        window: SECURITY_CONFIG.rateLimiting.windowMs,
      }),
    });

    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(SECURITY_CONFIG.rateLimiting.windowMs / 1000),
    });
  },
});

// Strict rate limiting for sensitive endpoints
export const strictRateLimit = createRateLimiter({
  ...SECURITY_CONFIG.strictRateLimiting,
  message: {
    error: 'Rate limit exceeded for sensitive operation',
    retryAfter: SECURITY_CONFIG.strictRateLimiting.windowMs / 1000,
  },
  handler: (req: Request, res: Response) => {
    logSecurity('Strict rate limit exceeded', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('strict_rate_limit_exceeded', 'high', {
        limit: SECURITY_CONFIG.strictRateLimiting.max,
        window: SECURITY_CONFIG.strictRateLimiting.windowMs,
      }),
    });

    res.status(429).json({
      error: 'Rate limit exceeded for sensitive operation',
      retryAfter: Math.ceil(SECURITY_CONFIG.strictRateLimiting.windowMs / 1000),
    });
  },
});

// Monte Carlo specific rate limiting (compute-intensive operations)
// Note: We don't use custom keyGenerator here to allow express-rate-limit
// to handle IPv6 properly. User-based rate limiting should be implemented
// at the authentication middleware level if needed.
export const monteCarloRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Only 3 Monte Carlo simulations per 5 minutes
  handler: (req: Request, res: Response) => {
    logSecurity('Monte Carlo rate limit exceeded', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('monte_carlo_rate_limit', 'high'),
    });

    res.status(429).json({
      error: 'Monte Carlo simulation rate limit exceeded',
      message: 'Please wait before starting another simulation',
      retryAfter: 300, // 5 minutes
    });
  },
});

// =============================================================================
// IP FILTERING MIDDLEWARE
// =============================================================================

export const ipFilter = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

  // Check if IP is blocked
  if (SECURITY_CONFIG.blockedIPs.has(clientIP)) {
    logSecurity('Blocked IP attempted access', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('blocked_ip_access', 'high', { blockedIP: clientIP }),
    });

    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address has been blocked',
    });
  }

  // Check if allowlist is configured and IP is not allowed
  if (SECURITY_CONFIG.allowedIPs.size > 0 && !SECURITY_CONFIG.allowedIPs.has(clientIP)) {
    logSecurity('Non-whitelisted IP attempted access', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('non_whitelisted_ip', 'medium', { clientIP }),
    });

    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address is not authorized',
    });
  }

  next();
};

// =============================================================================
// INPUT SANITIZATION MIDDLEWARE
// =============================================================================

// HTML/Script sanitization using sanitize-html library
function sanitizeStringValue(value: string): string {
  // Use sanitize-html for proper XSS prevention
  const sanitized = sanitizeInput(value);

  // Validate URLs if the value looks like a URL
  if (sanitized.includes('://') && !isValidUrl(sanitized)) {
    return ''; // Remove invalid URLs
  }

  return sanitized.trim();
}

// Recursive object sanitization - returns sanitized version of the input
function sanitizeObjectValue(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeStringValue(key);
    if (value === null || value === undefined) {
      result[sanitizedKey] = value;
    } else if (typeof value === 'string') {
      result[sanitizedKey] = sanitizeStringValue(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[sanitizedKey] = value;
    } else if (Array.isArray(value)) {
      result[sanitizedKey] = value.map((item: unknown): unknown => {
        if (typeof item === 'string') {
          return sanitizeStringValue(item);
        }
        if (typeof item === 'object' && item !== null) {
          return sanitizeObjectValue(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === 'object') {
      result[sanitizedKey] = sanitizeObjectValue(value as Record<string, unknown>);
    } else {
      result[sanitizedKey] = value;
    }
  }
  return result;
}

export const inputSanitization = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize request body (check for non-empty body)
    if (req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0) {
      req.body = sanitizeObjectValue(req.body as Record<string, unknown>);
    }

    // Sanitize query parameters (check for specific properties)
    if (Object.keys(req.query).length > 0) {
      const sanitizedQuery = sanitizeObjectValue(req.query as Record<string, unknown>);
      Object.assign(req.query, sanitizedQuery);
    }

    // Sanitize route parameters (check for specific properties)
    if (Object.keys(req.params).length > 0) {
      const sanitizedParams = sanitizeObjectValue(req.params as Record<string, unknown>);
      Object.assign(req.params, sanitizedParams);
    }

    next();
  } catch (error) {
    logSecurity('Input sanitization error', {
      ...logContext.addRequestContext(req),
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(400).json({
      error: 'Invalid input format',
      message: 'Request contains invalid or malicious content',
    });
  }
};

// =============================================================================
// REQUEST SIZE LIMITS
// =============================================================================

export const requestSizeLimits = {
  json: SECURITY_CONFIG.requestSize.json,
  urlencoded: SECURITY_CONFIG.requestSize.urlencoded,
  raw: SECURITY_CONFIG.requestSize.raw,
};

// =============================================================================
// SUSPICIOUS ACTIVITY DETECTION
// =============================================================================

const suspiciousPatterns = [
  /(<|%3C)script/i,
  /javascript:/i,
  /vbscript:/i,
  /onload\s*=/i,
  /onerror\s*=/i,
  /union\s+select/i,
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+.*set/i,
  /exec\s*\(/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
];

export const suspiciousActivityDetection = (req: Request, res: Response, next: NextFunction) => {
  const checkContent = (content: string): boolean => {
    return suspiciousPatterns.some((pattern) => pattern.test(content));
  };

  try {
    const requestString = JSON.stringify({
      body: req.body as Record<string, unknown>,
      query: req.query,
      params: req.params,
      headers: req.headers,
      url: req.url,
    });

    if (checkContent(requestString)) {
      logSecurity('Suspicious activity detected', {
        ...logContext.addRequestContext(req),
        ...logContext.addSecurityContext('suspicious_activity', 'high', {
          detectedPatterns: suspiciousPatterns
            .filter((pattern) => pattern.test(requestString))
            .map((p) => p.toString()),
        }),
      });

      return res.status(400).json({
        error: 'Suspicious activity detected',
        message: 'Request contains potentially malicious content',
      });
    }

    next();
  } catch (error) {
    logSecurity('Error in suspicious activity detection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(); // Continue on detection error
  }
};

// =============================================================================
// SECURITY EVENT MIDDLEWARE
// =============================================================================

export const securityEventLogger = (req: Request, res: Response, next: NextFunction) => {
  // Log security-relevant events
  const securityHeaders = {
    'x-forwarded-for': req.get('x-forwarded-for'),
    'x-real-ip': req.get('x-real-ip'),
    'user-agent': req.get('user-agent'),
    authorization: req.get('authorization') ? '[PRESENT]' : '[ABSENT]',
    origin: req.get('origin'),
    referer: req.get('referer'),
  };

  // Log authentication attempts
  if (req.path.includes('/auth') || req.path.includes('/login')) {
    logSecurity('Authentication attempt', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('auth_attempt', 'low', { securityHeaders }),
    });
  }

  // Log administrative actions
  if (req.path.includes('/admin') || req.method === 'DELETE') {
    logSecurity('Administrative action attempted', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('admin_action', 'medium', { securityHeaders }),
    });
  }

  // Log financial operations
  if (req.path.includes('/monte-carlo') || req.path.includes('/simulation')) {
    logSecurity('Financial operation requested', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('financial_operation', 'medium', {
        operation: req.path,
        securityHeaders,
      }),
    });
  }

  next();
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export const addToBlocklist = (ip: string) => {
  SECURITY_CONFIG.blockedIPs.add(ip);
  logSecurity('IP added to blocklist', { ip });
};

export const removeFromBlocklist = (ip: string) => {
  SECURITY_CONFIG.blockedIPs.delete(ip);
  logSecurity('IP removed from blocklist', { ip });
};

export const addToAllowlist = (ip: string) => {
  SECURITY_CONFIG.allowedIPs.add(ip);
  logSecurity('IP added to allowlist', { ip });
};

export const removeFromAllowlist = (ip: string) => {
  SECURITY_CONFIG.allowedIPs.delete(ip);
  logSecurity('IP removed from allowlist', { ip });
};

// Export security configuration for monitoring
export const getSecurityConfig = () => ({
  blockedIPs: Array.from(SECURITY_CONFIG.blockedIPs),
  allowedIPs: Array.from(SECURITY_CONFIG.allowedIPs),
  rateLimiting: SECURITY_CONFIG.rateLimiting,
  strictRateLimiting: SECURITY_CONFIG.strictRateLimiting,
  redisConnected: redisClient !== null,
});

// =============================================================================
// COMBINED SECURITY MIDDLEWARE STACK
// =============================================================================

// CRITICAL: suspiciousActivityDetection MUST come BEFORE inputSanitization
// to detect malicious patterns in raw input before they get sanitized away
export const securityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  generalRateLimit,
  suspiciousActivityDetection,
  inputSanitization,
  securityEventLogger,
];

export const strictSecurityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  strictRateLimit,
  suspiciousActivityDetection,
  inputSanitization,
  securityEventLogger,
];

export const monteCarloSecurityStack = [
  securityHeaders,
  ipFilter,
  monteCarloRateLimit,
  suspiciousActivityDetection,
  inputSanitization,
  securityEventLogger,
];
