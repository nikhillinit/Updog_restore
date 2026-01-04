/**
 * Snapshot Version Service
 *
 * Manages version history for forecast snapshots with simple named versions.
 * Supports 90-day auto-pruning with pin capability.
 *
 * @module server/services/snapshot-version-service
 */

import { db } from '../db';
import { snapshotVersions, forecastSnapshots } from '@shared/schema';
import type { SnapshotVersion, InsertSnapshotVersion } from '@shared/schema';
import { eq, and, desc, lt, sql, type SQL } from 'drizzle-orm';
import { typedFindFirst, typedFindMany, typedInsert, typedUpdate } from '../db/typed-query';
import { createHash } from 'crypto';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Create version request data
 */
export interface CreateVersionData {
  snapshotId: string;
  stateSnapshot: Record<string, unknown>;
  calculatedMetrics?: Record<string, unknown> | null;
  versionName?: string;
  description?: string;
  createdBy?: string;
  tags?: string[];
  isPinned?: boolean;
}

/**
 * List versions filter
 */
export interface ListVersionsFilter {
  snapshotId: string;
  cursor?: string;
  limit?: number;
  includeExpired?: boolean;
}

/**
 * Paginated versions result
 */
export interface PaginatedVersions {
  versions: SnapshotVersion[];
  nextCursor?: string;
  hasMore: boolean;
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Error thrown when version is not found
 */
export class VersionNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Version not found: ${versionId}`);
    this.name = 'VersionNotFoundError';
  }
}

/**
 * Error thrown when snapshot is not found
 */
export class SnapshotNotFoundError extends Error {
  constructor(snapshotId: string) {
    super(`Snapshot not found: ${snapshotId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * SnapshotVersionService
 *
 * Provides methods for managing snapshot versions with:
 * - Sequential version numbering
 * - Named versions for what-if scenarios
 * - Pin/unpin for retention control
 * - 90-day auto-expiration for unpinned versions
 * - Cursor-based pagination
 */
export class SnapshotVersionService {
  /**
   * Create a new version
   *
   * Automatically increments version number, sets parent reference,
   * and marks as current version. Expires in 90 days unless pinned.
   */
  async createVersion(data: CreateVersionData): Promise<SnapshotVersion> {
    // Verify snapshot exists
    await this.verifySnapshotExists(data.snapshotId);

    // Get the current head version (if any)
    const currentHead = await typedFindFirst<typeof snapshotVersions>(
      db.query.snapshotVersions.findFirst({
        where: and(
          eq(snapshotVersions.snapshotId, data.snapshotId),
          eq(snapshotVersions.isCurrent, true)
        ),
      })
    );

    // Compute next version number
    const nextVersionNumber = await this.getNextVersionNumber(data.snapshotId);

    // Compute source hash for deduplication
    const sourceHash = this.computeSourceHash(data.stateSnapshot);

    // Build version data
    const now = new Date();
    const versionData: InsertSnapshotVersion = {
      snapshotId: data.snapshotId,
      versionNumber: nextVersionNumber,
      parentVersionId: currentHead?.id ?? null,
      versionName: data.versionName ?? null,
      isCurrent: true,
      stateSnapshot: data.stateSnapshot,
      calculatedMetrics: data.calculatedMetrics ?? null,
      sourceHash,
      description: data.description ?? null,
      createdBy: data.createdBy ?? null,
      tags: data.tags ?? null,
      expiresAt: data.isPinned ? null : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      isPinned: data.isPinned ?? false,
      createdAt: now,
    };

    // Insert new version (trigger will unmark previous current)
    const [version] = await typedInsert<typeof snapshotVersions>(
      db.insert(snapshotVersions).values(versionData).returning()
    );

    if (!version) {
      throw new Error('Failed to create version');
    }

    return version;
  }

  /**
   * List versions for a snapshot with pagination
   *
   * Returns versions ordered by version_number DESC.
   */
  async listVersions(filter: ListVersionsFilter): Promise<PaginatedVersions> {
    // Verify snapshot exists
    await this.verifySnapshotExists(filter.snapshotId);

    const limit = filter.limit ?? 50;
    const conditions: SQL<unknown>[] = [eq(snapshotVersions.snapshotId, filter.snapshotId)];

    // Filter out expired versions unless explicitly included
    if (!filter.includeExpired) {
      conditions.push(
        sql`(${snapshotVersions.expiresAt} IS NULL OR ${snapshotVersions.expiresAt} > NOW())`
      );
    }

    // Add cursor filter if provided
    if (filter.cursor) {
      const { versionNumber } = this.decodeCursor(filter.cursor);
      conditions.push(lt(snapshotVersions.versionNumber, versionNumber));
    }

    // Fetch limit + 1 to detect if there are more results
    const versions = await typedFindMany<typeof snapshotVersions>(
      db.query.snapshotVersions.findMany({
        where: and(...conditions),
        orderBy: [desc(snapshotVersions.versionNumber)],
        limit: limit + 1,
      })
    );

    const hasMore = versions.length > limit;
    const resultVersions = hasMore ? versions.slice(0, limit) : versions;

    let nextCursor: string | undefined = undefined;
    if (hasMore && resultVersions.length > 0) {
      const lastVersion = resultVersions[resultVersions.length - 1];
      if (lastVersion) {
        nextCursor = this.encodeCursor(lastVersion.versionNumber);
      }
    }

    return {
      versions: resultVersions,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
      hasMore,
    } as PaginatedVersions;
  }

  /**
   * Get a specific version by ID
   */
  async getVersion(versionId: string): Promise<SnapshotVersion> {
    const version = await typedFindFirst<typeof snapshotVersions>(
      db.query.snapshotVersions.findFirst({
        where: eq(snapshotVersions.id, versionId),
      })
    );

    if (!version) {
      throw new VersionNotFoundError(versionId);
    }

    return version;
  }

  /**
   * Get current (latest) version for a snapshot
   */
  async getCurrent(snapshotId: string): Promise<SnapshotVersion> {
    await this.verifySnapshotExists(snapshotId);

    const version = await typedFindFirst<typeof snapshotVersions>(
      db.query.snapshotVersions.findFirst({
        where: and(
          eq(snapshotVersions.snapshotId, snapshotId),
          eq(snapshotVersions.isCurrent, true)
        ),
      })
    );

    if (!version) {
      throw new VersionNotFoundError(`No current version for snapshot ${snapshotId}`);
    }

    return version;
  }

  /**
   * Get version by number
   */
  async getVersionByNumber(snapshotId: string, versionNumber: number): Promise<SnapshotVersion> {
    await this.verifySnapshotExists(snapshotId);

    const version = await typedFindFirst<typeof snapshotVersions>(
      db.query.snapshotVersions.findFirst({
        where: and(
          eq(snapshotVersions.snapshotId, snapshotId),
          eq(snapshotVersions.versionNumber, versionNumber)
        ),
      })
    );

    if (!version) {
      throw new VersionNotFoundError(
        `Version ${versionNumber} not found for snapshot ${snapshotId}`
      );
    }

    return version;
  }

  /**
   * Get version history (ancestry chain from a version)
   */
  async getHistory(versionId: string, limit: number = 10): Promise<SnapshotVersion[]> {
    const history: SnapshotVersion[] = [];
    let currentVersionId: string | null = versionId;

    while (currentVersionId && history.length < limit) {
      const version: SnapshotVersion | undefined = await typedFindFirst<typeof snapshotVersions>(
        db.query.snapshotVersions.findFirst({
          where: eq(snapshotVersions.id, currentVersionId),
        })
      );

      if (!version) break;

      history.push(version);
      currentVersionId = version.parentVersionId;
    }

    return history;
  }

  /**
   * Restore snapshot to a previous version
   *
   * Creates a new version with the state from the target version.
   */
  async restore(
    snapshotId: string,
    targetVersionId: string,
    description?: string
  ): Promise<SnapshotVersion> {
    // Get the target version
    const targetVersion = await this.getVersion(targetVersionId);

    // Verify it belongs to the same snapshot
    if (targetVersion.snapshotId !== snapshotId) {
      throw new Error('Target version does not belong to this snapshot');
    }

    // Create new version with restored state
    return this.createVersion({
      snapshotId,
      stateSnapshot: targetVersion.stateSnapshot as Record<string, unknown>,
      calculatedMetrics: targetVersion.calculatedMetrics as Record<string, unknown> | null,
      versionName: `Restored from v${targetVersion.versionNumber}`,
      description: description ?? `Restored from version ${targetVersion.versionNumber}`,
      tags: ['restored'],
    });
  }

  /**
   * Pin a version (prevent auto-pruning)
   */
  async pinVersion(versionId: string): Promise<SnapshotVersion> {
    const _version = await this.getVersion(versionId);

    const [updated] = await typedUpdate<typeof snapshotVersions>(
      db
        .update(snapshotVersions)
        .set({
          isPinned: true,
          expiresAt: null, // Clear expiration
        })
        .where(eq(snapshotVersions.id, versionId))
        .returning()
    );

    if (!updated) {
      throw new VersionNotFoundError(versionId);
    }

    return updated;
  }

  /**
   * Unpin a version (allow auto-pruning)
   */
  async unpinVersion(versionId: string): Promise<SnapshotVersion> {
    const _version = await this.getVersion(versionId);

    // Set expiration to 90 days from now
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const [updated] = await typedUpdate<typeof snapshotVersions>(
      db
        .update(snapshotVersions)
        .set({
          isPinned: false,
          expiresAt,
        })
        .where(eq(snapshotVersions.id, versionId))
        .returning()
    );

    if (!updated) {
      throw new VersionNotFoundError(versionId);
    }

    return updated;
  }

  /**
   * Manually prune expired versions (called by scheduler)
   *
   * @returns Number of deleted versions
   */
  async pruneExpired(): Promise<number> {
    const result = await db
      .delete(snapshotVersions)
      .where(and(lt(snapshotVersions.expiresAt, new Date()), eq(snapshotVersions.isPinned, false)))
      .returning({ id: snapshotVersions.id });

    return result.length;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Compute SHA-256 hash of state for deduplication
   */
  private computeSourceHash(state: Record<string, unknown>): string {
    const stateString = JSON.stringify(state, Object.keys(state).sort());
    return createHash('sha256').update(stateString).digest('hex');
  }

  /**
   * Get next version number for a snapshot
   */
  private async getNextVersionNumber(snapshotId: string): Promise<number> {
    const result = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${snapshotVersions.versionNumber}), 0)` })
      .from(snapshotVersions)
      .where(eq(snapshotVersions.snapshotId, snapshotId));

    return (result[0]?.maxVersion ?? 0) + 1;
  }

  /**
   * Verify snapshot exists
   */
  private async verifySnapshotExists(snapshotId: string): Promise<void> {
    const snapshot = await typedFindFirst<typeof forecastSnapshots>(
      db.query.forecastSnapshots.findFirst({
        where: eq(forecastSnapshots.id, snapshotId),
      })
    );

    if (!snapshot) {
      throw new SnapshotNotFoundError(snapshotId);
    }
  }

  /**
   * Encode cursor for pagination
   */
  private encodeCursor(versionNumber: number): string {
    return Buffer.from(JSON.stringify({ versionNumber })).toString('base64');
  }

  /**
   * Decode cursor for pagination
   */
  private decodeCursor(cursor: string): { versionNumber: number } {
    try {
      const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64').toString());

      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('versionNumber' in decoded) ||
        typeof decoded.versionNumber !== 'number'
      ) {
        throw new Error('Invalid cursor structure');
      }

      return { versionNumber: decoded.versionNumber };
    } catch {
      throw new Error('Invalid cursor format');
    }
  }
}
