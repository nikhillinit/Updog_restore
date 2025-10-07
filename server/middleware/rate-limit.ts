/**
 * Rate Limiting Middleware
 * 
 * Provides rate limiting for sensitive routes like admin endpoints
 */

import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for admin routes
 * Limits each IP to 100 requests per 15 minutes
 */
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});
