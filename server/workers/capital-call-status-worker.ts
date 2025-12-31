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

import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { db } from '../db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { lpCapitalCalls, lpNotifications, lpPaymentSubmissions } from '@shared/schema-lp-sprint3';
import { funds } from '@shared/schema';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

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

const REMINDER_DAYS = [7, 3, 1, 0]; // Days before due date to send reminders
const GRACE_PERIOD_DAYS = 3; // Days after due date before marking overdue
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ============================================================================
// WORKER CLASS
// ============================================================================

export class CapitalCallStatusWorker {
  private queue: Queue<CapitalCallStatusJob>;
  private worker: Worker<CapitalCallStatusJob>;
  private redis: Redis;
  private metrics: StatusCheckMetrics[] = [];

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_BACKOFF_MS = 5000;

  constructor(redis: Redis, queueName: string = 'capital-call-status') {
    this.redis = redis;
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

    // eslint-disable-next-line povc-security/require-bullmq-config -- lockDuration serves as timeout
    this.worker = new Worker<CapitalCallStatusJob>(queueName, this.processJob.bind(this), {
      connection: redis,
      concurrency: 1,
      // 5 minute lock duration for status checks (AP-QUEUE-02)
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
      const queuedJob = await this.queue.add('status-check', job, {
        delay: job.type === 'scheduled-check' ? 0 : undefined,
      });

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

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  /**
   * Main job processor
   */
  private async processJob(job: Job<CapitalCallStatusJob>): Promise<StatusCheckMetrics> {
    const startTime = Date.now();

    try {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing status check job');

      let metrics: StatusCheckMetrics;

      switch (job.data.type) {
        case 'scheduled-check':
          metrics = await this.processScheduledCheck(job.data);
          break;
        case 'payment-update':
          metrics = await this.processPaymentUpdateJob(job.data);
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

      this.metrics.push(metrics);
      if (this.metrics.length > 100) {
        this.metrics.shift();
      }

      return metrics;
    } catch (error) {
      const duration = Date.now() - startTime;
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
    }
  }

  /**
   * Process scheduled status check for all calls
   */
  private async processScheduledCheck(_job: CapitalCallStatusJob): Promise<StatusCheckMetrics> {
    const startTime = Date.now();
    let statusTransitions = 0;
    let notificationsSent = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // 1. Find pending calls that should become "due"
    const pendingTodue = await db
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
        and(eq(lpCapitalCalls.status, CALL_STATUS.PENDING), lte(lpCapitalCalls.dueDate, todayStr))
      );

    for (const call of pendingTodue) {
      await this.transitionStatus(call.id, CALL_STATUS.DUE, call.version ?? 1n);
      await this.createNotification(
        call.lpId,
        'capital_call',
        'Capital Call Due Today',
        `Your capital call for ${call.fundName ?? 'Unknown Fund'} is due today.`,
        call.id,
        'capital_call'
      );
      statusTransitions++;
      notificationsSent++;
    }

    // 2. Find due calls that should become "overdue"
    const graceDate = new Date(today);
    graceDate.setDate(graceDate.getDate() - GRACE_PERIOD_DAYS);
    const graceDateStr = graceDate.toISOString().split('T')[0];

    const dueToOverdue = await db
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
        and(eq(lpCapitalCalls.status, CALL_STATUS.DUE), lte(lpCapitalCalls.dueDate, graceDateStr))
      );

    for (const call of dueToOverdue) {
      await this.transitionStatus(call.id, CALL_STATUS.OVERDUE, call.version ?? 1n);
      await this.createNotification(
        call.lpId,
        'capital_call',
        'Capital Call Overdue',
        `Your capital call for ${call.fundName ?? 'Unknown Fund'} is now overdue. Please submit payment immediately.`,
        call.id,
        'capital_call'
      );
      statusTransitions++;
      notificationsSent++;
    }

    // 3. Check for upcoming reminders (pending calls within reminder window)
    for (const daysBeforeDue of REMINDER_DAYS) {
      if (daysBeforeDue === 0) continue; // 0 days = due date, handled above

      const reminderDate = new Date(today);
      reminderDate.setDate(reminderDate.getDate() + daysBeforeDue);
      const reminderDateStr = reminderDate.toISOString().split('T')[0];

      // Check if we've already sent this reminder today
      const reminderKey = `capital-call-reminder:${reminderDateStr}:${daysBeforeDue}`;
      const alreadySent = await this.redis.get(reminderKey);

      if (!alreadySent) {
        const upcomingCalls = await db
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
              eq(lpCapitalCalls.dueDate, reminderDateStr)
            )
          );

        for (const call of upcomingCalls) {
          await this.createNotification(
            call.lpId,
            'capital_call',
            `Capital Call Due in ${daysBeforeDue} Day${daysBeforeDue > 1 ? 's' : ''}`,
            `Reminder: Your capital call for ${call.fundName ?? 'Unknown Fund'} is due in ${daysBeforeDue} day${daysBeforeDue > 1 ? 's' : ''}.`,
            call.id,
            'capital_call'
          );
          notificationsSent++;
        }

        // Mark this reminder as sent (TTL 24 hours)
        await this.redis.setex(reminderKey, 86400, '1');
      }
    }

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
  private async processPaymentUpdateJob(job: CapitalCallStatusJob): Promise<StatusCheckMetrics> {
    const startTime = Date.now();

    if (!job.callId) {
      throw new Error('callId is required for payment update');
    }

    // Get call and its confirmed payments
    const calls = await db
      .select({
        id: lpCapitalCalls.id,
        lpId: lpCapitalCalls.lpId,
        callAmountCents: lpCapitalCalls.callAmountCents,
        paidAmountCents: lpCapitalCalls.paidAmountCents,
        status: lpCapitalCalls.status,
        version: lpCapitalCalls.version,
        fundName: funds.name,
      })
      .from(lpCapitalCalls)
      .leftJoin(funds, eq(lpCapitalCalls.fundId, funds.id))
      .where(eq(lpCapitalCalls.id, job.callId))
      .limit(1);

    if (calls.length === 0) {
      throw new Error(`Capital call ${job.callId} not found`);
    }

    const call = calls[0]!;

    // Get total confirmed payments
    const payments = await db
      .select({
        totalPaid: sql<bigint>`COALESCE(SUM(${lpPaymentSubmissions.amountCents}), 0)`.as(
          'total_paid'
        ),
      })
      .from(lpPaymentSubmissions)
      .where(
        and(
          eq(lpPaymentSubmissions.callId, job.callId),
          eq(lpPaymentSubmissions.status, 'confirmed')
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
      await this.transitionStatus(call.id, newStatus, call.version ?? 1n);

      // Update paid amount
      await db
        .update(lpCapitalCalls)
        .set({
          paidAmountCents: totalPaidCents,
          paidDate: newStatus === CALL_STATUS.PAID ? new Date().toISOString().split('T')[0] : null,
          updatedAt: new Date(),
        })
        .where(eq(lpCapitalCalls.id, job.callId));

      if (newStatus === CALL_STATUS.PAID) {
        await this.createNotification(
          call.lpId,
          'capital_call',
          'Capital Call Paid in Full',
          `Your capital call for ${call.fundName ?? 'Unknown Fund'} has been paid in full. Thank you!`,
          call.id,
          'capital_call'
        );
        notificationsSent++;
      }

      statusTransitions++;
    }

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
    currentVersion: bigint
  ): Promise<void> {
    const result = await db
      .update(lpCapitalCalls)
      .set({
        status: newStatus,
        version: currentVersion + 1n,
        updatedAt: new Date(),
      })
      .where(and(eq(lpCapitalCalls.id, callId), eq(lpCapitalCalls.version, currentVersion)))
      .returning({ id: lpCapitalCalls.id });

    if (result.length === 0) {
      throw new Error(`Optimistic lock failed for call ${callId} - concurrent modification`);
    }

    logger.info({ callId, newStatus }, 'Capital call status transitioned');
  }

  /**
   * Create notification for LP
   */
  private async createNotification(
    lpId: number,
    type: string,
    title: string,
    message: string,
    relatedEntityId: string,
    relatedEntityType: string
  ): Promise<void> {
    await db.insert(lpNotifications).values({
      id: uuidv4(),
      lpId,
      type,
      title,
      message,
      relatedEntityId,
      relatedEntityType,
      actionUrl: `/lp/capital-calls/${relatedEntityId}`,
      read: false,
      createdAt: new Date(),
    });

    logger.info({ lpId, type, title }, 'Notification created');
  }

  /**
   * Schedule recurring status checks
   */
  private async scheduleRecurringChecks(): Promise<void> {
    // Add a repeatable job
    await this.queue.add(
      'scheduled-check',
      {
        type: 'scheduled-check',
        timestamp: new Date(),
        reason: 'recurring-check',
      },
      {
        repeat: {
          every: CHECK_INTERVAL_MS,
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
  queueName?: string
): CapitalCallStatusWorker {
  return new CapitalCallStatusWorker(redis, queueName);
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
