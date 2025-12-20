/**
 * Snapshot Service Tests (Phase 0-ALPHA - TDD RED Phase)
 *
 * Tests for SnapshotService covering:
 * - create() with valid data
 * - create() with duplicate idempotency key
 * - list() with pagination
 * - get() by ID
 * - update() with version conflict (409)
 *
 * Version: 1.0.0 (Phase 0-ALPHA)
 * Created: 2025-11-10
 *
 * @module tests/services/snapshot-service.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SnapshotService,
  type CreateSnapshotData,
  type UpdateSnapshotData,
  SnapshotNotFoundError,
  SnapshotVersionConflictError,
  FundNotFoundError,
} from '@/server/services/snapshot-service';
import { createTestSnapshot, SAMPLE_SNAPSHOTS } from '../../fixtures/portfolio-fixtures';
import {
  assertValidSnapshot,
  assertValidUUID,
  generateIdempotencyKey,
} from '../../utils/portfolio-test-utils';
import { databaseMock } from '../../helpers/database-mock';

// Helper to create and insert a test snapshot into mock
function createAndInsertSnapshot(overrides?: Partial<ReturnType<typeof createTestSnapshot>>) {
  const snapshot = createTestSnapshot(overrides);
  const existing = databaseMock.getMockData('forecast_snapshots') || [];
  databaseMock.setMockData('forecast_snapshots', [...existing, snapshot]);
  return snapshot;
}

describe('SnapshotService (Phase 0-ALPHA - TDD RED)', () => {
  let service: SnapshotService;

  beforeEach(() => {
    // Reset mock data between tests to ensure isolation
    databaseMock.setMockData('forecast_snapshots', []);
    service = new SnapshotService();
  });

  describe('create()', () => {
    it('should create a snapshot with valid data', async () => {
      // ARRANGE
      const data: CreateSnapshotData = {
        fundId: 1,
        name: 'Q4 2024 Forecast',
        idempotencyKey: generateIdempotencyKey(),
      };

      // ACT
      const snapshot = await service.create(data);

      // ASSERT
      assertValidSnapshot(snapshot);
      expect(snapshot.fundId).toBe(data.fundId);
      expect(snapshot.name).toBe(data.name);
      expect(snapshot.status).toBe('pending');
      expect(snapshot.version).toBe(BigInt(1));
      expect(snapshot.idempotencyKey).toBe(data.idempotencyKey);
      assertValidUUID(snapshot.id);
      expect(snapshot.createdAt).toBeInstanceOf(Date);
      expect(snapshot.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a snapshot without idempotency key', async () => {
      // ARRANGE
      const data: CreateSnapshotData = {
        fundId: 1,
        name: 'Q4 2024 Forecast',
      };

      // ACT
      const snapshot = await service.create(data);

      // ASSERT
      assertValidSnapshot(snapshot);
      expect(snapshot.idempotencyKey).toBeNull();
    });

    it('should return existing snapshot on duplicate idempotency key', async () => {
      // ARRANGE
      const idempotencyKey = generateIdempotencyKey();
      const data: CreateSnapshotData = {
        fundId: 1,
        name: 'Q4 2024 Forecast',
        idempotencyKey,
      };

      // ACT
      const first = await service.create(data);
      const second = await service.create(data); // Duplicate request

      // ASSERT
      expect(first.id).toBe(second.id);
      expect(first.version).toBe(second.version);
      expect(first.createdAt).toEqual(second.createdAt);
    });

    it('should throw FundNotFoundError if fund does not exist', async () => {
      // ARRANGE
      const data: CreateSnapshotData = {
        fundId: 99999, // Non-existent fund
        name: 'Q4 2024 Forecast',
      };

      // ACT & ASSERT
      await expect(service.create(data)).rejects.toThrow(FundNotFoundError);
      await expect(service.create(data)).rejects.toThrow('Fund not found: 99999');
    });

    it('should initialize snapshot with pending status', async () => {
      // ARRANGE
      const data: CreateSnapshotData = {
        fundId: 1,
        name: 'Q4 2024 Forecast',
      };

      // ACT
      const snapshot = await service.create(data);

      // ASSERT
      expect(snapshot.status).toBe('pending');
      expect(snapshot.calculatedMetrics).toBeNull();
      expect(snapshot.fundState).toBeNull();
      expect(snapshot.portfolioState).toBeNull();
      expect(snapshot.metricsState).toBeNull();
    });
  });

  describe('list()', () => {
    it('should list snapshots with default pagination', async () => {
      // ARRANGE
      const fundId = 1;

      // ACT
      const result = await service.list(fundId, {});

      // ASSERT
      expect(result).toHaveProperty('snapshots');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.snapshots)).toBe(true);
      expect(typeof result.hasMore).toBe('boolean');

      if (result.snapshots.length > 0) {
        result.snapshots.forEach(assertValidSnapshot);
      }
    });

    it('should filter snapshots by status', async () => {
      // ARRANGE
      const fundId = 1;

      // ACT
      const result = await service.list(fundId, { status: 'complete' });

      // ASSERT
      expect(result.snapshots).toBeDefined();
      result.snapshots.forEach((snapshot) => {
        expect(snapshot.status).toBe('complete');
      });
    });

    it('should respect limit parameter', async () => {
      // ARRANGE
      const fundId = 1;
      const limit = 5;

      // ACT
      const result = await service.list(fundId, { limit });

      // ASSERT
      expect(result.snapshots.length).toBeLessThanOrEqual(limit);
    });

    it('should paginate with cursor', async () => {
      // ARRANGE
      const fundId = 1;
      const limit = 2;

      // ACT
      const page1 = await service.list(fundId, { limit });

      // ASSERT
      if (page1.hasMore) {
        expect(page1.nextCursor).toBeDefined();

        const page2 = await service.list(fundId, {
          limit,
          cursor: page1.nextCursor,
        });

        expect(page2.snapshots.length).toBeGreaterThan(0);

        // Ensure no duplicate IDs between pages
        const page1Ids = page1.snapshots.map((s) => s.id);
        const page2Ids = page2.snapshots.map((s) => s.id);
        const intersection = page1Ids.filter((id) => page2Ids.includes(id));
        expect(intersection.length).toBe(0);
      }
    });

    it('should return empty array if no snapshots exist', async () => {
      // ARRANGE
      const fundId = 1;

      // ACT
      const result = await service.list(fundId, {});

      // ASSERT
      expect(result.snapshots).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('should throw FundNotFoundError if fund does not exist', async () => {
      // ARRANGE
      const fundId = 99999;

      // ACT & ASSERT
      await expect(service.list(fundId, {})).rejects.toThrow(FundNotFoundError);
    });
  });

  describe('get()', () => {
    it('should retrieve snapshot by ID', async () => {
      // ARRANGE - Insert snapshot into mock first
      const testSnapshot = createAndInsertSnapshot();

      // ACT
      const snapshot = await service.get(testSnapshot.id);

      // ASSERT
      assertValidSnapshot(snapshot);
      expect(snapshot.id).toBe(testSnapshot.id);
    });

    it('should throw SnapshotNotFoundError if snapshot does not exist', async () => {
      // ARRANGE
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      // ACT & ASSERT
      await expect(service.get(nonExistentId)).rejects.toThrow(SnapshotNotFoundError);
      await expect(service.get(nonExistentId)).rejects.toThrow(
        `Snapshot not found: ${nonExistentId}`
      );
    });

    it('should return snapshot with all fields populated', async () => {
      // ARRANGE - Insert snapshot into mock first
      const testSnapshot = createAndInsertSnapshot({
        status: 'complete',
        calculatedMetrics: { irr: 0.18 },
      });

      // ACT
      const snapshot = await service.get(testSnapshot.id);

      // ASSERT
      expect(snapshot.status).toBe('complete');
      expect(snapshot.calculatedMetrics).toBeDefined();
    });
  });

  describe('update()', () => {
    it('should update snapshot with valid version', async () => {
      // ARRANGE - Insert snapshot into mock first
      const testSnapshot = createAndInsertSnapshot();
      const updateData: UpdateSnapshotData = {
        status: 'calculating',
        version: testSnapshot.version,
      };

      // ACT
      const updated = await service.update(testSnapshot.id, updateData);

      // ASSERT
      assertValidSnapshot(updated);
      expect(updated.status).toBe('calculating');
      expect(updated.version).toBe(testSnapshot.version + BigInt(1));
    });

    it('should update calculated metrics', async () => {
      // ARRANGE - Insert snapshot into mock first
      const testSnapshot = createAndInsertSnapshot({ status: 'calculating' });
      const updateData: UpdateSnapshotData = {
        status: 'complete',
        calculatedMetrics: {
          irr: 0.185,
          moic: 2.4,
          dpi: 0.92,
        },
        version: testSnapshot.version,
      };

      // ACT
      const updated = await service.update(testSnapshot.id, updateData);

      // ASSERT
      expect(updated.status).toBe('complete');
      expect(updated.calculatedMetrics).toEqual(updateData.calculatedMetrics);
      expect(updated.version).toBe(testSnapshot.version + BigInt(1));
    });

    it('should throw SnapshotVersionConflictError on version mismatch', async () => {
      // ARRANGE - Insert snapshot into mock first
      const testSnapshot = createAndInsertSnapshot();
      const staleVersion = testSnapshot.version - BigInt(1); // Stale version

      const updateData: UpdateSnapshotData = {
        status: 'calculating',
        version: staleVersion,
      };

      // ACT & ASSERT
      await expect(service.update(testSnapshot.id, updateData)).rejects.toThrow(
        SnapshotVersionConflictError
      );
    });

    it('should throw SnapshotNotFoundError if snapshot does not exist', async () => {
      // ARRANGE
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const updateData: UpdateSnapshotData = {
        status: 'calculating',
        version: BigInt(1),
      };

      // ACT & ASSERT
      await expect(service.update(nonExistentId, updateData)).rejects.toThrow(
        SnapshotNotFoundError
      );
    });

    it('should update multiple fields atomically', async () => {
      // ARRANGE - Insert snapshot into mock first
      const testSnapshot = createAndInsertSnapshot({ status: 'calculating' });
      const updateData: UpdateSnapshotData = {
        status: 'complete',
        calculatedMetrics: { irr: 0.18 },
        fundState: { fundSize: 100_000_000 },
        portfolioState: { companyCount: 18 },
        metricsState: { calculationTime: 2850 },
        version: testSnapshot.version,
      };

      // ACT
      const updated = await service.update(testSnapshot.id, updateData);

      // ASSERT
      expect(updated.status).toBe('complete');
      expect(updated.calculatedMetrics).toEqual(updateData.calculatedMetrics);
      expect(updated.fundState).toEqual(updateData.fundState);
      expect(updated.portfolioState).toEqual(updateData.portfolioState);
      expect(updated.metricsState).toEqual(updateData.metricsState);
    });
  });
});
