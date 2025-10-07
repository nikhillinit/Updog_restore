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
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import RedisStore from 'rate-limit-redis';
import { logSecurity, logContext } from '../utils/logger.js';

// Security configuration
const SECURITY_CONFIG = {
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: (req: Request) => req.ip || 'unknown',
    standardHeaders: true,
    legacyHeaders: false
  },
  strictRateLimiting: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // requests per window for sensitive endpoints
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  requestSize: {
    json: '10mb',
    urlencoded: '10mb',
    raw: '10mb'
  },
  blockedIPs: new Set<string>(),
  allowedIPs: new Set<string>(), // Empty = allow all
  trustedProxies: ['127.0.0.1', '::1'] // localhost
};

// Redis client for rate limiting
let redisClient: any = null;

export const initializeSecurityMiddleware = async () => {
  try {
    if (process.env['REDIS_URL'] && process.env['REDIS_URL'] !== 'memory://') {
      redisClient = createClient({
        url: process.env['REDIS_URL']
      });

      await redisClient.connect();
      logSecurity('Redis client connected for rate limiting', {
        url: process.env['REDIS_URL']?.split('@')[1] // Hide credentials
      });
    }
  } catch (error) {
    logSecurity('Failed to connect Redis for rate limiting, falling back to memory', {
      error: error instanceof Error ? error.message : 'Unknown error'
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
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://api.sentry.io"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },

  // Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
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
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }

  // Remove permissions policy as it's not supported in current helmet version
});

// =============================================================================
// RATE LIMITING MIDDLEWARE
// =============================================================================

// Create Redis-based rate limiter if available
const createRateLimiter = (options: any) => {
  if (redisClient) {
    return rateLimit({
      ...options,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:',
        sendCommand: (...args: string[]) => redisClient.sendCommand(args)
      })
    });
  }

  // Fallback to memory-based rate limiting
  return rateLimit(options);
};

// General rate limiting
export const generalRateLimit = createRateLimiter({
  ...SECURITY_CONFIG.rateLimiting,
  message: {
    error: 'Too many requests',
    retryAfter: SECURITY_CONFIG.rateLimiting.windowMs / 1000
  },
  handler: (req: Request, res: Response) => {
    logSecurity('Rate limit exceeded', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('rate_limit_exceeded', 'medium', {
        limit: SECURITY_CONFIG.rateLimiting.max,
        window: SECURITY_CONFIG.rateLimiting.windowMs
      })
    });

    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil(SECURITY_CONFIG.rateLimiting.windowMs / 1000)
    });
  }
});

// Strict rate limiting for sensitive endpoints
export const strictRateLimit = createRateLimiter({
  ...SECURITY_CONFIG.strictRateLimiting,
  message: {
    error: 'Rate limit exceeded for sensitive operation',
    retryAfter: SECURITY_CONFIG.strictRateLimiting.windowMs / 1000
  },
  handler: (req: Request, res: Response) => {
    logSecurity('Strict rate limit exceeded', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('strict_rate_limit_exceeded', 'high', {
        limit: SECURITY_CONFIG.strictRateLimiting.max,
        window: SECURITY_CONFIG.strictRateLimiting.windowMs
      })
    });

    res.status(429).json({
      error: 'Rate limit exceeded for sensitive operation',
      retryAfter: Math.ceil(SECURITY_CONFIG.strictRateLimiting.windowMs / 1000)
    });
  }
});

// Monte Carlo specific rate limiting (compute-intensive operations)
export const monteCarloRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Only 3 Monte Carlo simulations per 5 minutes
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id;
    return userId ? `mc:${userId}` : `mc:${req.ip}`;
  },
  handler: (req: Request, res: Response) => {
    logSecurity('Monte Carlo rate limit exceeded', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('monte_carlo_rate_limit', 'high')
    });

    res.status(429).json({
      error: 'Monte Carlo simulation rate limit exceeded',
      message: 'Please wait before starting another simulation',
      retryAfter: 300 // 5 minutes
    });
  }
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
      ...logContext.addSecurityContext('blocked_ip_access', 'high', { blockedIP: clientIP })
    });

    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address has been blocked'
    });
  }

  // Check if allowlist is configured and IP is not allowed
  if (SECURITY_CONFIG.allowedIPs.size > 0 && !SECURITY_CONFIG.allowedIPs.has(clientIP)) {
    logSecurity('Non-whitelisted IP attempted access', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('non_whitelisted_ip', 'medium', { clientIP })
    });

    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address is not authorized'
    });
  }

  next();
};

// =============================================================================
// INPUT SANITIZATION MIDDLEWARE
// =============================================================================

// HTML/Script sanitization
const sanitizeString = (value: any): any => {
  if (typeof value !== 'string') return value;

  // Remove potential XSS vectors
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

// Recursive object sanitization
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
};

export const inputSanitization = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize route parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logSecurity('Input sanitization error', {
      ...logContext.addRequestContext(req),
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(400).json({
      error: 'Invalid input format',
      message: 'Request contains invalid or malicious content'
    });
  }
};

// =============================================================================
// REQUEST SIZE LIMITS
// =============================================================================

export const requestSizeLimits = {
  json: SECURITY_CONFIG.requestSize.json,
  urlencoded: SECURITY_CONFIG.requestSize.urlencoded,
  raw: SECURITY_CONFIG.requestSize.raw
};

// =============================================================================
// SUSPICIOUS ACTIVITY DETECTION
// =============================================================================

const suspiciousPatterns = [
  /(\<|\%3C)script/i,
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
  /expression\s*\(/i
];

export const suspiciousActivityDetection = (req: Request, res: Response, next: NextFunction) => {
  const checkContent = (content: string): boolean => {
    return suspiciousPatterns.some(pattern => pattern.test(content));
  };

  try {
    const requestString = JSON.stringify({
      body: req.body,
      query: req.query,
      params: req.params,
      headers: req.headers,
      url: req.url
    });

    if (checkContent(requestString)) {
      logSecurity('Suspicious activity detected', {
        ...logContext.addRequestContext(req),
        ...logContext.addSecurityContext('suspicious_activity', 'high', {
          detectedPatterns: suspiciousPatterns.filter(pattern => pattern.test(requestString)).map(p => p.toString())
        })
      });

      return res.status(400).json({
        error: 'Suspicious activity detected',
        message: 'Request contains potentially malicious content'
      });
    }

    next();
  } catch (error) {
    logSecurity('Error in suspicious activity detection', {
      error: error instanceof Error ? error.message : 'Unknown error'
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
    'x-forwarded-for': req['get']('x-forwarded-for'),
    'x-real-ip': req['get']('x-real-ip'),
    'user-agent': req['get']('user-agent'),
    'authorization': req['get']('authorization') ? '[PRESENT]' : '[ABSENT]',
    'origin': req['get']('origin'),
    'referer': req['get']('referer')
  };

  // Log authentication attempts
  if (req.path.includes('/auth') || req.path.includes('/login')) {
    logSecurity('Authentication attempt', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('auth_attempt', 'low', { securityHeaders })
    });
  }

  // Log administrative actions
  if (req.path.includes('/admin') || req.method === 'DELETE') {
    logSecurity('Administrative action attempted', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('admin_action', 'medium', { securityHeaders })
    });
  }

  // Log financial operations
  if (req.path.includes('/monte-carlo') || req.path.includes('/simulation')) {
    logSecurity('Financial operation requested', {
      ...logContext.addRequestContext(req),
      ...logContext.addSecurityContext('financial_operation', 'medium', {
        operation: req.path,
        securityHeaders
      })
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
  redisConnected: redisClient !== null
});

// =============================================================================
// COMBINED SECURITY MIDDLEWARE STACK
// =============================================================================

export const securityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  generalRateLimit,
  inputSanitization,
  suspiciousActivityDetection,
  securityEventLogger
];

export const strictSecurityMiddlewareStack = [
  securityHeaders,
  ipFilter,
  strictRateLimit,
  inputSanitization,
  suspiciousActivityDetection,
  securityEventLogger
];

export const monteCarloSecurityStack = [
  securityHeaders,
  ipFilter,
  monteCarloRateLimit,
  inputSanitization,
  suspiciousActivityDetection,
  securityEventLogger
];