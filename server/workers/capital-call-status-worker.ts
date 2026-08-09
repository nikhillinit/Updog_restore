/**
 * Capital Call Status Worker
 *
 * Responsible for:
 * 1. Auto-transitioning capital call statuses based on dates
 *    - pending -> due (when due date arrives)
 *    - due -> overdue (after grace period)
 * 2. Sending reminder notifications
 *    - 7 days before due date
 *    - 3 days before due date
 *    - 1 day before due date
 *    - On due date
 * 3. Processing payment confirmations and updating call status
 *
 * Runs every hour via scheduled job.
 *
 * @module server/workers/capital-call-status-worker
 */

import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { eq, and, sql } from 'drizzle-orm';
import { lpCapitalCalls, lpPaymentSubmissions } from '@shared/schema-lp-sprint3';
import { funds } from '@shared/schema';
import { logger } from '../lib/logger';
import { metrics as runtimeMetrics } from '../../lib/metrics';
import {
  countExhaustedCapitalCallNotifications,
  dispatchPendingCapitalCallNotifications,
  enqueueCapitalCallNotification,
  transitionCapitalCallWithNotification,
  transitionCapitalCallWithPayment,
  withCapitalCallStatusTransaction,
  type CapitalCallStatusTransaction,
  type CapitalCallNotificationInput,
} from '../services/capital-call-notification-outbox-service';
import {
  getCapitalCallStatusHardTimeoutMs,
  isCapitalCallStatusHardTimeoutError,
  CapitalCallStatusHardTimeoutError,
  throwIfCapitalCallStatusAborted,
} from '../services/capital-call-status-timeout';

// ============================================================================
// TYPES
// ============================================================================

export interface CapitalCallStatusJob {
  type: 'scheduled-check' | 'payment-update' | 'status-transition' | 'send-reminder';
  callId?: string;
  lpId?: number;
  timestamp: Date;
  reason?: string;
}

export interface StatusCheckMetrics {
  duration: number;
  callsChecked: number;
  statusTransitions: number;
  notificationsSent: number;
  success: boolean;
  error?: string;
}

type CallStatus = 'pending' | 'due' | 'overdue' | 'paid' | 'partial';

interface ReminderRedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
}

export interface CapitalCallStatusWorkerOptions {
  hardTimeoutMs?: number;
}

function isReminderRedisClient(value: unknown): value is ReminderRedisClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReminderRedisClient).get === 'function' &&
    typeof (value as ReminderRedisClient).setex === 'function'
  );
}

function getReminderRedisClient(redis: unknown): ReminderRedisClient {
  if (!isReminderRedisClient(redis)) {
    throw new Error('Capital call reminder Redis client is unavailable');
  }

  return redis;
}

const CALL_STATUS = {
  PENDING: 'pending' as const,
  DUE: 'due' as const,
  OVERDUE: 'overdue' as const,
  PAID: 'paid' as const,
  PARTIAL: 'partial' as const,
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const REMINDER_DAYS = [7, 3, 1]; // Days before due date to send reminders
const GRACE_PERIOD_DAYS = 3; // Days after due date before marking overdue
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CAPITAL_CALL_STATUS_SCHEDULER_ID = 'capital-call-status-hourly';

// ============================================================================
// WORKER CLASS
// ============================================================================

export class CapitalCallStatusWorker {
  private queue: Queue<CapitalCallStatusJob>;
  private worker: Worker<CapitalCallStatusJob>;
  private redis: Redis;
  private readonly hardTimeoutMs: number;
  private metrics: StatusCheckMetrics[] = [];

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BACKOFF_MS = 5000;

  private remainingTimeoutMs(deadlineAt: number): number {
    return Math.max(1, deadlineAt - Date.now());
  }

  private async bestEffortReminderRedis<T>(
    operation: () => Promise<T>,
    deadlineAt: number,
    fallback: T
  ): Promise<T> {
    const remainingMs = Math.max(0, deadlineAt - Date.now());
    if (remainingMs === 0) return fallback;
    const redisBudgetMs = Math.max(1, Math.min(2_000, Math.floor(remainingMs / 4)));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), redisBudgetMs);
    });
    try {
      return await Promise.race([
        Promise.resolve().then(operation).catch(() => fallback),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private withBudgetedTransaction<T>(
    deadlineAt: number,
    signal: AbortSignal | undefined,
    callback: (tx: CapitalCallStatusTransaction) => Promise<T>
  ): Promise<T> {
    return withCapitalCallStatusTransaction(callback, {
      hardTimeoutMs: this.remainingTimeoutMs(deadlineAt),
      deadlineAt,
      ...(signal ? { signal } : {}),
    });
  }

  constructor(
    redis: Redis,
    queueName: string = 'capital-call-status',
    options: CapitalCallStatusWorkerOptions = {}
  ) {
    this.redis = redis;
    this.hardTimeoutMs = options.hardTimeoutMs ?? getCapitalCallStatusHardTimeoutMs();
    this.queue = new Queue<CapitalCallStatusJob>(queueName, {
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

    // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration is a renewable ownership lease
    this.worker = new Worker<CapitalCallStatusJob>(queueName, this.processJob.bind(this), {
      connection: redis,
      concurrency: 1,
      // 5 minute ownership lease for status checks (AP-QUEUE-02); execution timeout is DB-scoped.
      lockDuration: 300000,
    });

    this.setupEventHandlers();
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Schedule a status check job
   */
  async scheduleStatusCheck(job: CapitalCallStatusJob): Promise<Job<CapitalCallStatusJob>> {
    try {
      const jobOptions = job.type === 'scheduled-check' ? { delay: 0 } : {};
      const queuedJob = await this.queue.add('status-check', job, jobOptions);

      logger.info(
        { jobId: queuedJob.id, type: job.type, callId: job.callId },
        'Capital call status check scheduled'
      );

      return queuedJob;
    } catch (error) {
      logger.error({ error, job }, 'Error scheduling status check');
      throw error;
    }
  }

  /**
   * Run immediate status check for all calls
   */
  async runImmediateCheck(): Promise<StatusCheckMetrics> {
    const job: CapitalCallStatusJob = {
      type: 'scheduled-check',
      timestamp: new Date(),
      reason: 'immediate-check',
    };

    return this.processScheduledCheck(job);
  }

  /**
   * Process payment confirmation and update call status
   */
  async processPaymentUpdate(callId: string): Promise<void> {
    const job: CapitalCallStatusJob = {
      type: 'payment-update',
      callId,
      timestamp: new Date(),
      reason: 'payment-confirmed',
    };

    await this.scheduleStatusCheck(job);
  }

  /**
   * Get metrics
   */
  getMetrics(): StatusCheckMetrics[] {
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
   * Start the worker with scheduled checks
   */
  async start(): Promise<void> {
    try {
      await this.worker.waitUntilReady();
      logger.info({}, 'Capital call status worker started');

      // Schedule recurring checks
      await this.scheduleRecurringChecks();
      await this.dispatchPendingNotifications();
    } catch (error) {
      logger.error({ error }, 'Error starting worker');
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
      logger.info({}, 'Capital call status worker stopped');
    } catch (error) {
      logger.error({ error }, 'Error stopping worker');
      throw error;
    }
  }

  getBullMqWorker(): Worker<CapitalCallStatusJob> {
    return this.worker;
  }

  async getHealthDetails(): Promise<{ exhaustedOutboxCount: number }> {
    return {
      exhaustedOutboxCount: await countExhaustedCapitalCallNotifications({
        hardTimeoutMs: this.hardTimeoutMs,
      }),
    };
  }

  async dispatchPendingNotifications(
    signal?: AbortSignal,
    deadlineAt = Date.now() + this.hardTimeoutMs
  ): Promise<{
    deliveredCount: number;
    exhaustedCount: number;
  }> {
    return dispatchPendingCapitalCallNotifications({
      hardTimeoutMs: this.remainingTimeoutMs(deadlineAt),
      deadlineAt,
      ...(signal ? { signal } : {}),
    });
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  /**
   * Main job processor
   */
  private async processJob(
    job: Job<CapitalCallStatusJob>,
    _token?: string,
    signal?: AbortSignal
  ): Promise<StatusCheckMetrics> {
    const startTime = Date.now();
    const ownedAbortController = new AbortController();
    const onBullMqAbort = () => ownedAbortController.abort(signal?.reason);
    if (signal?.aborted) onBullMqAbort();
    else signal?.addEventListener('abort', onBullMqAbort, { once: true });
    const timeout = setTimeout(() => {
      ownedAbortController.abort(new CapitalCallStatusHardTimeoutError(this.hardTimeoutMs));
    }, this.hardTimeoutMs);
    const deadlineAt = Date.now() + this.hardTimeoutMs;

    try {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing status check job');
      throwIfCapitalCallStatusAborted(ownedAbortController.signal);

      let metrics: StatusCheckMetrics;

      switch (job.data.type) {
        case 'scheduled-check':
          metrics = await this.processScheduledCheck(
            job.data,
            ownedAbortController.signal,
            deadlineAt
          );
          break;
        case 'payment-update':
          metrics = await this.processPaymentUpdateJob(
            job.data,
            ownedAbortController.signal,
            deadlineAt
          );
          break;
        case 'status-transition':
          metrics = await this.processStatusTransition(job.data);
          break;
        case 'send-reminder':
          metrics = await this.processSendReminder(job.data);
          break;
        default:
          throw new Error(`Unknown job type: ${(job.data as CapitalCallStatusJob).type}`);
      }

      throwIfCapitalCallStatusAborted(ownedAbortController.signal);

      this.metrics.push(metrics);
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      return metrics;
    } catch (error) {
      const duration = Date.now() - startTime;
      if (isCapitalCallStatusHardTimeoutError(error)) {
        runtimeMetrics.capitalCallStatusHardTimeouts.inc();
        runtimeMetrics.capitalCallStatusHardTimeoutDuration.observe(this.hardTimeoutMs / 1000);
        throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
      }
      logger.error({ jobId: job.id, error, duration }, 'Status check job failed');

      const metrics: StatusCheckMetrics = {
        duration,
        callsChecked: 0,
        statusTransitions: 0,
        notificationsSent: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.metrics.push(metrics);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onBullMqAbort);
    }
  }

  /**
   * Process scheduled status check for all calls
   */
  private async processScheduledCheck(
    _job: CapitalCallStatusJob,
    signal?: AbortSignal,
    deadlineAt = Date.now() + this.hardTimeoutMs
  ): Promise<StatusCheckMetrics> {
    const startTime = Date.now();
    let statusTransitions = 0;
    let notificationsSent = 0;
    throwIfCapitalCallStatusAborted(signal);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]!;

    // 1. Find pending calls that should become "due"
    const pendingTodue = await this.withBudgetedTransaction(deadlineAt, signal, (tx) =>
      tx
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          fundId: lpCapitalCalls.fundId,
          dueDate: lpCapitalCalls.dueDate,
          callAmountCents: lpCapitalCalls.callAmountCents,
          version: lpCapitalCalls.version,
          fundName: funds.name,
        })
        .from(lpCapitalCalls)
        .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
        .where(
          and(
            eq(lpCapitalCalls.status, CALL_STATUS.PENDING),
            sql`${lpCapitalCalls.dueDate} <= ${todayStr}`
          )
        )
    );

    for (const call of pendingTodue) {
      throwIfCapitalCallStatusAborted(signal);
      const transitioned = await this.transitionStatus(
        call.id,
        CALL_STATUS.DUE,
        call.version ?? 1n,
        {
          capitalCallId: call.id,
          lpId: call.lpId,
          transitionKind: 'due',
          dueDateBucket: call.dueDate ?? todayStr,
          notificationType: 'capital_call',
          title: 'Capital Call Due Today',
          message: `Your capital call for ${call.fundName ?? 'Unknown Fund'} is due today.`,
          relatedEntityType: 'capital_call',
          relatedEntityId: call.id,
          actionUrl: `/lp/capital-calls/${call.id}`,
        },
        signal,
        deadlineAt
      );
      if (transitioned) {
        statusTransitions++;
        notificationsSent++;
      }
    }

    // 2. Find due calls that should become "overdue"
    const graceDate = new Date(today);
    graceDate.setDate(graceDate.getDate() - GRACE_PERIOD_DAYS);
    const graceDateStr = graceDate.toISOString().split('T')[0];

    const dueToOverdue = await this.withBudgetedTransaction(deadlineAt, signal, (tx) =>
      tx
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          fundId: lpCapitalCalls.fundId,
          dueDate: lpCapitalCalls.dueDate,
          callAmountCents: lpCapitalCalls.callAmountCents,
          version: lpCapitalCalls.version,
          fundName: funds.name,
        })
        .from(lpCapitalCalls)
        .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
        .where(
          and(
            eq(lpCapitalCalls.status, CALL_STATUS.DUE),
            sql`${lpCapitalCalls.dueDate} <= ${graceDateStr}`
          )
        )
    );

    for (const call of dueToOverdue) {
      throwIfCapitalCallStatusAborted(signal);
      const transitioned = await this.transitionStatus(
        call.id,
        CALL_STATUS.OVERDUE,
        call.version ?? 1n,
        {
          capitalCallId: call.id,
          lpId: call.lpId,
          transitionKind: 'overdue',
          dueDateBucket: call.dueDate ?? graceDateStr,
          notificationType: 'capital_call',
          title: 'Capital Call Overdue',
          message: `Your capital call for ${call.fundName ?? 'Unknown Fund'} is now overdue. Please submit payment immediately.`,
          relatedEntityType: 'capital_call',
          relatedEntityId: call.id,
          actionUrl: `/lp/capital-calls/${call.id}`,
        },
        signal,
        deadlineAt
      );
      if (transitioned) {
        statusTransitions++;
        notificationsSent++;
      }
    }

    // 3. Check for upcoming reminders (pending calls within reminder window)
    for (const daysBeforeDue of REMINDER_DAYS) {
      const reminderDate = new Date(today);
      reminderDate.setDate(reminderDate.getDate() + daysBeforeDue);
      const reminderDateStr = reminderDate.toISOString().split('T')[0];

      // Check if we've already sent this reminder today
      const reminderKey = `capital-call-reminder:${reminderDateStr}:${daysBeforeDue}`;
      const redisClient = getReminderRedisClient(this.redis);
      throwIfCapitalCallStatusAborted(signal);
      const alreadySent = await this.bestEffortReminderRedis(
        () => redisClient.get(reminderKey),
        deadlineAt,
        null
      );
      throwIfCapitalCallStatusAborted(signal);

      const upcomingCalls = await this.withBudgetedTransaction(deadlineAt, signal, (tx) =>
        tx
          .select({
            id: lpCapitalCalls.id,
            lpId: lpCapitalCalls.lpId,
            fundId: lpCapitalCalls.fundId,
            dueDate: lpCapitalCalls.dueDate,
            callAmountCents: lpCapitalCalls.callAmountCents,
            fundName: funds.name,
          })
          .from(lpCapitalCalls)
          .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
          .where(
            and(
              eq(lpCapitalCalls.status, CALL_STATUS.PENDING),
              sql`${lpCapitalCalls.dueDate} = ${reminderDateStr}`
            )
          )
      );

      for (const call of upcomingCalls) {
        throwIfCapitalCallStatusAborted(signal);
        const queued = await this.createNotification(
          {
            capitalCallId: call.id,
            lpId: call.lpId,
            transitionKind: `reminder_${daysBeforeDue}d` as
              'reminder_7d' | 'reminder_3d' | 'reminder_1d',
            dueDateBucket: reminderDateStr ?? todayStr,
            notificationType: 'capital_call',
            title: `Capital Call Due in ${daysBeforeDue} Day${daysBeforeDue > 1 ? 's' : ''}`,
            message: `Reminder: Your capital call for ${call.fundName ?? 'Unknown Fund'} is due in ${daysBeforeDue} day${daysBeforeDue > 1 ? 's' : ''}.`,
            relatedEntityType: 'capital_call',
            relatedEntityId: call.id,
            actionUrl: `/lp/capital-calls/${call.id}`,
          },
          signal,
          deadlineAt
        );
        if (queued) notificationsSent++;
      }

      // Redis only avoids repeat enqueue work; outbox uniqueness remains authoritative.
      if (!alreadySent) {
        throwIfCapitalCallStatusAborted(signal);
        await this.bestEffortReminderRedis(
          () => redisClient.setex(reminderKey, 86400, '1').then(() => undefined),
          deadlineAt,
          undefined
        );
        throwIfCapitalCallStatusAborted(signal);
      }
    }

    await this.dispatchPendingNotifications(signal, deadlineAt);

    const callsChecked = pendingTodue.length + dueToOverdue.length;

    const metrics: StatusCheckMetrics = {
      duration: Date.now() - startTime,
      callsChecked,
      statusTransitions,
      notificationsSent,
      success: true,
    };

    logger.info(metrics, 'Scheduled status check completed');
    return metrics;
  }

  /**
   * Process payment update for a specific call
   */
  private async processPaymentUpdateJob(
    job: CapitalCallStatusJob,
    signal?: AbortSignal,
    deadlineAt = Date.now() + this.hardTimeoutMs
  ): Promise<StatusCheckMetrics> {
    const startTime = Date.now();
    throwIfCapitalCallStatusAborted(signal);

    if (!job.callId) {
      throw new Error('callId is required for payment update');
    }
    const callId = job.callId;

    // Get call and its confirmed payments
    const calls = await this.withBudgetedTransaction(deadlineAt, signal, (tx) =>
      tx
        .select({
          id: lpCapitalCalls.id,
          lpId: lpCapitalCalls.lpId,
          callAmountCents: lpCapitalCalls.callAmountCents,
          dueDate: lpCapitalCalls.dueDate,
          paidAmountCents: lpCapitalCalls.paidAmountCents,
          status: lpCapitalCalls.status,
          version: lpCapitalCalls.version,
          fundName: funds.name,
        })
        .from(lpCapitalCalls)
        .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
        .where(eq(lpCapitalCalls.id, callId))
        .limit(1)
    );

    if (calls.length === 0) {
      throw new Error(`Capital call ${job.callId} not found`);
    }

    const call = calls[0]!;
    throwIfCapitalCallStatusAborted(signal);

    // Get total confirmed payments
    const payments = await this.withBudgetedTransaction(deadlineAt, signal, (tx) =>
      tx
        .select({
          totalPaid: sql<bigint>`COALESCE(SUM(${lpPaymentSubmissions.amountCents}), 0)`.as(
            'total_paid'
          ),
        })
        .from(lpPaymentSubmissions)
        .where(
          and(eq(lpPaymentSubmissions.callId, callId), eq(lpPaymentSubmissions.status, 'confirmed'))
        )
    );

    const totalPaidCents = payments[0]?.totalPaid ?? 0n;
    const callAmountCents = call.callAmountCents ?? 0n;

    let newStatus: CallStatus = call.status as CallStatus;
    let statusTransitions = 0;
    let notificationsSent = 0;

    if (totalPaidCents >= callAmountCents) {
      newStatus = CALL_STATUS.PAID;
    } else if (totalPaidCents > 0n) {
      newStatus = CALL_STATUS.PARTIAL;
    }

    if (newStatus !== call.status) {
      const paymentStatus = newStatus === CALL_STATUS.PAID ? CALL_STATUS.PAID : CALL_STATUS.PARTIAL;
      const transitioned = await transitionCapitalCallWithPayment({
        callId: call.id,
        newStatus: paymentStatus,
        currentVersion: call.version ?? 1n,
        paidAmountCents: totalPaidCents,
        paidDate:
          newStatus === CALL_STATUS.PAID ? (new Date().toISOString().split('T')[0] ?? null) : null,
        hardTimeoutMs: this.remainingTimeoutMs(deadlineAt),
        deadlineAt,
        ...(signal ? { signal } : {}),
        ...(newStatus === CALL_STATUS.PAID || newStatus === CALL_STATUS.PARTIAL
          ? {
              notification: {
                capitalCallId: call.id,
                lpId: call.lpId,
                transitionKind: newStatus === CALL_STATUS.PAID ? 'paid' : 'partial',
                dueDateBucket: call.dueDate ?? new Date().toISOString().split('T')[0]!,
                notificationType: 'capital_call',
                title:
                  newStatus === CALL_STATUS.PAID
                    ? 'Capital Call Paid in Full'
                    : 'Capital Call Partially Paid',
                message:
                  newStatus === CALL_STATUS.PAID
                    ? `Your capital call for ${call.fundName ?? 'Unknown Fund'} has been paid in full. Thank you!`
                    : `Your capital call for ${call.fundName ?? 'Unknown Fund'} has received a partial payment.`,
                relatedEntityType: 'capital_call',
                relatedEntityId: call.id,
                actionUrl: `/lp/capital-calls/${call.id}`,
              },
            }
          : {}),
      });

      if (transitioned) {
        statusTransitions++;
        notificationsSent++;
      }
    }

    await this.dispatchPendingNotifications(signal, deadlineAt);

    return {
      duration: Date.now() - startTime,
      callsChecked: 1,
      statusTransitions,
      notificationsSent,
      success: true,
    };
  }

  /**
   * Process manual status transition
   */
  private async processStatusTransition(_job: CapitalCallStatusJob): Promise<StatusCheckMetrics> {
    // This would be called for manual status transitions by GPs
    // Implementation similar to processPaymentUpdateJob
    return {
      duration: 0,
      callsChecked: 0,
      statusTransitions: 0,
      notificationsSent: 0,
      success: true,
    };
  }

  /**
   * Process reminder notification
   */
  private async processSendReminder(_job: CapitalCallStatusJob): Promise<StatusCheckMetrics> {
    // For manual reminder triggers
    return {
      duration: 0,
      callsChecked: 0,
      statusTransitions: 0,
      notificationsSent: 0,
      success: true,
    };
  }

  /**
   * Transition call status with optimistic locking
   */
  private async transitionStatus(
    callId: string,
    newStatus: CallStatus,
    currentVersion: bigint,
    notification: CapitalCallNotificationInput,
    signal?: AbortSignal,
    deadlineAt = Date.now() + this.hardTimeoutMs
  ): Promise<boolean> {
    const transitioned = await transitionCapitalCallWithNotification({
      callId,
      newStatus,
      currentVersion,
      notification,
      hardTimeoutMs: this.remainingTimeoutMs(deadlineAt),
      deadlineAt,
      ...(signal ? { signal } : {}),
    });

    if (transitioned) {
      logger.info({ callId, newStatus }, 'Capital call status transitioned');
    }
    return transitioned;
  }

  /**
   * Create notification for LP
   */
  private async createNotification(
    notification: CapitalCallNotificationInput,
    signal?: AbortSignal,
    deadlineAt = Date.now() + this.hardTimeoutMs
  ): Promise<boolean> {
    const queued = await enqueueCapitalCallNotification(notification, {
      hardTimeoutMs: this.remainingTimeoutMs(deadlineAt),
      deadlineAt,
      ...(signal ? { signal } : {}),
    });

    logger.info(
      { lpId: notification.lpId, type: notification.notificationType, title: notification.title },
      'Capital call notification queued'
    );
    return queued;
  }

  /**
   * Schedule recurring status checks
   */
  private async scheduleRecurringChecks(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CAPITAL_CALL_STATUS_SCHEDULER_ID,
      { every: CHECK_INTERVAL_MS },
      {
        name: 'scheduled-check',
        data: {
          type: 'scheduled-check',
          timestamp: new Date(),
          reason: 'recurring-check',
        },
      }
    );

    logger.info({ intervalMs: CHECK_INTERVAL_MS }, 'Recurring status checks scheduled');
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      logger.info({ jobId: job.id }, 'Status check job completed');
    });

    this.worker.on('failed', (job, error) => {
      logger.error({ jobId: job?.id, error }, 'Status check job failed');
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
export function createCapitalCallStatusWorker(
  redis: Redis,
  queueName?: string,
  options?: CapitalCallStatusWorkerOptions
): CapitalCallStatusWorker {
  return new CapitalCallStatusWorker(redis, queueName, options);
}

/**
 * Global worker instance (singleton pattern)
 */
let globalWorker: CapitalCallStatusWorker | null = null;

export function getOrCreateCapitalCallStatusWorker(redis: Redis): CapitalCallStatusWorker {
  if (!globalWorker) {
    globalWorker = new CapitalCallStatusWorker(redis);
  }
  return globalWorker;
}

/**
 * Cleanup function for process shutdown
 */
export async function cleanupCapitalCallStatusWorker(): Promise<void> {
  const worker = globalWorker;
  if (worker) {
    globalWorker = null;
    await worker.stop();
  }
}
