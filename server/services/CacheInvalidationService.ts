/**
 * Cache Invalidation Service
 *
 * Handles cache invalidation with scope-based filtering:
 * - `all`: Invalidate all cache entries (Redis + PostgreSQL)
 * - `fund`: Invalidate all entries for a specific fund
 * - `matrix`: Invalidate a specific matrix by key
 *
 * Uses Redis SCAN for production-safe key deletion (avoids blocking KEYS command).
 * Marks PostgreSQL entries as status='invalidated' for audit trail.
 */

import { db } from '../db';
import type { RedisClientType } from 'redis';
import { scenarioMatrices } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Invalidation parameters
 */
export interface InvalidationParams {
  scope: 'all' | 'fund' | 'matrix';
  fundId?: string | undefined;
  matrixKey?: string | undefined;
  reason?: string | undefined;
}

/**
 * Invalidation result
 */
export interface InvalidationResult {
  invalidated: {
    redis: number;
    postgres: number;
  };
  duration: number;
  auditLog: {
    timestamp: string;
    user: string;
    reason: string;
  };
}

export class CacheInvalidationService {
  /**
   * Invalidate cache entries based on scope
   */
  static async invalidate(
    params: InvalidationParams,
    redis?: RedisClientType
  ): Promise<InvalidationResult> {
    const startTime = Date.now();

    // Invalidate in parallel for performance
    const [redisCount, postgresCount] = await Promise.all([
      this.invalidateRedis(params, redis),
      this.invalidatePostgres(params),
    ]);

    const duration = Date.now() - startTime;

    // Audit log
    console.log(
      `[CacheInvalidation] ${params.scope} invalidation - ` +
        `Redis: ${redisCount}, PostgreSQL: ${postgresCount}, ` +
        `Reason: ${params.reason || 'N/A'}`
    );

    return {
      invalidated: {
        redis: redisCount,
        postgres: postgresCount,
      },
      duration,
      auditLog: {
        timestamp: new Date().toISOString(),
        user: 'system',
        reason: params.reason || 'Manual invalidation',
      },
    };
  }

  /**
   * Invalidate Redis cache entries
   *
   * Uses SCAN for production-safe iteration (not KEYS).
   */
  private static async invalidateRedis(
    params: InvalidationParams,
    redis?: RedisClientType
  ): Promise<number> {
    if (!redis) return 0;

    try {
      if (params.scope === 'all') {
        return await this.deleteAllRedisKeys(redis);
      } else if (params.scope === 'fund' && params.fundId) {
        return await this.deleteRedisByFund(redis, params.fundId);
      } else if (params.scope === 'matrix' && params.matrixKey) {
        return await this.deleteRedisByMatrixKey(redis, params.matrixKey);
      }

      return 0;
    } catch (error) {
      console.error('[CacheInvalidation] Redis invalidation error:', error);
      return 0;
    }
  }

  /**
   * Delete all Redis cache keys using SCAN
   */
  private static async deleteAllRedisKeys(redis: RedisClientType): Promise<number> {
    const keysToDelete: string[] = [];
    let cursor = 0;

    // Scan all cache keys
    do {
      const result = await redis.scan(cursor, {
        MATCH: 'scenario-matrix:*',
        COUNT: 100,
      });
      cursor = result.cursor;
      keysToDelete.push(...result.keys);
    } while (cursor !== 0 && keysToDelete.length < 100000); // Safety limit

    // Delete in batches of 1000
    let deletedCount = 0;
    for (let i = 0; i < keysToDelete.length; i += 1000) {
      const batch = keysToDelete.slice(i, i + 1000);
      if (batch.length > 0) {
        await redis.del(batch);
        deletedCount += batch.length;
      }
    }

    return deletedCount;
  }

  /**
   * Delete Redis keys for a specific fund
   *
   * Note: Redis keys don't include fundId, so we need to query PostgreSQL first
   * to get matrix keys for the fund.
   */
  private static async deleteRedisByFund(redis: RedisClientType, fundId: string): Promise<number> {
    try {
      // Get matrix keys for the fund from PostgreSQL
      const matrices = await db
        .select({ matrixKey: scenarioMatrices.matrixKey })
        .from(scenarioMatrices)
        .where(eq(scenarioMatrices.fundId, fundId));

      if (matrices.length === 0) {
        return 0;
      }

      // Delete Redis keys in batches
      const keys = matrices.map((m) => `scenario-matrix:${m.matrixKey}`);
      let deletedCount = 0;

      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        if (batch.length > 0) {
          await redis.del(batch);
          deletedCount += batch.length;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('[CacheInvalidation] Redis fund invalidation error:', error);
      return 0;
    }
  }

  /**
   * Delete a specific Redis key by matrix key
   */
  private static async deleteRedisByMatrixKey(
    redis: RedisClientType,
    matrixKey: string
  ): Promise<number> {
    try {
      const deleted = await redis.del(`scenario-matrix:${matrixKey}`);
      return deleted;
    } catch (error) {
      console.error('[CacheInvalidation] Redis matrix invalidation error:', error);
      return 0;
    }
  }

  /**
   * Invalidate PostgreSQL cache entries (mark as status='invalidated')
   */
  private static async invalidatePostgres(params: InvalidationParams): Promise<number> {
    try {
      if (params.scope === 'all') {
        const result = await db
          .update(scenarioMatrices)
          .set({ status: 'invalidated', updatedAt: new Date() })
          .where(eq(scenarioMatrices.status, 'complete'));
        return result.rowCount || 0;
      } else if (params.scope === 'fund' && params.fundId) {
        const result = await db
          .update(scenarioMatrices)
          .set({ status: 'invalidated', updatedAt: new Date() })
          .where(
            and(eq(scenarioMatrices.fundId, params.fundId), eq(scenarioMatrices.status, 'complete'))
          );
        return result.rowCount || 0;
      } else if (params.scope === 'matrix' && params.matrixKey) {
        const result = await db
          .update(scenarioMatrices)
          .set({ status: 'invalidated', updatedAt: new Date() })
          .where(
            and(
              eq(scenarioMatrices.matrixKey, params.matrixKey),
              eq(scenarioMatrices.status, 'complete')
            )
          );
        return result.rowCount || 0;
      }

      return 0;
    } catch (error) {
      console.error('[CacheInvalidation] PostgreSQL invalidation error:', error);
      throw error; // Fatal - PostgreSQL is source of truth
    }
  }
}
