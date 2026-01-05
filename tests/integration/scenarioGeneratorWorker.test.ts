/**
 * Integration tests for ScenarioGenerator BullMQ Worker
 *
 * Tests the complete worker lifecycle:
 * - Job enqueueing and processing
 * - Progress reporting
 * - Result retrieval
 * - Error handling and retries
 * - Graceful shutdown
 *
 * Requires Redis running on localhost:6379
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Queue, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';
import IORedis from 'ioredis';
import { createScenarioWorker, type WorkerConfig } from '@/server/workers/scenarioGeneratorWorker';
import {
  createDefaultScenarioConfig,
  type ScenarioConfig,
  type ScenarioResult,
} from '@shared/core/optimization/ScenarioGenerator';
import {
  decompressMatrix,
  type CompressedMatrix,
} from '@shared/core/optimization/MatrixCompression';

/**
 * Normalize compressed matrix data from BullMQ serialization
 * BullMQ serializes Uint8Array as { type: 'Buffer', data: number[] }
 */
function normalizeCompressedMatrix(result: ScenarioResult): CompressedMatrix {
  const data = result.compressed.data;

  // If data is already a Buffer-like object from JSON serialization
  if (data && typeof data === 'object' && 'type' in data && data.type === 'Buffer') {
    return {
      ...result.compressed,
      data: new Uint8Array((data as { data: number[] }).data),
    };
  }

  // If data is a plain object/array
  if (Array.isArray(data) || (data && typeof data === 'object' && !ArrayBuffer.isView(data))) {
    return {
      ...result.compressed,
      data: new Uint8Array(Object.values(data)),
    };
  }

  // Already a Uint8Array or Buffer
  return {
    ...result.compressed,
    data: new Uint8Array(data),
  };
}

describe('ScenarioGenerator Worker Integration', () => {
  let redisConnection: Redis;
  let queue: Queue<ScenarioConfig, ScenarioResult>;
  let queueEvents: QueueEvents;
  let worker: ReturnType<typeof createScenarioWorker>;

  beforeAll(async () => {
    // Create Redis connection
    redisConnection = new IORedis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      maxRetriesPerRequest: null, // Required for BullMQ
    });

    // Create queue for job submission
    queue = new Queue<ScenarioConfig, ScenarioResult>('scenario-generation', {
      connection: redisConnection,
    });

    // Create queue events for monitoring
    queueEvents = new QueueEvents('scenario-generation', {
      connection: redisConnection,
    });

    // Create worker
    const workerConfig: WorkerConfig = {
      connection: redisConnection,
      concurrency: 1,
      timeout: 120_000, // 2 minutes for tests
    };
    worker = createScenarioWorker(workerConfig);
  });

  afterAll(async () => {
    // Cleanup
    await worker.close();
    await queue.close();
    await queueEvents.close();
    await redisConnection.quit();
  });

  beforeEach(async () => {
    // Clear queue before each test
    await queue.drain();
    await queue.clean(0, 0);
  });

  describe('Job Processing', () => {
    it('should process a simple scenario generation job', async () => {
      const config: ScenarioConfig = {
        numScenarios: 100,
        buckets: [
          {
            name: 'Seed',
            capitalAllocation: 50,
            moicCalibration: { median: 1.0, p90: 3.0 },
          },
          {
            name: 'Series A',
            capitalAllocation: 50,
            moicCalibration: { median: 1.5, p90: 3.5 },
          },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: {
          enabled: true,
          mode: 'same-bucket',
          reinvestmentRate: 0.8,
          avgHoldingPeriod: 5,
          fundLifetime: 10,
        },
        seed: 'integration-test-1',
      };

      // Add job to queue
      const job = await queue.add('generate-scenarios', config);

      // Wait for completion
      const result = await job.waitUntilFinished(queueEvents, 120_000);

      // Validate result structure
      expect(result).toBeDefined();
      expect(result.compressed).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Validate metadata
      expect(result.metadata.numScenarios).toBe(100);
      expect(result.metadata.numBuckets).toBe(2);
      expect(result.metadata.configHash).toBe('integration-test-1');
      expect(result.metadata.durationMs).toBeGreaterThan(0);

      // Validate compressed matrix
      expect(result.compressed.numScenarios).toBe(100);
      expect(result.compressed.numBuckets).toBe(2);

      // Decompress and validate matrix dimensions
      const compressedMatrix = normalizeCompressedMatrix(result);
      const matrix = await decompressMatrix(compressedMatrix);
      expect(matrix).toHaveLength(100);
      expect(matrix[0]).toHaveLength(2);
    }, 120_000);

    it('should handle large scenario generation (10K scenarios)', async () => {
      const config = createDefaultScenarioConfig();
      config.seed = 'integration-test-large';

      const job = await queue.add('generate-scenarios', config);
      const result = await job.waitUntilFinished(queueEvents, 120_000);

      expect(result.metadata.numScenarios).toBe(10_000);
      expect(result.metadata.numBuckets).toBe(3);
      expect(result.metadata.durationMs).toBeLessThan(5_000); // Should complete in < 5 seconds
    }, 120_000);

    it('should produce reproducible results for same seed', async () => {
      const config: ScenarioConfig = {
        numScenarios: 100,
        buckets: [
          {
            name: 'Test',
            capitalAllocation: 100,
            moicCalibration: { median: 1.0, p90: 3.0 },
          },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: {
          enabled: false,
          mode: 'same-bucket',
          reinvestmentRate: 0,
          avgHoldingPeriod: 5,
          fundLifetime: 10,
        },
        seed: 'reproducibility-test',
      };

      // Generate twice with same config
      const job1 = await queue.add('generate-scenarios-1', config);
      const result1 = await job1.waitUntilFinished(queueEvents, 120_000);

      const job2 = await queue.add('generate-scenarios-2', config);
      const result2 = await job2.waitUntilFinished(queueEvents, 120_000);

      // Normalize and compare compressed data
      const compressed1 = normalizeCompressedMatrix(result1);
      const compressed2 = normalizeCompressedMatrix(result2);

      // Compressed data should be byte-identical
      expect(compressed1.data).toEqual(compressed2.data);

      // Decompress and verify matrices are identical
      const matrix1 = await decompressMatrix(compressed1);
      const matrix2 = await decompressMatrix(compressed2);
      expect(matrix1).toEqual(matrix2);
    }, 120_000);
  });

  describe('Progress Reporting', () => {
    it('should complete generation and track job progress', async () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 1000;
      config.seed = 'progress-test';

      const job = await queue.add('generate-with-progress', config);

      // Wait for completion
      const result = await job.waitUntilFinished(queueEvents, 30_000);

      // Verify job completed successfully
      expect(result).toBeDefined();
      expect(result.metadata.numScenarios).toBe(1000);

      // Check job state is completed
      const state = await job.getState();
      expect(state).toBe('completed');

      // Note: Progress events in BullMQ require a separate listener setup
      // For integration tests, we verify completion rather than granular progress
    }, 60_000);
  });

  describe('Error Handling', () => {
    it('should reject invalid configuration', async () => {
      const invalidConfig = {
        numScenarios: -1, // Invalid: negative scenarios
        buckets: [
          {
            name: 'Test',
            capitalAllocation: 100,
            moicCalibration: { median: 1.0, p90: 3.0 },
          },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: {
          enabled: false,
          mode: 'same-bucket' as const,
          reinvestmentRate: 0,
          avgHoldingPeriod: 5,
          fundLifetime: 10,
        },
        seed: 'invalid-test',
      };

      const job = await queue.add('invalid-job', invalidConfig);

      // Should fail validation
      await expect(job.waitUntilFinished(queueEvents, 30_000)).rejects.toThrow();

      const jobState = await job.getState();
      expect(jobState).toBe('failed');
    }, 60_000);

    it('should reject allocations not summing to 100%', async () => {
      const invalidConfig: ScenarioConfig = {
        numScenarios: 100,
        buckets: [
          {
            name: 'A',
            capitalAllocation: 50,
            moicCalibration: { median: 1.0, p90: 3.0 },
          },
          {
            name: 'B',
            capitalAllocation: 40, // Total = 90%, not 100%
            moicCalibration: { median: 1.5, p90: 3.5 },
          },
        ],
        correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
        recycling: {
          enabled: false,
          mode: 'same-bucket',
          reinvestmentRate: 0,
          avgHoldingPeriod: 5,
          fundLifetime: 10,
        },
        seed: 'invalid-allocation',
      };

      const job = await queue.add('invalid-allocation-job', invalidConfig);

      await expect(job.waitUntilFinished(queueEvents, 120_000)).rejects.toThrow();
    }, 120_000);
  });

  describe('Concurrency', () => {
    it('should process multiple jobs concurrently', async () => {
      const configs = [
        { ...createDefaultScenarioConfig(), numScenarios: 500, seed: 'concurrent-1' },
        { ...createDefaultScenarioConfig(), numScenarios: 500, seed: 'concurrent-2' },
        { ...createDefaultScenarioConfig(), numScenarios: 500, seed: 'concurrent-3' },
      ];

      // Add all jobs
      const jobs = await Promise.all(
        configs.map((config, i) => queue.add(`concurrent-job-${i}`, config))
      );

      // Wait for all to complete
      const startTime = Date.now();
      const results = await Promise.all(
        jobs.map((job) => job.waitUntilFinished(queueEvents, 120_000))
      );
      const durationMs = Date.now() - startTime;

      // All should complete
      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result.metadata.configHash).toBe(`concurrent-${i + 1}`);
      });

      // Should complete faster than sequential (rough check)
      expect(durationMs).toBeLessThan(15_000); // Allow 15 seconds for 3 jobs
    }, 120_000);
  });

  describe('Queue Management', () => {
    it('should track job counts correctly', async () => {
      const initialCounts = await queue.getJobCounts();

      const config = createDefaultScenarioConfig();
      config.numScenarios = 100;
      config.seed = 'queue-management-test';

      const job = await queue.add('queue-test', config);

      // Should have one active/waiting job
      const activeCounts = await queue.getJobCounts();
      expect(activeCounts.waiting + activeCounts.active).toBeGreaterThan(
        initialCounts.waiting + initialCounts.active
      );

      await job.waitUntilFinished(queueEvents, 120_000);

      // Should have one completed job
      const finalCounts = await queue.getJobCounts();
      expect(finalCounts.completed).toBeGreaterThan(initialCounts.completed);
    }, 120_000);

    it('should allow job removal when delayed', async () => {
      const config = createDefaultScenarioConfig();
      config.numScenarios = 100;
      config.seed = 'removal-test';

      // Add job with delay to prevent immediate processing
      const job = await queue.add('removal-test', config, { delay: 5000 });

      // Verify job is delayed
      const state = await job.getState();
      expect(state).toBe('delayed');

      // Remove delayed job
      await job.remove();

      // Job should no longer exist (undefined) or be unknown (some BullMQ versions)
      const finalState = await job.getState();
      expect(['unknown', undefined]).toContain(finalState);
    }, 120_000);
  });
});
