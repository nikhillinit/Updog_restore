/**
 * Scenario Matrix Cache - Dual-tier caching (PostgreSQL + Redis) for scenario matrices
 *
 * Architecture:
 * - PostgreSQL: Durable storage layer for all generated matrices
 * - Redis: Hot cache for frequently accessed matrices (24-hour TTL)
 * - ScenarioGenerator: Generates matrices on cache miss
 *
 * Cache Key Design (v1.2):
 * - Canonical SHA-256 hash of scenario configuration
 * - Includes: fundId, taxonomyVersion, buckets, correlationWeights, recycling, scenarioCount
 * - Deterministic: same config → same key → same matrix
 *
 * Usage:
 * ```typescript
 * const cache = new ScenarioMatrixCache(db, redis);
 * const result = await cache.getOrGenerate({
 *   fundId: 'fund-123',
 *   taxonomyVersion: 'v1.2',
 *   numScenarios: 10000,
 *   buckets: [...],
 *   correlationWeights: {...},
 *   recycling: {...},
 * });
 * ```
 */

import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { RedisClientType } from 'redis';
import { scenarioMatrices } from '@shared/schema';
import type { CompressedMatrix } from './MatrixCompression';
import type { ScenarioConfig, ScenarioResult } from './ScenarioGenerator';
import { ScenarioGenerator } from './ScenarioGenerator';

/**
 * Extended scenario configuration with fund/taxonomy metadata
 */
export interface ScenarioConfigWithMeta extends ScenarioConfig {
  /** Fund ID for cache association */
  fundId: string;

  /** Taxonomy version for scenario metadata */
  taxonomyVersion: string;
}

/**
 * Dual-tier cache for scenario matrices
 */
export class ScenarioMatrixCache {
  constructor(
    private readonly db: NodePgDatabase<typeof import('@shared/schema')>,
    private readonly redis?: RedisClientType
  ) {}

  /**
   * Get matrix from cache or generate on miss
   *
   * Cache lookup order:
   * 1. Redis (hot cache, 24-hour TTL)
   * 2. PostgreSQL (durable storage)
   * 3. ScenarioGenerator (cache miss)
   *
   * On cache miss, stores result in both Redis and PostgreSQL.
   */
  async getOrGenerate(config: ScenarioConfigWithMeta): Promise<ScenarioResult> {
    const matrixKey = this.generateCanonicalKey(config);

    // 1. Check Redis hot cache
    if (this.redis) {
      const redisResult = await this.checkRedis(matrixKey);
      if (redisResult) {
        return {
          compressed: redisResult,
          metadata: {
            configHash: matrixKey,
            numScenarios: config.numScenarios,
            numBuckets: config.buckets.length,
            generatedAt: new Date().toISOString(),
            durationMs: 0,
            recyclingMultiples: [],
          },
        };
      }
    }

    // 2. Check PostgreSQL durable storage
    const pgResult = await this.checkPostgres(matrixKey);
    if (pgResult) {
      // Warm Redis cache for next access
      if (this.redis) {
        await this.storeRedis(matrixKey, pgResult);
      }

      return {
        compressed: pgResult,
        metadata: {
          configHash: matrixKey,
          numScenarios: config.numScenarios,
          numBuckets: config.buckets.length,
          generatedAt: new Date().toISOString(),
          durationMs: 0,
          recyclingMultiples: [],
        },
      };
    }

    // 3. Cache miss - generate matrix
    const generator = new ScenarioGenerator(config);
    const result = await generator.generate();

    // Store in both caches
    await Promise.all([
      this.storePostgres(matrixKey, config, result.compressed),
      this.redis ? this.storeRedis(matrixKey, result.compressed) : Promise.resolve(),
    ]);

    return result;
  }

  /**
   * Generate canonical cache key (SHA-256 hash v1.2)
   *
   * Includes all factors that affect MOIC simulation:
   * - fundId (for fund association)
   * - taxonomyVersion (for scenario metadata)
   * - numScenarios (simulation size)
   * - buckets (capital allocation + MOIC calibration)
   * - correlationWeights (macro/systematic/idiosyncratic)
   * - recycling (enabled, rate, cash multiple, max recycle deals)
   *
   * Canonicalization:
   * - Sorted keys (deterministic object order)
   * - 5 decimal precision for floats (eliminates noise)
   * - Recycling normalization: enabled=false → no-op config
   */
  private generateCanonicalKey(config: ScenarioConfigWithMeta): string {
    // Normalize recycling: disabled recycling has no effect on simulation
    const recycling = config.recycling.enabled
      ? {
          enabled: true,
          mode: config.recycling.mode,
          reinvestmentRate: this.round(config.recycling.reinvestmentRate, 5),
          avgHoldingPeriod: this.round(config.recycling.avgHoldingPeriod, 5),
          fundLifetime: this.round(config.recycling.fundLifetime, 5),
        }
      : { enabled: false, mode: 'same-bucket' as const };

    // Canonical configuration (sorted keys, normalized values)
    const canonical = {
      fundId: config.fundId,
      taxonomyVersion: config.taxonomyVersion,
      numScenarios: config.numScenarios,
      buckets: config.buckets
        .map((b) => ({
          name: b.name,
          capitalAllocation: this.round(b.capitalAllocation, 5),
          moicCalibration: {
            median: this.round(b.moicCalibration.median, 5),
            p90: this.round(b.moicCalibration.p90, 5),
          },
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      correlationWeights: {
        macro: this.round(config.correlationWeights.macro, 5),
        systematic: this.round(config.correlationWeights.systematic, 5),
        idiosyncratic: this.round(config.correlationWeights.idiosyncratic, 5),
      },
      recycling,
    };

    // SHA-256 hash of canonical JSON
    const json = JSON.stringify(canonical);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Check Redis cache
   */
  private async checkRedis(matrixKey: string): Promise<CompressedMatrix | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(`scenario-matrix:${matrixKey}`);
      if (!cached) return null;

      // Deserialize compressed matrix
      const parsed = JSON.parse(cached) as {
        data: string;
        numScenarios: number;
        numBuckets: number;
        version: 1;
        uncompressedSize: number;
        compressedSize: number;
      };

      return {
        data: new Uint8Array(Buffer.from(parsed.data, 'base64')),
        numScenarios: parsed.numScenarios,
        numBuckets: parsed.numBuckets,
        version: parsed.version,
        uncompressedSize: parsed.uncompressedSize,
        compressedSize: parsed.compressedSize,
      };
    } catch (error) {
      console.error('Redis cache read error:', error);
      return null;
    }
  }

  /**
   * Store matrix in Redis (24-hour TTL)
   */
  private async storeRedis(matrixKey: string, matrix: CompressedMatrix): Promise<void> {
    if (!this.redis) return;

    try {
      const serialized = JSON.stringify({
        data: Buffer.from(matrix.data).toString('base64'),
        numScenarios: matrix.numScenarios,
        numBuckets: matrix.numBuckets,
        version: matrix.version,
        uncompressedSize: matrix.uncompressedSize,
        compressedSize: matrix.compressedSize,
      });

      await this.redis.setEx(`scenario-matrix:${matrixKey}`, 86400, serialized); // 24 hours
    } catch (error) {
      console.error('Redis cache write error:', error);
      // Non-fatal - PostgreSQL is source of truth
    }
  }

  /**
   * Check PostgreSQL storage
   */
  private async checkPostgres(matrixKey: string): Promise<CompressedMatrix | null> {
    try {
      const result = await this.db
        .select({
          moicMatrix: scenarioMatrices.moicMatrix,
          scenarioStates: scenarioMatrices.scenarioStates,
          bucketCount: scenarioMatrices.bucketCount,
        })
        .from(scenarioMatrices)
        .where(
          and(eq(scenarioMatrices.matrixKey, matrixKey), eq(scenarioMatrices.status, 'complete'))
        )
        .limit(1);

      if (!result[0] || !result[0].moicMatrix) return null;

      const matrixBuffer = result[0].moicMatrix;
      const numScenarios = (result[0].scenarioStates as { scenarios: unknown[] }).scenarios.length;
      const numBuckets = result[0].bucketCount!;

      return {
        data: new Uint8Array(matrixBuffer),
        numScenarios,
        numBuckets,
        version: 1,
        uncompressedSize: numScenarios * numBuckets * 4, // Float32 = 4 bytes
        compressedSize: matrixBuffer.length,
      };
    } catch (error) {
      console.error('PostgreSQL cache read error:', error);
      return null;
    }
  }

  /**
   * Store matrix in PostgreSQL
   */
  private async storePostgres(
    matrixKey: string,
    config: ScenarioConfigWithMeta,
    matrix: CompressedMatrix
  ): Promise<void> {
    try {
      await this.db
        .insert(scenarioMatrices)
        .values({
          matrixKey,
          fundId: config.fundId,
          taxonomyVersion: config.taxonomyVersion,
          matrixType: 'moic',
          moicMatrix: Buffer.from(matrix.data),
          compressionCodec: 'zstd',
          matrixLayout: 'row-major',
          bucketCount: matrix.numBuckets,
          scenarioStates: {
            scenarios: Array.from({ length: matrix.numScenarios }, (_, i) => ({
              id: i,
              params: {},
            })),
          },
          bucketParams: {
            min: 0,
            max: 1,
            count: matrix.numBuckets,
            distribution: 'power-law',
          },
          sOpt: {
            algorithm: 'correlation-structure-v1',
            params: config.correlationWeights as unknown as Record<string, unknown>,
            convergence: {},
          },
          status: 'complete',
        })
        .onConflictDoNothing();
    } catch (error) {
      console.error('PostgreSQL cache write error:', error);
      throw error; // Fatal - PostgreSQL is source of truth
    }
  }

  /**
   * Round number to N decimal places
   */
  private round(value: number, decimals: number): number {
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
  }
}
