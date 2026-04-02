import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../lib/logger';
import { ensureAttributedFundMetricsForCalcRun } from './fund-metrics-attribution-service';
import { jobOutbox, alertRules, type JobOutbox } from '@shared/schema';
import { varianceTrackingService } from './variance-tracking';
import { VarianceAlertEvaluationService } from './variance-alert-evaluation';

type PeriodicAlertFrequency = 'hourly' | 'daily' | 'weekly';

type ScheduledVarianceAlertJobPayload = {
  kind: 'variance_alert_evaluation';
  fundId: number;
  frequency: PeriodicAlertFrequency;
  windowStart: string;
  windowEnd: string;
};

type AlertAutomationHealth = {
  enabled: boolean;
  planner: {
    running: boolean;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
  };
  processor: {
    running: boolean;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
    staleRecovered: number;
  };
  counters: {
    planned: Record<PeriodicAlertFrequency, number>;
    processed: Record<PeriodicAlertFrequency, number>;
    failed: Record<PeriodicAlertFrequency, number>;
    skipped: number;
  };
};

const log = logger.child({ module: 'variance-alert-automation' });
const JOB_TYPE = 'variance_alert_evaluation';
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const RECOVERY_SWEEP_MS = 5 * 60 * 1000;
const DEFAULT_PLANNER_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PROCESSOR_INTERVAL_MS = 30 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 30 * 1000;

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function withTimeout<T>(
  label: string,
  work: () => Promise<T> | T,
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void Promise.resolve()
      .then(() => work())
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function getPeriodicWindowStart(now: Date, frequency: PeriodicAlertFrequency): Date {
  switch (frequency) {
    case 'hourly':
      return new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours(),
          0,
          0,
          0
        )
      );
    case 'daily':
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
      );
    case 'weekly': {
      const day = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
      );
      start.setUTCDate(start.getUTCDate() - (day - 1));
      return start;
    }
  }
}

function mapJobRow(row: Record<string, unknown>): JobOutbox {
  return {
    id: String(row['id']),
    jobType: String(row['jobType'] ?? row['job_type']),
    dedupeKey: (row['dedupeKey'] ?? row['dedupe_key'] ?? null) as string | null,
    payload: row['payload'] as Record<string, unknown>,
    status: String(row['status']) as JobOutbox['status'],
    priority: Number(row['priority'] ?? 0),
    attemptCount: Number(row['attemptCount'] ?? row['attempt_count'] ?? 0),
    maxAttempts: Number(row['maxAttempts'] ?? row['max_attempts'] ?? 3),
    scheduledFor: (row['scheduledFor'] ?? row['scheduled_for'] ?? null) as Date | null,
    processingAt: (row['processingAt'] ?? row['processing_at'] ?? null) as Date | null,
    nextRunAt: (row['nextRunAt'] ?? row['next_run_at'] ?? null) as Date | null,
    completedAt: (row['completedAt'] ?? row['completed_at'] ?? null) as Date | null,
    errorMessage: (row['errorMessage'] ?? row['error_message'] ?? null) as string | null,
    createdAt: (row['createdAt'] ?? row['created_at'] ?? new Date()) as Date,
    updatedAt: (row['updatedAt'] ?? row['updated_at'] ?? new Date()) as Date,
  };
}

export class VarianceAlertAutomationService {
  private readonly baselines = varianceTrackingService.baselines;
  private readonly evaluator = new VarianceAlertEvaluationService(
    this.baselines,
    varianceTrackingService.calculations,
    varianceTrackingService.alerts
  );
  private plannerTimer: NodeJS.Timeout | null = null;
  private processorTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private plannerInFlight = false;
  private processorInFlight = false;
  private enabled = false;
  private readonly healthState: {
    planner: { lastStartedAt: Date | null; lastCompletedAt: Date | null; lastError: string | null };
    processor: {
      lastStartedAt: Date | null;
      lastCompletedAt: Date | null;
      lastError: string | null;
      staleRecovered: number;
    };
    counters: {
      planned: Record<PeriodicAlertFrequency, number>;
      processed: Record<PeriodicAlertFrequency, number>;
      failed: Record<PeriodicAlertFrequency, number>;
      skipped: number;
    };
  } = {
    planner: { lastStartedAt: null, lastCompletedAt: null, lastError: null },
    processor: { lastStartedAt: null, lastCompletedAt: null, lastError: null, staleRecovered: 0 },
    counters: {
      planned: { hourly: 0, daily: 0, weekly: 0 },
      processed: { hourly: 0, daily: 0, weekly: 0 },
      failed: { hourly: 0, daily: 0, weekly: 0 },
      skipped: 0,
    },
  };

  start(options?: { enabled?: boolean; plannerIntervalMs?: number; processorIntervalMs?: number }) {
    const shouldEnable =
      options?.enabled ??
      (process.env['NODE_ENV'] !== 'test' &&
        process.env['ENABLE_VARIANCE_ALERT_AUTOMATION'] !== '0');

    if (!shouldEnable) {
      this.enabled = false;
      log.info('Variance alert automation disabled');
      return;
    }

    if (this.enabled) {
      log.debug('Variance alert automation already started');
      return;
    }

    this.enabled = true;

    const plannerIntervalMs =
      options?.plannerIntervalMs ??
      parsePositiveIntEnv('VARIANCE_ALERT_PLANNER_INTERVAL_MS', DEFAULT_PLANNER_INTERVAL_MS);
    const processorIntervalMs =
      options?.processorIntervalMs ??
      parsePositiveIntEnv('VARIANCE_ALERT_PROCESSOR_INTERVAL_MS', DEFAULT_PROCESSOR_INTERVAL_MS);

    this.plannerTimer = setInterval(() => {
      void this.runPlannerCycle();
    }, plannerIntervalMs);
    this.processorTimer = setInterval(() => {
      void this.runProcessorCycle();
    }, processorIntervalMs);
    this.recoveryTimer = setInterval(() => {
      void this.recoverStaleProcessingJobs();
    }, RECOVERY_SWEEP_MS);

    void this.runPlannerCycle();
    void this.runProcessorCycle();
    log.info(
      { plannerIntervalMs, processorIntervalMs, recoverySweepMs: RECOVERY_SWEEP_MS },
      'Variance alert automation started'
    );
  }

  async stop(): Promise<void> {
    this.enabled = false;

    if (this.plannerTimer) {
      clearInterval(this.plannerTimer);
      this.plannerTimer = null;
    }
    if (this.processorTimer) {
      clearInterval(this.processorTimer);
      this.processorTimer = null;
    }
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  getHealth(): AlertAutomationHealth {
    return {
      enabled: this.enabled,
      planner: {
        running: this.plannerInFlight,
        lastStartedAt: toIsoOrNull(this.healthState.planner.lastStartedAt),
        lastCompletedAt: toIsoOrNull(this.healthState.planner.lastCompletedAt),
        lastError: this.healthState.planner.lastError,
      },
      processor: {
        running: this.processorInFlight,
        lastStartedAt: toIsoOrNull(this.healthState.processor.lastStartedAt),
        lastCompletedAt: toIsoOrNull(this.healthState.processor.lastCompletedAt),
        lastError: this.healthState.processor.lastError,
        staleRecovered: this.healthState.processor.staleRecovered,
      },
      counters: this.healthState.counters,
    };
  }

  async runCalcRunCompletion(runId: number, fundId: number): Promise<void> {
    const startedAt = new Date();
    log.info(
      { event: 'alert.calc_run.started', runId, fundId },
      'Starting calc-run alert automation'
    );

    try {
      await withTimeout('ensureAttributedFundMetricsForCalcRun', () =>
        ensureAttributedFundMetricsForCalcRun(runId)
      );
      const baseline = await withTimeout('createBaselineFromCalcRun', () =>
        this.baselines.createBaselineFromCalcRun(runId)
      );

      const rules = await db.query.alertRules.findMany({
        where: and(
          eq(alertRules.fundId, fundId),
          eq(alertRules.isEnabled, true),
          eq(alertRules.checkFrequency, 'realtime')
        ),
      });

      for (const rule of rules) {
        await withTimeout('evaluateRealtimeVarianceAlerts', () =>
          this.evaluator.evaluateVarianceAlerts({
            fundId,
            baselineId: baseline.id,
            runId,
            asOfDate: baseline.snapshotDate,
            source: 'calc_run_completion',
            persistAlerts: true,
            rules: [rule],
            checkFrequency: 'realtime',
            executionKey: `calc:${runId}:${baseline.id}:${rule.id}`,
          })
        );
      }

      log.info(
        {
          event: 'alert.calc_run.completed',
          runId,
          fundId,
          baselineId: baseline.id,
          durationMs: Date.now() - startedAt.getTime(),
          ruleCount: rules.length,
        },
        'Completed calc-run alert automation'
      );
    } catch (error) {
      log.error(
        {
          event: 'alert.calc_run.failed',
          runId,
          fundId,
          err: error,
        },
        'Calc-run alert automation failed'
      );
      throw error;
    }
  }

  async planScheduledEvaluations(now = new Date()): Promise<number> {
    const periodicRules = await db.query.alertRules.findMany({
      where: and(
        eq(alertRules.isEnabled, true),
        inArray(alertRules.checkFrequency, ['hourly', 'daily', 'weekly'])
      ),
      columns: {
        fundId: true,
        checkFrequency: true,
      },
    });

    const ruleGroups = new Map<string, { fundId: number; frequency: PeriodicAlertFrequency }>();
    for (const rule of periodicRules) {
      if (
        rule.fundId == null ||
        rule.checkFrequency == null ||
        rule.checkFrequency === 'realtime'
      ) {
        continue;
      }

      const frequency = rule.checkFrequency as PeriodicAlertFrequency;
      ruleGroups.set(`${rule.fundId}:${frequency}`, { fundId: rule.fundId, frequency });
    }

    let enqueued = 0;

    for (const group of ruleGroups.values()) {
      const defaultBaseline = await this.baselines.getBaselines(group.fundId, {
        isDefault: true,
        limit: 1,
      });
      if (!defaultBaseline[0]) {
        this.healthState.counters.skipped += 1;
        log.info(
          {
            event: 'alert.planner.skipped',
            fundId: group.fundId,
            frequency: group.frequency,
            reason: 'missing_default_baseline',
          },
          'Skipping scheduled alert planning for fund without a default baseline'
        );
        continue;
      }

      const windowStart = getPeriodicWindowStart(now, group.frequency);
      const payload: ScheduledVarianceAlertJobPayload = {
        kind: 'variance_alert_evaluation',
        fundId: group.fundId,
        frequency: group.frequency,
        windowStart: windowStart.toISOString(),
        windowEnd: now.toISOString(),
      };
      const dedupeKey = `variance-alert:${group.fundId}:${group.frequency}:${windowStart.toISOString()}`;

      const insertResult = await db
        .insert(jobOutbox)
        .values({
          jobType: JOB_TYPE,
          dedupeKey,
          payload,
          status: 'pending',
          attemptCount: 0,
          maxAttempts: 3,
          priority: 0,
          scheduledFor: now,
          nextRunAt: now,
        })
        .onConflictDoNothing()
        .returning();

      if (!insertResult[0]) {
        continue;
      }

      enqueued += 1;
      this.healthState.counters.planned[group.frequency] += 1;
      log.info(
        {
          event: 'alert.planner.enqueued',
          fundId: group.fundId,
          frequency: group.frequency,
          windowStart: payload.windowStart,
          dedupeKey,
        },
        'Enqueued scheduled alert evaluation job'
      );
    }

    return enqueued;
  }

  async recoverStaleProcessingJobs(now = new Date()): Promise<number> {
    const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);

    const failedRows = await db.execute(sql`
      UPDATE job_outbox
      SET
        status = 'failed',
        processing_at = NULL,
        error_message = COALESCE(error_message, 'stale processing exceeded max attempts'),
        updated_at = NOW()
      WHERE job_type = ${JOB_TYPE}
        AND status = 'processing'
        AND processing_at < ${staleBefore}
        AND attempt_count >= max_attempts
      RETURNING id
    `);

    const pendingRows = await db.execute(sql`
      UPDATE job_outbox
      SET
        status = 'pending',
        processing_at = NULL,
        next_run_at = NOW(),
        error_message = 'Recovered stale processing lease',
        updated_at = NOW()
      WHERE job_type = ${JOB_TYPE}
        AND status = 'processing'
        AND processing_at < ${staleBefore}
        AND attempt_count < max_attempts
      RETURNING id
    `);

    const recoveredCount = failedRows.rows.length + pendingRows.rows.length;
    if (recoveredCount > 0) {
      this.healthState.processor.staleRecovered += recoveredCount;
      log.warn(
        {
          event: 'alert.processor.recovered_stale',
          recoveredCount,
          staleBefore: staleBefore.toISOString(),
        },
        'Recovered stale variance alert jobs'
      );
    }

    return recoveredCount;
  }

  async claimNextScheduledEvaluationJob(): Promise<JobOutbox | null> {
    const result = await db.execute(sql`
      WITH next_job AS (
        SELECT id
        FROM job_outbox
        WHERE job_type = ${JOB_TYPE}
          AND status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= NOW())
          AND (next_run_at IS NULL OR next_run_at <= NOW())
        ORDER BY next_run_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE job_outbox AS j
      SET
        status = 'processing',
        processing_at = NOW(),
        attempt_count = COALESCE(j.attempt_count, 0) + 1,
        updated_at = NOW()
      FROM next_job
      WHERE j.id = next_job.id
      RETURNING
        j.id,
        j.job_type AS "jobType",
        j.dedupe_key AS "dedupeKey",
        j.payload,
        j.status,
        j.priority,
        j.attempt_count AS "attemptCount",
        j.max_attempts AS "maxAttempts",
        j.scheduled_for AS "scheduledFor",
        j.processing_at AS "processingAt",
        j.next_run_at AS "nextRunAt",
        j.completed_at AS "completedAt",
        j.error_message AS "errorMessage",
        j.created_at AS "createdAt",
        j.updated_at AS "updatedAt"
    `);

    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row ? mapJobRow(row) : null;
  }

  async processScheduledEvaluationJob(job: JobOutbox): Promise<void> {
    const payload = job.payload as Partial<ScheduledVarianceAlertJobPayload>;
    if (
      payload.kind !== 'variance_alert_evaluation' ||
      typeof payload.fundId !== 'number' ||
      (payload.frequency !== 'hourly' &&
        payload.frequency !== 'daily' &&
        payload.frequency !== 'weekly') ||
      typeof payload.windowStart !== 'string' ||
      typeof payload.windowEnd !== 'string'
    ) {
      await this.markJobCancelled(job.id, 'Invalid variance alert job payload');
      return;
    }

    const rules = await db.query.alertRules.findMany({
      where: and(
        eq(alertRules.fundId, payload.fundId),
        eq(alertRules.isEnabled, true),
        eq(alertRules.checkFrequency, payload.frequency)
      ),
    });

    if (rules.length === 0) {
      await this.markJobCancelled(job.id, 'No enabled rules matched scheduled frequency');
      return;
    }

    const defaultBaseline = await this.baselines.getBaselines(payload.fundId, {
      isDefault: true,
      limit: 1,
    });
    const baseline = defaultBaseline[0];
    if (!baseline) {
      await this.markJobCancelled(
        job.id,
        'No default baseline found for scheduled alert evaluation'
      );
      this.healthState.counters.skipped += 1;
      return;
    }

    const windowStart = new Date(payload.windowStart);
    const asOfDate = new Date(payload.windowEnd);

    for (const rule of rules) {
      await this.evaluator.evaluateVarianceAlerts({
        fundId: payload.fundId,
        baselineId: baseline.id,
        asOfDate,
        source: 'scheduler',
        persistAlerts: true,
        rules: [rule],
        checkFrequency: payload.frequency,
        executionKey: `sched:${payload.fundId}:${baseline.id}:${payload.frequency}:${windowStart.toISOString()}:${rule.id}`,
        windowStart,
      });
    }

    await this.markJobCompleted(job.id);
    this.healthState.counters.processed[payload.frequency] += 1;
    log.info(
      {
        event: 'alert.processor.completed',
        jobId: job.id,
        fundId: payload.fundId,
        frequency: payload.frequency,
        windowStart: payload.windowStart,
        ruleCount: rules.length,
      },
      'Completed scheduled alert evaluation job'
    );
  }

  private async runPlannerCycle(): Promise<void> {
    if (!this.enabled || this.plannerInFlight) {
      return;
    }

    this.plannerInFlight = true;
    this.healthState.planner.lastStartedAt = new Date();

    try {
      await this.planScheduledEvaluations();
      this.healthState.planner.lastCompletedAt = new Date();
      this.healthState.planner.lastError = null;
    } catch (error) {
      this.healthState.planner.lastError =
        error instanceof Error ? error.message : 'Unknown planner error';
      log.error({ err: error }, 'Variance alert planner cycle failed');
    } finally {
      this.plannerInFlight = false;
    }
  }

  private async runProcessorCycle(): Promise<void> {
    if (!this.enabled || this.processorInFlight) {
      return;
    }

    this.processorInFlight = true;
    this.healthState.processor.lastStartedAt = new Date();
    let claimedJob: JobOutbox | null = null;

    try {
      claimedJob = await this.claimNextScheduledEvaluationJob();
      if (!claimedJob) {
        this.healthState.processor.lastCompletedAt = new Date();
        this.healthState.processor.lastError = null;
        return;
      }

      const payload = claimedJob.payload as Partial<ScheduledVarianceAlertJobPayload>;
      log.info(
        {
          event: 'alert.processor.claimed',
          jobId: claimedJob.id,
          fundId: payload.fundId,
          frequency: payload.frequency,
          windowStart: payload.windowStart,
        },
        'Claimed scheduled alert evaluation job'
      );

      await this.processScheduledEvaluationJob(claimedJob);
      this.healthState.processor.lastCompletedAt = new Date();
      this.healthState.processor.lastError = null;
    } catch (error) {
      this.healthState.processor.lastError =
        error instanceof Error ? error.message : 'Unknown processor error';
      if (claimedJob) {
        await this.handleJobFailure(claimedJob, this.healthState.processor.lastError);
      }
      log.error({ err: error }, 'Variance alert processor cycle failed');
    } finally {
      this.processorInFlight = false;
    }
  }

  private async markJobCompleted(jobId: string) {
    await db
      .update(jobOutbox)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobOutbox.id, jobId));
  }

  private async markJobCancelled(jobId: string, errorMessage: string) {
    await db
      .update(jobOutbox)
      .set({
        status: 'cancelled',
        errorMessage,
        processingAt: null,
        updatedAt: new Date(),
      })
      .where(eq(jobOutbox.id, jobId));

    log.info(
      { event: 'alert.processor.failed', jobId, errorMessage },
      'Cancelled scheduled alert job'
    );
  }

  private async handleJobFailure(job: JobOutbox, errorMessage: string) {
    const shouldFailTerminally = (job.attemptCount ?? 0) >= (job.maxAttempts ?? 3);
    const payload = job.payload as Partial<ScheduledVarianceAlertJobPayload>;

    await db
      .update(jobOutbox)
      .set({
        status: shouldFailTerminally ? 'failed' : 'pending',
        processingAt: null,
        nextRunAt: shouldFailTerminally ? job.nextRunAt : new Date(),
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobOutbox.id, job.id));

    if (
      payload.frequency === 'hourly' ||
      payload.frequency === 'daily' ||
      payload.frequency === 'weekly'
    ) {
      this.healthState.counters.failed[payload.frequency] += 1;
    }

    log.error(
      {
        event: 'alert.processor.failed',
        jobId: job.id,
        frequency: payload.frequency,
        errorMessage,
        terminal: shouldFailTerminally,
      },
      'Scheduled alert evaluation job failed'
    );
  }
}

export const varianceAlertAutomationService = new VarianceAlertAutomationService();
