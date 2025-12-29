/**
 * Unified Metrics API Routes
 *
 * Provides the single source of truth for fund metrics across the platform.
 *
 * Endpoints:
 * - GET /api/funds/:fundId/metrics - Get unified metrics for a fund
 * - POST /api/funds/:fundId/metrics/invalidate - Force cache invalidation
 *
 * @module server/routes/fund-metrics
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { metricsAggregator } from '../services/metrics-aggregator';
import type { UnifiedFundMetrics, MetricsCalculationError } from '@shared/types/metrics';
import { toNumber, NumberParseError } from '@shared/number';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import rateLimit from 'express-rate-limit';

const router = Router();

/**
 * Rate limiter for cache invalidation
 * Prevents abuse/DoS: 6 requests per minute per IP
 */
const invalidateLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 6, // 6 requests per window
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many cache invalidation requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for metrics endpoint
 * Lighter rate limit for regular requests: 60 requests per minute per IP
 */
const metricsLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60, // 60 requests per window
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many metrics requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/funds/:fundId/metrics
 *
 * Get unified metrics for a fund
 *
 * Query parameters:
 * - skipCache: boolean - Force recomputation (requires auth)
 * - skipProjections: boolean - Skip expensive projections (for fast loading)
 *
 * Response: UnifiedFundMetrics
 */
router["get"](
  '/api/funds/:fundId/metrics',
  requireAuth(),
  requireFundAccess,
  metricsLimiter,
  async (req: Request, res: Response) => {
  try {
    // Parse and validate fund ID
    const fundIdParam = req.params.fundId;
    const fundId = toNumber(fundIdParam, 'fundId');

    if (fundId <= 0) {
      return res["status"](400)["json"]({
        error: 'Invalid fund ID',
        message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
      });
    }

    // Parse query options
    const skipCache = req.query.skipCache === 'true';
    const skipProjections = req.query.skipProjections === 'true';

    // Log skipCache usage for operational visibility
    if (skipCache) {
      console.info(JSON.stringify({
        event: 'metrics.skipCache',
        user: (req as any).user?.id || 'unknown',
        fundId,
        ip: req.ip,
        reason: req.query.reason || 'manual',
        timestamp: new Date().toISOString(),
      }));
    }

    // Get unified metrics
    const metrics: UnifiedFundMetrics = await metricsAggregator.getUnifiedMetrics(fundId, {
      skipCache,
      skipProjections,
    });

    // Add response headers
    res["setHeader"]('Content-Type', 'application/json');
    res["setHeader"]('Cache-Control', 'private, max-age=60'); // Client cache for 1 minute

    // Return metrics
    return res["json"](metrics);
  } catch (error) {
    console.error('Metrics API error:', error);

    // Handle parameter validation errors
    if (error instanceof NumberParseError) {
      return res["status"](400)["json"]({
        error: 'Invalid parameter',
        message: error.message,
      });
    }

    // Handle metrics calculation errors
    if (isMetricsCalculationError(error)) {
      const statusCode = getStatusCodeForError(error.code);
      return res["status"](statusCode)["json"]({
        error: error.code,
        message: error.message,
        component: error.component,
        timestamp: error.timestamp,
      });
    }

    // Handle unexpected errors
    return res["status"](500)["json"]({
      error: 'INTERNAL_ERROR',
      message: 'Failed to calculate metrics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
);

/**
 * POST /api/funds/:fundId/metrics/invalidate
 *
 * Invalidate cached metrics for a fund
 *
 * Use this when fund data changes (new investment, valuation update, etc.)
 * to force fresh calculation on next request.
 *
 * **Security**: Authentication + fund-scoped authorization + rate limiting (6/min)
 *
 * Response: 204 No Content on success
 */
router["post"](
  '/api/funds/:fundId/metrics/invalidate',
  requireAuth(),
  requireFundAccess,
  invalidateLimiter,
  async (req: Request, res: Response) => {
  try {
    const fundIdParam = req.params.fundId;
    const fundId = toNumber(fundIdParam, 'fundId');

    if (fundId <= 0) {
      return res["status"](400)["json"]({
        error: 'Invalid fund ID',
        message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
      });
    }

    await metricsAggregator.invalidateCache(fundId);

    // 204 No Content - successful invalidation, no body needed
    return res["status"](204)["end"]();
  } catch (error) {
    console.error('Cache invalidation error:', error);

    if (error instanceof NumberParseError) {
      return res["status"](400)["json"]({
        error: 'Invalid parameter',
        message: error.message,
      });
    }

    return res["status"](500)["json"]({
      error: 'INTERNAL_ERROR',
      message: 'Failed to invalidate cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Type guard for MetricsCalculationError
 */
function isMetricsCalculationError(error: unknown): error is MetricsCalculationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'component' in error &&
    'message' in error &&
    'timestamp' in error
  );
}

/**
 * Map error codes to HTTP status codes
 */
function getStatusCodeForError(code: MetricsCalculationError['code']): number {
  switch (code) {
    case 'INSUFFICIENT_DATA':
      return 404; // Not found
    case 'CALCULATION_FAILED':
      return 500; // Internal server error
    case 'ENGINE_ERROR':
      return 503; // Service unavailable
    case 'CACHE_ERROR':
      return 503; // Service unavailable
    default:
      return 500;
  }
}

export default router;
