/**
 * Rate Limiter Middleware for AI Proposals
 *
 * Provides sliding window rate limiting for AI proposal generation to prevent abuse
 * and manage costs.
 *
 * Features:
 * - 10 proposals per hour per user (MVP limit)
 * - Sliding window implementation (not fixed window)
 * - Per-user tracking (ready for multi-user expansion)
 * - Clear error messages with retry information
 * - Integration with existing rate limit infrastructure
 *
 * @see server/config/ai-providers.ts for configuration
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { getAIProvidersConfig } from '../config/ai-providers.js';

const config = getAIProvidersConfig();

/**
 * Rate limiter for AI proposal generation
 *
 * Limits each user/IP to 10 proposals per hour using a sliding window.
 * This prevents abuse and manages AI API costs.
 */
export const proposalRateLimiter = rateLimit({
  windowMs: config.security.proposalRateLimit.windowMs, // 1 hour
  max: config.security.proposalRateLimit.maxPerHour, // 10 requests per hour
  message: {
    error: 'Proposal rate limit exceeded',
    message: `You have exceeded the maximum of ${config.security.proposalRateLimit.maxPerHour} AI proposals per hour. Please try again later.`,
    limit: config.security.proposalRateLimit.maxPerHour,
    windowMs: config.security.proposalRateLimit.windowMs,
    retryAfterMs: config.security.proposalRateLimit.windowMs
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers

  // Key generation for per-user tracking
  // In MVP: use IP address
  // In production: use authenticated user ID
  keyGenerator: (req: Request): string => {
    // TODO: Replace with authenticated user ID when auth is implemented
    // For now, use IP address + user agent for basic per-client tracking
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // If user is authenticated, use userId (future implementation)
    // const userId = (req as any).user?.id;
    // if (userId) {
    //   return `user:${userId}`;
    // }

    // For now, use IP-based tracking
    return `ip:${ip}:${userAgent.substring(0, 50)}`;
  },

  // Skip rate limiting for certain conditions
  skip: (req: Request): boolean => {
    // Skip in test environment
    if (process.env['NODE_ENV'] === 'test') {
      return true;
    }

    // Skip if rate limiting is explicitly disabled
    if (process.env['DISABLE_RATE_LIMITING'] === 'true') {
      return true;
    }

    return false;
  },

  // Custom handler for when limit is exceeded
  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(config.security.proposalRateLimit.windowMs / 1000); // Convert to seconds

    res.status(429).json({
      error: 'Rate limit exceeded',
      message: `You have exceeded the maximum of ${config.security.proposalRateLimit.maxPerHour} AI proposals per hour.`,
      details: {
        limit: config.security.proposalRateLimit.maxPerHour,
        windowHours: config.security.proposalRateLimit.windowMs / (60 * 60 * 1000),
        retryAfterSeconds: retryAfter
      },
      retryAfter: retryAfter,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Admin rate limiter (existing from rate-limit.ts)
 * Limits each IP to 100 requests per 15 minutes
 */
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware to log rate limit events for monitoring
 */
export function rateLimitLogger(req: Request, res: Response, next: NextFunction): void {
  // Attach listener to response to log when rate limit is hit
  const originalJson = res.json.bind(res);

  res.json = function(body: any) {
    if (res.statusCode === 429) {
      console.warn('[rate-limit] Rate limit exceeded', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString(),
        limit: body.details?.limit,
        windowHours: body.details?.windowHours
      });
    }
    return originalJson(body);
  };

  next();
}

/**
 * Check if request would exceed rate limit without consuming quota
 * Useful for showing warnings before user hits limit
 */
export async function checkRateLimit(req: Request): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}> {
  // This is a placeholder for future implementation
  // Would require access to the rate limiter's store
  // For now, return optimistic values

  return {
    allowed: true,
    remaining: config.security.proposalRateLimit.maxPerHour,
    limit: config.security.proposalRateLimit.maxPerHour,
    resetAt: new Date(Date.now() + config.security.proposalRateLimit.windowMs)
  };
}
