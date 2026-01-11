/**
 * Timeline API Routes
 *
 * RESTful endpoints for fund timeline and snapshot management
 * Routes are thin wrappers that delegate business logic to TimeTravelAnalyticsService
 */
import { funds } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Express } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { NotFoundError } from '../errors';
import { logger } from '../logger';
import { recordBusinessMetric } from '../metrics';
import { asyncHandler } from '../middleware/async';
import { validateRequest } from '../middleware/validation';
import { TimeTravelAnalyticsService, type Cache } from '../services/time-travel-analytics';

/**
 * Create timeline router with service dependency injection
 */

/**
 * Cache adapter bridges Express app.locals.cache to service Cache interface
 */
function createCacheAdapter(appLocalsCache: unknown): Cache | undefined {
  if (!appLocalsCache) return undefined;

  return {
    async get(key: string): Promise<string | null> {
      return appLocalsCache.get(key);
    },
    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
      return appLocalsCache.set(key, value, { EX: ttlSeconds });
    },
  };
}

/**
 * Create timeline router with service dependency injection
 */
export function createTimelineRouter(service: TimeTravelAnalyticsService) {
  const router = Router();

// Timeline range schema
const timelineRangeSchema = z.object({
  fundId: z.coerce.number().int().positive(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// Point-in-time query schema
const pointInTimeSchema = z.object({
  fundId: z.coerce.number().int().positive(),
  timestamp: z.string().datetime(),
  includeEvents: z.coerce.boolean().default(false),
});

// Snapshot creation schema
const createSnapshotSchema = z.object({
  fundId: z.coerce.number().int().positive(),
  type: z.enum(['manual', 'scheduled', 'auto']).default('manual'),
  description: z.string().optional(),
});

  /**
   * GET /api/timeline/:fundId
   * Get timeline of events and snapshots for a fund
   */
  router.get(
    '/:fundId',
    validateRequest({
      params: z.object({ fundId: z.coerce.number() }),
      query: timelineRangeSchema.omit({ fundId: true }),
    }),
    asyncHandler(async (req, res) => {
      const startTimer = Date.now();
      const fundIdNum = parseInt(req.params['fundId'], 10);
      const startTimeStr = typeof req.query['startTime'] === 'string' ? req.query['startTime'] : undefined;
      const endTimeStr = typeof req.query['endTime'] === 'string' ? req.query['endTime'] : undefined;
      const limitNum = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : 100;
      const offsetNum = typeof req.query['offset'] === 'string' ? parseInt(req.query['offset'], 10) : 0;

      // Delegate to service
      const result = await service.getTimelineEvents(fundIdNum, {
        ...(startTimeStr && { startTime: new Date(startTimeStr) }),
        ...(endTimeStr && { endTime: new Date(endTimeStr) }),
        limit: limitNum,
        offset: offsetNum,
      });

      recordBusinessMetric('timeline_query', 'success', Date.now() - startTimer);
      res.json(result);
    })
  );

  /**
   * GET /api/timeline/:fundId/state
   * Get fund state at a specific point in time
   */
  router.get(
    '/:fundId/state',
    validateRequest({
      params: z.object({ fundId: z.coerce.number() }),
      query: pointInTimeSchema.omit({ fundId: true }),
    }),
    asyncHandler(async (req, res) => {
      const startTimer = Date.now();
      const fundIdNum = parseInt(req.params['fundId'], 10);
      const timestampStr = typeof req.query['timestamp'] === 'string' ? req.query['timestamp'] : '';
      const includeEventsFlag = typeof req.query['includeEvents'] === 'string' ? req.query['includeEvents'] === 'true' : false;

      if (!timestampStr) {
        throw new NotFoundError('timestamp is required');
      }

      const targetTime = new Date(timestampStr);

      // Delegate to service (service handles caching)
      const response = await service.getStateAtTime(fundIdNum, targetTime, includeEventsFlag);

      // Check if result came from cache by seeing if it's very fast
      const duration = Date.now() - startTimer;
      const metricType = duration < 10 ? 'cache_hit' : 'success';

      recordBusinessMetric('state_query', metricType, duration);
      res.json(response);
    })
  );

  /**
   * POST /api/timeline/:fundId/snapshot
   * Create a new snapshot for a fund
   */
  router.post(
    '/:fundId/snapshot',
    validateRequest({
      params: z.object({ fundId: z.coerce.number() }),
      body: createSnapshotSchema.omit({ fundId: true }),
    }),
    asyncHandler(async (req, res) => {
      const startTimer = Date.now();
      const fundIdNum = parseInt(req.params['fundId'], 10);
      const { type, description: _description } = req.body;

      // Verify fund exists
      const fund = await db.query.funds.findFirst({
        where: eq(funds.id, fundIdNum),
      });

      if (!fund) {
        throw new NotFoundError(`Fund ${fundIdNum} not found`);
      }

      // Get queue from providers
      const providers = (req as { app: { locals: { providers?: { queue?: { enabled: boolean } } } } }).app.locals.providers;

      // Only create snapshot if queues are enabled
      if (!providers.queue?.enabled) {
        throw new Error('Background queues not available in this environment');
      }

      // For development mode, just return a mock response
      logger.info('Snapshot creation requested (dev mode)', {
        fundId: fundIdNum,
        type,
      });

      recordBusinessMetric('snapshot_creation', 'queued', Date.now() - startTimer);

      res.status(202).json({
        message: 'Snapshot creation requested (dev mode - no background processing)',
        fundId: fundIdNum,
        type,
        estimatedCompletion: new Date(Date.now() + 30000).toISOString(),
      });
    })
  );

  /**
   * GET /api/timeline/:fundId/compare
   * Compare fund states at two different times
   */
  router.get(
    '/:fundId/compare',
    validateRequest({
      params: z.object({ fundId: z.coerce.number() }),
      query: z.object({
        timestamp1: z.string().datetime(),
        timestamp2: z.string().datetime(),
        includeDiff: z.coerce.boolean().default(true),
      }),
    }),
    asyncHandler(async (req, res) => {
      const startTimer = Date.now();
      const { fundId } = req.params;
      const { timestamp1, timestamp2, includeDiff } = req.query;

      const fundIdNum = parseInt(fundId, 10);
      const ts1 = typeof timestamp1 === 'string' ? timestamp1 : '';
      const ts2 = typeof timestamp2 === 'string' ? timestamp2 : '';

      if (!ts1 || !ts2) {
        throw new NotFoundError('Both timestamp1 and timestamp2 are required');
      }

      // Delegate to service
      const result = await service.compareStates(
        fundIdNum,
        new Date(ts1),
        new Date(ts2),
        includeDiff !== false
      );

      recordBusinessMetric('state_comparison', 'success', Date.now() - startTimer);
      res.json(result);
    })
  );

  /**
   * GET /api/timeline/events/latest
   * Get latest events across all funds (for admin dashboard)
   */
  router.get(
    '/events/latest',
    validateRequest({
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        eventTypes: z.array(z.string()).optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      const limitNum = typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : 20;
      const eventTypes = Array.isArray(req.query['eventTypes']) ? req.query['eventTypes'] : undefined;

      // Delegate to service
      const result = await service.getLatestEvents(limitNum, eventTypes);

      res.json(result);
    })
  );

  return router;
}

/**
 * Default export: instantiate service and create router
 *
 * Cache is lazily accessed from req.app.locals.cache at runtime.
 * This factory allows cache integration when app context is available.
 */
function createDefaultTimelineRouter(app?: Express) {
  const cache = app ? createCacheAdapter((app as { locals: { cache?: unknown } }).locals.cache) : undefined;
  const timelineService = new TimeTravelAnalyticsService(db, cache);
  return createTimelineRouter(timelineService);
}

// For backward compatibility with static imports
const defaultRouter = createDefaultTimelineRouter();
export default defaultRouter;
