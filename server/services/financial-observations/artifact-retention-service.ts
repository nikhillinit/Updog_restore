/**
 * Artifact retention lifecycle sweep (PLAN_61 Wave D, Task 8).
 *
 * Reclaims raw source-artifact payloads past their retention window and expires
 * the uncommitted work that depended on them. Runs through the existing
 * `job_outbox` planner/claim/process cycle (the repo has no BullMQ cron
 * precedent) and bootstraps only on the Docker/Railway `registerRoutes` surface
 * (R33-a). Correctness never depends on this job's liveness: commit-side expiry
 * is enforced check-on-use by Task 6 (`import-batch-expiry.ts`). This service is
 * storage reclamation plus the terminal state transitions only.
 *
 * Deferral: a due batch that still has staged groups or open reconciliation
 * cases receives ONE bounded, logged extension (`purge_after + 90 days`); once
 * that extension elapses it is purged. There is no dedicated acknowledgement
 * column (the migration tail is frozen at 0039), so the single extension is the
 * deferral mechanism and the exit gate ("no raw payload past retention +
 * extension remains readable") requires the post-extension purge to be automatic.
 *
 * @module server/services/financial-observations/artifact-retention-service
 */
import { eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import { logger } from '../../lib/logger';
import { jobOutbox, type JobOutbox } from '@shared/schema';
import type { ReconciliationCaseHistoryEntryV1 } from '../../../shared/contracts/financial-observations/reconciliation.contract';

const log = logger.child({ module: 'artifact-retention' });
const DAY_MS = 86_400_000;

export const RETENTION_JOB_TYPE = 'artifact_retention_sweep';
export const RETENTION_EXTENSION_DAYS = 90;
export const RETENTION_STARTUP_CATCHUP_DAYS = 30;
export const RETENTION_EXTENSION_REASON =
  'deferred: staged groups or open reconciliation cases at retention';

const DEFAULT_PLANNER_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_PROCESSOR_INTERVAL_MS = 60 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Pure decision core (unit-tested, no DB, fixed clock injected as `now`)
// ---------------------------------------------------------------------------

export type RetentionDisposition = 'extend' | 'purge' | 'skip';

export interface RetentionSweepBatchRow {
  id: number;
  fundId: number;
  sourceArtifactId: number | null;
  status: string;
  purgeAfter: Date;
  retentionExtendedUntil: Date | null;
  purgedAt: Date | null;
  hasUncommittedObservations: boolean;
  hasOpenCases: boolean;
}

export interface RetentionPurgeResult {
  becameExpired: boolean;
  expiredCaseIds: number[];
}

export interface RetentionSweepPorts {
  selectDueBatches(now: Date): Promise<RetentionSweepBatchRow[]>;
  extendBatch(batch: RetentionSweepBatchRow, now: Date): Promise<void>;
  purgeBatch(batch: RetentionSweepBatchRow, now: Date): Promise<RetentionPurgeResult>;
}

export interface RetentionSweepSummary {
  extended: number;
  purged: number;
  expiredBatchIds: number[];
  expiredCaseIds: number[];
}

function utcIsoDate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Deterministic per-UTC-day dedupe key so daily planning is idempotent. */
export function retentionDedupeKey(now: Date): string {
  return `retention:${utcIsoDate(now)}`;
}

/**
 * The UTC days a starting process should ensure jobs exist for, oldest first
 * and inclusive of today, bounded so a long outage cannot flood the outbox
 * (R33-b). The sweep itself purges everything past due, so a single fired job is
 * sufficient; the extra days only guarantee the cadence recovers after downtime.
 */
export function enumerateCatchupDates(now: Date, maxDays: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates: string[] = [];
  for (let offset = maxDays - 1; offset >= 0; offset -= 1) {
    dates.push(utcIsoDate(new Date(todayUtc - offset * DAY_MS)));
  }
  return dates;
}

/**
 * Decide what to do with one due batch. A batch with pending work (staged groups
 * or open cases) is extended exactly once; after the extension elapses, or when
 * there is no pending work, it is purged. Already-purged and not-yet-due batches
 * are skipped.
 */
export function classifyBatchDisposition(
  batch: RetentionSweepBatchRow,
  now: Date
): RetentionDisposition {
  if (batch.purgedAt !== null) return 'skip';
  if (batch.purgeAfter.getTime() > now.getTime()) return 'skip';

  const hasPendingWork = batch.hasUncommittedObservations || batch.hasOpenCases;
  if (hasPendingWork) {
    if (batch.retentionExtendedUntil === null) return 'extend';
    if (batch.retentionExtendedUntil.getTime() > now.getTime()) return 'skip';
  }
  return 'purge';
}

export function computeRetentionExtension(purgeAfter: Date): {
  retentionExtendedUntil: Date;
  retentionExtensionReason: string;
} {
  return {
    retentionExtendedUntil: new Date(purgeAfter.getTime() + RETENTION_EXTENSION_DAYS * DAY_MS),
    retentionExtensionReason: RETENTION_EXTENSION_REASON,
  };
}

/** Append a terminal expiry entry to a case history without mutating the prior array. */
export function appendExpiredUnresolvedHistory(
  history: ReconciliationCaseHistoryEntryV1[],
  at: Date
): ReconciliationCaseHistoryEntryV1[] {
  return [...history, { at: at.toISOString(), event: 'expired_unresolved' }];
}

/**
 * Orchestrate a full sweep over the due batches. Pure with respect to the DB —
 * all persistence is behind `ports`, so this is exhaustively testable.
 */
export async function sweepDueBatches(
  ports: RetentionSweepPorts,
  now: Date
): Promise<RetentionSweepSummary> {
  const due = await ports.selectDueBatches(now);
  const summary: RetentionSweepSummary = {
    extended: 0,
    purged: 0,
    expiredBatchIds: [],
    expiredCaseIds: [],
  };

  for (const batch of due) {
    const disposition = classifyBatchDisposition(batch, now);
    if (disposition === 'extend') {
      await ports.extendBatch(batch, now);
      summary.extended += 1;
    } else if (disposition === 'purge') {
      const result = await ports.purgeBatch(batch, now);
      summary.purged += 1;
      if (result.becameExpired) summary.expiredBatchIds.push(batch.id);
      summary.expiredCaseIds.push(...result.expiredCaseIds);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// DB adapter (thin SQL layer implementing the ports)
// ---------------------------------------------------------------------------

type RetentionDatabase = typeof db;

function toRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return (result as { rows?: Array<Record<string, unknown>> }).rows ?? [];
}

function toBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

function toNullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

export function createRetentionSweepPorts(database: RetentionDatabase): RetentionSweepPorts {
  return {
    async selectDueBatches(now) {
      const result = await database.execute(sql`
        SELECT
          b.id AS "id",
          b.fund_id AS "fundId",
          b.source_artifact_id AS "sourceArtifactId",
          b.status AS "status",
          b.purge_after AS "purgeAfter",
          b.retention_extended_until AS "retentionExtendedUntil",
          b.purged_at AS "purgedAt",
          EXISTS (
            SELECT 1 FROM source_observations o
            WHERE o.import_batch_id = b.id AND o.fund_id = b.fund_id AND o.status = 'staged'
          ) AS "hasUncommittedObservations",
          EXISTS (
            SELECT 1 FROM reconciliation_cases c
            WHERE c.import_batch_id = b.id AND c.fund_id = b.fund_id AND c.status = 'open'
          ) AS "hasOpenCases"
        FROM import_batches b
        WHERE b.purged_at IS NULL
          AND b.purge_after <= ${now}
          AND (b.retention_extended_until IS NULL OR b.retention_extended_until <= ${now})
        ORDER BY b.id ASC
      `);
      return toRows(result).map((row) => ({
        id: Number(row['id']),
        fundId: Number(row['fundId']),
        sourceArtifactId:
          row['sourceArtifactId'] === null || row['sourceArtifactId'] === undefined
            ? null
            : Number(row['sourceArtifactId']),
        status: String(row['status']),
        purgeAfter: toDate(row['purgeAfter']),
        retentionExtendedUntil: toNullableDate(row['retentionExtendedUntil']),
        purgedAt: toNullableDate(row['purgedAt']),
        hasUncommittedObservations: toBool(row['hasUncommittedObservations']),
        hasOpenCases: toBool(row['hasOpenCases']),
      }));
    },

    async extendBatch(batch) {
      const extension = computeRetentionExtension(batch.purgeAfter);
      await database.execute(sql`
        UPDATE import_batches
        SET retention_extended_until = ${extension.retentionExtendedUntil},
            retention_extension_reason = ${extension.retentionExtensionReason}
        WHERE id = ${batch.id}
          AND fund_id = ${batch.fundId}
          AND retention_extended_until IS NULL
          AND purged_at IS NULL
      `);
      log.info(
        { event: 'retention.batch.extended', batchId: batch.id, fundId: batch.fundId },
        'Deferred artifact retention purge for a batch with pending work'
      );
    },

    async purgeBatch(batch, now) {
      // Global lock order: artifact -> batch -> observation -> case (identity is
      // untouched by a purge). Each UPDATE takes the row locks in that order.
      return database.transaction(async (tx) => {
        if (batch.sourceArtifactId !== null) {
          await tx.execute(sql`
            UPDATE source_artifacts
            SET payload = NULL, purged_at = ${now}
            WHERE id = ${batch.sourceArtifactId}
              AND fund_id = ${batch.fundId}
              AND purged_at IS NULL
          `);
        }

        const becameExpired = batch.hasUncommittedObservations;
        await tx.execute(sql`
          UPDATE import_batches
          SET purged_at = ${now},
              status = ${becameExpired ? 'expired' : batch.status}
          WHERE id = ${batch.id}
            AND fund_id = ${batch.fundId}
            AND purged_at IS NULL
        `);

        await tx.execute(sql`
          UPDATE source_observations
          SET status = 'purged'
          WHERE import_batch_id = ${batch.id}
            AND fund_id = ${batch.fundId}
            AND status = 'staged'
        `);

        const openCases = toRows(
          await tx.execute(sql`
            SELECT id, history
            FROM reconciliation_cases
            WHERE import_batch_id = ${batch.id}
              AND fund_id = ${batch.fundId}
              AND status = 'open'
            ORDER BY id ASC
            FOR UPDATE
          `)
        );

        const expiredCaseIds: number[] = [];
        for (const row of openCases) {
          const caseId = Number(row['id']);
          const priorHistory = Array.isArray(row['history'])
            ? (row['history'] as ReconciliationCaseHistoryEntryV1[])
            : [];
          const nextHistory = appendExpiredUnresolvedHistory(priorHistory, now);
          await tx.execute(sql`
            UPDATE reconciliation_cases
            SET status = 'expired_unresolved',
                history = ${JSON.stringify(nextHistory)}::jsonb,
                version = version + 1
            WHERE id = ${caseId}
              AND fund_id = ${batch.fundId}
              AND status = 'open'
          `);
          expiredCaseIds.push(caseId);
        }

        if (becameExpired || expiredCaseIds.length > 0) {
          log.info(
            {
              event: 'retention.batch.expired',
              batchId: batch.id,
              fundId: batch.fundId,
              becameExpired,
              expiredCaseIds,
            },
            'Purged expired artifact and terminated dependent uncommitted work'
          );
        }

        return { becameExpired, expiredCaseIds };
      });
    },
  };
}

/** Convenience entry point: build the DB-backed ports and run a full sweep. */
export function runRetentionSweep(
  now: Date,
  database: RetentionDatabase = db
): Promise<RetentionSweepSummary> {
  return sweepDueBatches(createRetentionSweepPorts(database), now);
}

// ---------------------------------------------------------------------------
// job_outbox lifecycle (planner + SKIP LOCKED claim + processor)
// ---------------------------------------------------------------------------

type RetentionJobPayload = { kind: 'artifact_retention_sweep'; windowDate: string };

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function withTimeout<T>(label: string, work: () => Promise<T> | T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${DEFAULT_STEP_TIMEOUT_MS}ms`));
    }, DEFAULT_STEP_TIMEOUT_MS);
    void Promise.resolve()
      .then(work)
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

export class ArtifactRetentionService {
  private plannerTimer: NodeJS.Timeout | null = null;
  private processorTimer: NodeJS.Timeout | null = null;
  private plannerInFlight = false;
  private processorInFlight = false;
  private enabled = false;

  start(options?: {
    enabled?: boolean;
    plannerIntervalMs?: number;
    processorIntervalMs?: number;
  }): void {
    const shouldEnable =
      options?.enabled ??
      (process.env['NODE_ENV'] !== 'test' && process.env['ENABLE_ARTIFACT_RETENTION'] !== '0');

    if (!shouldEnable) {
      this.enabled = false;
      log.info('Artifact retention sweep disabled');
      return;
    }
    if (this.enabled) {
      log.debug('Artifact retention sweep already started');
      return;
    }

    this.enabled = true;
    const plannerIntervalMs =
      options?.plannerIntervalMs ??
      parsePositiveIntEnv('ARTIFACT_RETENTION_PLANNER_INTERVAL_MS', DEFAULT_PLANNER_INTERVAL_MS);
    const processorIntervalMs =
      options?.processorIntervalMs ??
      parsePositiveIntEnv(
        'ARTIFACT_RETENTION_PROCESSOR_INTERVAL_MS',
        DEFAULT_PROCESSOR_INTERVAL_MS
      );

    this.plannerTimer = setInterval(() => void this.runPlannerCycle(), plannerIntervalMs);
    this.processorTimer = setInterval(() => void this.runProcessorCycle(), processorIntervalMs);

    // Startup catch-up: enqueue any missed daily windows immediately (R33-b).
    void this.runPlannerCycle();
    void this.runProcessorCycle();
    log.info({ plannerIntervalMs, processorIntervalMs }, 'Artifact retention sweep started');
  }

  stop(): void {
    this.enabled = false;
    if (this.plannerTimer) {
      clearInterval(this.plannerTimer);
      this.plannerTimer = null;
    }
    if (this.processorTimer) {
      clearInterval(this.processorTimer);
      this.processorTimer = null;
    }
  }

  /** Enqueue one job per missed UTC day within the catch-up bound (idempotent). */
  async planRetentionJobs(now = new Date()): Promise<number> {
    let enqueued = 0;
    for (const windowDate of enumerateCatchupDates(now, RETENTION_STARTUP_CATCHUP_DAYS)) {
      const payload: RetentionJobPayload = { kind: 'artifact_retention_sweep', windowDate };
      const inserted = await db
        .insert(jobOutbox)
        .values({
          jobType: RETENTION_JOB_TYPE,
          dedupeKey: `retention:${windowDate}`,
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
      if (inserted[0]) enqueued += 1;
    }
    return enqueued;
  }

  async claimNextRetentionJob(): Promise<JobOutbox | null> {
    const result = await db.execute(sql`
      WITH next_job AS (
        SELECT id
        FROM job_outbox
        WHERE job_type = ${RETENTION_JOB_TYPE}
          AND status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= NOW())
          AND (next_run_at IS NULL OR next_run_at <= NOW())
        ORDER BY next_run_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE job_outbox AS j
      SET status = 'processing',
          processing_at = NOW(),
          attempt_count = COALESCE(j.attempt_count, 0) + 1,
          updated_at = NOW()
      FROM next_job
      WHERE j.id = next_job.id
      RETURNING
        j.id, j.job_type AS "jobType", j.dedupe_key AS "dedupeKey", j.payload, j.status,
        j.priority, j.attempt_count AS "attemptCount", j.max_attempts AS "maxAttempts",
        j.scheduled_for AS "scheduledFor", j.processing_at AS "processingAt",
        j.next_run_at AS "nextRunAt", j.completed_at AS "completedAt",
        j.error_message AS "errorMessage", j.created_at AS "createdAt", j.updated_at AS "updatedAt"
    `);
    const row = toRows(result)[0];
    return row ? mapJobRow(row) : null;
  }

  async processRetentionJob(job: JobOutbox): Promise<void> {
    const payload = job.payload as Partial<RetentionJobPayload>;
    if (payload.kind !== 'artifact_retention_sweep' || typeof payload.windowDate !== 'string') {
      await this.markJobCancelled(job.id, 'Invalid artifact retention job payload');
      return;
    }
    const summary = await runRetentionSweep(new Date());
    await this.markJobCompleted(job.id);
    log.info(
      { event: 'retention.processor.completed', jobId: job.id, ...summary },
      'Completed artifact retention sweep'
    );
  }

  private async runPlannerCycle(): Promise<void> {
    if (!this.enabled || this.plannerInFlight) return;
    this.plannerInFlight = true;
    try {
      await withTimeout('planRetentionJobs', () => this.planRetentionJobs());
    } catch (error) {
      log.error({ err: error }, 'Artifact retention planner cycle failed');
    } finally {
      this.plannerInFlight = false;
    }
  }

  private async runProcessorCycle(): Promise<void> {
    if (!this.enabled || this.processorInFlight) return;
    this.processorInFlight = true;
    let claimed: JobOutbox | null = null;
    try {
      claimed = await this.claimNextRetentionJob();
      if (!claimed) return;
      await this.processRetentionJob(claimed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown processor error';
      if (claimed) await this.handleJobFailure(claimed, message);
      log.error({ err: error }, 'Artifact retention processor cycle failed');
    } finally {
      this.processorInFlight = false;
    }
  }

  private async markJobCompleted(jobId: string): Promise<void> {
    await db
      .update(jobOutbox)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobOutbox.id, jobId));
  }

  private async markJobCancelled(jobId: string, errorMessage: string): Promise<void> {
    await db
      .update(jobOutbox)
      .set({ status: 'cancelled', errorMessage, processingAt: null, updatedAt: new Date() })
      .where(eq(jobOutbox.id, jobId));
    log.warn(
      { event: 'retention.processor.cancelled', jobId, errorMessage },
      'Cancelled retention job'
    );
  }

  private async handleJobFailure(job: JobOutbox, errorMessage: string): Promise<void> {
    const terminal = (job.attemptCount ?? 0) >= (job.maxAttempts ?? 3);
    await db
      .update(jobOutbox)
      .set({
        status: terminal ? 'failed' : 'pending',
        processingAt: null,
        nextRunAt: terminal ? job.nextRunAt : new Date(),
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobOutbox.id, job.id));
    log.error(
      { event: 'retention.processor.failed', jobId: job.id, terminal, errorMessage },
      'Artifact retention job failed'
    );
  }
}

export const artifactRetentionService = new ArtifactRetentionService();
