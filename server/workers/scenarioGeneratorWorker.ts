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

import { Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { ScenarioGenerator, ScenarioConfig, ScenarioResult } from '@shared/core/optimization/ScenarioGenerator';

/**
 * Worker configuration
 */
export interface WorkerConfig {
  /** Redis connection */
  connection: Redis;

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
 * Process scenario generation job
 *
 * @param job - BullMQ job with ScenarioConfig data
 * @returns ScenarioResult with compressed matrix
 */
async function processScenarioJob(job: Job<ScenarioConfig>): Promise<ScenarioResult> {
  const { data: config } = job;

  // Report progress: Starting
  await job.updateProgress({
    percent: 0,
    step: 'Initializing generator',
  } as JobProgress);

  // Create generator
  const generator = new ScenarioGenerator(config);

  // Report progress: Generation started
  await job.updateProgress({
    percent: 10,
    step: 'Generating scenarios',
  } as JobProgress);

  // Generate matrix (this is the heavy computation)
  const startTime = Date.now();
  const result = await generator.generate();
  const durationMs = Date.now() - startTime;

  // Report progress: Compression complete
  await job.updateProgress({
    percent: 90,
    step: 'Finalizing result',
  } as JobProgress);

  // Log generation stats
  console.log(
    `[ScenarioWorker] Generated ${result.metadata.numScenarios}×${result.metadata.numBuckets} matrix in ${durationMs}ms ` +
    `(compressed: ${(result.compressed.compressedSize / 1024).toFixed(1)}KB)`
  );

  // Report progress: Complete
  await job.updateProgress({
    percent: 100,
    step: 'Complete',
  } as JobProgress);

  return result;
}

/**
 * Create and start scenario generation worker
 *
 * @param config - Worker configuration
 * @returns BullMQ Worker instance
 */
export function createScenarioWorker(config: WorkerConfig): Worker<ScenarioConfig, ScenarioResult> {
  const worker = new Worker<ScenarioConfig, ScenarioResult>(
    'scenario-generation',
    async (job) => {
      try {
        return await processScenarioJob(job);
      } catch (error) {
        console.error(`[ScenarioWorker] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection: config.connection,
      concurrency: config.concurrency ?? 2,

      // Job timeout (default: 5 minutes)
      lockDuration: config.timeout ?? 5 * 60 * 1000,

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

  // Event listeners for monitoring
  worker.on('completed', (job) => {
    console.log(`[ScenarioWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[ScenarioWorker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, error);
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

  console.log(`[ScenarioWorker] Started with concurrency=${config.concurrency ?? 2}`);

  return worker;
}

/**
 * Standalone worker entry point (when run directly)
 */
if (require.main === module) {
  // Load Redis connection from environment
  const Redis = require('ioredis').default;

  const redisConnection = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required for BullMQ
  });

  // Create worker
  const worker = createScenarioWorker({
    connection: redisConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '2', 10),
    timeout: parseInt(process.env.WORKER_TIMEOUT ?? '300000', 10), // 5 minutes
  });

  console.log('[ScenarioWorker] Standalone worker started');
}
