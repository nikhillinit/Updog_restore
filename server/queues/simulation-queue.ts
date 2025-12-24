/**
 * Simulation Queue Service
 *
 * BullMQ-based job queue for Monte Carlo simulations and other long-running calculations.
 * Provides async job processing with progress tracking and SSE streaming support.
 */

import type { Job } from 'bullmq';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { EventEmitter } from 'events';
import type IORedis from 'ioredis';

// Job types
export interface SimulationJobData {
  fundId: number;
  runs: number;
  timeHorizonYears: number;
  baselineId?: string;
  portfolioSize?: number;
  userId?: number;
  requestId?: string;
}

export interface SimulationJobResult {
  success: boolean;
  metrics?: {
    mean: number;
    median: number;
    p10: number;
    p90: number;
    min: number;
    max: number;
  };
  error?: string;
  durationMs?: number;
}

export interface JobProgressEvent {
  jobId: string;
  progress: number;
  message?: string;
}

export interface JobCompleteEvent {
  jobId: string;
  result: SimulationJobResult;
}

export interface JobFailedEvent {
  jobId: string;
  error: string;
}

// Event emitter for job notifications (SSE streaming)
class SimulationEventEmitter extends EventEmitter {
  emitProgress(jobId: string, progress: number, message?: string) {
    this.emit(`job:${jobId}:progress`, { jobId, progress, message });
    this.emit('progress', { jobId, progress, message });
  }

  emitComplete(jobId: string, result: SimulationJobResult) {
    this.emit(`job:${jobId}:complete`, { jobId, result });
    this.emit('complete', { jobId, result });
  }

  emitFailed(jobId: string, error: string) {
    this.emit(`job:${jobId}:failed`, { jobId, error });
    this.emit('failed', { jobId, error });
  }
}

export const simulationEvents = new SimulationEventEmitter();

// Queue name
const QUEUE_NAME = 'monte-carlo-simulations';

// Queue and worker instances (lazily initialized)
let queue: Queue<SimulationJobData, SimulationJobResult> | null = null;
let worker: Worker<SimulationJobData, SimulationJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Initialize the simulation queue with Redis connection
 */
export async function initializeSimulationQueue(redisConnection: IORedis): Promise<{
  queue: Queue<SimulationJobData, SimulationJobResult>;
  close: () => Promise<void>;
}> {
  const connection = {
    host: redisConnection.options['host'] || 'localhost',
    port: redisConnection.options['port'] || 6379,
    password: redisConnection.options['password'],
  };

  // Create queue
  queue = new Queue<SimulationJobData, SimulationJobResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
      removeOnFail: { count: 50 }, // Keep last 50 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  // Create worker to process jobs
  worker = new Worker<SimulationJobData, SimulationJobResult>(
    QUEUE_NAME,
    async (job: Job<SimulationJobData, SimulationJobResult>) => {
      const startTime = Date.now();

      try {
        // Report initial progress
        await job.updateProgress(0);
        simulationEvents.emitProgress(job.id!, 0, 'Starting simulation...');

        // Import simulation service lazily to avoid circular deps
        const { unifiedMonteCarloService } = await import(
          '../services/monte-carlo-service-unified'
        );

        // Run simulation with progress tracking
        const totalRuns = job.data.runs;
        const batchSize = Math.min(1000, Math.floor(totalRuns / 10));

        let completedRuns = 0;
        const results: number[] = [];

        // Simulate in batches for progress reporting
        while (completedRuns < totalRuns) {
          const runsThisBatch = Math.min(batchSize, totalRuns - completedRuns);

          // Run batch
          const batchResult = await unifiedMonteCarloService.runSimulation({
            fundId: job.data.fundId,
            runs: runsThisBatch,
            timeHorizonYears: job.data.timeHorizonYears,
          });

          // Collect results (simplified - actual implementation would aggregate)
          const batchMetrics = (batchResult as { metrics?: { tvpiDistribution?: number[] } })
            .metrics;
          if (batchMetrics?.tvpiDistribution) {
            results.push(...batchMetrics.tvpiDistribution);
          }

          completedRuns += runsThisBatch;
          const progress = Math.round((completedRuns / totalRuns) * 100);

          await job.updateProgress(progress);
          simulationEvents.emitProgress(
            job.id!,
            progress,
            `Completed ${completedRuns}/${totalRuns} runs`
          );
        }

        // Calculate final metrics
        const sorted = results.sort((a, b) => a - b);
        const mean = results.reduce((a, b) => a + b, 0) / results.length || 0;
        const median = sorted[Math.floor(sorted.length / 2)] || 0;
        const p10 = sorted[Math.floor(sorted.length * 0.1)] || 0;
        const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
        const min = sorted[0] || 0;
        const max = sorted[sorted.length - 1] || 0;

        const result: SimulationJobResult = {
          success: true,
          metrics: { mean, median, p10, p90, min, max },
          durationMs: Date.now() - startTime,
        };

        simulationEvents.emitComplete(job.id!, result);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        simulationEvents.emitFailed(job.id!, errorMessage);
        throw error;
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 jobs concurrently
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute
      },
    }
  );

  // Set up queue events for monitoring
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    console.log(`[queue] Job ${jobId} completed`, returnvalue);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[queue] Job ${jobId} failed:`, failedReason);
  });

  // Error handlers
  worker.on('error', (err) => {
    console.error('[queue] Worker error:', err);
  });

  queue.on('error', (err) => {
    console.error('[queue] Queue error:', err);
  });

  console.log('[queue] Simulation queue initialized');

  return {
    queue,
    close: async () => {
      console.log('[queue] Closing simulation queue...');
      await worker?.close();
      await queueEvents?.close();
      await queue?.close();
      console.log('[queue] Simulation queue closed');
    },
  };
}

/**
 * Add a simulation job to the queue
 */
export async function enqueueSimulation(
  data: SimulationJobData
): Promise<{ jobId: string; estimatedWaitMs: number }> {
  if (!queue) {
    throw new Error('Simulation queue not initialized');
  }

  const job = await queue.add('simulation', data, {
    jobId: data.requestId || `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });

  // Get queue metrics for wait time estimate
  const waiting = await queue.getWaitingCount();
  const estimatedWaitMs = waiting * 30000; // Rough estimate: 30s per job

  return {
    jobId: job.id!,
    estimatedWaitMs,
  };
}

/**
 * Get job status and result
 */
export async function getJobStatus(jobId: string): Promise<{
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
  progress?: number | undefined;
  result?: SimulationJobResult | undefined;
  error?: string | undefined;
}> {
  if (!queue) {
    throw new Error('Simulation queue not initialized');
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return { status: 'unknown' };
  }

  const state = await job.getState();
  const progress = job.progress as number | undefined;

  if (state === 'completed') {
    return {
      status: 'completed',
      progress: 100,
      result: job.returnvalue,
    };
  }

  if (state === 'failed') {
    return {
      status: 'failed',
      error: job.failedReason,
    };
  }

  return {
    status: state as 'waiting' | 'active' | 'delayed',
    progress: typeof progress === 'number' ? progress : undefined,
  };
}

/**
 * Subscribe to job events for SSE streaming
 */
export function subscribeToJob(
  jobId: string,
  callbacks: {
    onProgress?: (event: JobProgressEvent) => void;
    onComplete?: (event: JobCompleteEvent) => void;
    onFailed?: (event: JobFailedEvent) => void;
  }
): () => void {
  const progressHandler = (event: JobProgressEvent) => callbacks.onProgress?.(event);
  const completeHandler = (event: JobCompleteEvent) => callbacks.onComplete?.(event);
  const failedHandler = (event: JobFailedEvent) => callbacks.onFailed?.(event);

  simulationEvents.on(`job:${jobId}:progress`, progressHandler);
  simulationEvents.on(`job:${jobId}:complete`, completeHandler);
  simulationEvents.on(`job:${jobId}:failed`, failedHandler);

  // Return unsubscribe function
  return () => {
    simulationEvents.off(`job:${jobId}:progress`, progressHandler);
    simulationEvents.off(`job:${jobId}:complete`, completeHandler);
    simulationEvents.off(`job:${jobId}:failed`, failedHandler);
  };
}

/**
 * Check if queue is initialized
 */
export function isQueueInitialized(): boolean {
  return queue !== null;
}
