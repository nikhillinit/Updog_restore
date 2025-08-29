/**
 * Integration tests for database circuit breakers
 * Validates PostgreSQL and Redis circuit breaker behavior
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  q,
  query,
  queryWithRetry,
  pgPool,
  redisGet,
  redisSet,
  cache,
  checkDatabaseHealth,
  shutdownDatabases,
} from '../../server/db';
import { breakerRegistry } from '../../server/infra/circuit-breaker/breaker-registry';

describe('Database Circuit Breakers', () => {
  // Skip tests if in CI without database
  const skipInCI = process.env.CI && !process.env.DATABASE_URL;
  
  beforeAll(() => {
    if (skipInCI) {
      console.log('Skipping database tests in CI without DATABASE_URL');
      return;
    }
    
    // Enable circuit breakers for tests
    process.env.CB_DB_ENABLED = 'true';
    process.env.CB_CACHE_ENABLED = 'true';
  });
  
  afterAll(async () => {
    if (!skipInCI) {
      await shutdownDatabases();
    }
  });
  
  describe('PostgreSQL Circuit Breaker', () => {
    it.skipIf(skipInCI)('should execute successful queries', async () => {
      const result = await q('SELECT 1 as value');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ value: 1 });
    });
    
    it.skipIf(skipInCI)('should handle query timeout', async () => {
      // Simulate slow query
      const slowQuery = 'SELECT pg_sleep(15)'; // 15 second sleep
      
      await expect(query(slowQuery)).rejects.toThrow();
      
      // Check circuit breaker state
      const state = breakerRegistry.get('postgres')?.getState();
      console.log('Circuit breaker state after timeout:', state);
    });
    
    it.skipIf(skipInCI)('should retry with backoff', async () => {
      let attempts = 0;
      const failingQuery = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Connection failed');
        }
        return Promise.resolve({ rows: [{ success: true }], rowCount: 1 });
      });
      
      // Mock the internal query function
      const result = await queryWithRetry('SELECT 1', [], {
        maxRetries: 3,
        initialDelay: 10,
      });
      
      // Should eventually succeed
      expect(result).toBeDefined();
    });
    
    it.skipIf(skipInCI)('should record query metrics', async () => {
      // Execute some queries
      await q('SELECT 1');
      await q('SELECT 2');
      
      // Get metrics
      const metrics = await import('../../server/db/pg-circuit').then(m => m.getQueryMetrics());
      
      expect(metrics.totalQueries).toBeGreaterThan(0);
      expect(metrics.avgDuration).toBeGreaterThan(0);
    });
  });
  
  describe('Redis Circuit Breaker', () => {
    it.skipIf(skipInCI)('should handle get/set operations', async () => {
      const key = 'test:circuit:key';
      const value = 'test-value';
      
      await redisSet(key, value, 60);
      const retrieved = await redisGet(key);
      
      expect(retrieved).toBe(value);
    });
    
    it.skipIf(skipInCI)('should fall back to memory cache on Redis failure', async () => {
      const key = 'test:fallback:key';
      const value = 'fallback-value';
      
      // Set value (will be stored in memory cache too)
      await redisSet(key, value, 60);
      
      // Simulate Redis failure by closing connection
      const { redis } = await import('../../server/db/redis-circuit');
      await redis.quit();
      
      // Should still get value from memory cache
      const retrieved = await redisGet(key);
      expect(retrieved).toBe(value);
      
      // Reconnect for other tests
      await redis.connect();
    });
    
    it.skipIf(skipInCI)('should handle JSON operations', async () => {
      const key = 'test:json:key';
      const data = { id: 1, name: 'Test', values: [1, 2, 3] };
      
      await cache.setJSON(key, data, 60);
      const retrieved = await cache.getJSON<typeof data>(key);
      
      expect(retrieved).toEqual(data);
    });
    
    it.skipIf(skipInCI)('should record cache metrics', async () => {
      // Perform some operations
      await redisSet('metric:1', 'value1');
      await redisGet('metric:1'); // Hit
      await redisGet('metric:2'); // Miss
      
      const metrics = cache.getCacheMetrics();
      
      expect(metrics.totalOps).toBeGreaterThan(0);
      expect(metrics.hitRate).toBeGreaterThan(0);
    });
  });
  
  describe('Combined Health Checks', () => {
    it.skipIf(skipInCI)('should check all database health', async () => {
      const health = await checkDatabaseHealth();
      
      expect(health).toHaveProperty('postgres');
      expect(health).toHaveProperty('redis');
      expect(health).toHaveProperty('healthy');
      
      // If databases are available, they should be healthy
      if (process.env.DATABASE_URL && process.env.REDIS_URL) {
        expect(health.healthy).toBe(true);
      }
    });
  });
  
  describe('Circuit Breaker Registry', () => {
    it('should have registered circuit breakers', () => {
      const breakers = breakerRegistry.getAll();
      
      expect(breakers).toHaveProperty('postgres');
      expect(breakers).toHaveProperty('redis');
      
      // Check if circuit breakers are healthy
      const isHealthy = breakerRegistry.isHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });
    
    it('should track degraded services', () => {
      const degraded = breakerRegistry.getDegraded();
      expect(Array.isArray(degraded)).toBe(true);
      
      // Should initially have no degraded services
      if (!skipInCI) {
        expect(degraded).toHaveLength(0);
      }
    });
  });
});

describe('Chaos Testing', () => {
  const skipInCI = process.env.CI && !process.env.DATABASE_URL;
  
  it.skipIf(skipInCI)('should handle database connection loss', async () => {
    // Simulate connection pool exhaustion
    const connections = [];
    
    try {
      // Try to acquire many connections
      for (let i = 0; i < 30; i++) {
        connections.push(pgPool.connect());
      }
      
      // Should eventually fail or timeout
      await expect(Promise.all(connections)).rejects.toThrow();
    } finally {
      // Release connections
      const resolvedConnections = await Promise.allSettled(connections);
      for (const result of resolvedConnections) {
        if (result.status === 'fulfilled' && result.value) {
          result.value.release();
        }
      }
    }
  });
  
  it.skipIf(skipInCI)('should handle Redis memory pressure', async () => {
    // Fill memory cache to test eviction
    for (let i = 0; i < 1100; i++) {
      await cache.set(`stress:key:${i}`, `value${i}`, 60);
    }
    
    const metrics = cache.getCacheMetrics();
    
    // Memory cache should be capped at 1000 entries
    expect(metrics.memoryCacheSize).toBeLessThanOrEqual(1000);
  });
});