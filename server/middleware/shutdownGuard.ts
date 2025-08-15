import type { Request, Response, NextFunction } from 'express';
import { isReady } from '../health/state';
import { sendApiError } from '../lib/apiError';

// Allow these paths during shutdown for liveness/metrics/triage
const ALLOWLIST = new Set(['/healthz', '/readyz', '/metrics', '/health/live', '/health/detailed']);

// Configurable retry-after for shutdown
const SHUTDOWN_RETRY_AFTER = Number(process.env.SHUTDOWN_RETRY_AFTER_SECONDS ?? 30);

/**
 * Middleware that returns 503 during shutdown
 * Ensures new requests are rejected when service is shutting down
 * Allows health/metrics endpoints to continue working
 */
export function shutdownGuard() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isReady() && !ALLOWLIST.has(req.path)) {
      res.setHeader('Connection', 'close');
      res.setHeader('Retry-After', String(SHUTDOWN_RETRY_AFTER));
      res.setHeader('Cache-Control', 'no-store');
      return sendApiError(res, 503, { 
        error: 'Service Unavailable', 
        code: 'SERVICE_UNAVAILABLE', 
        requestId: (req as any).requestId 
      });
    }
    next();
  };
}