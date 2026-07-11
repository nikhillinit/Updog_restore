import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createRouteLogger } from '../lib/route-logger.js';

const routeLog = createRouteLogger('metrics-rum.guard');

const SAMPLE = Number(process.env['RUM_SAMPLE_RATE'] || '0.2'); // 20% default sampling
const RUM_PATH_PREFIXES = ['/metrics/rum', '/api/metrics/rum'];
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
  const [pathWithoutQuery = pathname] = pathname.split('?');
  return pathWithoutQuery
    .replace(UUID_SEGMENT_PATTERN, '/:id')
    .replace(LARGE_NUMERIC_SEGMENT_PATTERN, '/:id');
}

function parseHttpOrigin(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    return parsed.origin;
  } catch {
    return undefined;
  }
}

function getAllowedOrigins(): string[] {
  return (process.env['RUM_ORIGIN_ALLOWLIST'] || '')
    .split(',')
    .map((s) => parseHttpOrigin(s.trim()))
    .filter((origin): origin is string => Boolean(origin));
}

function isRumRequest(req: Request): boolean {
  return RUM_PATH_PREFIXES.some(
    (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`)
  );
}

function isProductionRumEnabled(): boolean {
  return process.env['NODE_ENV'] === 'production' && process.env['ENABLE_RUM_V2'] === '1';
}

/**
 * Guard to restrict RUM metrics to allowed origins
 */
export function rumOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (!isRumRequest(req)) {
    return next();
  }

  // In development, allow all origins
  const allowedOrigins = getAllowedOrigins();

  if (process.env['NODE_ENV'] === 'development' && allowedOrigins.length === 0) {
    return next();
  }

  const origin = req['get']('origin') || '';
  const referer = req['get']('referer') || '';

  // Allow if no allowlist configured (opt-in security)
  if (allowedOrigins.length === 0) {
    if (isProductionRumEnabled()) {
      routeLog.warn('RUM_ORIGIN_ALLOWLIST required when production RUM is enabled');
      return res.status(403).json({ error: 'forbidden_origin' });
    }

    routeLog.warn('RUM_ORIGIN_ALLOWLIST not configured - accepting all origins');
    return next();
  }

  const requestOrigins = [parseHttpOrigin(origin), parseHttpOrigin(referer)].filter(
    (value): value is string => Boolean(value)
  );
  const ok = requestOrigins.some((requestOrigin) => allowedOrigins.includes(requestOrigin));

  if (!ok) {
    routeLog.warn(`RUM origin blocked: ${origin || referer}`);
    return res.status(403).json({ error: 'forbidden_origin' });
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
  skip: () => {
    // Skip rate limiting in development
    return process.env['NODE_ENV'] === 'development';
  },
});

/**
 * Privacy guard to strip PII from RUM payloads
 */
export function rumPrivacyGuard(req: Request, res: Response, next: NextFunction) {
  // Set no-store cache control (applies to every response; keep unconditional).
  res.setHeader('Cache-Control', 'no-store');

  // Only mutate RUM beacon payloads. This guard runs on metricsRumRouter, which is
  // mounted at the bare root, so without this gate it strips password/token/email/
  // userName (and lowercased `username`) from EVERY request body — e.g. it empties
  // POST /api/auth/login. Mirrors the isRumRequest gate in rumOriginGuard/rumSamplingGuard.
  if (!isRumRequest(req)) {
    return next();
  }

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
