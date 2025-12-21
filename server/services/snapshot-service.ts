/**
 * Snapshot Service
 *
 * Handles forecast snapshot operations including creation, retrieval, listing, and updates.
 * Uses database-level idempotency and optimistic locking for consistency.
 *
 * Version: 1.0.0 (Phase 0-ALPHA)
 * Created: 2025-11-10
 *
 * @module server/services/snapshot-service
 */

import { db } from '../db';
import { forecastSnapshots, funds } from '@shared/schema';
import type { ForecastSnapshot, InsertForecastSnapshot } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * Create snapshot request data
 */
export interface CreateSnapshotData {
  fundId: number;
  name: string;
  idempotencyKey?: string | null;
}

/**
 * Update snapshot request data
 */
export interface UpdateSnapshotData {
  name?: string;
  status?: 'pending' | 'calculating' | 'complete' | 'error';
  calculatedMetrics?: Record<string, unknown> | null;
  fundState?: Record<string, unknown> | null;
  portfolioState?: Record<string, unknown> | null;
  metricsState?: Record<string, unknown> | null;
  version: bigint;
}

/**
 * List snapshots filter
 */
export interface ListSnapshotsFilter {
  cursor?: string;
  limit?: number;
  status?: 'pending' | 'calculating' | 'complete' | 'error';
}

/**
 * Paginated snapshots result
 */
export interface PaginatedSnapshots {
  snapshots: ForecastSnapshot[];
  nextCursor?: string;
  hasMore: boolean;
}

// =====================
// ERROR CLASSES
// =====================

/**
 * Error thrown when snapshot is not found
 */
export class SnapshotNotFoundError extends Error {
  constructor(snapshotId: string) {
    super(`Snapshot not found: ${snapshotId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

/**
 * Error thrown when version conflict occurs (optimistic locking)
 */
export class SnapshotVersionConflictError extends Error {
  constructor(snapshotId: string, expectedVersion: bigint, currentVersion: bigint) {
    super(
      `Version conflict for snapshot ${snapshotId}: expected ${expectedVersion}, current ${currentVersion}`
    );
    this.name = 'SnapshotVersionConflictError';
  }
}

/**
 * Error thrown when fund is not found
 */
export class FundNotFoundError extends Error {
  constructor(fundId: number) {
    super(`Fund not found: ${fundId}`);
    this.name = 'FundNotFoundError';
  }
}

// =====================
// SERVICE CLASS
// =====================

/**
 * SnapshotService
 *
 * Provides methods for managing forecast snapshots with:
 * - Database-level idempotency
 * - Optimistic locking with version field
 * - Cursor-based pagination
 * - Status filtering
 *
 * @example
 * const service = new SnapshotService();
 * const snapshot = await service.create({
 *   fundId: 1,
 *   name: 'Q4 2024',
 *   idempotencyKey: 'unique-key',
 * });
 */
export class SnapshotService {
  /**
   * Create a new forecast snapshot
   *
   * Creates a snapshot with status 'pending'. Uses database-level idempotency
   * via unique index on (fundId, idempotencyKey).
   *
   * @param data - Snapshot creation data
   * @returns Created snapshot
   * @throws FundNotFoundError if fund does not exist
   * @throws Error if idempotency key collision with different data
   *
   * @example
   * const snapshot = await service.create({
   *   fundId: 1,
   *   name: 'Q4 2024',
   *   idempotencyKey: 'key123',
   * });
   */
  async create(data: CreateSnapshotData): Promise<ForecastSnapshot> {
    // Verify fund exists
    await this.verifyFundExists(data.fundId);

    // Check for existing snapshot with same idempotency key
    if (data.idempotencyKey) {
      const existing = await db.query.forecastSnapshots.findFirst({
        where: and(
          eq(forecastSnapshots.fundId, data.fundId),
          eq(forecastSnapshots.idempotencyKey, data.idempotencyKey)
        )
      });

      if (existing) {
        return existing;
      }
    }

    // Create new snapshot
    const now = new Date();
    const snapshotData: InsertForecastSnapshot = {
      fundId: data.fundId,
      name: data.name,
      status: 'pending',
      sourceHash: null,
      calculatedMetrics: null,
      fundState: null,
      portfolioState: null,
      metricsState: null,
      snapshotTime: now,
      version: BigInt(1),
      idempotencyKey: data.idempotencyKey ?? null,
      createdAt: now,
      updatedAt: now
    };

    const [snapshot] = await db.insert(forecastSnapshots)
      .values(snapshotData)
      .returning();

    return snapshot;
  }

  /**
   * List snapshots for a fund with pagination
   *
   * Returns snapshots ordered by snapshotTime DESC, with cursor-based pagination.
   * Supports filtering by status.
   *
   * @param fundId - Fund ID
   * @param filter - List filter options
   * @returns Paginated snapshots result
   * @throws FundNotFoundError if fund does not exist
   *
   * @example
   * const result = await service.list(1, {
   *   status: 'complete',
   *   limit: 20,
   * });
   * console.log(result.snapshots); // Max 20 items
   * console.log(result.hasMore); // true if more results available
   */
  async list(fundId: number, filter: ListSnapshotsFilter): Promise<PaginatedSnapshots> {
    // Verify fund exists
    await this.verifyFundExists(fundId);

    const limit = filter.limit ?? 50;
    const conditions = [eq(forecastSnapshots.fundId, fundId)];

    // Add status filter if provided
    if (filter.status) {
      conditions.push(eq(forecastSnapshots.status, filter.status));
    }

    // Add cursor filter if provided
    if (filter.cursor) {
      const { timestamp, id } = this.decodeCursor(filter.cursor);
      conditions.push(
        sql`(${forecastSnapshots.snapshotTime}, ${forecastSnapshots.id}) < (${timestamp}, ${id})`
      );
    }

    // Fetch limit + 1 to detect if there are more results
    const snapshots = await db.query.forecastSnapshots.findMany({
      where: and(...conditions),
      orderBy: [desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id)],
      limit: limit + 1
    });

    const hasMore = snapshots.length > limit;
    const resultSnapshots = hasMore ? snapshots.slice(0, limit) : snapshots;

    let nextCursor: string | undefined;
    if (hasMore && resultSnapshots.length > 0) {
      const lastSnapshot = resultSnapshots[resultSnapshots.length - 1];
      nextCursor = this.encodeCursor(lastSnapshot.snapshotTime, lastSnapshot.id);
    }

    return {
      snapshots: resultSnapshots,
      nextCursor,
      hasMore
    };
  }

  /**
   * Get a snapshot by ID
   *
   * @param snapshotId - Snapshot UUID
   * @returns Snapshot
   * @throws SnapshotNotFoundError if snapshot does not exist
   *
   * @example
   * const snapshot = await service.get('uuid');
   */
  async get(snapshotId: string): Promise<ForecastSnapshot> {
    const snapshot = await db.query.forecastSnapshots.findFirst({
      where: eq(forecastSnapshots.id, snapshotId)
    });

    if (!snapshot) {
      throw new SnapshotNotFoundError(snapshotId);
    }

    return snapshot;
  }

  /**
   * Update a snapshot with optimistic locking
   *
   * Updates snapshot fields using version field for optimistic locking.
   * Increments version on successful update.
   *
   * @param snapshotId - Snapshot UUID
   * @param data - Update data including current version
   * @returns Updated snapshot with incremented version
   * @throws SnapshotNotFoundError if snapshot does not exist
   * @throws SnapshotVersionConflictError if version mismatch (409)
   *
   * @example
   * const updated = await service.update('uuid', {
   *   status: 'complete',
   *   calculatedMetrics: { irr: 0.18 },
   *   version: BigInt(1), // Current version
   * });
   * console.log(updated.version); // BigInt(2)
   */
  async update(snapshotId: string, data: UpdateSnapshotData): Promise<ForecastSnapshot> {
    // Get current snapshot to verify existence and version
    const current = await db.query.forecastSnapshots.findFirst({
      where: eq(forecastSnapshots.id, snapshotId)
    });

    if (!current) {
      throw new SnapshotNotFoundError(snapshotId);
    }

    // Check version for optimistic locking
    if (current.version !== data.version) {
      throw new SnapshotVersionConflictError(snapshotId, data.version, current.version);
    }

    // Build update object with only provided fields
    const updateData: Partial<InsertForecastSnapshot> = {
      updatedAt: new Date(),
      version: current.version + BigInt(1)
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.calculatedMetrics !== undefined) {
      updateData.calculatedMetrics = data.calculatedMetrics;
    }
    if (data.fundState !== undefined) {
      updateData.fundState = data.fundState;
    }
    if (data.portfolioState !== undefined) {
      updateData.portfolioState = data.portfolioState;
    }
    if (data.metricsState !== undefined) {
      updateData.metricsState = data.metricsState;
    }

    // Perform update
    const [updated] = await db.update(forecastSnapshots)
      ['set'](updateData)
      .where(and(
        eq(forecastSnapshots.id, snapshotId),
        eq(forecastSnapshots.version, data.version)
      ))
      .returning();

    if (!updated) {
      throw new SnapshotVersionConflictError(snapshotId, data.version, current.version);
    }

    return updated;
  }

  // =====================
  // PRIVATE HELPERS
  // =====================

  /**
   * Encode cursor for pagination
   *
   * @param timestamp - Snapshot timestamp
   * @param id - Snapshot ID
   * @returns Base64-encoded cursor
   */
  private encodeCursor(timestamp: Date, id: string): string {
    return Buffer.from(JSON.stringify({ timestamp: timestamp.toISOString(), id })).toString(
      'base64'
    );
  }

  /**
   * Decode cursor for pagination
   *
   * @param cursor - Base64-encoded cursor
   * @returns Decoded timestamp and ID
   */
  private decodeCursor(cursor: string): { timestamp: Date; id: string } {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      return {
        timestamp: new Date(decoded.timestamp),
        id: decoded.id,
      };
    } catch {
      throw new Error(`Invalid cursor format`);
    }
  }

  /**
   * Verify fund exists
   *
   * @param fundId - Fund ID
   * @throws FundNotFoundError if fund does not exist
   */
  private async verifyFundExists(fundId: number): Promise<void> {
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId)
    });

    if (!fund) {
      throw new FundNotFoundError(fundId);
    }
  }
}
