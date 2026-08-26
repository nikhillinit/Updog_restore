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
}

type ExecuteCapableDatabase = MetricRunLifecycleDatabase & {
  execute?: (query: unknown) => Promise<unknown>;
};
type SqlRow = Record<string, unknown> & {
  id?: unknown;
  fund_id?: unknown;
  vehicle_id?: unknown;
  as_of_date?: unknown;
  run_type?: unknown;
  perspective?: unknown;
  status?: unknown;
  inputs_hash?: unknown;
  source_event_ids?: unknown;
  source_mark_ids?: unknown;
  source_evidence_ids?: unknown;
  results_json?: unknown;
  diagnostics_json?: unknown;
  methodology_version?: unknown;
  calculation_version?: unknown;
  generated_by?: unknown;
  approved_by?: unknown;
  approved_at?: unknown;
  locked_by?: unknown;
  locked_at?: unknown;
  exported_at?: unknown;
  version?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};
type SqlResult<T> = { rows: T[] };

const IdArraySchema = z.array(z.number().int().positive());

async function executeRows<T>(database: MetricRunLifecycleDatabase, query: unknown): Promise<T[]> {
  const executeCapable = database as ExecuteCapableDatabase;
  if (typeof executeCapable.execute !== 'function') {
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_DATABASE_UNAVAILABLE',
      'Metric-run database executor is unavailable.'
    );
  }
  return ((await executeCapable.execute(query)) as SqlResult<T>).rows;
}

function jsonObject(value: unknown): SqlRow | null {
  return typeof value === 'object' && value !== null ? (value as SqlRow) : null;
}

function metricRunFromJson(value: unknown): LpMetricRun {
  const row = jsonObject(value);
  if (!row)
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_ROW_INVALID',
      'Metric-run SQL result was invalid.'
    );
  return {
    id: Number(row.id),
    fundId: Number(row.fund_id),
    vehicleId: row.vehicle_id === null ? null : Number(row.vehicle_id),
    asOfDate: String(row.as_of_date),
    runType: row.run_type as LpMetricRun['runType'],
    perspective: row.perspective as LpMetricRun['perspective'],
    status: row.status as LpMetricRun['status'],
    inputsHash: String(row.inputs_hash),
    sourceEventIds: row.source_event_ids,
    sourceMarkIds: row.source_mark_ids,
    sourceEvidenceIds: row.source_evidence_ids,
    resultsJson: row.results_json,
    diagnosticsJson: row.diagnostics_json,
    methodologyVersion: String(row.methodology_version),
    calculationVersion: String(row.calculation_version),
    generatedBy: row.generated_by === null ? null : Number(row.generated_by),
    approvedBy: row.approved_by === null ? null : Number(row.approved_by),
    approvedAt: row.approved_at === null ? null : (String(row.approved_at) as unknown as Date),
    lockedBy: row.locked_by === null ? null : Number(row.locked_by),
    lockedAt: row.locked_at === null ? null : (String(row.locked_at) as unknown as Date),
    exportedAt: row.exported_at === null ? null : (String(row.exported_at) as unknown as Date),
    version: Number(row.version),
    createdAt: row.created_at === null ? null : (String(row.created_at) as unknown as Date),
    updatedAt: row.updated_at === null ? null : (String(row.updated_at) as unknown as Date),
  };
}

interface MetricRunMutationRow extends SqlRow {
  metric_exists: boolean;
  actual_status: string | null;
  actual_version: number | null;
  evidence_ids: unknown;
  guard_row: unknown;
  updated_row: unknown;
}

async function executeMetricRunMutation(
  database: MetricRunLifecycleDatabase,
  input: MetricRunLifecycleInput,
  transition: 'approve' | 'lock'
): Promise<MetricRunMutationRow> {
  const expectedStatus = transition === 'approve' ? 'draft' : 'approved';
  const setClause =
    transition === 'approve'
      ? sql`status = 'approved', approved_by = ${input.userId}::integer, approved_at = now(), source_evidence_ids = guard.evidence_ids`
      : sql`status = 'locked', locked_by = ${input.userId}::integer, locked_at = now()`;
  const rows = await executeRows<MetricRunMutationRow>(
    database,
    sql`
    WITH metric_run_row AS (
      SELECT id, fund_id, vehicle_id, as_of_date, run_type, perspective, status,
             inputs_hash, source_event_ids, source_mark_ids, source_evidence_ids,
             results_json, diagnostics_json, methodology_version, calculation_version,
             generated_by, approved_by, approved_at, locked_by, locked_at,
             exported_at, version, created_at, updated_at
        FROM lp_metric_runs
       WHERE fund_id = ${input.fundId}::integer AND id = ${input.metricRunId}::integer
       FOR UPDATE
    ),
    guard AS (
      SELECT mr.*, true::boolean AS metric_exists,
             COALESCE((SELECT jsonb_agg(e.id ORDER BY e.id) FROM evidence_records e
                        WHERE e.fund_id = mr.fund_id AND e.metric_run_id = mr.id), '[]'::jsonb) AS evidence_ids
        FROM metric_run_row mr
      UNION ALL
      SELECT ${input.metricRunId}::integer, ${input.fundId}::integer, NULL::integer, NULL::date,
             NULL::varchar, NULL::varchar, NULL::varchar, NULL::varchar, '[]'::jsonb, '[]'::jsonb,
             '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, NULL::varchar, NULL::varchar,
             NULL::integer, NULL::integer, NULL::timestamptz, NULL::integer, NULL::timestamptz,
             NULL::timestamptz, NULL::integer, NULL::timestamptz, NULL::timestamptz,
             false::boolean, '[]'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM metric_run_row)
    ),
    updated AS (
      UPDATE lp_metric_runs AS run
         SET ${setClause}, version = ${input.expectedVersion + 1}::integer, updated_at = now()
        FROM guard
       WHERE guard.metric_exists AND guard.status = ${expectedStatus}::varchar
         AND guard.version = ${input.expectedVersion}::integer
         ${transition === 'approve' ? sql`AND jsonb_array_length(guard.evidence_ids) > 0` : sql``}
         AND run.id = guard.id AND run.fund_id = guard.fund_id
       RETURNING run.*
    )
    SELECT guard.metric_exists, guard.status AS actual_status, guard.version AS actual_version,
           guard.evidence_ids, to_jsonb(guard) AS guard_row, to_jsonb(updated) AS updated_row
      FROM guard LEFT JOIN updated ON true
  `
  );
  const row = rows[0];
  if (!row)
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_MUTATION_INVALID',
      'Metric-run mutation returned no guard row.'
    );
  return row;
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

export async function getMetricRunOwnership(
  input: MetricRunDetailInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<{ fundId: number } | undefined> {
  const database = options.database ?? db;
  const rows = await database
    .select({ id: lpMetricRuns.id, fundId: lpMetricRuns.fundId })
    .from(lpMetricRuns)
    .where(and(eq(lpMetricRuns.fundId, input.fundId), eq(lpMetricRuns.id, input.metricRunId)))
    .limit(1);
  const row = rows[0];
  return row && row.id === input.metricRunId && row.fundId === input.fundId
    ? { fundId: row.fundId }
    : undefined;
}

export async function approveMetricRun(
  input: MetricRunLifecycleInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<MetricRunLifecycleResponse> {
  const database = options.database ?? db;
  const row = await executeMetricRunMutation(database, input, 'approve');
  if (!row.metric_exists) {
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  }
  const metricRun = metricRunFromJson(row.guard_row);
  const evidenceIds = normalizeIdArray(row.evidence_ids);
  if (isSameApproveRetry(metricRun, input)) {
    return MetricRunLifecycleResponseSchema.parse({
      metricRun: toMetricRunDetail(metricRun, evidenceIds),
      changed: false,
    });
  }
  if (metricRun.status !== 'draft') throw statusConflict(metricRun.status, 'draft');
  assertExpectedVersion(normalizeVersion(metricRun.version), input.expectedVersion);
  if (evidenceIds.length === 0) {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_EVIDENCE_REQUIRED',
      'At least one evidence record is required before approval.'
    );
  }
  if (!row.updated_row) {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Metric run approval conflicted with another lifecycle update.'
    );
  }
  return MetricRunLifecycleResponseSchema.parse({
    metricRun: toMetricRunDetail(metricRunFromJson(row.updated_row), evidenceIds),
    changed: true,
  });
}

export async function lockMetricRun(
  input: MetricRunLifecycleInput,
  options: MetricRunLifecycleServiceOptions = {}
): Promise<MetricRunLifecycleResponse> {
  const database = options.database ?? db;
  const row = await executeMetricRunMutation(database, input, 'lock');
  if (!row.metric_exists) {
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  }
  const metricRun = metricRunFromJson(row.guard_row);
  const evidenceIds = normalizeIdArray(row.evidence_ids);
  if (isSameLockRetry(metricRun, input)) {
    return MetricRunLifecycleResponseSchema.parse({
      metricRun: toMetricRunDetail(metricRun, evidenceIds),
      changed: false,
    });
  }
  if (metricRun.status !== 'approved') throw statusConflict(metricRun.status, 'approved');
  assertExpectedVersion(normalizeVersion(metricRun.version), input.expectedVersion);
  if (!row.updated_row) {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Metric run lock conflicted with another lifecycle update.'
    );
  }
  const updated = metricRunFromJson(row.updated_row);
  return MetricRunLifecycleResponseSchema.parse({
    metricRun: toMetricRunDetail(updated, normalizeIdArray(updated.sourceEvidenceIds)),
    changed: true,
  });
}
