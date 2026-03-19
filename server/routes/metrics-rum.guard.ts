import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Parse allowed origins from environment
const ORIGINS = (process.env['RUM_ORIGIN_ALLOWLIST'] || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SAMPLE = Number(process.env['RUM_SAMPLE_RATE'] || '0.2'); // 20% default sampling
const RUM_PATH_PREFIX = '/metrics/rum';
const UUID_SEGMENT_PATTERN = /\/[a-f0-9-]{36}/gi;
const LARGE_NUMERIC_SEGMENT_PATTERN = /\/\d{5,}/g;

type RumBody = Record<string, unknown> & {
  error?: boolean;
  pathname?: string;
  rating?: string;
};

function getRumBody(req: Request): RumBody | undefined {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return undefined;
  }

  return req.body as RumBody;
}

export function sanitizeRumPathname(pathname: string): string {
  return pathname
    .split('?')[0]
    .replace(UUID_SEGMENT_PATTERN, '/:id')
    .replace(LARGE_NUMERIC_SEGMENT_PATTERN, '/:id');
}

function isRumRequest(req: Request): boolean {
  return req.path === RUM_PATH_PREFIX || req.path.startsWith(`${RUM_PATH_PREFIX}/`);
}

/**
 * Guard to restrict RUM metrics to allowed origins
 */
export function rumOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (!isRumRequest(req)) {
    return next();
  }

  // In development, allow all origins
  if (process.env['NODE_ENV'] === 'development' && ORIGINS.length === 0) {
    return next();
  }

  const origin = req['get']('origin') || '';
  const referer = req['get']('referer') || '';

  // Allow if no allowlist configured (opt-in security)
  if (ORIGINS.length === 0) {
    console.warn('RUM_ORIGIN_ALLOWLIST not configured - accepting all origins');
    return next();
  }

  // Check if origin or referer matches allowlist
  const ok = ORIGINS.some((o) => origin.startsWith(o) || referer.startsWith(o));

  if (!ok) {
    console.warn(`RUM origin blocked: ${origin || referer}`);
    return res['status'](403)['json']({ error: 'forbidden_origin' });
  }

  next();
}

/**
 * Guard to implement sampling for RUM metrics
 */
export function rumSamplingGuard(req: Request, res: Response, next: NextFunction) {
  if (!isRumRequest(req)) {
    return next();
  }

  // Client can opt-in to force sampling
  const force = req['get']('x-rum-sample') === '1';
  const body = getRumBody(req);

  // Always sample errors
  const isError = body?.rating === 'poor' || body?.error === true;

  if (force || isError || Math.random() < SAMPLE) {
    return next();
  }

  // Return 204 for non-sampled requests
  res['status'](204)['end']();
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
  skip: () => {
    // Skip rate limiting in development
    return process.env['NODE_ENV'] === 'development';
  },
});

/**
 * Privacy guard to strip PII from RUM payloads
 */
export function rumPrivacyGuard(req: Request, res: Response, next: NextFunction) {
  // Set no-store cache control
  res['setHeader']('Cache-Control', 'no-store');

  // Strip accidental PII fields from body
  const body = getRumBody(req);
  if (body) {
    const piiFields = [
      'userEmail',
      'userName',
      'email',
      'accountNumber',
      'ssn',
      'creditCard',
      'password',
      'token',
      'apiKey',
      'secret',
    ];

    piiFields.forEach((field) => {
      delete body[field];
      delete body[field.toLowerCase()];
      delete body[field.toUpperCase()];
    });

    // Sanitize pathname to remove potential IDs
    if (typeof body.pathname === 'string') {
      body.pathname = sanitizeRumPathname(body.pathname);
    }
  }

  next();
}
