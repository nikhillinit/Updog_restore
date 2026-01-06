/**
 * Cache Monitoring & Management API Routes
 *
 * Endpoints:
 * - GET /api/cache/stats - Cache statistics (hit rate, storage, performance)
 * - POST /api/cache/invalidate - Manual cache invalidation
 * - POST /api/cache/warm - Pre-warm cache with common configurations
 */

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { CacheStatsService } from '../services/CacheStatsService';
import {
  CacheInvalidationService,
  type InvalidationParams,
} from '../services/CacheInvalidationService';
import { CacheWarmingService, type WarmingParams } from '../services/CacheWarmingService';

const router = express.Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

/**
 * Cache invalidation request schema
 */
const invalidationSchema = z
  .object({
    scope: z.enum(['all', 'fund', 'matrix']),
    fundId: z.string().min(1).optional(),
    matrixKey: z.string().min(1).optional(),
    reason: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.scope === 'fund') return !!data.fundId;
      if (data.scope === 'matrix') return !!data.matrixKey;
      return true;
    },
    {
      message: 'fundId required for scope=fund, matrixKey required for scope=matrix',
    }
  );

/**
 * Cache warming request schema
 */
const warmingSchema = z
  .object({
    fundIds: z.array(z.string().min(1)).min(1).max(10),
    taxonomyVersion: z.string().regex(/^v\d+\.\d+$/, 'Must be format: v1.2'),
    priority: z.enum(['high', 'low']),
    configs: z
      .array(
        z.object({
          numScenarios: z.number().int().min(100).max(50000),
          buckets: z.array(z.any()).min(1).max(10),
          correlationWeights: z.object({
            macro: z.number().min(0).max(1),
            systematic: z.number().min(0).max(1),
            idiosyncratic: z.number().min(0).max(1),
          }),
          recycling: z.object({
            enabled: z.boolean(),
            mode: z.enum(['same-bucket', 'cross-bucket']),
            reinvestmentRate: z.number().min(0).max(1).optional(),
            avgHoldingPeriod: z.number().min(1).optional(),
            fundLifetime: z.number().min(1).optional(),
          }),
        })
      )
      .min(1)
      .max(5),
  })
  .strict();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Protected endpoint middleware (X-Health-Key header)
 */
function requireHealthKey(req: Request, res: Response, next: () => void) {
  const healthKey = process.env['HEALTH_KEY'];

  // Internal tool: allow localhost without key
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';

  if (!healthKey || isLocal) {
    return next();
  }

  const providedKey = req.get('X-Health-Key');
  if (providedKey !== healthKey) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Invalid or missing X-Health-Key header',
    });
  }

  next();
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/cache/stats
 *
 * Get comprehensive cache statistics:
 * - Hit/miss rates
 * - Storage usage (PostgreSQL + Redis)
 * - Performance metrics (latencies, percentiles)
 * - Recent activity
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Redis client is optional - graceful degradation to PostgreSQL-only stats
    const stats = await CacheStatsService.getStatistics(undefined);
    res.json(stats);
  } catch (error) {
    console.error('[CacheAPI] Stats error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve cache statistics',
    });
  }
});

/**
 * POST /api/cache/invalidate
 *
 * Invalidate cache entries by scope:
 * - all: Invalidate entire cache
 * - fund: Invalidate all matrices for a fund
 * - matrix: Invalidate a specific matrix
 *
 * Protected with X-Health-Key header (or localhost).
 */
router.post('/invalidate', requireHealthKey, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = invalidationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid invalidation request',
        details: validation.error.errors,
      });
    }

    // Redis client is optional - graceful degradation to PostgreSQL-only invalidation
    const params: InvalidationParams = validation.data;
    const result = await CacheInvalidationService.invalidate(params, undefined);
    res.json(result);
  } catch (error) {
    console.error('[CacheAPI] Invalidation error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to invalidate cache',
    });
  }
});

/**
 * POST /api/cache/warm
 *
 * Pre-warm cache by scheduling matrix generation jobs:
 * - Generates matrices for specified fund IDs and configurations
 * - Priority: high (immediate) or low (background)
 * - Returns scheduled job count and estimated completion time
 *
 * Protected with X-Health-Key header (or localhost).
 */
router.post('/warm', requireHealthKey, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = warmingSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid warming request',
        details: validation.error.errors,
      });
    }

    const result = await CacheWarmingService.warm(validation.data as WarmingParams);
    res.json(result);
  } catch (error) {
    console.error('[CacheAPI] Warming error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to warm cache',
    });
  }
});

export default router;
