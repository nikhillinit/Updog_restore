/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { fundEvents, fundSnapshots, funds } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
// Redis cache removed - using injected cache from providers
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/async';
import { NotFoundError, ValidationError } from '../errors';
import { logger } from '../logger';
import { recordBusinessMetric } from '../metrics';

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
    const fundIdNum = parseInt(req.params.fundId, 10);
    const startTimeStr = typeof req.query.startTime === 'string' ? req.query.startTime : undefined;
    const endTimeStr = typeof req.query.endTime === 'string' ? req.query.endTime : undefined;
    const limitNum = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
    const offsetNum = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

    // Build query conditions
    const conditions = [eq(fundEvents.fundId, fundIdNum)];
    if (startTimeStr) conditions.push(gte(fundEvents.eventTime, new Date(startTimeStr)));
    if (endTimeStr) conditions.push(lte(fundEvents.eventTime, new Date(endTimeStr)));

    // Fetch events with pagination
    const [events, snapshots] = await Promise.all([
      db
        .select({
          id: fundEvents.id,
          eventType: fundEvents.eventType,
          eventTime: fundEvents.eventTime,
          operation: fundEvents.operation,
          entityType: fundEvents.entityType,
          metadata: fundEvents.metadata,
        })
        .from(fundEvents)
        .where(and(...conditions))
        .orderBy(desc(fundEvents.eventTime))
        .limit(limitNum)
        .offset(offsetNum),

      // Get related snapshots
      db
        .select({
          id: fundSnapshots.id,
          snapshotTime: fundSnapshots.snapshotTime,
          eventCount: fundSnapshots.eventCount,
          stateHash: fundSnapshots.stateHash,
          metadata: fundSnapshots.metadata,
        })
        .from(fundSnapshots)
        .where(
          and(
            eq(fundSnapshots.fundId, fundIdNum),
            startTimeStr ? gte(fundSnapshots.snapshotTime, new Date(startTimeStr)) : undefined,
            endTimeStr ? lte(fundSnapshots.snapshotTime, new Date(endTimeStr)) : undefined
          )
        )
        .orderBy(desc(fundSnapshots.snapshotTime)),
    ]);

    // Count total events for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(fundEvents)
      .where(and(...conditions));

    recordBusinessMetric('timeline_query', 'success', Date.now() - startTimer);

    res.json({
      fundId: fundIdNum,
      timeRange: {
        start: startTimeStr || events[events.length - 1]?.eventTime,
        end: endTimeStr || events[0]?.eventTime,
      },
      events,
      snapshots,
      pagination: {
        total: Number(count),
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < Number(count),
      },
    });
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
    const fundIdNum = parseInt(req.params.fundId, 10);
    const timestampStr = typeof req.query.timestamp === 'string' ? req.query.timestamp : '';
    const includeEventsFlag = typeof req.query.includeEvents === 'string' ? req.query.includeEvents === 'true' : false;
    
    if (!timestampStr) {
      throw new ValidationError('timestamp is required');
    }
    
    const targetTime = new Date(timestampStr);

    // Check cache first
    const cache = (req as any).app.locals.cache;
    const cacheKey = `fund:${fundIdNum}:state:${targetTime.getTime()}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      recordBusinessMetric('state_query', 'cache_hit', Date.now() - startTimer);
      return res.json(JSON.parse(cached));
    }

    // Find nearest snapshot before target time
    const [snapshot] = await db
      .select()
      .from(fundSnapshots)
      .where(
        and(
          eq(fundSnapshots.fundId, fundIdNum),
          lte(fundSnapshots.snapshotTime, targetTime)
        )
      )
      .orderBy(desc(fundSnapshots.snapshotTime))
      .limit(1);

    if (!snapshot) {
      throw new NotFoundError(`No snapshot found for fund ${fundIdNum} before ${timestampStr}`);
    }

    // Get events between snapshot and target time
    const eventsAfterSnapshot = includeEventsFlag
      ? await db
          .select()
          .from(fundEvents)
          .where(
            and(
              eq(fundEvents.fundId, fundIdNum),
              gte(fundEvents.eventTime, snapshot.snapshotTime),
              lte(fundEvents.eventTime, targetTime)
            )
          )
          .orderBy(fundEvents.eventTime)
      : [];

    const response = {
      fundId: fundIdNum,
      timestamp: targetTime.toISOString(),
      snapshot: {
        id: snapshot.id,
        time: snapshot.snapshotTime,
        eventCount: snapshot.eventCount,
        stateHash: snapshot.stateHash,
      },
      state: snapshot.state,
      eventsApplied: eventsAfterSnapshot.length,
      events: includeEventsFlag ? eventsAfterSnapshot : undefined,
    };

    // Cache for 5 minutes using injected cache
    await cache.set(cacheKey, JSON.stringify(response), 300);

    recordBusinessMetric('state_query', 'success', Date.now() - startTimer);
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
    const fundIdNum = parseInt(req.params.fundId, 10);
    const { type, description } = req.body;

    // Verify fund exists
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundIdNum),
    });

    if (!fund) {
      throw new NotFoundError(`Fund ${fundIdNum} not found`);
    }

    // Get queue from providers
    const providers = (req as any).app.locals.providers;
    
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

    // Validate and convert parameters
    const fundIdNum = parseInt(fundId, 10);
    const ts1 = typeof timestamp1 === 'string' ? timestamp1 : '';
    const ts2 = typeof timestamp2 === 'string' ? timestamp2 : '';

    if (!ts1 || !ts2) {
      throw new ValidationError('Both timestamp1 and timestamp2 are required');
    }

    // Fetch states at both timestamps in parallel
    const [state1, state2] = await Promise.all([
      fetchStateAtTime(fundIdNum, new Date(ts1)),
      fetchStateAtTime(fundIdNum, new Date(ts2)),
    ]);

    if (!state1 || !state2) {
      throw new NotFoundError('Could not retrieve states for comparison');
    }

    // Calculate differences if requested
    let differences = null;
    if (includeDiff) {
      // Use basic comparison for state differences
      differences = JSON.stringify(state1.state) !== JSON.stringify(state2.state) ? 
        [{ op: 'replace', path: '', value: 'States differ' }] : [];
    }

    recordBusinessMetric('state_comparison', 'success', Date.now() - startTimer);

    res.json({
      fundId,
      comparison: {
        timestamp1: timestamp1,
        timestamp2: timestamp2,
        state1: {
          snapshotId: state1.snapshot.id,
          eventCount: state1.eventsApplied,
        },
        state2: {
          snapshotId: state2.snapshot.id,
          eventCount: state2.eventsApplied,
        },
      },
      differences,
      summary: {
        totalChanges: Array.isArray(differences) ? differences.length : 0,
        timeSpan: Math.abs(new Date(timestamp2 as string).getTime() - new Date(timestamp1 as string).getTime()),
      },
    });
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
    const { limit, eventTypes } = req.query;

    const conditions = [];
    if (eventTypes && Array.isArray(eventTypes) && eventTypes.length > 0) {
      conditions.push(sql`${fundEvents.eventType} = ANY(${eventTypes})`);
    }

    const events = await db
      .select({
        id: fundEvents.id,
        fundId: fundEvents.fundId,
        eventType: fundEvents.eventType,
        eventTime: fundEvents.eventTime,
        operation: fundEvents.operation,
        entityType: fundEvents.entityType,
        metadata: fundEvents.metadata,
        fundName: funds.name,
      })
      .from(fundEvents)
      .leftJoin(funds, eq(fundEvents.fundId, funds.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(fundEvents.eventTime))
      .limit(typeof limit === 'string' ? parseInt(limit, 10) : 20);

    res.json({
      events,
      timestamp: new Date().toISOString(),
    });
  })
);

// Helper function to fetch state at a specific time
async function fetchStateAtTime(fundId: number, targetTime: Date) {
  // Find nearest snapshot
  const [snapshot] = await db
    .select()
    .from(fundSnapshots)
    .where(
      and(
        eq(fundSnapshots.fundId, fundId),
        lte(fundSnapshots.snapshotTime, targetTime)
      )
    )
    .orderBy(desc(fundSnapshots.snapshotTime))
    .limit(1);

  if (!snapshot) return null;

  // Get events after snapshot
  const eventsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(fundEvents)
    .where(
      and(
        eq(fundEvents.fundId, fundId),
        gte(fundEvents.eventTime, snapshot.snapshotTime),
        lte(fundEvents.eventTime, targetTime)
      )
    );

  return {
    snapshot: {
      id: snapshot.id,
      time: snapshot.snapshotTime,
    },
    state: snapshot.state,
    eventsApplied: Number(eventsCount[0].count),
  };
}

export default router;

