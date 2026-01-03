import Redis from 'ioredis';
import { logger } from '../lib/logger';

/**
 * LP Reporting Dashboard - Redis Caching Layer
 *
 * Implements cache-aside pattern with tag-based invalidation
 *
 * Cache TTLs:
 * - Dashboard summary: 5 minutes (frequently accessed)
 * - Fund performance: 10 minutes (less volatile)
 * - Holdings data: 1 hour (valuation updates infrequently)
 * - Performance timeseries: 1 hour (historical data stable)
 *
 * Invalidation Strategy:
 * - Tag-based: When capital activity occurs, invalidate related tags
 * - Tags: `lp:{lpId}:*`, `commitment:{commitmentId}:*`, `fund:{fundId}:*`
 * - Automatic: Expired via TTL
 * - Manual: Triggered by background job refresh
 */

export interface CacheConfig {
  ttlSeconds: Record<string, number>;
  enableCompression: boolean;
  maxEntries: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlSeconds: {
    summary: 5 * 60, // 5 minutes
    performance: 10 * 60, // 10 minutes
    holdings: 60 * 60, // 1 hour
    timeseries: 60 * 60, // 1 hour
    capitalActivity: 10 * 60, // 10 minutes
  },
  enableCompression: true,
  maxEntries: 100000,
};

export class LPReportingCache {
  private redis: Redis;
  private config: CacheConfig;

  constructor(redis: Redis, config: Partial<CacheConfig> = {}) {
    this.redis = redis;
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  // =========================================================================
  // DASHBOARD SUMMARY CACHING
  // =========================================================================

  /**
   * Get or set LP summary in cache
   * Key: lp:{lpId}:summary
   * Tags: lp:{lpId}:summary, lp:{lpId}:*
   */
  async getLPSummary(
    lpId: string,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const key = `lp:${lpId}:summary`;

    try {
      // Try cache first
      const cached = await this.redis['get'](key);
      if (cached) {
        logger.debug({ lpId }, 'Cache hit: LP summary');
        return JSON.parse(cached);
      }

      // Cache miss: fetch and store
      const data = await fetchFn();
      if (data) {
        await this.set(key, data, this.config.ttlSeconds['summary'] ?? 300, [
          `lp:${lpId}:summary`,
          `lp:${lpId}:*`,
        ]);
      }
      return data;
    } catch (error) {
      logger.error({ lpId, error }, 'Cache error in getLPSummary');
      // Fallback to direct fetch on cache error
      return fetchFn();
    }
  }

  // =========================================================================
  // CAPITAL ACCOUNT CACHING
  // =========================================================================

  /**
   * Get or set capital account transactions
   * Key: lp:{lpId}:capital-activity:{fundIds}:{startDate}:{endDate}
   * Tags: lp:{lpId}:capital-activity, commitment:{commitmentId}:*
   */
  async getCapitalActivities(
    lpId: string,
    commitmentId: string,
    fundIds: number[],
    startDate: Date,
    endDate: Date,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const dateRange = `${startDate.toISOString()}:${endDate.toISOString()}`;
    const fundStr = fundIds.join(',') || 'all';
    const key = `lp:${lpId}:capital-activity:${fundStr}:${dateRange}`;

    try {
      const cached = await this.redis['get'](key);
      if (cached) {
        logger.debug({ lpId, commitmentId }, 'Cache hit: Capital activities');
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      if (data) {
        await this.set(key, data, this.config.ttlSeconds['capitalActivity'] ?? 600, [
          `lp:${lpId}:capital-activity`,
          `commitment:${commitmentId}:*`,
          `lp:${lpId}:*`,
        ]);
      }
      return data;
    } catch (error) {
      logger.error({ lpId, error }, 'Cache error in getCapitalActivities');
      return fetchFn();
    }
  }

  // =========================================================================
  // PERFORMANCE METRICS CACHING
  // =========================================================================

  /**
   * Get or set fund performance metrics
   * Key: lp:{lpId}:fund:{fundId}:performance
   * Tags: fund:{fundId}:performance, lp:{lpId}:performance
   */
  async getFundPerformance(
    lpId: string,
    fundId: number,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const key = `lp:${lpId}:fund:${fundId}:performance`;

    try {
      const cached = await this.redis['get'](key);
      if (cached) {
        logger.debug({ lpId, fundId }, 'Cache hit: Fund performance');
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      if (data) {
        await this.set(key, data, this.config.ttlSeconds['performance'] ?? 600, [
          `fund:${fundId}:performance`,
          `lp:${lpId}:performance`,
          `lp:${lpId}:*`,
        ]);
      }
      return data;
    } catch (error) {
      logger.error({ lpId, fundId, error }, 'Cache error in getFundPerformance');
      return fetchFn();
    }
  }

  /**
   * Get or set LP aggregate performance across all funds
   * Key: lp:{lpId}:performance:aggregate
   * Tags: lp:{lpId}:performance
   */
  async getAggregatePerformance(
    lpId: string,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const key = `lp:${lpId}:performance:aggregate`;

    try {
      const cached = await this.redis['get'](key);
      if (cached) {
        logger.debug({ lpId }, 'Cache hit: Aggregate performance');
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      if (data) {
        await this.set(key, data, this.config.ttlSeconds['performance'] ?? 600, [
          `lp:${lpId}:performance`,
          `lp:${lpId}:*`,
        ]);
      }
      return data;
    } catch (error) {
      logger.error({ lpId, error }, 'Cache error in getAggregatePerformance');
      return fetchFn();
    }
  }

  // =========================================================================
  // HOLDINGS CACHING
  // =========================================================================

  /**
   * Get or set pro-rata holdings
   * Key: lp:{lpId}:fund:{fundId}:holdings
   * Tags: fund:{fundId}:holdings, lp:{lpId}:holdings
   */
  async getProRataHoldings(
    lpId: string,
    fundId: number,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const key = `lp:${lpId}:fund:${fundId}:holdings`;

    try {
      const cached = await this.redis['get'](key);
      if (cached) {
        logger.debug({ lpId, fundId }, 'Cache hit: Pro-rata holdings');
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      if (data) {
        await this.set(key, data, this.config.ttlSeconds['holdings'] ?? 3600, [
          `fund:${fundId}:holdings`,
          `lp:${lpId}:holdings`,
          `lp:${lpId}:*`,
        ]);
      }
      return data;
    } catch (error) {
      logger.error({ lpId, fundId, error }, 'Cache error in getProRataHoldings');
      return fetchFn();
    }
  }

  // =========================================================================
  // TIMESERIES CACHING
  // =========================================================================

  /**
   * Get or set performance timeseries
   * Key: lp:{lpId}:commitment:{commitmentId}:timeseries:{granularity}:{dateRange}
   * Tags: commitment:{commitmentId}:timeseries
   */
  async getPerformanceTimeseries(
    lpId: string,
    commitmentId: string,
    granularity: 'monthly' | 'quarterly',
    startDate: Date,
    endDate: Date,
    fetchFn: () => Promise<any>
  ): Promise<any> {
    const dateRange = `${startDate.toISOString()}:${endDate.toISOString()}`;
    const key = `lp:${lpId}:commitment:${commitmentId}:timeseries:${granularity}:${dateRange}`;

    try {
      const cached = await this.redis['get'](key);
      if (cached) {
        logger.debug({ commitmentId, granularity }, 'Cache hit: Performance timeseries');
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      if (data) {
        await this.set(key, data, this.config.ttlSeconds['timeseries'] ?? 3600, [
          `commitment:${commitmentId}:timeseries`,
          `lp:${lpId}:*`,
        ]);
      }
      return data;
    } catch (error) {
      logger.error({ commitmentId, error }, 'Cache error in getPerformanceTimeseries');
      return fetchFn();
    }
  }

  // =========================================================================
  // TAG-BASED INVALIDATION
  // =========================================================================

  /**
   * Invalidate all cache entries matching a tag pattern
   * Patterns support wildcard: tag:* invalidates all tag:xxx
   */
  async invalidateByTag(pattern: string): Promise<number> {
    try {
      // Scan for keys matching pattern
      const cursor = '0';
      const keysToDelete: string[] = [];
      let scan = await this.redis['scan'](cursor, 'MATCH', pattern, 'COUNT', 100);

      while (true) {
        const [newCursor, keys] = scan;
        keysToDelete.push(...keys);

        if (newCursor === '0') break;
        scan = await this.redis['scan'](newCursor, 'MATCH', pattern, 'COUNT', 100);
      }

      if (keysToDelete.length > 0) {
        await this.redis['del'](...keysToDelete);
        logger.info({ pattern, count: keysToDelete.length }, 'Invalidated cache by tag');
      }
      return keysToDelete.length;
    } catch (error) {
      logger.error({ pattern, error }, 'Error invalidating cache by tag');
      return 0;
    }
  }

  /**
   * Invalidate cache after capital activity (call/distribution)
   */
  async invalidateAfterCapitalActivity(lpId: string, fundId: number): Promise<void> {
    try {
      const patterns = [
        `lp:${lpId}:summary`, // LP dashboard
        `lp:${lpId}:capital-activity*`, // Capital activity history
        `lp:${lpId}:fund:${fundId}:performance`, // Fund performance
        `lp:${lpId}:performance:*`, // All performance data
        `fund:${fundId}:*`, // All fund-related caches
      ];

      for (const pattern of patterns) {
        await this.invalidateByTag(pattern);
      }

      logger.info({ lpId, fundId }, 'Invalidated cache after capital activity');
    } catch (error) {
      logger.error({ lpId, fundId, error }, 'Error invalidating cache after capital activity');
    }
  }

  /**
   * Invalidate cache after performance snapshot update
   */
  async invalidateAfterPerformanceUpdate(commitmentId: string, lpId: string): Promise<void> {
    try {
      const patterns = [
        `commitment:${commitmentId}:timeseries`, // Timeseries data
        `lp:${lpId}:performance:*`, // All performance
        `lp:${lpId}:*`, // All LP data (conservative)
      ];

      for (const pattern of patterns) {
        await this.invalidateByTag(pattern);
      }

      logger.info({ commitmentId }, 'Invalidated cache after performance update');
    } catch (error) {
      logger.error({ commitmentId, error }, 'Error invalidating cache after performance update');
    }
  }

  /**
   * Clear all LP-related caches (used in test cleanup or LP deactivation)
   */
  async clearLPCache(lpId: string): Promise<number> {
    try {
      const count = await this.invalidateByTag(`lp:${lpId}:*`);
      logger.info({ lpId, count }, 'Cleared LP cache');
      return count;
    } catch (error) {
      logger.error({ lpId, error }, 'Error clearing LP cache');
      return 0;
    }
  }

  // =========================================================================
  // LOW-LEVEL CACHE OPERATIONS
  // =========================================================================

  /**
   * Set cache value with tags
   * Tags allow bulk invalidation
   */
  private async set(
    key: string,
    value: any,
    ttl: number,
    tags: string[] = []
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      // Set main key with TTL
      await this.redis['setex'](key, ttl, serialized);

      // Set tag references (with longer TTL than data)
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        await this.redis['setex'](
          tagKey,
          Math.max(ttl * 2, 24 * 60 * 60), // At least 24h
          '1'
        );
      }

      logger.debug({ key, ttl, tags: tags.length }, 'Cache set');
    } catch (error) {
      logger.error({ key, error }, 'Error setting cache');
    }
  }

  /**
   * Get cache value
   */
  async get(key: string): Promise<any | null> {
    try {
      const value = await this.redis['get'](key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ key, error }, 'Error getting cache');
      return null;
    }
  }

  /**
   * Delete specific cache key
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis['del'](key);
      return result > 0;
    } catch (error) {
      logger.error({ key, error }, 'Error deleting cache');
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    cacheSize: number;
    estimatedItemCount: number;
    memoryUsage: string;
  }> {
    try {
      const info = await this.redis['info']('memory');
      const dbSize = await this.redis['dbsize']();

      // Parse memory info
      const memoryUsageLine = info.split('\n').find((line: string) => line.includes('used_memory:'));
      const memoryBytes = memoryUsageLine
        ? parseInt(memoryUsageLine.split(':')[1], 10)
        : 0;

      return {
        cacheSize: memoryBytes,
        estimatedItemCount: dbSize,
        memoryUsage: `${(memoryBytes / 1024 / 1024).toFixed(2)} MB`,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting cache stats');
      return { cacheSize: 0, estimatedItemCount: 0, memoryUsage: 'unknown' };
    }
  }
}

/**
 * Factory function to create cache instance
 */
export function createLPCache(redis: Redis, config?: Partial<CacheConfig>): LPReportingCache {
  return new LPReportingCache(redis, config);
}
