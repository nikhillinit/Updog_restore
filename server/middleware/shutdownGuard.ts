import type { Request, Response, NextFunction } from 'express';
import { isReady } from '../health/state';
import { sendApiError } from '../lib/apiError';

// Allow these paths and prefixes during shutdown for liveness/metrics/triage
const ALLOW = (path: string) =>
  path === '/healthz' || path === '/readyz' || path === '/metrics' || path.startsWith('/health/');

function shutdownRetryAfterSeconds(): number {
  const retryAfter = Number(process.env['SHUTDOWN_RETRY_AFTER_SECONDS'] ?? 30);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30;
}

/**
 * Middleware that returns 503 during shutdown
 * Ensures new requests are rejected when service is shutting down
 * Allows health/metrics endpoints to continue working
 * Supports HEAD/OPTIONS methods for health checks
 */
export function shutdownGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isReady() && !ALLOW(req.path)) {
      const retryAfter = shutdownRetryAfterSeconds();
      res['setHeader']('Connection', 'close');
      res['setHeader']('Retry-After', String(retryAfter));
      res['setHeader']('Cache-Control', 'no-store');
      return sendApiError(res, 503, {
        error: 'Service Unavailable',
        code: 'SERVICE_UNAVAILABLE',
        ...(req.requestId ? { requestId: req.requestId } : {}),
      });
    }
    next();
  };
}
