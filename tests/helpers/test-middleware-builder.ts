/**
 * Middleware builder for HTTP/middleware integration tests.
 */

import express, { type Express, type Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createErrorBody, sendApiError } from '../../server/lib/apiError';
import { MAX_REQUESTS, WINDOW_MS } from '../../server/middleware/rateLimitDetailed';
import { createTestAuthMiddleware, type MockTokenRegistry } from './test-auth-helpers';
import { RateLimitState } from './test-state-manager';

type RequestWithRateLimit = Request & { rateLimit?: { resetTime?: Date } };
type RequestWithId = Request & { requestId?: string };

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:5000'];

function normalizeCorsOrigins(origins?: string[]): string[] {
  const raw = origins && origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS;
  const cleaned = raw.map((origin) => origin.trim()).filter(Boolean);
  const valid = cleaned.filter((origin) => {
    try {
      const url = new URL(origin);
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch {
      return false;
    }
  });
  return valid.length > 0 ? valid : DEFAULT_CORS_ORIGINS;
}

/**
 * Configuration for test middleware composition.
 */
export interface TestMiddlewareConfig {
  auth?: { enabled: boolean; devMode?: boolean; registry?: MockTokenRegistry };
  rateLimit?: { enabled: boolean; windowMs?: number; max?: number };
  security?: { helmet?: boolean; cors?: { origins?: string[] } };
}

/**
 * Build a fresh Express app with test middleware applied in order.
 */
export function buildTestMiddleware(config: TestMiddlewareConfig = {}): Express {
  const app = express();
  applySecurityHeaders(app, config);
  applyRateLimiting(app, config);
  applyAuthMiddleware(app, config);
  return app;
}

/**
 * Apply security headers (Helmet + CORS) when configured.
 */
export function applySecurityHeaders(app: Express, config: TestMiddlewareConfig): void {
  const security = config.security;
  if (!security) return;

  if (security.helmet !== false) {
    app.use(helmet());
  }

  if (security.cors) {
    const origins = normalizeCorsOrigins(security.cors.origins);
    app.use(
      cors({
        origin: origins,
        credentials: true,
        exposedHeaders: [
          'X-Request-ID',
          'RateLimit-Limit',
          'RateLimit-Remaining',
          'RateLimit-Reset',
        ],
      })
    );
  }
}

/**
 * Apply in-memory rate limiting when enabled.
 */
export function applyRateLimiting(app: Express, config: TestMiddlewareConfig): void {
  const rateLimitConfig = config.rateLimit;
  if (!rateLimitConfig?.enabled) return;

  const store = new RateLimitState().createFreshStore();
  const windowMs = rateLimitConfig.windowMs ?? WINDOW_MS;
  const max = rateLimitConfig.max ?? MAX_REQUESTS;

  app.use(
    rateLimit({
      windowMs,
      limit: max,
      standardHeaders: true,
      legacyHeaders: false,
      store,
      keyGenerator: (req) => ipKeyGenerator(req.ip || '127.0.0.1'),
      handler: (req, res) => {
        const rateLimitReq = req as RequestWithRateLimit;
        const resetTime = rateLimitReq.rateLimit?.resetTime;
        const seconds = resetTime
          ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
          : Math.ceil(windowMs / 1000);
        res.setHeader('Retry-After', String(seconds));

        const requestId = (req as RequestWithId).requestId;
        sendApiError(res, 429, createErrorBody('Too Many Requests', requestId, 'RATE_LIMITED'));
      },
    })
  );
}

/**
 * Apply test auth middleware when enabled.
 */
export function applyAuthMiddleware(app: Express, config: TestMiddlewareConfig): void {
  const authConfig = config.auth;
  if (!authConfig?.enabled) return;

  const registry = authConfig.registry ?? new MockTokenRegistry();
  app.use(createTestAuthMiddleware(registry, { devMode: authConfig.devMode }));
}
