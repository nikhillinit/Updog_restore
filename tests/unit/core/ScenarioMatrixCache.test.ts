/**
 * ScenarioMatrixCache Comprehensive Tests
 *
 * Test coverage:
 * 1. Canonical key generation (reproducibility, collision avoidance)
 * 2. Cache miss -> generation -> storage flow
 * 3. Cache hit from Redis (hot path)
 * 4. Cache hit from PostgreSQL (warm-up)
 * 5. Error handling (Redis unavailability, PostgreSQL errors)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { RedisClientType } from 'redis';
import {
  ScenarioMatrixCache,
  type ScenarioConfigWithMeta,
} from '@shared/core/optimization/ScenarioMatrixCache';
import type { CompressedMatrix } from '@shared/core/optimization/MatrixCompression';
import { ScenarioGenerator } from '@shared/core/optimization/ScenarioGenerator';

// Mock ScenarioGenerator
vi.mock('@shared/core/optimization/ScenarioGenerator');

describe('ScenarioMatrixCache', () => {
  let mockDb: NodePgDatabase<typeof import('@shared/schema')>;
  let mockRedis: RedisClientType;

  const mockConfig: ScenarioConfigWithMeta = {
    fundId: 'fund-123',
    taxonomyVersion: 'v1.2',
    numScenarios: 1000,
    buckets: [
      {
        name: 'bucket-1',
        capitalAllocation: 0.5,
        moicCalibration: { median: 2.0, p90: 5.0 },
      },
      {
        name: 'bucket-2',
        capitalAllocation: 0.5,
        moicCalibration: { median: 1.5, p90: 3.0 },
      },
    ],
    correlationWeights: {
      macro: 0.3,
      systematic: 0.4,
      idiosyncratic: 0.3,
    },
    recycling: {
      enabled: false,
      reinvestmentRate: 0,
      cashMultiple: 0,
      maxRecycleDeals: 0,
    },
  };

  const mockMatrix: CompressedMatrix = {
    data: Buffer.from('mock-compressed-data'),
    codec: 'zstd',
    layout: 'row-major',
    dimensions: { scenarios: 1000, buckets: 2 },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(Promise.resolve([])),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnValue(Promise.resolve()),
    } as unknown as NodePgDatabase<typeof import('@shared/schema')>;

    // Mock Redis
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
    } as unknown as RedisClientType;

    // Mock ScenarioGenerator
    vi.mocked(ScenarioGenerator).mockImplementation(() => {
      return {
        generate: vi.fn().mockResolvedValue({
          compressed: mockMatrix,
          metadata: {
            configHash: 'mock-hash',
            numScenarios: 1000,
            numBuckets: 2,
            generatedAt: new Date().toISOString(),
            durationMs: 100,
            recyclingMultiples: [],
          },
        }),
      } as unknown as ScenarioGenerator;
    });
  });

  describe('Canonical Key Generation', () => {
    it('should generate same key for identical configs', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = { ...mockConfig };
      const config2 = { ...mockConfig };

      // Access private method via type assertion
      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it('should generate different keys for different fundIds', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = { ...mockConfig, fundId: 'fund-123' };
      const config2 = { ...mockConfig, fundId: 'fund-456' };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different taxonomyVersions', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = { ...mockConfig, taxonomyVersion: 'v1.2' };
      const config2 = { ...mockConfig, taxonomyVersion: 'v1.3' };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different numScenarios', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = { ...mockConfig, numScenarios: 1000 };
      const config2 = { ...mockConfig, numScenarios: 5000 };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different bucket configs', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = { ...mockConfig };
      const config2 = {
        ...mockConfig,
        buckets: [
          ...mockConfig.buckets,
          {
            name: 'bucket-3',
            capitalAllocation: 0.3,
            moicCalibration: { median: 3.0, p90: 8.0 },
          },
        ],
      };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different correlationWeights', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = { ...mockConfig };
      const config2 = {
        ...mockConfig,
        correlationWeights: { macro: 0.5, systematic: 0.3, idiosyncratic: 0.2 },
      };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).not.toBe(key2);
    });

    it('should normalize recycling disabled to no-op', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = {
        ...mockConfig,
        recycling: { enabled: false, reinvestmentRate: 0, cashMultiple: 0, maxRecycleDeals: 0 },
      };
      const config2 = {
        ...mockConfig,
        recycling: {
          enabled: false,
          reinvestmentRate: 0.5,
          cashMultiple: 2.0,
          maxRecycleDeals: 10,
        },
      };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      // Should generate same key - recycling disabled normalizes to no-op
      expect(key1).toBe(key2);
    });

    it('should generate different keys when recycling enabled', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      const config1 = {
        ...mockConfig,
        recycling: {
          enabled: true,
          reinvestmentRate: 0.5,
          cashMultiple: 2.0,
          maxRecycleDeals: 10,
        },
      };
      const config2 = {
        ...mockConfig,
        recycling: {
          enabled: true,
          reinvestmentRate: 0.7,
          cashMultiple: 2.0,
          maxRecycleDeals: 10,
        },
      };

      const key1 = (cache as any).generateCanonicalKey(config1);
      const key2 = (cache as any).generateCanonicalKey(config2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('Cache Miss -> Generation -> Storage', () => {
    it('should generate matrix and store in both caches on miss', async () => {
      const cache = new ScenarioMatrixCache(mockDb, mockRedis);

      const result = await cache.getOrGenerate(mockConfig);

      // Should call ScenarioGenerator
      expect(ScenarioGenerator).toHaveBeenCalledWith(mockConfig);

      // Should store in PostgreSQL
      expect(mockDb.insert).toHaveBeenCalled();

      // Should store in Redis
      expect(mockRedis.setEx).toHaveBeenCalled();
      const setExCall = vi.mocked(mockRedis.setEx).mock.calls[0];
      expect(setExCall[0]).toMatch(/^scenario-matrix:/);
      expect(setExCall[1]).toBe(86400); // 24 hours

      // Should return result with metadata
      expect(result.compressed).toBe(mockMatrix);
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.recyclingMultiples).toEqual([]);
    });

    it('should store in PostgreSQL only when Redis unavailable', async () => {
      const cache = new ScenarioMatrixCache(mockDb); // No Redis

      const result = await cache.getOrGenerate(mockConfig);

      // Should call ScenarioGenerator
      expect(ScenarioGenerator).toHaveBeenCalledWith(mockConfig);

      // Should store in PostgreSQL
      expect(mockDb.insert).toHaveBeenCalled();

      // Should return result
      expect(result.compressed).toBe(mockMatrix);
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache Hit from Redis', () => {
    it('should return cached matrix from Redis', async () => {
      const serialized = JSON.stringify({
        ...mockMatrix,
        data: mockMatrix.data.toString('base64'),
      });

      mockRedis.get = vi.fn().mockResolvedValue(serialized);

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);
      const result = await cache.getOrGenerate(mockConfig);

      // Should check Redis
      expect(mockRedis.get).toHaveBeenCalled();

      // Should NOT call ScenarioGenerator
      expect(ScenarioGenerator).not.toHaveBeenCalled();

      // Should NOT check PostgreSQL
      expect(mockDb.select).not.toHaveBeenCalled();

      // Should return cached result from Redis
      expect(result.metadata.durationMs).toBe(0);
      expect(result.metadata.recyclingMultiples).toEqual([]);
      expect(result.compressed.data).toBeInstanceOf(Uint8Array);
    });
  });

  describe('Cache Hit from PostgreSQL', () => {
    it('should return cached matrix from PostgreSQL and warm Redis', async () => {
      const pgResult = [
        {
          moicMatrix: mockMatrix.data,
          compressionCodec: mockMatrix.codec,
          matrixLayout: mockMatrix.layout,
          bucketCount: mockMatrix.dimensions.buckets,
          scenarioStates: {
            scenarios: Array.from({ length: mockMatrix.dimensions.scenarios }, (_, i) => ({
              id: i,
              params: {},
            })),
          },
        },
      ];

      mockDb.limit = vi.fn().mockResolvedValue(pgResult);

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);
      const result = await cache.getOrGenerate(mockConfig);

      // Should check Redis (miss)
      expect(mockRedis.get).toHaveBeenCalled();

      // Should check PostgreSQL (hit)
      expect(mockDb.select).toHaveBeenCalled();

      // Should warm Redis cache
      expect(mockRedis.setEx).toHaveBeenCalled();

      // Should NOT call ScenarioGenerator
      expect(ScenarioGenerator).not.toHaveBeenCalled();

      // Should return cached result from PostgreSQL
      expect(result.metadata.durationMs).toBe(0);
      expect(result.metadata.recyclingMultiples).toEqual([]);
      expect(result.compressed.data).toBeInstanceOf(Uint8Array);
    });

    it('should return from PostgreSQL without warming when Redis unavailable', async () => {
      const pgResult = [
        {
          moicMatrix: mockMatrix.data,
          compressionCodec: mockMatrix.codec,
          matrixLayout: mockMatrix.layout,
          bucketCount: mockMatrix.dimensions.buckets,
          scenarioStates: {
            scenarios: Array.from({ length: mockMatrix.dimensions.scenarios }, (_, i) => ({
              id: i,
              params: {},
            })),
          },
        },
      ];

      mockDb.limit = vi.fn().mockResolvedValue(pgResult);

      const cache = new ScenarioMatrixCache(mockDb); // No Redis
      const result = await cache.getOrGenerate(mockConfig);

      // Should check PostgreSQL (hit)
      expect(mockDb.select).toHaveBeenCalled();

      // Should NOT call ScenarioGenerator
      expect(ScenarioGenerator).not.toHaveBeenCalled();

      // Should return cached result from PostgreSQL
      expect(result.metadata.durationMs).toBe(0);
      expect(result.metadata.recyclingMultiples).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis read error gracefully', async () => {
      mockRedis.get = vi.fn().mockRejectedValue(new Error('Redis connection failed'));

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);

      // Should not throw
      await expect(cache.getOrGenerate(mockConfig)).resolves.toBeDefined();

      // Should fall back to PostgreSQL check
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle Redis write error gracefully', async () => {
      mockRedis.setEx = vi.fn().mockRejectedValue(new Error('Redis connection failed'));

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);

      // Should not throw - Redis write is non-fatal
      await expect(cache.getOrGenerate(mockConfig)).resolves.toBeDefined();

      // Should still store in PostgreSQL
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should handle PostgreSQL read error gracefully', async () => {
      mockDb.limit = vi.fn().mockRejectedValue(new Error('PostgreSQL query failed'));

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);

      // Should not throw on read error
      await expect(cache.getOrGenerate(mockConfig)).resolves.toBeDefined();

      // Should fall back to generation
      expect(ScenarioGenerator).toHaveBeenCalled();
    });

    it('should throw on PostgreSQL write error', async () => {
      mockDb.onConflictDoNothing = vi.fn().mockRejectedValue(new Error('PostgreSQL insert failed'));

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);

      // Should throw - PostgreSQL write is fatal
      await expect(cache.getOrGenerate(mockConfig)).rejects.toThrow('PostgreSQL insert failed');
    });

    it('should return null on PostgreSQL cache miss with no moicMatrix', async () => {
      const pgResult = [
        {
          moicMatrix: null,
          compressionCodec: 'zstd',
          matrixLayout: 'row-major',
          bucketCount: 2,
          scenarioStates: { scenarios: [] },
        },
      ];

      mockDb.limit = vi.fn().mockResolvedValue(pgResult);

      const cache = new ScenarioMatrixCache(mockDb, mockRedis);
      const result = await cache.getOrGenerate(mockConfig);

      // Should treat as cache miss and generate
      expect(ScenarioGenerator).toHaveBeenCalled();
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.recyclingMultiples).toEqual([]);
    });
  });

  describe('Round Function', () => {
    it('should round to specified decimal places', () => {
      const cache = new ScenarioMatrixCache(mockDb);

      expect((cache as any).round(1.23456, 2)).toBe(1.23);
      expect((cache as any).round(1.23456, 3)).toBe(1.235);
      expect((cache as any).round(1.23456, 5)).toBe(1.23456);
      expect((cache as any).round(1.23999, 2)).toBe(1.24);
    });
  });
});
