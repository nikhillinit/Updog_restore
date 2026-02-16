/**
 * Backtesting Queue Service
 *
 * BullMQ-based job queue for async backtesting with stage-based progress,
 * cancellation support, stale-job sweeping, and EventEmitter-based subscriptions.
 *
 * Pattern: follows server/queues/simulation-queue.ts
 */

import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { EventEmitter } from 'events';
import type IORedis from 'ioredis';
import type {
  BacktestConfig,
  BacktestingJobStage,
  BacktestingJobStatus,
  BacktestingJobTerminalStatus,
  BacktestingJobErrorCode,
  BacktestingJobError,
  BacktestingJobResultRef,
} from '@shared/types/backtesting';

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestJobData {
  config: BacktestConfig;
  correlationId: string;
  requesterUserId?: string;
  idempotencyKey?: string;
}

interface BacktestJobSnapshot {
  jobId: string;
  status: BacktestingJobStatus | 'unknown';
  stage: BacktestingJobStage;
  progressPercent: number;
  message?: string;
  correlationId?: string;
  resultRef?: BacktestingJobResultRef;
  error?: BacktestingJobError;
  fundId: number;
  requesterUserId?: string;
  updatedAt: string;
}

interface SubscribeCallbacks {
  onStatus?: (snapshot: BacktestJobSnapshot) => void;
  onComplete?: (snapshot: BacktestJobSnapshot) => void;
  onFailed?: (snapshot: BacktestJobSnapshot) => void;
  onTimedOut?: (snapshot: BacktestJobSnapshot) => void;
  onCancelled?: (snapshot: BacktestJobSnapshot) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const QUEUE_NAME = 'backtesting-jobs';
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const STALE_SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute

const TERMINAL_STATUSES: ReadonlySet<BacktestingJobTerminalStatus> = new Set([
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);

// ============================================================================
// IN-MEMORY JOB STATE (supplements BullMQ for stage tracking)
// ============================================================================

const jobStates = new Map<
  string,
  {
    stage: BacktestingJobStage;
    progressPercent: number;
    message: string | undefined;
    resultRef: BacktestingJobResultRef | undefined;
    error: BacktestingJobError | undefined;
    correlationId: string | undefined;
    fundId: number;
    requesterUserId: string | undefined;
    updatedAt: string;
    abortController: AbortController;
  }
>();

// Idempotency key -> jobId mapping
const idempotencyMap = new Map<string, string>();

// ============================================================================
// EVENT EMITTER
// ============================================================================

class BacktestingEventEmitter extends EventEmitter {
  emitSnapshot(jobId: string, snapshot: BacktestJobSnapshot) {
    this.emit(`job:${jobId}:status`, snapshot);

    if (snapshot.status === 'completed') {
      this.emit(`job:${jobId}:complete`, snapshot);
    } else if (snapshot.status === 'failed') {
      this.emit(`job:${jobId}:failed`, snapshot);
    } else if (snapshot.status === 'timed_out') {
      this.emit(`job:${jobId}:timed_out`, snapshot);
    } else if (snapshot.status === 'cancelled') {
      this.emit(`job:${jobId}:cancelled`, snapshot);
    }
  }
}

const events = new BacktestingEventEmitter();

// ============================================================================
// QUEUE + WORKER (lazily initialized)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: Queue<BacktestJobData, any, string> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: Worker<BacktestJobData, any, string> | null = null;
let staleSweepTimer: ReturnType<typeof setInterval> | null = null;

export async function initializeBacktestingQueue(redisConnection: IORedis): Promise<{
  queue: Queue<BacktestJobData>;
  close: () => Promise<void>;
}> {
  const connection = {
    host: redisConnection['options']['host'] || 'localhost',
    port: redisConnection['options']['port'] || 6379,
    password: redisConnection['options']['password'],
  };

  queue = new Queue<BacktestJobData>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 2, // 1 initial + 1 retry
      backoff: { type: 'fixed', delay: 5000 },
    },
  });

  worker = new Worker<BacktestJobData>(
    QUEUE_NAME,
    async (job: Job<BacktestJobData>) => {
      const { config, correlationId, requesterUserId } = job.data;
      const jobId = job.id!;
      const abortController = new AbortController();

      // Initialize in-memory state
      jobStates.set(jobId, {
        stage: 'queued',
        progressPercent: 0,
        message: undefined,
        resultRef: undefined,
        error: undefined,
        correlationId,
        fundId: config.fundId,
        requesterUserId,
        updatedAt: new Date().toISOString(),
        abortController,
      });

      const updateState = (
        stage: BacktestingJobStage,
        progressPercent: number,
        message: string
      ) => {
        const state = jobStates.get(jobId);
        if (!state) return;
        state.stage = stage;
        state.progressPercent = progressPercent;
        state.message = message;
        state.updatedAt = new Date().toISOString();

        const snapshot = buildSnapshot(jobId, stage);
        events.emitSnapshot(jobId, snapshot);
        job.updateProgress(progressPercent).catch(() => {});
      };

      // Set job-level timeout
      const timeout = setTimeout(() => {
        abortController.abort();
        const state = jobStates.get(jobId);
        if (state) {
          state.error = {
            code: 'SYSTEM_EXECUTION_FAILURE',
            message: 'Job timed out',
            retryable: false,
          };
          state.updatedAt = new Date().toISOString();
        }
        const snapshot = buildSnapshot(jobId, 'timed_out');
        events.emitSnapshot(jobId, snapshot);
      }, JOB_TIMEOUT_MS);

      try {
        // Lazy import to avoid circular deps
        const { backtestingService } = await import('../services/backtesting-service');

        const result = await backtestingService.runBacktest(config, {
          onStageProgress: updateState,
          signal: abortController.signal,
          ...(correlationId ? { correlationId } : {}),
          ...(requesterUserId ? { requesterUserId } : {}),
        });

        clearTimeout(timeout);

        // Mark completed
        const state = jobStates.get(jobId);
        if (state) {
          state.stage = 'persisting';
          state.progressPercent = 100;
          state.resultRef = { backtestId: result.backtestId };
          state.updatedAt = new Date().toISOString();
        }

        const snapshot = buildSnapshot(jobId, 'completed');
        events.emitSnapshot(jobId, snapshot);
        return;
      } catch (err) {
        clearTimeout(timeout);
        const message = err instanceof Error ? err.message : 'Unknown error';
        const isCancelled = message === 'BACKTEST_CANCELLED' || abortController.signal.aborted;

        const errorCode: BacktestingJobErrorCode = isCancelled
          ? 'SYSTEM_EXECUTION_FAILURE'
          : classifyError(message);

        const retryable = errorCode === 'SYSTEM_EXECUTION_FAILURE' && !isCancelled;

        const state = jobStates.get(jobId);
        if (state) {
          state.error = { code: errorCode, message, retryable };
          state.updatedAt = new Date().toISOString();
        }

        const terminalStatus: BacktestingJobTerminalStatus = isCancelled ? 'cancelled' : 'failed';
        const snapshot = buildSnapshot(jobId, terminalStatus);
        events.emitSnapshot(jobId, snapshot);

        // Only throw for retryable errors (BullMQ will retry)
        if (retryable) {
          throw err;
        }
        // Non-retryable: don't throw so BullMQ doesn't retry
      }
    },
    {
      connection,
      concurrency: 2,
      limiter: { max: 10, duration: 60000 },
    }
  );

  worker.on('error', (err) => {
    console.error('[backtesting-queue] Worker error:', err);
  });

  queue.on('error', (err) => {
    console.error('[backtesting-queue] Queue error:', err);
  });

  // Start stale-job sweeper
  staleSweepTimer = setInterval(() => sweepStaleJobs(), STALE_SWEEP_INTERVAL_MS);

  console.warn('[backtesting-queue] Initialized');

  const queueRef = queue;
  return {
    queue: queueRef,
    close: async () => {
      if (staleSweepTimer) clearInterval(staleSweepTimer);
      await worker?.close();
      await queue?.close();
      console.warn('[backtesting-queue] Closed');
    },
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function enqueueBacktestJob(opts: {
  config: BacktestConfig;
  correlationId: string;
  requesterUserId?: string;
  idempotencyKey?: string;
}): Promise<{ jobId: string; estimatedWaitMs: number; deduplicated: boolean }> {
  if (!queue) {
    throw new Error('Backtesting queue not initialized');
  }

  // Idempotency check
  if (opts.idempotencyKey) {
    const existingJobId = idempotencyMap.get(opts.idempotencyKey);
    if (existingJobId) {
      const state = jobStates.get(existingJobId);
      if (state && !isBacktestingTerminalStatus(buildSnapshot(existingJobId, state.stage).status)) {
        return { jobId: existingJobId, estimatedWaitMs: 0, deduplicated: true };
      }
    }
  }

  const jobId = `bt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await queue.add('backtest', opts, { jobId });

  if (opts.idempotencyKey) {
    idempotencyMap.set(opts.idempotencyKey, jobId);
  }

  const waiting = await queue.getWaitingCount();
  const estimatedWaitMs = waiting * 30000;

  return { jobId, estimatedWaitMs, deduplicated: false };
}

export async function getBacktestJobStatus(jobId: string): Promise<BacktestJobSnapshot> {
  // Check in-memory state first
  const state = jobStates.get(jobId);
  if (state) {
    // Determine if the BullMQ job is completed/failed
    if (queue) {
      const job = await queue.getJob(jobId);
      if (job) {
        const bullState = await job.getState();
        if (bullState === 'completed' && state.resultRef) {
          return buildSnapshot(jobId, 'completed');
        }
        if (bullState === 'failed' && state.error) {
          return buildSnapshot(jobId, 'failed');
        }
      }
    }
    return buildSnapshot(jobId, state.stage);
  }

  // Check BullMQ directly for jobs that existed before this process
  if (queue) {
    const job = await queue.getJob(jobId);
    if (job) {
      const bullState = await job.getState();
      const stage: BacktestingJobStage = 'queued';
      const status: BacktestingJobStatus =
        bullState === 'completed' ? 'completed' : bullState === 'failed' ? 'failed' : stage;
      const snapshot: BacktestJobSnapshot = {
        jobId,
        status,
        stage,
        progressPercent: typeof job.progress === 'number' ? job.progress : 0,
        fundId: job.data.config.fundId,
        updatedAt: new Date().toISOString(),
      };
      if (job.data.requesterUserId) snapshot.requesterUserId = job.data.requesterUserId;
      if (job.data.correlationId) snapshot.correlationId = job.data.correlationId;
      return snapshot;
    }
  }

  return {
    jobId,
    status: 'unknown',
    stage: 'queued',
    progressPercent: 0,
    fundId: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function subscribeToBacktestJob(jobId: string, callbacks: SubscribeCallbacks): () => void {
  const statusHandler = (s: BacktestJobSnapshot) => callbacks.onStatus?.(s);
  const completeHandler = (s: BacktestJobSnapshot) => callbacks.onComplete?.(s);
  const failedHandler = (s: BacktestJobSnapshot) => callbacks.onFailed?.(s);
  const timedOutHandler = (s: BacktestJobSnapshot) => callbacks.onTimedOut?.(s);
  const cancelledHandler = (s: BacktestJobSnapshot) => callbacks.onCancelled?.(s);

  events.on(`job:${jobId}:status`, statusHandler);
  events.on(`job:${jobId}:complete`, completeHandler);
  events.on(`job:${jobId}:failed`, failedHandler);
  events.on(`job:${jobId}:timed_out`, timedOutHandler);
  events.on(`job:${jobId}:cancelled`, cancelledHandler);

  return () => {
    events.off(`job:${jobId}:status`, statusHandler);
    events.off(`job:${jobId}:complete`, completeHandler);
    events.off(`job:${jobId}:failed`, failedHandler);
    events.off(`job:${jobId}:timed_out`, timedOutHandler);
    events.off(`job:${jobId}:cancelled`, cancelledHandler);
  };
}

export function isBacktestingTerminalStatus(
  status: string
): status is BacktestingJobTerminalStatus {
  return TERMINAL_STATUSES.has(status as BacktestingJobTerminalStatus);
}

export function isBacktestingQueueInitialized(): boolean {
  return queue !== null;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildSnapshot(jobId: string, statusOverride: BacktestingJobStatus): BacktestJobSnapshot {
  const state = jobStates.get(jobId);
  if (!state) {
    return {
      jobId,
      status: statusOverride,
      stage: 'queued',
      progressPercent: 0,
      fundId: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    jobId,
    status: statusOverride,
    stage: state.stage,
    progressPercent: state.progressPercent,
    fundId: state.fundId,
    updatedAt: state.updatedAt,
    ...(state.message ? { message: state.message } : {}),
    ...(state.correlationId ? { correlationId: state.correlationId } : {}),
    ...(state.resultRef ? { resultRef: state.resultRef } : {}),
    ...(state.error ? { error: state.error } : {}),
    ...(state.requesterUserId ? { requesterUserId: state.requesterUserId } : {}),
  };
}

function classifyError(message: string): BacktestingJobErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes('validation') || lower.includes('invalid')) {
    return 'VALIDATION_ERROR';
  }
  if (lower.includes('data quality') || lower.includes('insufficient') || lower.includes('stale')) {
    return 'DATA_QUALITY_LIMITATION';
  }
  return 'SYSTEM_EXECUTION_FAILURE';
}

function sweepStaleJobs(): void {
  const now = Date.now();
  for (const [jobId, state] of jobStates.entries()) {
    const updatedAt = new Date(state.updatedAt).getTime();
    const age = now - updatedAt;

    if (age > STALE_JOB_THRESHOLD_MS) {
      // Check if job is in a non-terminal stage
      const snapshot = buildSnapshot(jobId, state.stage);
      if (!isBacktestingTerminalStatus(snapshot.status)) {
        console.warn(
          `[backtesting-queue] Sweeping stale job ${jobId} (age: ${Math.round(age / 1000)}s)`
        );
        state.error = {
          code: 'SYSTEM_EXECUTION_FAILURE',
          message: 'Job timed out (stale sweep)',
          retryable: false,
        };
        state.updatedAt = new Date().toISOString();
        state.abortController.abort();
        const timedOutSnapshot = buildSnapshot(jobId, 'timed_out');
        events.emitSnapshot(jobId, timedOutSnapshot);
      }
    }

    // Clean up old terminal jobs from memory (>30 min)
    if (
      age > 30 * 60 * 1000 &&
      isBacktestingTerminalStatus(buildSnapshot(jobId, state.stage).status)
    ) {
      jobStates.delete(jobId);
    }
  }
}
