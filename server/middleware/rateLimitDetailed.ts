/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * DI-Friendly Rate Limiter for /health/detailed
 * Accepts injected store instead of creating Redis connections at import time
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { RateLimitRequestHandler , Store } from 'express-rate-limit';

import { sendApiError, createErrorBody } from '../lib/apiError.js';
import { spreadIfDefined } from '@shared/lib/ts/spreadIfDefined';

export function rateLimitDetailed(opts?: { store?: Store }): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60_000, // 1 minute
    max: 30, // 30 requests per minute
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    ...spreadIfDefined('store', opts?.store), // Injected store (undefined => memory store)
    keyGenerator: (req: Request) => {
      // Use library's IPv6-safe key generator
      return `${ipKeyGenerator(req)}:health-detailed`;
    },
    skip: (req: Request) => {
      // Allow on-call to bypass with a valid health key
      const healthKey = process.env['HEALTH_KEY'];
      return Boolean(healthKey && req['get']('X-Health-Key') === healthKey);
    },
    handler: (req: Request, res: Response) => {
      // Express-rate-limit v7+ adds rateLimit property to the request
      const resetTime = (req as any).rateLimit?.resetTime;
      const seconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : 60;
      res['setHeader']('Retry-After', String(seconds));
      sendApiError(res, 429, createErrorBody('Too Many Requests', (req as any).requestId, 'RATE_LIMITED'));
    }
  });
}

// Export for testing
export const WINDOW_MS = 60_000;
export const MAX_REQUESTS = 30;
