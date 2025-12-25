/**
 * Time-Travel Analytics Service
 *
 * Core business logic for fund timeline and snapshot management.
 * Extracted from routes to enable proper testing and separation of concerns.
 */

import type * as schema from '@shared/schema';
import { fundEvents, fundSnapshots, funds, type FundEvent } from '@shared/schema';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as jsonpatch from 'fast-json-patch';
import { NotFoundError } from '../errors';
import { logger } from '../logger';

/**
 * Cache interface for dependency injection
 */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

export interface PortfolioState {
  totalValue: number;
  deployedCapital: number;
  portfolioCount: number;
  companies: CompanySnapshot[];
  sectorBreakdown: Record<string, number>;
  stageBreakdown: Record<string, number>;
}

export interface CompanySnapshot {
  id: number;
  name: string;
  valuation: number;
  stage: string;
  sector: string;
}

/**
 * Return types for service methods
 */
export interface FundStateAtTime {
  fundId: number;
  timestamp: string;
  snapshot: {
    id: string;
    time: Date;
    eventCount: number;
    stateHash: string;
  };
  state: PortfolioState;
  eventsApplied: number;
  events?: FundEvent[];
}

export interface TimelineResult {
  fundId: number;
  timeRange: {
    start?: string | Date;
    end?: string | Date;
  };
  events: Array<
    Pick<FundEvent, 'id' | 'eventType' | 'eventTime' | 'operation' | 'entityType' | 'metadata'>
  >;
  snapshots: Array<
    Pick<
      typeof fundSnapshots.$inferSelect,
      'id' | 'snapshotTime' | 'eventCount' | 'stateHash' | 'metadata'
    >
  >;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ComparisonResult {
  fundId: string;
  comparison: {
    timestamp1: string;
    timestamp2: string;
    state1: {
      snapshotId: string;
      eventCount: number;
    };
    state2: {
      snapshotId: string;
      eventCount: number;
    };
  };
  differences: import('fast-json-patch').Operation[] | null;
  summary: {
    totalChanges: number;
    timeSpan: number;
  };
}

export interface LatestEventResult {
  id: string;
  fundId: number;
  eventType: string;
  eventTime: Date;
  operation: string;
  entityType: string;
  metadata: Record<string, unknown> | null;
  fundName: string | null;
}

/**
 * Time-Travel Analytics Service
 *
 * Handles business logic for:
 * - Point-in-time state reconstruction
 * - Timeline event retrieval with pagination
 * - State comparison between timestamps
 * - Latest events across all funds
 */
export class TimeTravelAnalyticsService {
  constructor(
    private db: NodePgDatabase<typeof schema>,
    private cache?: Cache,
    private loggerInstance = logger
  ) {}

  /**
   * Get fund state at a specific point in time
   *
   * Uses caching and snapshot-based reconstruction:
   * 1. Check cache for existing result
   * 2. Find nearest snapshot before target time
   * 3. Count/retrieve events between snapshot and target
   * 4. Cache result for 5 minutes
   */
  async getStateAtTime(
    fundId: number,
    targetTime: Date,
    includeEvents = false
  ): Promise<FundStateAtTime> {
    // Check cache first
    if (this.cache) {
      const cacheKey = this.generateCacheKey(fundId, targetTime);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.loggerInstance.debug('Cache hit for state query', { fundId, targetTime });
        return JSON.parse(cached);
      }
    }

    // Find nearest snapshot before target time
    const [snapshot] = await this.db
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
      throw new NotFoundError(
        `No snapshot found for fund ${fundId} before ${targetTime.toISOString()}`
      );
    }

    // Get events between snapshot and target time
    const eventsAfterSnapshot = includeEvents
      ? await this.db
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

    const response: FundStateAtTime = {
      fundId,
      timestamp: targetTime.toISOString(),
      snapshot: {
        id: snapshot.id,
        time: snapshot.snapshotTime,
        eventCount: snapshot.eventCount ?? 0,
        stateHash: snapshot.stateHash ?? '',
      },
      state: snapshot.state as PortfolioState,
      eventsApplied: eventsAfterSnapshot.length,
      events: includeEvents ? eventsAfterSnapshot : undefined,
    };

    // Cache for 5 minutes
    if (this.cache) {
      const cacheKey = this.generateCacheKey(fundId, targetTime);
      await this.cache.set(cacheKey, JSON.stringify(response), 300);
    }

    return response;
  }

  /**
   * Get timeline events and snapshots for a fund
   *
   * Supports:
   * - Time range filtering (startTime, endTime)
   * - Pagination (limit, offset)
   * - Parallel query execution for performance
   */
  async getTimelineEvents(
    fundId: number,
    options: {
      startTime?: Date;
      endTime?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TimelineResult> {
    const { startTime, endTime, limit = 100, offset = 0 } = options;

    // Build query conditions
    const conditions = [eq(fundEvents.fundId, fundId)];
    if (startTime) conditions.push(gte(fundEvents.eventTime, startTime));
    if (endTime) conditions.push(lte(fundEvents.eventTime, endTime));

    // Fetch events with pagination and related snapshots in parallel
    const [events, snapshots] = await Promise.all([
      this.db
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
        .limit(limit)
        .offset(offset),

      // Get related snapshots
      this.db
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
            startTime ? gte(fundSnapshots.snapshotTime, startTime) : undefined,
            endTime ? lte(fundSnapshots.snapshotTime, endTime) : (undefined as SQL | undefined)
          )
        )
        .orderBy(desc(fundSnapshots.snapshotTime)),
    ]);

    // Count total events for pagination
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(fundEvents)
      .where(and(...conditions));

    return {
      fundId,
      timeRange: {
        start: startTime?.toISOString() || events[events.length - 1]?.eventTime,
        end: endTime?.toISOString() || events[0]?.eventTime,
      },
      events,
      snapshots,
      pagination: {
        total: Number(count),
        limit,
        offset,
        hasMore: offset + limit < Number(count),
      },
    };
  }

  /**
   * Compare fund states at two different timestamps
   *
   * Calculates differences and metrics:
   * - State snapshots at both times
   * - Differences (if requested)
   * - Time span and change count
   */
  async compareStates(
    fundId: number,
    timestamp1: Date,
    timestamp2: Date,
    includeDiff = true
  ): Promise<ComparisonResult> {
    // Fetch states at both timestamps in parallel
    const [state1, state2] = await Promise.all([
      this.fetchStateAtTime(fundId, timestamp1),
      this.fetchStateAtTime(fundId, timestamp2),
    ]);

    if (!state1 || !state2) {
      throw new NotFoundError('Could not retrieve states for comparison');
    }

    // Calculate differences if requested
    let differences = null;
    if (includeDiff && state1.state && state2.state) {
      // Use basic comparison for state differences
      differences = jsonpatch.compare(state1.state as object, state2.state as object);
    }

    return {
      fundId: String(fundId),
      comparison: {
        timestamp1: timestamp1.toISOString(),
        timestamp2: timestamp2.toISOString(),
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
        timeSpan: Math.abs(timestamp2.getTime() - timestamp1.getTime()),
      },
    };
  }

  /**
   * Get latest events across all funds
   *
   * Features:
   * - Optional event type filtering
   * - Limit control
   * - Fund name enrichment via left join
   */
  async getLatestEvents(
    limit = 20,
    eventTypes?: string[]
  ): Promise<{ events: LatestEventResult[]; timestamp: string }> {
    const conditions = [];
    if (eventTypes && eventTypes.length > 0) {
      conditions.push(sql`${fundEvents.eventType} = ANY(${eventTypes})`);
    }

    const events = await this.db
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

    return {
      events,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Private helper: Fetch state at time (used by compareStates)
   *
   * Similar to getStateAtTime but returns minimal structure
   * without caching (used internally for comparisons)
   */
  private async fetchStateAtTime(fundId: number, targetTime: Date) {
    // Find nearest snapshot
    const [snapshot] = await this.db
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
    const eventsCount = await this.db
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

  /**
   * Generate cache key for state queries
   */
  private generateCacheKey(fundId: number, targetTime: Date): string {
    return `fund:${fundId}:state:${targetTime.getTime()}`;
  }
}
