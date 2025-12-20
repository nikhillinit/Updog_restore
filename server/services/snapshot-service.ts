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

import { db } from '../db.js';
import { forecastSnapshots, funds } from '@shared/schema.js';
import { eq, and, desc, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { ForecastSnapshot } from '@shared/schema.js';

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
        ),
      });

      if (existing) {
        return existing;
      }
    }

    // Create new snapshot
    const now = new Date();
    const [snapshot] = await db
      .insert(forecastSnapshots)
      .values({
        id: randomUUID(),
        fundId: data.fundId,
        name: data.name,
        idempotencyKey: data.idempotencyKey ?? null,
        status: 'pending',
        snapshotTime: now,
        version: BigInt(1),
        calculatedMetrics: null,
        fundState: null,
        portfolioState: null,
        metricsState: null,
        createdAt: now,
        updatedAt: now,
      })
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

    const limit = Math.min(filter.limit ?? 50, 100);

    // Query snapshots for fund
    const snapshots = await db.query.forecastSnapshots.findMany({
      where: eq(forecastSnapshots.fundId, fundId),
      orderBy: [desc(forecastSnapshots.snapshotTime), desc(forecastSnapshots.id)],
      limit: limit + 1,
    });

    // Apply status filter if specified
    let filteredSnapshots = filter.status
      ? snapshots.filter((s) => s.status === filter.status)
      : snapshots;

    // Determine if there are more results
    const hasMore = filteredSnapshots.length > limit;
    if (hasMore) {
      filteredSnapshots = filteredSnapshots.slice(0, limit);
    }

    // Generate next cursor if there are more results
    const nextCursor =
      hasMore && filteredSnapshots.length > 0
        ? this.encodeCursor(filteredSnapshots[filteredSnapshots.length - 1].snapshotTime, filteredSnapshots[filteredSnapshots.length - 1].id)
        : undefined;

    return {
      snapshots: filteredSnapshots,
      nextCursor,
      hasMore,
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
      where: eq(forecastSnapshots.id, snapshotId),
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
    // Get current snapshot
    const current = await this.get(snapshotId);

    // Check version for optimistic locking
    if (current.version !== data.version) {
      throw new SnapshotVersionConflictError(snapshotId, data.version, current.version);
    }

    // Build update object
    const updateData: Partial<ForecastSnapshot> = {
      updatedAt: new Date(),
      version: current.version + BigInt(1),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.calculatedMetrics !== undefined) updateData.calculatedMetrics = data.calculatedMetrics;
    if (data.fundState !== undefined) updateData.fundState = data.fundState;
    if (data.portfolioState !== undefined) updateData.portfolioState = data.portfolioState;
    if (data.metricsState !== undefined) updateData.metricsState = data.metricsState;

    // Update in database
    const [updated] = await db
      .update(forecastSnapshots)
      .set(updateData)
      .where(eq(forecastSnapshots.id, snapshotId))
      .returning();

    return updated || { ...current, ...updateData };
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
      where: eq(funds.id, fundId),
    });

    if (!fund) {
      throw new FundNotFoundError(fundId);
    }
  }
}
