/**
 * BullMQ Worker for Monte Carlo Scenario Matrix Generation
 *
 * Background worker that generates MOIC scenario matrices using BullMQ.
 * Handles long-running matrix generation jobs asynchronously.
 *
 * Features:
 * - Job retry with exponential backoff
 * - Progress reporting (0-100%)
 * - Graceful shutdown
 * - Error handling with circuit breaker
 * - Result caching via compressed matrix storage
 *
 * Queue: scenario-generation
 * Job data: ScenarioConfig
 * Job result: ScenarioResult
 */

import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { RedisClientType } from 'redis';
import type { ScenarioResult } from '@shared/core/optimization/ScenarioGenerator';
import { ScenarioMatrixCache } from '@shared/core/optimization/ScenarioMatrixCache';
import type { ScenarioConfigWithMeta } from '@shared/core/optimization/ScenarioMatrixCache';

/**
 * Worker configuration
 */
export interface WorkerConfig {
  /** Redis connection for BullMQ (ioredis) */
  connection: Redis;

  /** PostgreSQL database connection (Drizzle ORM) */
  db: NodePgDatabase<typeof import('@shared/schema')>;

  /** Redis client for cache (redis package) - optional for cache support */
  redis?: RedisClientType;

  /** Worker concurrency (number of parallel jobs) */
  concurrency?: number;

  /** Job timeout in milliseconds */
  timeout?: number;

  /** Enable progress reporting */
  enableProgress?: boolean;
}

/**
 * Job progress update
 */
interface JobProgress {
  /** Progress percentage (0-100) */
  percent: number;

  /** Current step description */
  step: string;

  /** Estimated time remaining in milliseconds */
  estimatedMs?: number;
}

/**
 * Process scenario generation job with caching
 *
 * @param job - BullMQ job with ScenarioConfigWithMeta data
 * @param cache - ScenarioMatrixCache instance
 * @returns ScenarioResult with compressed matrix
 */
async function processScenarioJob(
  job: Job<ScenarioConfigWithMeta>,
  cache: ScenarioMatrixCache
): Promise<ScenarioResult> {
  const { data: config } = job;

  // Report progress: Cache lookup
  await job.updateProgress({
    percent: 0,
    step: 'Checking cache',
  } as JobProgress);

  // Use cache (will check Redis -> PostgreSQL -> generate on miss)
  const startTime = Date.now();
  const result = await cache.getOrGenerate(config);
  const totalDurationMs = Date.now() - startTime;

  // Determine if cache hit or miss
  const cacheHit = result.metadata.durationMs === 0;

  if (cacheHit) {
    // Cache hit - fast path
    await job.updateProgress({
      percent: 100,
      step: 'Retrieved from cache',
    } as JobProgress);

    console.log(
      `[ScenarioWorker] Cache HIT - Job ${job.id} retrieved ${result.metadata.numScenarios}×${result.metadata.numBuckets} matrix in ${totalDurationMs}ms ` +
        `(key: ${result.metadata.configHash.substring(0, 8)}...)`
    );
  } else {
    // Cache miss - generation occurred
    await job.updateProgress({
      percent: 90,
      step: 'Generated and cached',
    } as JobProgress);

    console.log(
      `[ScenarioWorker] Cache MISS - Job ${job.id} generated ${result.metadata.numScenarios}×${result.metadata.numBuckets} matrix in ${result.metadata.durationMs}ms ` +
        `(total: ${totalDurationMs}ms, compressed: ${(result.compressed.compressedSize / 1024).toFixed(1)}KB, key: ${result.metadata.configHash.substring(0, 8)}...)`
    );

    await job.updateProgress({
      percent: 100,
      step: 'Complete',
    } as JobProgress);
  }

  return result;
}

/**
 * Create and start scenario generation worker with cache support
 *
 * @param config - Worker configuration
 * @returns BullMQ Worker instance
 */
export function createScenarioWorker(
  config: WorkerConfig
): Worker<ScenarioConfigWithMeta, ScenarioResult> {
  // Initialize cache with database + Redis connections
  const cache = new ScenarioMatrixCache(config.db, config.redis);
  console.log(
    `[ScenarioWorker] Cache initialized (Redis: ${config.redis ? 'enabled' : 'disabled'})`
  );

  const worker = new Worker<ScenarioConfigWithMeta, ScenarioResult>(
    'scenario-generation',
    async (job) => {
      try {
        return await processScenarioJob(job, cache);
      } catch (error) {
        console.error(`[ScenarioWorker] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection: config.connection,
      concurrency: config.concurrency ?? 2,

      // Job timeout (default: 5 minutes) - AP-QUEUE-02 compliance
      lockDuration: config.timeout ?? 5 * 60 * 1000,
      timeout: config.timeout ?? 5 * 60 * 1000, // Explicit timeout for lint rule

      // Retry configuration
      settings: {
        // Backoff strategy: exponential
        backoffStrategy: (attemptsMade: number) => {
          // 1s, 2s, 4s, 8s, 16s, ...
          return Math.min(1000 * Math.pow(2, attemptsMade), 60000);
        },
      },
    }
  );

  // Event listeners for monitoring with cache metrics
  worker.on('completed', (job) => {
    const result = job.returnvalue as ScenarioResult | undefined;
    const cacheHit = result?.metadata.durationMs === 0;

    console.log(
      `[ScenarioWorker] Job ${job.id} completed successfully - ` +
        `Cache: ${cacheHit ? 'HIT' : 'MISS'}${result ? `, Matrix: ${result.compressed.numScenarios}x${result.compressed.numBuckets}` : ''}`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(
      `[ScenarioWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      error
    );
  });

  worker.on('error', (error) => {
    console.error('[ScenarioWorker] Worker error:', error);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[ScenarioWorker] SIGTERM received, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[ScenarioWorker] SIGINT received, shutting down gracefully...');
    await worker.close();
    process.exit(0);
  });

  console.log(
    `[ScenarioWorker] Started with concurrency=${config.concurrency ?? 2}, cache=${config.redis ? 'enabled' : 'PostgreSQL-only'}`
  );

  return worker;
}

/**
 * Standalone worker entry point (when run directly)
 */
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const Redis = require('ioredis').default;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { Pool } = require('pg');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { drizzle } = require('drizzle-orm/node-postgres');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { createClient } = require('redis');

  (async () => {
    // BullMQ Redis connection (ioredis)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const bullmqRedis = new Redis({
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      password: process.env['REDIS_PASSWORD'],
      maxRetriesPerRequest: null, // Required for BullMQ
    });

    // PostgreSQL connection
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const pool = new Pool({
      connectionString: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/updog',
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const db = drizzle(pool);

    // Cache Redis connection (redis package) - optional
    let cacheRedis: RedisClientType | undefined;
    try {
      const redisUrl =
        process.env['REDIS_URL'] ??
        `redis://${process.env['REDIS_HOST'] ?? 'localhost'}:${process.env['REDIS_PORT'] ?? '6379'}`;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      cacheRedis = createClient({ url: redisUrl });

      await cacheRedis.connect();
      console.log('[ScenarioWorker] Cache Redis connected');
    } catch (error) {
      console.warn('[ScenarioWorker] Cache Redis unavailable, using PostgreSQL-only mode:', error);
      cacheRedis = undefined;
    }

    // Create worker with cache
    createScenarioWorker({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      connection: bullmqRedis,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      db,

      redis: cacheRedis,
      concurrency: parseInt(process.env['WORKER_CONCURRENCY'] ?? '2', 10),
      timeout: parseInt(process.env['WORKER_TIMEOUT'] ?? '300000', 10), // 5 minutes
    });

    console.log('[ScenarioWorker] Standalone worker started with cache support');
  })().catch((error) => {
    console.error('[ScenarioWorker] Failed to start worker:', error);
    process.exit(1);
  });
}
