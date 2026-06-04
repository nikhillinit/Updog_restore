/**
 * LP Reporting -- metric-run approval and lock lifecycle service.
 *
 * Lifecycle transitions serialize on the parent metric-run row before reading
 * or snapshotting evidence so approved runs cannot drift after evidence create
 * requests race with approval.
 *
 * @module server/services/lp-reporting/metric-run-lifecycle-service
 */

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  LatestMetricRunResponseSchema,
  MetricRunDetailResponseSchema,
  MetricRunLifecycleResponseSchema,
  type LatestMetricRunQuery,
  type LatestMetricRunResponse,
  type MetricRunDetailResponse,
  type MetricRunLifecycleResponse,
} from '@shared/contracts/lp-reporting';
import {
  evidenceRecords,
  lpMetricRuns,
  type EvidenceRecord,
  type LpMetricRun,
} from '@shared/schema/lp-reporting-evidence';
import { MetricRunCommitError } from './metric-run-commit-service';

type MetricRunLifecycleDatabase = typeof db;

export interface MetricRunLifecycleInput {
  fundId: number;
  metricRunId: number;
  userId: number;
  expectedVersion: number;
}

export interface LatestMetricRunInput extends LatestMetricRunQuery {
  fundId: number;
}

export interface MetricRunDetailInput {
  fundId: number;
  metricRunId: number;
}

interface MetricRunLifecycleServiceOptions {
  database?: MetricRunLifecycleDatabase;
  skipTransaction?: boolean;
}

type TransactionCapableDatabase = MetricRunLifecycleDatabase & {
  transaction?: <TResult>(
    callback: (tx: MetricRunLifecycleDatabase) => Promise<TResult>
  ) => Promise<TResult>;
};

type ExecuteCapableDatabase = MetricRunLifecycleDatabase & {
  execute?: (query: unknown) => Promise<unknown>;
};

const IdArraySchema = z.array(z.number().int().positive());

function withTransaction<TResult>(
  database: MetricRunLifecycleDatabase,
  skipTransaction: boolean,
  callback: (tx: MetricRunLifecycleDatabase) => Promise<TResult>
): Promise<TResult> {
  const transactionCapable = database as TransactionCapableDatabase;
  if (!skipTransaction && typeof transactionCapable.transaction === 'function') {
    return transactionCapable.transaction((tx) => callback(tx));
  }
  return callback(database);
}

async function lockMetricRunRow(
  database: MetricRunLifecycleDatabase,
  fundId: number,
  metricRunId: number
): Promise<void> {
  const executeCapable = database as ExecuteCapableDatabase;
  if (typeof executeCapable.execute !== 'function') {
    return;
  }
  await executeCapable.execute(sql`
    SELECT id
      FROM lp_metric_runs
     WHERE fund_id = ${fundId}
       AND id = ${metricRunId}
     FOR UPDATE
  `);
}

function isoDateTime(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function isoDay(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function normalizeIdArray(value: unknown): number[] {
  return IdArraySchema.parse(value ?? []);
}

function normalizeVersion(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function dateSortValue(value: Date | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toMetricRunDetail(metricRun: LpMetricRun, evidenceIds: number[]): MetricRunDetailResponse {
  return MetricRunDetailResponseSchema.parse({
    metricRunId: metricRun.id,
    fundId: metricRun.fundId,
    asOfDate: isoDay(metricRun.asOfDate),
    runType: metricRun.runType,
    perspective: metricRun.perspective,
    status: metricRun.status,
    inputsHash: metricRun.inputsHash,
    sourceEventIds: normalizeIdArray(metricRun.sourceEventIds),
    sourceMarkIds: normalizeIdArray(metricRun.sourceMarkIds),
    sourceEvidenceIds: normalizeIdArray(metricRun.sourceEvidenceIds),
    evidenceCount: evidenceIds.length,
    generatedBy: metricRun.generatedBy ?? null,
    approvedBy: metricRun.approvedBy ?? null,
    approvedAt: isoDateTime(metricRun.approvedAt),
    lockedBy: metricRun.lockedBy ?? null,
    lockedAt: isoDateTime(metricRun.lockedAt),
    exportedAt: isoDateTime(metricRun.exportedAt),
    version: normalizeVersion(metricRun.version),
    createdAt: isoDateTime(metricRun.createdAt),
    updatedAt: isoDateTime(metricRun.updatedAt),
  });
}

async function loadMetricRun(
  database: MetricRunLifecycleDatabase,
  fundId: number,
  metricRunId: number
): Promise<LpMetricRun> {
  const rows = await database
    .select()
    .from(lpMetricRuns)
    .where(and(eq(lpMetricRuns.fundId, fundId), eq(lpMetricRuns.id, metricRunId)))
    .limit(1);
  const row = (rows as LpMetricRun[]).find(
    (candidate) => candidate.id === metricRunId && candidate.fundId === fundId
  );
  if (!row) {
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  }
  return row;
}

async function loadEvidenceIds(
  database: MetricRunLifecycleDatabase,
  fundId: number,
  metricRunId: number
): Promise<number[]> {
  const rows = await database
    .select()
    .from(evidenceRecords)
    .where(and(eq(evidenceRecords.fundId, fundId), eq(evidenceRecords.metricRunId, metricRunId)));
  return (rows as EvidenceRecord[])
    .filter((row) => row.fundId === fundId && row.metricRunId === metricRunId)
    .map((row) => row.id)
    .sort((a, b) => a - b);
}

async function loadDetail(
  database: MetricRunLifecycleDatabase,
  fundId: number,
  metricRunId: number
): Promise<MetricRunDetailResponse> {
  const metricRun = await loadMetricRun(database, fundId, metricRunId);
  const evidenceIds = await loadEvidenceIds(database, fundId, metricRunId);
  return toMetricRunDetail(metricRun, evidenceIds);
}

function assertExpectedVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_VERSION_CONFLICT',
      'Metric run version no longer matches the request.',
      { expectedVersion: expected, actualVersion: actual }
    );
  }
}

function statusConflict(actualStatus: string, expectedStatus: string): MetricRunCommitError {
  return new MetricRunCommitError(
    409,
    'METRIC_RUN_STATUS_CONFLICT',
    `Metric run must be ${expectedStatus} for this lifecycle transition.`,
    { expectedStatus, actualStatus }
  );
}

function isSameApproveRetry(metricRun: LpMetricRun, input: MetricRunLifecycleInput): boolean {
  return (
    metricRun.status === 'approved' &&
    normalizeVersion(metricRun.version) === input.expectedVersion + 1 &&
    metricRun.approvedBy === input.userId &&
    metricRun.approvedAt !== null &&
    normalizeIdArray(metricRun.sourceEvidenceIds).length > 0
  );
}

function isSameLockRetry(metricRun: LpMetricRun, input: MetricRunLifecycleInput): boolean {
  return (
    metricRun.status === 'locked' &&
    normalizeVersion(metricRun.version) === input.expectedVersion + 1 &&
    metricRun.lockedBy === input.userId &&
    metricRun.lockedAt !== null
  );
}

export async function getLatestMetricRun(
  input: LatestMetricRunInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<LatestMetricRunResponse> {
  const database = options.database ?? db;
  const rows = await database
    .select()
    .from(lpMetricRuns)
    .where(
      and(
        eq(lpMetricRuns.fundId, input.fundId),
        eq(lpMetricRuns.runType, input.runType),
        eq(lpMetricRuns.perspective, input.perspective),
        eq(lpMetricRuns.asOfDate, input.asOfDate)
      )
    );
  const exactRows = (rows as LpMetricRun[])
    .filter(
      (row) =>
        row.fundId === input.fundId &&
        row.runType === input.runType &&
        row.perspective === input.perspective &&
        isoDay(row.asOfDate) === input.asOfDate
    )
    .sort((left, right) => {
      const createdDelta = dateSortValue(right.createdAt) - dateSortValue(left.createdAt);
      return createdDelta !== 0 ? createdDelta : right.id - left.id;
    });

  const latest = exactRows[0] ?? null;
  if (!latest) {
    return LatestMetricRunResponseSchema.parse({ metricRun: null });
  }
  const evidenceIds = await loadEvidenceIds(database, input.fundId, latest.id);
  return LatestMetricRunResponseSchema.parse({
    metricRun: toMetricRunDetail(latest, evidenceIds),
  });
}

export async function getMetricRunDetail(
  input: MetricRunDetailInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<MetricRunDetailResponse> {
  const database = options.database ?? db;
  return loadDetail(database, input.fundId, input.metricRunId);
}

export async function approveMetricRun(
  input: MetricRunLifecycleInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<MetricRunLifecycleResponse> {
  const database = options.database ?? db;
  return withTransaction(database, options.skipTransaction === true, async (tx) => {
    await lockMetricRunRow(tx, input.fundId, input.metricRunId);
    const metricRun = await loadMetricRun(tx, input.fundId, input.metricRunId);
    if (isSameApproveRetry(metricRun, input)) {
      return MetricRunLifecycleResponseSchema.parse({
        metricRun: await loadDetail(tx, input.fundId, input.metricRunId),
        changed: false,
      });
    }
    if (metricRun.status !== 'draft') {
      throw statusConflict(metricRun.status, 'draft');
    }
    assertExpectedVersion(normalizeVersion(metricRun.version), input.expectedVersion);

    const evidenceIds = await loadEvidenceIds(tx, input.fundId, input.metricRunId);
    if (evidenceIds.length === 0) {
      throw new MetricRunCommitError(
        409,
        'METRIC_RUN_EVIDENCE_REQUIRED',
        'At least one evidence record is required before approval.'
      );
    }

    const now = new Date();
    const updatedRows = await tx
      .update(lpMetricRuns)
      .set({
        status: 'approved',
        approvedBy: input.userId,
        approvedAt: now,
        sourceEvidenceIds: evidenceIds,
        version: input.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(lpMetricRuns.fundId, input.fundId),
          eq(lpMetricRuns.id, input.metricRunId),
          eq(lpMetricRuns.status, 'draft'),
          eq(lpMetricRuns.version, input.expectedVersion)
        )
      )
      .returning();

    const updated = (updatedRows as LpMetricRun[])[0];
    if (!updated) {
      const current = await loadMetricRun(tx, input.fundId, input.metricRunId);
      if (isSameApproveRetry(current, input)) {
        return MetricRunLifecycleResponseSchema.parse({
          metricRun: await loadDetail(tx, input.fundId, input.metricRunId),
          changed: false,
        });
      }
      if (current.status !== 'draft') {
        throw statusConflict(current.status, 'draft');
      }
      assertExpectedVersion(normalizeVersion(current.version), input.expectedVersion);
      throw new MetricRunCommitError(
        409,
        'METRIC_RUN_STATUS_CONFLICT',
        'Metric run approval conflicted with another lifecycle update.'
      );
    }

    return MetricRunLifecycleResponseSchema.parse({
      metricRun: toMetricRunDetail(updated, evidenceIds),
      changed: true,
    });
  });
}

export async function lockMetricRun(
  input: MetricRunLifecycleInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<MetricRunLifecycleResponse> {
  const database = options.database ?? db;
  return withTransaction(database, options.skipTransaction === true, async (tx) => {
    await lockMetricRunRow(tx, input.fundId, input.metricRunId);
    const metricRun = await loadMetricRun(tx, input.fundId, input.metricRunId);
    if (isSameLockRetry(metricRun, input)) {
      return MetricRunLifecycleResponseSchema.parse({
        metricRun: await loadDetail(tx, input.fundId, input.metricRunId),
        changed: false,
      });
    }
    if (metricRun.status !== 'approved') {
      throw statusConflict(metricRun.status, 'approved');
    }
    assertExpectedVersion(normalizeVersion(metricRun.version), input.expectedVersion);

    const now = new Date();
    const updatedRows = await tx
      .update(lpMetricRuns)
      .set({
        status: 'locked',
        lockedBy: input.userId,
        lockedAt: now,
        version: input.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(lpMetricRuns.fundId, input.fundId),
          eq(lpMetricRuns.id, input.metricRunId),
          eq(lpMetricRuns.status, 'approved'),
          eq(lpMetricRuns.version, input.expectedVersion)
        )
      )
      .returning();

    const updated = (updatedRows as LpMetricRun[])[0];
    if (!updated) {
      const current = await loadMetricRun(tx, input.fundId, input.metricRunId);
      if (isSameLockRetry(current, input)) {
        return MetricRunLifecycleResponseSchema.parse({
          metricRun: await loadDetail(tx, input.fundId, input.metricRunId),
          changed: false,
        });
      }
      if (current.status !== 'approved') {
        throw statusConflict(current.status, 'approved');
      }
      assertExpectedVersion(normalizeVersion(current.version), input.expectedVersion);
      throw new MetricRunCommitError(
        409,
        'METRIC_RUN_STATUS_CONFLICT',
        'Metric run lock conflicted with another lifecycle update.'
      );
    }

    const evidenceIds = await loadEvidenceIds(tx, input.fundId, input.metricRunId);
    return MetricRunLifecycleResponseSchema.parse({
      metricRun: toMetricRunDetail(updated, evidenceIds),
      changed: true,
    });
  });
}
