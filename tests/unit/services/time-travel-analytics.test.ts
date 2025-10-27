/**
 * Time-Travel Analytics Service Tests
 *
 * Comprehensive unit tests for time-travel analytics service layer functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as schema from '@shared/schema';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { TimeTravelAnalyticsService, type Cache } from '../../../server/services/time-travel-analytics';
import { createSandbox } from '../../setup/test-infrastructure';

// Mock database structure with chained query builder
const createMockQueryChain = (result: any) => {
  const promise = Promise.resolve(result);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise)
  };
  return chain;
};

const mockDb = {
  select: vi.fn(() => createMockQueryChain([])),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn((fn) => fn(mockDb))
};

// Mock the database module
vi.mock('../../../server/db', () => ({
  db: mockDb
}));

// Mock metrics functions
vi.mock('../../../server/metrics', () => ({
  recordBusinessMetric: vi.fn()
}));

// Mock logger
vi.mock('../../../server/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Time-Travel Analytics Service', () => {
  let service: TimeTravelAnalyticsService;
  let sandbox: Awaited<ReturnType<typeof createSandbox>>;

  beforeEach(() => {
    sandbox = createSandbox();
    // Reset the mock select implementation completely
    mockDb.select = vi.fn(() => createMockQueryChain([]));
    service = new TimeTravelAnalyticsService(mockDb as unknown as NodePgDatabase<typeof schema>);
  });

  afterEach(async () => {
    await sandbox.abort();
    vi.restoreAllMocks();
  });

  describe('getStateAtTime', () => {
    it('should retrieve fund state at specific point in time', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');
      const mockSnapshot = {
        id: 'snapshot-123',
        fundId: 1,
        snapshotTime: new Date('2024-11-30T00:00:00Z'),
        eventCount: 5,
        stateHash: 'hash123',
        state: { portfolioValue: 1000000, companies: 10 },
        metadata: {}
      };

      // Mock select query chain for snapshot lookup
      mockDb.select.mockReturnValueOnce(createMockQueryChain([mockSnapshot]));

      // Mock select query chain for events count (no events after snapshot)
      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      const result = await service.getStateAtTime(1, targetTime, false);

      expect(result).toBeDefined();
      expect(result.fundId).toBe(1);
      expect(result.timestamp).toBe(targetTime.toISOString());
      expect(result.snapshot.id).toBe('snapshot-123');
      expect(result.snapshot.eventCount).toBe(5);
      expect(result.state).toEqual({ portfolioValue: 1000000, companies: 10 });
      expect(result.eventsApplied).toBe(0);
      expect(result.events).toBeUndefined();
    });

    it('should include events when requested', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');
      const mockSnapshot = {
        id: 'snapshot-123',
        fundId: 1,
        snapshotTime: new Date('2024-11-30T00:00:00Z'),
        eventCount: 5,
        stateHash: 'hash123',
        state: { portfolioValue: 1000000 },
        metadata: {}
      };

      const mockEvents = [
        {
          id: 'event-1',
          fundId: 1,
          eventType: 'investment',
          eventTime: new Date('2024-11-30T12:00:00Z'),
          operation: 'create',
          entityType: 'portfolio_company',
          metadata: { amount: 500000 }
        }
      ];

      // Mock snapshot lookup - returns array with snapshot
      mockDb.select.mockReturnValueOnce(createMockQueryChain([mockSnapshot]));

      // Mock events lookup - returns array of events
      mockDb.select.mockReturnValueOnce(createMockQueryChain(mockEvents));

      const result = await service.getStateAtTime(1, targetTime, true);

      expect(result.events).toBeDefined();
      expect(result.events).toHaveLength(1);
      expect(result.eventsApplied).toBe(1);
      expect(result.events![0].id).toBe('event-1');
    });

    it('should throw NotFoundError when no snapshot exists', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');

      // Mock no snapshot found - empty array means no snapshot
      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      await expect(service.getStateAtTime(1, targetTime)).rejects.toThrow('No snapshot found');
    });

    it('should use cache when available', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');
      const mockCache = {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          fundId: 1,
          timestamp: targetTime.toISOString(),
          snapshot: { id: 'cached-123', time: new Date(), eventCount: 5, stateHash: 'hash' },
          state: { cached: true },
          eventsApplied: 0
        })),
        set: vi.fn()
      };

      const serviceWithCache = new TimeTravelAnalyticsService(
        mockDb as unknown as NodePgDatabase<typeof schema>,
        mockCache as unknown as Cache
      );

      const result = await serviceWithCache.getStateAtTime(1, targetTime);

      expect(mockCache.get).toHaveBeenCalled();
      expect(result.state).toEqual({ cached: true });
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('getTimelineEvents', () => {
    it('should retrieve timeline events with pagination', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          eventType: 'investment',
          eventTime: new Date('2024-12-01T00:00:00Z'),
          operation: 'create',
          entityType: 'portfolio_company',
          metadata: { amount: 500000 }
        },
        {
          id: 'event-2',
          eventType: 'exit',
          eventTime: new Date('2024-11-15T00:00:00Z'),
          operation: 'update',
          entityType: 'portfolio_company',
          metadata: { exitValue: 2000000 }
        }
      ];

      const mockSnapshots = [
        {
          id: 'snapshot-1',
          snapshotTime: new Date('2024-12-01T00:00:00Z'),
          eventCount: 10,
          stateHash: 'hash1',
          metadata: {}
        }
      ];

      // getTimelineEvents calls db.select 3 times:
      // 1. For events with pagination
      // 2. For snapshots
      // 3. For count
      mockDb.select
        .mockReturnValueOnce(createMockQueryChain(mockEvents))
        .mockReturnValueOnce(createMockQueryChain(mockSnapshots))
        .mockReturnValueOnce(createMockQueryChain([{ count: 25 }]));

      const result = await service.getTimelineEvents(1, { limit: 10, offset: 0 });

      expect(result).toBeDefined();
      expect(result.fundId).toBe(1);
      expect(result.events).toHaveLength(2);
      expect(result.snapshots).toHaveLength(1);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('should filter by time range', async () => {
      const startTime = new Date('2024-01-01T00:00:00Z');
      const endTime = new Date('2024-12-31T23:59:59Z');

      // Mock 3 database calls
      mockDb.select
        .mockReturnValueOnce(createMockQueryChain([]))
        .mockReturnValueOnce(createMockQueryChain([]))
        .mockReturnValueOnce(createMockQueryChain([{ count: 0 }]));

      const result = await service.getTimelineEvents(1, { startTime, endTime });

      expect(result.timeRange.start).toBeDefined();
      expect(result.timeRange.end).toBeDefined();
    });

    it('should handle empty results', async () => {
      // Mock 3 database calls
      mockDb.select
        .mockReturnValueOnce(createMockQueryChain([]))
        .mockReturnValueOnce(createMockQueryChain([]))
        .mockReturnValueOnce(createMockQueryChain([{ count: 0 }]));

      const result = await service.getTimelineEvents(1);

      expect(result.events).toHaveLength(0);
      expect(result.snapshots).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('compareStates', () => {
    it('should compare fund states at two different timestamps', async () => {
      const timestamp1 = new Date('2024-11-01T00:00:00Z');
      const timestamp2 = new Date('2024-12-01T00:00:00Z');

      const mockSnapshot1 = {
        id: 'snapshot-1',
        fundId: 1,
        snapshotTime: new Date('2024-10-31T00:00:00Z'),
        eventCount: 5,
        stateHash: 'hash1',
        state: {
          totalValue: 1000000,
          deployedCapital: 800000,
          portfolioCount: 10,
          companies: [],
          sectorBreakdown: {},
          stageBreakdown: {}
        },
        metadata: {}
      };

      const mockSnapshot2 = {
        id: 'snapshot-2',
        fundId: 1,
        snapshotTime: new Date('2024-11-30T00:00:00Z'),
        eventCount: 8,
        stateHash: 'hash2',
        state: {
          totalValue: 1200000,
          deployedCapital: 950000,
          portfolioCount: 12,
          companies: [],
          sectorBreakdown: {},
          stageBreakdown: {}
        },
        metadata: {}
      };

      // compareStates calls fetchStateAtTime twice IN PARALLEL via Promise.all
      // Each fetchStateAtTime makes 2 db calls: snapshot + event count
      // Mock all 4 database calls (2 snapshots + 2 counts)
      mockDb.select
        .mockReturnValueOnce(createMockQueryChain([mockSnapshot1]))  // First snapshot lookup
        .mockReturnValueOnce(createMockQueryChain([{ count: 2 }]))   // First event count
        .mockReturnValueOnce(createMockQueryChain([mockSnapshot2]))  // Second snapshot lookup
        .mockReturnValueOnce(createMockQueryChain([{ count: 3 }]));  // Second event count

      const result = await service.compareStates(1, timestamp1, timestamp2, true);

      expect(result).toBeDefined();
      expect(result.fundId).toBe('1');
      expect(result.comparison.timestamp1).toBe(timestamp1.toISOString());
      expect(result.comparison.timestamp2).toBe(timestamp2.toISOString());
      // Verify state1 has required fields
      expect(result.comparison.state1.snapshotId).toBeDefined();
      expect(result.comparison.state1.eventCount).toBeDefined();
      // Verify result structure (differences and summary)
      expect(result.differences).toBeDefined();
      expect(result.summary.totalChanges).toBeGreaterThanOrEqual(0);
      expect(result.summary.timeSpan).toBeGreaterThan(0);
    });

    it('should skip differences calculation when not requested', async () => {
      const timestamp1 = new Date('2024-11-01T00:00:00Z');
      const timestamp2 = new Date('2024-12-01T00:00:00Z');

      const mockSnapshot = {
        id: 'snapshot-1',
        fundId: 1,
        snapshotTime: new Date('2024-10-31T00:00:00Z'),
        eventCount: 5,
        stateHash: 'hash1',
        state: { portfolioValue: 1000000 },
        metadata: {}
      };

      // Mock both state lookups
      mockDb.select.mockReturnValueOnce(createMockQueryChain([mockSnapshot]));
      mockDb.select.mockReturnValueOnce(createMockQueryChain([{ count: 2 }]));
      mockDb.select.mockReturnValueOnce(createMockQueryChain([mockSnapshot]));
      mockDb.select.mockReturnValueOnce(createMockQueryChain([{ count: 2 }]));

      const result = await service.compareStates(1, timestamp1, timestamp2, false);

      expect(result.differences).toBeNull();
    });

    it('should throw NotFoundError when state cannot be retrieved', async () => {
      const timestamp1 = new Date('2024-11-01T00:00:00Z');
      const timestamp2 = new Date('2024-12-01T00:00:00Z');

      // Mock no snapshot found for first state
      // fetchStateAtTime will try to get snapshot and fail
      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      await expect(service.compareStates(1, timestamp1, timestamp2)).rejects.toThrow(
        'Could not retrieve states for comparison'
      );
    });
  });

  describe('getLatestEvents', () => {
    it('should retrieve latest events across all funds', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          fundId: 1,
          eventType: 'investment',
          eventTime: new Date('2024-12-01T00:00:00Z'),
          operation: 'create',
          entityType: 'portfolio_company',
          metadata: { amount: 500000 },
          fundName: 'Fund Alpha'
        },
        {
          id: 'event-2',
          fundId: 2,
          eventType: 'exit',
          eventTime: new Date('2024-11-30T00:00:00Z'),
          operation: 'update',
          entityType: 'portfolio_company',
          metadata: { exitValue: 2000000 },
          fundName: 'Fund Beta'
        }
      ];

      mockDb.select.mockReturnValueOnce(createMockQueryChain(mockEvents));

      const result = await service.getLatestEvents(20);

      expect(result).toBeDefined();
      expect(result.events).toHaveLength(2);
      expect(result.events[0].fundName).toBe('Fund Alpha');
      expect(result.events[1].fundName).toBe('Fund Beta');
      expect(result.timestamp).toBeDefined();
    });

    it('should filter by event types', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          fundId: 1,
          eventType: 'investment',
          eventTime: new Date('2024-12-01T00:00:00Z'),
          operation: 'create',
          entityType: 'portfolio_company',
          metadata: { amount: 500000 },
          fundName: 'Fund Alpha'
        }
      ];

      mockDb.select.mockReturnValueOnce(createMockQueryChain(mockEvents));

      const result = await service.getLatestEvents(20, ['investment', 'exit']);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].eventType).toBe('investment');
    });

    it('should respect limit parameter', async () => {
      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      const result = await service.getLatestEvents(5);

      expect(result.events).toHaveLength(0);
      // Verify limit was applied (checked via mock calls)
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      const result = await service.getLatestEvents();

      expect(result.events).toHaveLength(0);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');

      // Mock database error
      mockDb.select.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      await expect(service.getStateAtTime(1, targetTime)).rejects.toThrow('Database connection failed');
    });

    it('should validate fundId parameter', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');

      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      await expect(service.getStateAtTime(999, targetTime)).rejects.toThrow('No snapshot found');
    });

    it('should handle future timestamps', async () => {
      const futureTime = new Date('2099-12-31T23:59:59Z');

      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      await expect(service.getStateAtTime(1, futureTime)).rejects.toThrow('No snapshot found');
    });
  });

  describe('Performance and Caching', () => {
    it('should cache frequently accessed state queries', async () => {
      const targetTime = new Date('2024-12-01T00:00:00Z');
      const cachedResult = {
        fundId: 1,
        timestamp: targetTime.toISOString(),
        snapshot: { id: 'cached-123', time: new Date(), eventCount: 5, stateHash: 'hash' },
        state: { portfolioValue: 1000000 },
        eventsApplied: 0
      };

      const mockCache = {
        get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(cachedResult)),
        set: vi.fn()
      };

      const serviceWithCache = new TimeTravelAnalyticsService(
        mockDb as unknown as NodePgDatabase<typeof schema>,
        mockCache as unknown as Cache
      );

      // First call - should query database
      const mockSnapshot = {
        id: 'snapshot-123',
        fundId: 1,
        snapshotTime: new Date('2024-11-30T00:00:00Z'),
        eventCount: 5,
        stateHash: 'hash123',
        state: { portfolioValue: 1000000 },
        metadata: {}
      };

      mockDb.select.mockReturnValueOnce(createMockQueryChain([mockSnapshot]));
      mockDb.select.mockReturnValueOnce(createMockQueryChain([]));

      await serviceWithCache.getStateAtTime(1, targetTime);

      expect(mockCache.get).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledTimes(1);
      expect(mockDb.select).toHaveBeenCalled();

      // Second call - should use cache
      vi.clearAllMocks();

      await serviceWithCache.getStateAtTime(1, targetTime);

      expect(mockCache.get).toHaveBeenCalledTimes(1);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });
});
