/**
 * Version Pruning Worker
 *
 * Responsible for:
 * 1. Auto-pruning expired snapshot versions (90-day retention)
 * 2. Respecting pinned versions (never pruned)
 * 3. Running daily via scheduled job
 *
 * @module server/workers/version-pruning-worker
 */

import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { SnapshotVersionService } from '../services/snapshot-version-service';
import { logger } from '../lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface VersionPruningJob {
  type: 'scheduled-prune' | 'manual-prune';
  timestamp: Date;
  reason?: string;
}

export interface PruningMetrics {
  duration: number;
  versionsDeleted: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (daily)

// ============================================================================
// WORKER CLASS
// ============================================================================

export class VersionPruningWorker {
  private queue: Queue<VersionPruningJob>;
  private worker: Worker<VersionPruningJob>;
  private readonly versionService: SnapshotVersionService;
  private metrics: PruningMetrics[] = [];

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BACKOFF_MS = 5000;

  constructor(redis: Redis, queueName: string = 'version-pruning') {
    this.versionService = new SnapshotVersionService();

    this.queue = new Queue<VersionPruningJob>(queueName, {
      connection: redis,
      defaultJobOptions: {
        attempts: this.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: this.RETRY_BACKOFF_MS,
        },
        removeOnComplete: true,
      },
    });

    // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration serves as timeout
    this.worker = new Worker<VersionPruningJob>(queueName, this.processJob.bind(this), {
      connection: redis,
      concurrency: 1,
      // 5 minute lock duration for pruning operations (AP-QUEUE-02)
      lockDuration: 300000,
    });

    this.setupEventHandlers();
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Schedule a pruning job
   */
  async schedulePruning(job: VersionPruningJob): Promise<Job<VersionPruningJob>> {
    try {
      const queuedJob = await this.queue.add('prune-versions', job);

      logger.info(
        { jobId: queuedJob.id, type: job.type },
        'Version pruning job scheduled'
      );

      return queuedJob;
    } catch (error) {
      logger.error({ error, job }, 'Error scheduling pruning job');
      throw error;
    }
  }

  /**
   * Run immediate pruning
   */
  async runImmediatePrune(): Promise<PruningMetrics> {
    const job: VersionPruningJob = {
      type: 'manual-prune',
      timestamp: new Date(),
      reason: 'immediate-prune',
    };

    return this.processPruning(job);
  }

  /**
   * Get metrics
   */
  getMetrics(): PruningMetrics[] {
    return this.metrics.slice(-100);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const counts = await this.queue.getJobCounts();
      return {
        active: counts['active'] ?? 0,
        waiting: counts['waiting'] ?? 0,
        completed: counts['completed'] ?? 0,
        failed: counts['failed'] ?? 0,
        delayed: counts['delayed'] ?? 0,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting queue stats');
      return { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }

  /**
   * Start the worker with scheduled pruning
   */
  async start(): Promise<void> {
    try {
      await this.worker.waitUntilReady();
      logger.info({}, 'Version pruning worker started');

      // Schedule recurring prune
      await this.scheduleRecurringPrune();
    } catch (error) {
      logger.error({ error }, 'Error starting version pruning worker');
      throw error;
    }
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    try {
      await this.worker.close();
      await this.queue.close();
      logger.info({}, 'Version pruning worker stopped');
    } catch (error) {
      logger.error({ error }, 'Error stopping version pruning worker');
      throw error;
    }
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  /**
   * Main job processor
   */
  private async processJob(job: Job<VersionPruningJob>): Promise<PruningMetrics> {
    const startTime = Date.now();

    try {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing pruning job');

      const metrics = await this.processPruning(job.data);

      this.metrics.push(metrics);
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      return metrics;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ jobId: job.id, error, duration }, 'Pruning job failed');

      const metrics: PruningMetrics = {
        duration,
        versionsDeleted: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.metrics.push(metrics);
      throw error;
    }
  }

  /**
   * Process pruning operation
   */
  private async processPruning(_job: VersionPruningJob): Promise<PruningMetrics> {
    const startTime = Date.now();

    try {
      // Call the version service to prune expired versions
      const deletedCount = await this.versionService.pruneExpired();

      const metrics: PruningMetrics = {
        duration: Date.now() - startTime,
        versionsDeleted: deletedCount,
        success: true,
      };

      logger.info(
        { versionsDeleted: deletedCount, duration: metrics.duration },
        'Version pruning completed'
      );

      return metrics;
    } catch (error) {
      logger.error({ error }, 'Error during version pruning');
      throw error;
    }
  }

  /**
   * Schedule recurring pruning (daily)
   */
  private async scheduleRecurringPrune(): Promise<void> {
    // Remove existing repeatable jobs first
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.key) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }

    // Add a new repeatable job (daily at 2 AM)
    await this.queue.add(
      'scheduled-prune',
      {
        type: 'scheduled-prune',
        timestamp: new Date(),
        reason: 'recurring-prune',
      },
      {
        repeat: {
          every: PRUNE_INTERVAL_MS,
        },
      }
    );

    logger.info({ intervalMs: PRUNE_INTERVAL_MS }, 'Recurring version pruning scheduled');
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Pruning job completed');
    });

    this.worker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, error }, 'Pruning job failed');
    });

    this.worker.on('error', (error) => {
      logger.error({ error }, 'Worker error');
    });

    this.queue.on('error', (error) => {
      logger.error({ error }, 'Queue error');
    });
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Factory function to create worker instance
 */
export function createVersionPruningWorker(
  redis: Redis,
  queueName?: string
): VersionPruningWorker {
  return new VersionPruningWorker(redis, queueName);
}

/**
 * Global worker instance (singleton pattern)
 */
let globalWorker: VersionPruningWorker | null = null;

export function getOrCreateVersionPruningWorker(redis: Redis): VersionPruningWorker {
  if (!globalWorker) {
    globalWorker = new VersionPruningWorker(redis);
  }
  return globalWorker;
}

/**
 * Cleanup function for process shutdown
 */
export async function cleanupVersionPruningWorker(): Promise<void> {
  const worker = globalWorker;
  if (worker) {
    globalWorker = null;
    await worker.stop();
  }
}
