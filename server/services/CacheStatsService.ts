/**
 * Cache Statistics Service
 *
 * Provides comprehensive statistics for ScenarioMatrixCache monitoring:
 * - PostgreSQL storage metrics (count, size, avg size)
 * - Redis hot cache metrics (sample-based size estimation)
 * - Cache hit/miss rates from worker metrics
 * - Performance metrics (latencies, slow queries)
 *
 * Uses Redis SCAN for production-safe key iteration (avoids blocking KEYS command).
 */

import { db } from '../db';
import type { RedisClientType } from 'redis';
import { scenarioMatrices } from '@shared/schema';
import { count, sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

/**
 * Cache statistics response schema
 */
export interface CacheStatistics {
  overview: {
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number; // 0.0 - 1.0
    avgLatencyMs: {
      redis: number;
      postgres: number;
      generation: number;
    };
  };
  storage: {
    redis: {
      entriesCount: number;
      totalSizeBytes: number;
      avgEntrySizeBytes: number;
    };
    postgres: {
      entriesCount: number;
      totalSizeBytes: number;
      avgEntrySizeBytes: number;
    };
  };
  performance: {
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    slowestQueries: Array<{
      matrixKey: string;
      latencyMs: number;
      timestamp: string;
    }>;
  };
  recentActivity: {
    last24Hours: {
      requests: number;
      hits: number;
      misses: number;
    };
    last7Days: {
      requests: number;
      hits: number;
      misses: number;
    };
  };
}

/**
 * Metrics data stored in Redis
 */
interface CacheMetricsData {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  latencies: Array<{
    tier: 'redis' | 'postgres' | 'generation';
    latency: number;
    timestamp: string;
    matrixKey?: string;
  }>;
}

export class CacheStatsService {
  /**
   * Get comprehensive cache statistics
   */
  static async getStatistics(redis?: RedisClientType): Promise<CacheStatistics> {
    // Run all stat queries in parallel for performance
    const [pgStats, redisStats, metrics24h, metrics7d] = await Promise.all([
      this.getPostgresStats(),
      this.getRedisStats(redis),
      this.getMetrics(redis, 'cache:metrics:24h'),
      this.getMetrics(redis, 'cache:metrics:7d'),
    ]);

    // Calculate hit rate
    const hitRate =
      metrics24h.totalRequests > 0 ? metrics24h.cacheHits / metrics24h.totalRequests : 0;

    // Calculate average latencies by tier
    const avgLatencyMs = this.calculateAvgLatencies(metrics24h.latencies);

    // Calculate percentiles from latencies
    const { p50, p95, p99, slowestQueries } = this.calculatePercentiles(metrics24h.latencies);

    return {
      overview: {
        totalRequests: metrics24h.totalRequests,
        cacheHits: metrics24h.cacheHits,
        cacheMisses: metrics24h.cacheMisses,
        hitRate,
        avgLatencyMs,
      },
      storage: {
        redis: redisStats,
        postgres: pgStats,
      },
      performance: {
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        p99LatencyMs: p99,
        slowestQueries,
      },
      recentActivity: {
        last24Hours: {
          requests: metrics24h.totalRequests,
          hits: metrics24h.cacheHits,
          misses: metrics24h.cacheMisses,
        },
        last7Days: {
          requests: metrics7d.totalRequests,
          hits: metrics7d.cacheHits,
          misses: metrics7d.cacheMisses,
        },
      },
    };
  }

  /**
   * Get PostgreSQL storage statistics
   */
  private static async getPostgresStats(): Promise<{
    entriesCount: number;
    totalSizeBytes: number;
    avgEntrySizeBytes: number;
  }> {
    try {
      const result = await db
        .select({
          count: count(),
          totalSize: sql<number>`COALESCE(SUM(octet_length(moic_matrix)), 0)`,
          avgSize: sql<number>`COALESCE(AVG(octet_length(moic_matrix)), 0)`,
        })
        .from(scenarioMatrices)
        .where(eq(scenarioMatrices.status, 'complete'));

      const row = result[0];
      return {
        entriesCount: row?.count ?? 0,
        totalSizeBytes: Math.round(row?.totalSize ?? 0),
        avgEntrySizeBytes: Math.round(row?.avgSize ?? 0),
      };
    } catch (error) {
      console.error('[CacheStats] PostgreSQL stats error:', error);
      return { entriesCount: 0, totalSizeBytes: 0, avgEntrySizeBytes: 0 };
    }
  }

  /**
   * Get Redis storage statistics (sample-based estimation)
   *
   * Uses SCAN for production-safe iteration (not KEYS).
   * Samples up to 100 keys to estimate total size.
   */
  private static async getRedisStats(redis?: RedisClientType): Promise<{
    entriesCount: number;
    totalSizeBytes: number;
    avgEntrySizeBytes: number;
  }> {
    if (!redis) {
      return { entriesCount: 0, totalSizeBytes: 0, avgEntrySizeBytes: 0 };
    }

    try {
      // Count all cache keys using SCAN
      const allKeys: string[] = [];
      let cursor = 0;

      do {
        const result = await redis.scan(cursor, {
          MATCH: 'scenario-matrix:*',
          COUNT: 100,
        });
        cursor = result.cursor;
        allKeys.push(...result.keys);
      } while (cursor !== 0 && allKeys.length < 10000); // Safety limit

      const entriesCount = allKeys.length;

      if (entriesCount === 0) {
        return { entriesCount: 0, totalSizeBytes: 0, avgEntrySizeBytes: 0 };
      }

      // Sample up to 100 keys for size estimation
      const sampleSize = Math.min(100, entriesCount);
      const sampleKeys = allKeys.slice(0, sampleSize);

      const sampleSizes = await Promise.all(
        sampleKeys.map(async (key) => {
          try {
            const value = await redis.get(key);
            return value ? Buffer.byteLength(value) : 0;
          } catch {
            return 0;
          }
        })
      );

      const totalSampleSize = sampleSizes.reduce((sum, size) => sum + size, 0);
      const avgEntrySizeBytes = totalSampleSize / sampleSize;
      const estimatedTotalSizeBytes = avgEntrySizeBytes * entriesCount;

      return {
        entriesCount,
        totalSizeBytes: Math.round(estimatedTotalSizeBytes),
        avgEntrySizeBytes: Math.round(avgEntrySizeBytes),
      };
    } catch (error) {
      console.error('[CacheStats] Redis stats error:', error);
      return { entriesCount: 0, totalSizeBytes: 0, avgEntrySizeBytes: 0 };
    }
  }

  /**
   * Get metrics from Redis (hash + list structure)
   */
  private static async getMetrics(
    redis: RedisClientType | undefined,
    key: string
  ): Promise<CacheMetricsData> {
    if (!redis) {
      return {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        latencies: [],
      };
    }

    try {
      // Get counters from hash
      const counters = await redis.hGetAll(key);

      // Get latency records from list
      const latencyRecords = await redis.lRange(`${key}:latencies`, 0, 999);

      type LatencyEntry = {
        tier: 'redis' | 'postgres' | 'generation';
        latency: number;
        timestamp: string;
        matrixKey?: string;
      };

      const latencies = latencyRecords
        .map((record: string): LatencyEntry | null => {
          try {
            return JSON.parse(record) as LatencyEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is LatencyEntry => entry !== null);

      return {
        totalRequests: parseInt(counters['totalRequests'] || '0', 10),
        cacheHits: parseInt(counters['cacheHits'] || '0', 10),
        cacheMisses: parseInt(counters['cacheMisses'] || '0', 10),
        latencies,
      };
    } catch (error) {
      console.error(`[CacheStats] Metrics read error (${key}):`, error);
      return {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        latencies: [],
      };
    }
  }

  /**
   * Calculate average latencies by tier
   */
  private static calculateAvgLatencies(latencies: Array<{ tier: string; latency: number }>): {
    redis: number;
    postgres: number;
    generation: number;
  } {
    const byTier = {
      redis: [] as number[],
      postgres: [] as number[],
      generation: [] as number[],
    };

    for (const entry of latencies) {
      if (entry.tier in byTier) {
        byTier[entry.tier as keyof typeof byTier].push(entry.latency);
      }
    }

    const avg = (nums: number[]) =>
      nums.length > 0 ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;

    return {
      redis: Math.round(avg(byTier.redis)),
      postgres: Math.round(avg(byTier.postgres)),
      generation: Math.round(avg(byTier.generation)),
    };
  }

  /**
   * Calculate latency percentiles (p50, p95, p99)
   */
  private static calculatePercentiles(
    latencies: Array<{ tier: string; latency: number; timestamp: string; matrixKey?: string }>
  ): {
    p50: number;
    p95: number;
    p99: number;
    slowestQueries: Array<{ matrixKey: string; latencyMs: number; timestamp: string }>;
  } {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, slowestQueries: [] };
    }

    // Sort by latency
    const sorted = [...latencies].sort((a, b) => a.latency - b.latency);

    // Calculate percentile indices
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    // Get slowest queries (top 5)
    const slowest = sorted
      .slice(-5)
      .reverse()
      .filter((entry) => entry.matrixKey)
      .map((entry) => ({
        matrixKey: `${entry.matrixKey!.substring(0, 16)}...`,
        latencyMs: Math.round(entry.latency),
        timestamp: entry.timestamp,
      }));

    return {
      p50: Math.round(sorted[p50Index]?.latency ?? 0),
      p95: Math.round(sorted[p95Index]?.latency ?? 0),
      p99: Math.round(sorted[p99Index]?.latency ?? 0),
      slowestQueries: slowest,
    };
  }
}
