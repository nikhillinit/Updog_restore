import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Parse allowed origins from environment
const ORIGINS = (process.env.RUM_ORIGIN_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
const SAMPLE = Number(process.env.RUM_SAMPLE_RATE || '0.2'); // 20% default sampling

/**
 * Guard to restrict RUM metrics to allowed origins
 */
export function rumOriginGuard(req: Request, res: Response, next: NextFunction) {
  // In development, allow all origins
  if (process.env.NODE_ENV === 'development' && ORIGINS.length === 0) {
    return next();
  }
  
  const origin = req.get('origin') || '';
  const referer = req.get('referer') || '';
  
  // Allow if no allowlist configured (opt-in security)
  if (ORIGINS.length === 0) {
    console.warn('RUM_ORIGIN_ALLOWLIST not configured - accepting all origins');
    return next();
  }
  
  // Check if origin or referer matches allowlist
  const ok = ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
  
  if (!ok) {
    console.warn(`RUM origin blocked: ${origin || referer}`);
    return res.status(403).json({ error: 'forbidden_origin' });
  }
  
  next();
}

/**
 * Guard to implement sampling for RUM metrics
 */
export function rumSamplingGuard(req: Request, res: Response, next: NextFunction) {
  // Client can opt-in to force sampling
  const force = req.get('x-rum-sample') === '1';
  
  // Always sample errors
  const isError = req.body?.rating === 'poor' || req.body?.error === true;
  
  if (force || isError || Math.random() < SAMPLE) {
    return next();
  }
  
  // Return 204 for non-sampled requests
  res.status(204).end();
}

/**
 * Rate limiter for RUM endpoint
 */
export const rumLimiter = rateLimit({
  windowMs: 30_000, // 30 seconds
  max: 120, // 120 beacons per 30s per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many metrics sent, please try again later',
  skip: (_req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === 'development';
  },
});

/**
 * Privacy guard to strip PII from RUM payloads
 */
export function rumPrivacyGuard(req: Request, res: Response, next: NextFunction) {
  // Set no-store cache control
  res.setHeader('Cache-Control', 'no-store');
  
  // Strip accidental PII fields from body
  if (typeof req.body === 'object' && req.body) {
    const piiFields = [
      'userEmail', 'userName', 'email', 'name',
      'accountNumber', 'ssn', 'creditCard',
      'password', 'token', 'apiKey', 'secret'
    ];
    
    piiFields.forEach(field => {
      delete req.body[field];
      delete req.body[field.toLowerCase()];
      delete req.body[field.toUpperCase()];
    });
    
    // Sanitize pathname to remove potential IDs
    if (req.body.pathname) {
      // Replace UUIDs with :id
      req.body.pathname = req.body.pathname
        .replace(/\/[a-f0-9-]{36}/gi, '/:id')
        .replace(/\/\d{5,}/g, '/:id'); // Replace long numeric IDs
    }
  }
  
  next();
}