import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { fundEvents, fundSnapshots, funds } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { redis } from '../redis';
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
    const { fundId } = req.params;
    const { startTime, endTime, limit, offset } = req.query;

    // Build query conditions
    const conditions = [eq(fundEvents.fundId, fundId)];
    if (startTime) conditions.push(gte(fundEvents.eventTime, new Date(startTime)));
    if (endTime) conditions.push(lte(fundEvents.eventTime, new Date(endTime)));

    // Fetch events with pagination
    const [events, snapshots] = await Promise.all([
      db
        .select({
          id: fundEvents.id,
          eventType: fundEvents.eventType,
          eventTime: fundEvents.eventTime,
          operation: fundEvents.operation,
          entityType: fundEvents.entityType,
          entityId: fundEvents.entityId,
          metadata: fundEvents.metadata,
        })
        .from(fundEvents)
        .where(and(...conditions))
        .orderBy(desc(fundEvents.eventTime))
        .limit(limit)
        .offset(offset),

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
            eq(fundSnapshots.fundId, fundId),
            startTime ? gte(fundSnapshots.snapshotTime, new Date(startTime)) : undefined,
            endTime ? lte(fundSnapshots.snapshotTime, new Date(endTime)) : undefined
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
      fundId,
      timeRange: {
        start: startTime || events[events.length - 1]?.eventTime,
        end: endTime || events[0]?.eventTime,
      },
      events,
      snapshots,
      pagination: {
        total: Number(count),
        limit,
        offset,
        hasMore: offset + limit < Number(count),
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
    const { fundId } = req.params;
    const { timestamp, includeEvents } = req.query;
    const targetTime = new Date(timestamp);

    // Check cache first
    const cacheKey = `fund:${fundId}:state:${targetTime.getTime()}`;
    const cached = await redis.get(cacheKey);
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
          eq(fundSnapshots.fundId, fundId),
          lte(fundSnapshots.snapshotTime, targetTime)
        )
      )
      .orderBy(desc(fundSnapshots.snapshotTime))
      .limit(1);

    if (!snapshot) {
      throw new NotFoundError(`No snapshot found for fund ${fundId} before ${timestamp}`);
    }

    // Get events between snapshot and target time
    const eventsAfterSnapshot = includeEvents
      ? await db
          .select()
          .from(fundEvents)
          .where(
            and(
              eq(fundEvents.fundId, fundId),
              gte(fundEvents.eventTime, snapshot.snapshotTime),
              lte(fundEvents.eventTime, targetTime)
            )
          )
          .orderBy(fundEvents.eventTime)
      : [];

    const response = {
      fundId,
      timestamp: targetTime.toISOString(),
      snapshot: {
        id: snapshot.id,
        time: snapshot.snapshotTime,
        eventCount: snapshot.eventCount,
        stateHash: snapshot.stateHash,
      },
      state: snapshot.state,
      eventsApplied: eventsAfterSnapshot.length,
      events: includeEvents ? eventsAfterSnapshot : undefined,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(response));

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
    const { fundId } = req.params;
    const { type, description } = req.body;

    // Verify fund exists
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId),
    });

    if (!fund) {
      throw new NotFoundError(`Fund ${fundId} not found`);
    }

    // Trigger snapshot creation via worker
    const { Queue } = await import('bullmq');
    const snapshotQueue = new Queue('snapshots', {
      connection: redis,
    });

    const job = await snapshotQueue.add(
      'create-snapshot',
      {
        fundId,
        type,
        description,
        requestedAt: new Date().toISOString(),
        userId: (req as any).user?.id,
      },
      {
        priority: type === 'manual' ? 1 : 2,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    logger.info('Snapshot creation queued', {
      fundId,
      jobId: job.id,
      type,
    });

    recordBusinessMetric('snapshot_creation', 'queued', Date.now() - startTimer);

    res.status(202).json({
      message: 'Snapshot creation queued',
      jobId: job.id,
      fundId,
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

    // Fetch states at both timestamps in parallel
    const [state1, state2] = await Promise.all([
      fetchStateAtTime(fundId, new Date(timestamp1)),
      fetchStateAtTime(fundId, new Date(timestamp2)),
    ]);

    if (!state1 || !state2) {
      throw new NotFoundError('Could not retrieve states for comparison');
    }

    // Calculate differences if requested
    let differences = null;
    if (includeDiff) {
      const { createPatch } = await import('immer');
      differences = createPatch(state1.state, state2.state);
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
        totalChanges: differences?.length || 0,
        timeSpan: Math.abs(new Date(timestamp2).getTime() - new Date(timestamp1).getTime()),
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
    if (eventTypes && eventTypes.length > 0) {
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
      .limit(limit);

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