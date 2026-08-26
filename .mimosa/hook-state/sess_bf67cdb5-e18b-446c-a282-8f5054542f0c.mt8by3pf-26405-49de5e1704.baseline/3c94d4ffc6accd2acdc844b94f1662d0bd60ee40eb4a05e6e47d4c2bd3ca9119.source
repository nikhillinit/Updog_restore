/**
 * LP Reporting -- narrative draft and lifecycle service.
 *
 * Narrative drafts are generated from persisted locked metric-run rows. The
 * template source is deliberately limited to the locked row plus validated
 * metric results/diagnostics payloads; live evidence_records content is not a
 * source for generated text.
 *
 * @module server/services/lp-reporting/narrative-run-service
 */

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  LpMetricRunDiagnosticsSchema,
  LpMetricRunResultsSchema,
  NarrativeRunCreateRequestSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunApproveRequestSchema,
  NarrativeRunEditRequestSchema,
  NarrativeRunLifecycleResponseSchema,
  NarrativeRunListResponseSchema,
  NarrativeRunRecordSchema,
  NarrativeRunReviewRequestSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunResults,
  type NarrativeRunApproveRequest,
  type NarrativeRunCreateRequest,
  type NarrativeRunCreateResponse,
  type NarrativeRunDetailResponse,
  type NarrativeRunEditRequest,
  type NarrativeRunLifecycleResponse,
  type NarrativeRunListResponse,
  type NarrativeRunRecord,
  type NarrativeRunReviewRequest,
  type NarrativeType,
} from '@shared/contracts/lp-reporting';
import {
  lpMetricRuns,
  narrativeRuns,
  type InsertNarrativeRun,
  type LpMetricRun,
  type NarrativeRun,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import { MetricRunCommitError } from './metric-run-commit-service';

type NarrativeRunDatabase = typeof db;

export interface NarrativeRunCreateInput {
  fundId: number;
  metricRunId: number;
  userId: number;
  body: NarrativeRunCreateRequest;
}

export interface NarrativeRunListInput {
  fundId: number;
  metricRunId: number;
}

export interface NarrativeRunDetailInput extends NarrativeRunListInput {
  narrativeRunId: number;
}

export interface NarrativeRunEditInput extends NarrativeRunDetailInput {
  userId: number;
  body: NarrativeRunEditRequest;
}

export interface NarrativeRunLifecycleInput extends NarrativeRunDetailInput {
  userId: number;
  body: NarrativeRunReviewRequest | NarrativeRunApproveRequest;
}

interface NarrativeRunServiceOptions {
  database?: NarrativeRunDatabase;
}

interface ValidatedMetricRunSource {
  metricRun: LpMetricRun;
  results: LpMetricRunResults;
  diagnostics: LpMetricRunDiagnostics;
  sourceEventCount: number;
  sourceMarkCount: number;
  sourceEvidenceCount: number;
}

type ExecuteCapableDatabase = NarrativeRunDatabase & {
  execute?: (query: unknown) => Promise<unknown>;
};
type SqlRow = Record<string, unknown> & {
  id?: unknown;
  fund_id?: unknown;
  metric_run_id?: unknown;
  as_of_date?: unknown;
  narrative_type?: unknown;
  generated_text?: unknown;
  edited_text?: unknown;
  status?: unknown;
  generated_by?: unknown;
  edited_by?: unknown;
  reviewed_by?: unknown;
  reviewed_at?: unknown;
  approved_by?: unknown;
  approved_at?: unknown;
  exported_at?: unknown;
  version?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};
type SqlResult<T> = { rows: T[] };

const IdArraySchema = z.array(z.number().int().positive());

const NARRATIVE_TYPE_ORDER: NarrativeType[] = [
  'no_dpi',
  'methodology',
  'portfolio_update',
  'risk_disclosure',
];

async function executeRows<T>(database: NarrativeRunDatabase, query: unknown): Promise<T[]> {
  const executeCapable = database as ExecuteCapableDatabase;
  if (typeof executeCapable.execute !== 'function') {
    throw new MetricRunCommitError(
      500,
      'NARRATIVE_RUN_DATABASE_UNAVAILABLE',
      'Narrative-run database executor is unavailable.'
    );
  }
  return ((await executeCapable.execute(query)) as SqlResult<T>).rows;
}

function narrativeRunFromJson(value: unknown): NarrativeRun {
  if (typeof value !== 'object' || value === null) {
    throw new MetricRunCommitError(
      500,
      'NARRATIVE_RUN_ROW_INVALID',
      'Narrative-run SQL result was invalid.'
    );
  }
  const row = value as SqlRow;
  return {
    id: Number(row.id),
    fundId: Number(row.fund_id),
    metricRunId: Number(row.metric_run_id),
    asOfDate: String(row.as_of_date),
    narrativeType: row.narrative_type as NarrativeRun['narrativeType'],
    generatedText: String(row.generated_text),
    editedText: row.edited_text === null ? null : String(row.edited_text),
    status: row.status as NarrativeRun['status'],
    generatedBy: row.generated_by === null ? null : Number(row.generated_by),
    editedBy: row.edited_by === null ? null : Number(row.edited_by),
    reviewedBy: row.reviewed_by === null ? null : Number(row.reviewed_by),
    reviewedAt: row.reviewed_at === null ? null : (String(row.reviewed_at) as unknown as Date),
    approvedBy: row.approved_by === null ? null : Number(row.approved_by),
    approvedAt: row.approved_at === null ? null : (String(row.approved_at) as unknown as Date),
    exportedAt: row.exported_at === null ? null : (String(row.exported_at) as unknown as Date),
    version: Number(row.version),
    createdAt: row.created_at === null ? null : (String(row.created_at) as unknown as Date),
    updatedAt: row.updated_at === null ? null : (String(row.updated_at) as unknown as Date),
  };
}

interface NarrativeMutationRow {
  metric_exists: boolean;
  metric_status: string | null;
  narrative_exists: boolean;
  actual_status: string | null;
  actual_version: number | null;
  guard_row: unknown;
  updated_row: unknown;
}

async function executeNarrativeMutation(
  database: NarrativeRunDatabase,
  input: NarrativeRunEditInput | NarrativeRunLifecycleInput,
  transition: 'edit' | 'review' | 'approve',
  userId: number,
  expectedVersion: number,
  editedText: string | null
): Promise<NarrativeMutationRow> {
  const expectedStatus = transition === 'approve' ? 'reviewed' : 'draft';
  const updateSet =
    transition === 'edit'
      ? sql`edited_text = ${editedText}::text, edited_by = ${userId}::integer`
      : transition === 'review'
        ? sql`status = 'reviewed', reviewed_by = ${userId}::integer, reviewed_at = now()`
        : sql`status = 'approved', approved_by = ${userId}::integer, approved_at = now()`;
  const rows = await executeRows<NarrativeMutationRow>(
    database,
    sql`
    WITH metric_run_row AS (
      SELECT id, status FROM lp_metric_runs
       WHERE fund_id = ${input.fundId}::integer AND id = ${input.metricRunId}::integer
       FOR UPDATE
    ),
    narrative_run_row AS (
      SELECT id, fund_id, metric_run_id, as_of_date, narrative_type, generated_text,
             edited_text, status, generated_by, edited_by, reviewed_by, reviewed_at,
             approved_by, approved_at, exported_at, version, created_at, updated_at
        FROM narrative_runs
       WHERE fund_id = ${input.fundId}::integer
         AND metric_run_id = ${input.metricRunId}::integer
         AND id = ${input.narrativeRunId}::integer
         -- Lock-order fence: report-package assembly locks the metric run
         -- BEFORE narrative rows; this always-true dependency forces the
         -- metric_run_row lock to be taken first here too, preventing
         -- lock-order inversion deadlocks. Independent CTEs have no
         -- guaranteed evaluation order.
         AND (SELECT count(*) FROM metric_run_row) >= 0
       FOR UPDATE
    ),
    metric_guard AS (
      SELECT id, status, true::boolean AS metric_exists FROM metric_run_row
      UNION ALL SELECT NULL::integer, NULL::varchar, false::boolean
       WHERE NOT EXISTS (SELECT 1 FROM metric_run_row)
    ),
    narrative_guard AS (
      SELECT nr.*, true::boolean AS narrative_exists FROM narrative_run_row nr
      UNION ALL
      SELECT ${input.narrativeRunId}::integer, ${input.fundId}::integer, ${input.metricRunId}::integer,
             NULL::date, NULL::varchar, NULL::text, NULL::text, NULL::varchar, NULL::integer,
             NULL::integer, NULL::integer, NULL::timestamptz, NULL::integer, NULL::timestamptz,
             NULL::timestamptz, NULL::integer, NULL::timestamptz, NULL::timestamptz, false::boolean
       WHERE NOT EXISTS (SELECT 1 FROM narrative_run_row)
    ),
    updated AS (
      UPDATE narrative_runs AS narrative
         SET ${updateSet}, version = ${expectedVersion + 1}::integer, updated_at = now()
        FROM metric_guard, narrative_guard
       WHERE metric_guard.metric_exists AND metric_guard.status = 'locked'::varchar
         AND narrative_guard.narrative_exists
         AND narrative_guard.status = ${expectedStatus}::varchar
         AND narrative_guard.version = ${expectedVersion}::integer
         ${transition === 'review' || transition === 'approve' ? sql`AND narrative_guard.edited_text IS NOT NULL AND btrim(narrative_guard.edited_text) <> ''` : sql``}
         AND narrative.id = narrative_guard.id AND narrative.fund_id = narrative_guard.fund_id
       RETURNING narrative.*
    )
    SELECT metric_guard.metric_exists, metric_guard.status AS metric_status,
           narrative_guard.narrative_exists, narrative_guard.status AS actual_status,
           narrative_guard.version AS actual_version, to_jsonb(narrative_guard) AS guard_row,
           to_jsonb(updated) AS updated_row
      FROM metric_guard CROSS JOIN narrative_guard LEFT JOIN updated ON true
  `
  );
  const row = rows[0];
  if (!row)
    throw new MetricRunCommitError(
      500,
      'NARRATIVE_RUN_MUTATION_INVALID',
      'Narrative-run mutation returned no guard row.'
    );
  return row;
}

function isoDateTime(value: Date | string | null | undefined, field: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  throw new MetricRunCommitError(
    500,
    'NARRATIVE_RUN_ROW_INVALID',
    `${field} is required on narrative_runs responses.`
  );
}

function isoDateTimeNullable(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return isoDateTime(value, 'nullableDateTime');
}

function isoDay(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function normalizeIdArray(value: unknown): number[] {
  const parsed = IdArraySchema.safeParse(value ?? []);
  if (!parsed.success) {
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_PAYLOAD_INVALID',
      'Metric-run source ID arrays do not match the locked contract.',
      parsed.error.issues
    );
  }
  return parsed.data;
}

function typeOrder(value: string): number {
  const index = NARRATIVE_TYPE_ORDER.indexOf(value as NarrativeType);
  return index === -1 ? NARRATIVE_TYPE_ORDER.length : index;
}

function normalizeVersion(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function hasEditedText(row: NarrativeRun): boolean {
  return typeof row.editedText === 'string' && row.editedText.trim().length > 0;
}

function assertExpectedVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw narrativeVersionConflict(actual, expected);
  }
}

function narrativeVersionConflict(actual: number, expected: number): MetricRunCommitError {
  return new MetricRunCommitError(
    409,
    'NARRATIVE_RUN_VERSION_CONFLICT',
    'Narrative run version no longer matches the request.',
    { expectedVersion: expected, actualVersion: actual }
  );
}

function narrativeStatusConflict(
  actualStatus: string,
  expectedStatus: string
): MetricRunCommitError {
  return new MetricRunCommitError(
    409,
    'NARRATIVE_RUN_STATUS_CONFLICT',
    `Narrative run must be ${expectedStatus} for this lifecycle transition.`,
    { expectedStatus, actualStatus }
  );
}

function assertEditedTextPresent(row: NarrativeRun): void {
  if (!hasEditedText(row)) {
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_EDIT_REQUIRED',
      'Narrative review and approval require saved edited text.'
    );
  }
}

async function assertUserExists(database: NarrativeRunDatabase, userId: number): Promise<void> {
  const rows = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) {
    throw new MetricRunCommitError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
}

async function loadMetricRun(
  database: NarrativeRunDatabase,
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

function assertMetricRunLocked(metricRun: LpMetricRun): void {
  if (metricRun.status !== 'locked') {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_NOT_LOCKED',
      'Narrative drafts can only be generated from locked metric runs.',
      { status: metricRun.status }
    );
  }
}

function validateMetricRunSource(metricRun: LpMetricRun): ValidatedMetricRunSource {
  const results = LpMetricRunResultsSchema.safeParse(metricRun.resultsJson);
  const diagnostics = LpMetricRunDiagnosticsSchema.safeParse(metricRun.diagnosticsJson);
  if (!results.success || !diagnostics.success) {
    throw new MetricRunCommitError(
      500,
      'METRIC_RUN_PAYLOAD_INVALID',
      'Locked metric-run payload does not match the metric-run contract.',
      {
        results: results.success ? [] : results.error.issues,
        diagnostics: diagnostics.success ? [] : diagnostics.error.issues,
      }
    );
  }

  return {
    metricRun,
    results: results.data,
    diagnostics: diagnostics.data,
    sourceEventCount: normalizeIdArray(metricRun.sourceEventIds).length,
    sourceMarkCount: normalizeIdArray(metricRun.sourceMarkIds).length,
    sourceEvidenceCount: normalizeIdArray(metricRun.sourceEvidenceIds).length,
  };
}

function valueOrUnavailable(value: string | null): string {
  return value ?? 'unavailable';
}

function currencyAmount(currency: string, value: string): string {
  return `${currency} ${value}`;
}

function failureReason(value: string | null): string {
  return value ?? 'none';
}

function warningSummary(warnings: LpMetricRunDiagnostics['warnings']): string {
  if (warnings.length === 0) {
    return '0 warnings';
  }
  return `${warnings.length} warnings: ${warnings
    .map((warning) => `${warning.code} - ${warning.message}`)
    .join('; ')}`;
}

export function generateNarrativeText(
  narrativeType: NarrativeType,
  source: ValidatedMetricRunSource
): string {
  const { metricRun, results, diagnostics } = source;
  const asOfDate = results.asOfDate || isoDay(metricRun.asOfDate);
  const currency = results.currency;

  switch (narrativeType) {
    case 'no_dpi':
      return [
        `No DPI draft as of ${asOfDate}.`,
        `DPI: ${valueOrUnavailable(results.dpi)}.`,
        `Total distributions: ${currencyAmount(currency, results.distributionsTotal)}.`,
        `Total contributions: ${currencyAmount(currency, results.contributionsTotal)}.`,
      ].join(' ');
    case 'methodology':
      return [
        `Methodology draft as of ${asOfDate}.`,
        `Run type: ${metricRun.runType}.`,
        `Perspective: ${metricRun.perspective}.`,
        `Source counts: ${source.sourceEventCount} events, ${source.sourceMarkCount} marks, ${source.sourceEvidenceCount} evidence records.`,
        `Engine version: ${diagnostics.engineVersion}.`,
        `Decimal precision: ${diagnostics.decimalPrecision}.`,
        `Net XIRR method: ${results.xirrDiagnostic.net.method}; convergence: ${results.xirrDiagnostic.net.convergence}.`,
        `Gross XIRR method: ${results.xirrDiagnostic.gross.method}; convergence: ${results.xirrDiagnostic.gross.convergence}.`,
      ].join(' ');
    case 'portfolio_update':
      return [
        `Portfolio update draft as of ${asOfDate}.`,
        `TVPI: ${valueOrUnavailable(results.tvpi)}.`,
        `RVPI: ${valueOrUnavailable(results.rvpi)}.`,
        `MOIC: ${valueOrUnavailable(results.moic)}.`,
        `Current NAV: ${currencyAmount(currency, results.currentNav)}.`,
        `Mark confidence counts: high ${results.markConfidenceMix.high}, medium ${results.markConfidenceMix.medium}, low ${results.markConfidenceMix.low}.`,
      ].join(' ');
    case 'risk_disclosure':
      return [
        `Risk disclosure draft as of ${asOfDate}.`,
        `Diagnostics warnings: ${warningSummary(diagnostics.warnings)}.`,
        `Excluded future marks: ${diagnostics.excludedFutureMarks.length}.`,
        `Net XIRR convergence: ${results.xirrDiagnostic.net.convergence}; failure reason: ${failureReason(results.xirrDiagnostic.net.failureReason)}.`,
        `Gross XIRR convergence: ${results.xirrDiagnostic.gross.convergence}; failure reason: ${failureReason(results.xirrDiagnostic.gross.failureReason)}.`,
        `Low-confidence marks: ${results.markConfidenceMix.low}.`,
      ].join(' ');
  }
}

function toNarrativeRunRecord(row: NarrativeRun): NarrativeRunRecord {
  return NarrativeRunRecordSchema.parse({
    narrativeRunId: row.id,
    fundId: row.fundId,
    metricRunId: row.metricRunId,
    asOfDate: isoDay(row.asOfDate),
    narrativeType: row.narrativeType,
    generatedText: row.generatedText,
    editedText: row.editedText ?? null,
    status: row.status,
    generatedBy: row.generatedBy ?? null,
    editedBy: row.editedBy ?? null,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: isoDateTimeNullable(row.reviewedAt),
    approvedBy: row.approvedBy ?? null,
    approvedAt: isoDateTimeNullable(row.approvedAt),
    exportedAt: isoDateTimeNullable(row.exportedAt),
    version: normalizeVersion(row.version),
    createdAt: isoDateTime(row.createdAt, 'createdAt'),
    updatedAt: isoDateTime(row.updatedAt, 'updatedAt'),
  });
}

async function findNarrativeByType(
  database: NarrativeRunDatabase,
  fundId: number,
  metricRunId: number,
  narrativeType: NarrativeType
): Promise<NarrativeRun | null> {
  const rows = await database
    .select()
    .from(narrativeRuns)
    .where(
      and(
        eq(narrativeRuns.fundId, fundId),
        eq(narrativeRuns.metricRunId, metricRunId),
        eq(narrativeRuns.narrativeType, narrativeType)
      )
    )
    .limit(1);
  return (
    (rows as NarrativeRun[]).find(
      (row) =>
        row.fundId === fundId &&
        row.metricRunId === metricRunId &&
        row.narrativeType === narrativeType
    ) ?? null
  );
}

async function loadNarrativeById(
  database: NarrativeRunDatabase,
  fundId: number,
  metricRunId: number,
  narrativeRunId: number
): Promise<NarrativeRun> {
  const rows = await database
    .select()
    .from(narrativeRuns)
    .where(
      and(
        eq(narrativeRuns.fundId, fundId),
        eq(narrativeRuns.metricRunId, metricRunId),
        eq(narrativeRuns.id, narrativeRunId)
      )
    )
    .limit(1);
  const row = (rows as NarrativeRun[]).find(
    (candidate) =>
      candidate.id === narrativeRunId &&
      candidate.fundId === fundId &&
      candidate.metricRunId === metricRunId
  );
  if (!row) {
    throw new MetricRunCommitError(
      404,
      'NARRATIVE_RUN_NOT_FOUND',
      'Narrative draft was not found for this metric run.'
    );
  }
  return row;
}

function isSameEditRetry(
  row: NarrativeRun,
  input: NarrativeRunEditInput,
  editedText: string
): boolean {
  return (
    row.status === 'draft' &&
    normalizeVersion(row.version) === input.body.expectedVersion + 1 &&
    (row.editedText ?? '').trim() === editedText &&
    row.editedBy === input.userId &&
    row.updatedAt !== null
  );
}

function isSameReviewRetry(row: NarrativeRun, input: NarrativeRunLifecycleInput): boolean {
  return (
    row.status === 'reviewed' &&
    normalizeVersion(row.version) === input.body.expectedVersion + 1 &&
    row.reviewedBy === input.userId &&
    row.reviewedAt !== null &&
    hasEditedText(row)
  );
}

function isDifferentUserReviewRetry(row: NarrativeRun, input: NarrativeRunLifecycleInput): boolean {
  return (
    row.status === 'reviewed' &&
    normalizeVersion(row.version) === input.body.expectedVersion + 1 &&
    row.reviewedBy !== null &&
    row.reviewedBy !== input.userId
  );
}

function isSameApproveRetry(row: NarrativeRun, input: NarrativeRunLifecycleInput): boolean {
  return (
    row.status === 'approved' &&
    normalizeVersion(row.version) === input.body.expectedVersion + 1 &&
    row.approvedBy === input.userId &&
    row.approvedAt !== null
  );
}

function narrativeInsertValues(
  source: ValidatedMetricRunSource,
  narrativeType: NarrativeType,
  userId: number
): InsertNarrativeRun {
  return {
    fundId: source.metricRun.fundId,
    metricRunId: source.metricRun.id,
    asOfDate: isoDay(source.metricRun.asOfDate),
    narrativeType,
    generatedText: generateNarrativeText(narrativeType, source),
    editedText: null,
    status: 'draft',
    generatedBy: userId,
    version: 1,
  };
}

export async function createNarrativeDraft(
  input: NarrativeRunCreateInput,
  options: NarrativeRunServiceOptions = {}
): Promise<NarrativeRunCreateResponse> {
  const database = options.database ?? db;
  const body = NarrativeRunCreateRequestSchema.parse(input.body);
  const metricRun = await loadMetricRun(database, input.fundId, input.metricRunId);
  assertMetricRunLocked(metricRun);
  const source = validateMetricRunSource(metricRun);
  await assertUserExists(database, input.userId);

  const existing = await findNarrativeByType(
    database,
    input.fundId,
    input.metricRunId,
    body.narrativeType
  );
  if (existing) {
    return NarrativeRunCreateResponseSchema.parse({
      record: toNarrativeRunRecord(existing),
      inserted: false,
    });
  }

  const inserted = await database
    .insert(narrativeRuns)
    .values(narrativeInsertValues(source, body.narrativeType, input.userId))
    .onConflictDoNothing({
      target: [narrativeRuns.metricRunId, narrativeRuns.narrativeType],
    })
    .returning();

  const insertedRow = (inserted as NarrativeRun[])[0];
  if (insertedRow) {
    return NarrativeRunCreateResponseSchema.parse({
      record: toNarrativeRunRecord(insertedRow),
      inserted: true,
    });
  }

  const racedExisting = await findNarrativeByType(
    database,
    input.fundId,
    input.metricRunId,
    body.narrativeType
  );
  if (racedExisting) {
    return NarrativeRunCreateResponseSchema.parse({
      record: toNarrativeRunRecord(racedExisting),
      inserted: false,
    });
  }

  throw new MetricRunCommitError(
    409,
    'NARRATIVE_RUN_CREATE_CONFLICT',
    'Narrative draft create conflicted but no existing row could be loaded.'
  );
}

export async function listNarrativeDrafts(
  input: NarrativeRunListInput,
  options: NarrativeRunServiceOptions = {}
): Promise<NarrativeRunListResponse> {
  const database = options.database ?? db;
  await loadMetricRun(database, input.fundId, input.metricRunId);

  const rows = await database
    .select()
    .from(narrativeRuns)
    .where(
      and(eq(narrativeRuns.fundId, input.fundId), eq(narrativeRuns.metricRunId, input.metricRunId))
    );

  return NarrativeRunListResponseSchema.parse({
    records: (rows as NarrativeRun[])
      .filter((row) => row.fundId === input.fundId && row.metricRunId === input.metricRunId)
      .sort((left, right) => typeOrder(left.narrativeType) - typeOrder(right.narrativeType))
      .map(toNarrativeRunRecord),
  });
}

export async function getNarrativeDraft(
  input: NarrativeRunDetailInput,
  options: NarrativeRunServiceOptions = {}
): Promise<NarrativeRunDetailResponse> {
  const database = options.database ?? db;
  await loadMetricRun(database, input.fundId, input.metricRunId);
  const row = await loadNarrativeById(
    database,
    input.fundId,
    input.metricRunId,
    input.narrativeRunId
  );

  return NarrativeRunDetailResponseSchema.parse({ record: toNarrativeRunRecord(row) });
}

export async function editNarrativeDraft(
  input: NarrativeRunEditInput,
  options: NarrativeRunServiceOptions = {}
): Promise<NarrativeRunLifecycleResponse> {
  const database = options.database ?? db;
  const body = NarrativeRunEditRequestSchema.parse(input.body);
  const lifecycleInput: NarrativeRunEditInput = { ...input, body };
  await assertUserExists(database, input.userId);
  const row = await executeNarrativeMutation(
    database,
    input,
    'edit',
    input.userId,
    body.expectedVersion,
    body.editedText
  );
  if (!row.metric_exists)
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  if (row.metric_status !== 'locked')
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Narrative lifecycle mutations require a locked metric run.',
      { expectedStatus: 'locked', actualStatus: row.metric_status }
    );
  if (!row.narrative_exists)
    throw new MetricRunCommitError(
      404,
      'NARRATIVE_RUN_NOT_FOUND',
      'Narrative draft was not found for this metric run.'
    );
  const narrative = narrativeRunFromJson(row.guard_row);
  if (isSameEditRetry(narrative, lifecycleInput, body.editedText))
    return NarrativeRunLifecycleResponseSchema.parse({
      record: toNarrativeRunRecord(narrative),
      changed: false,
    });
  if (narrative.status !== 'draft') throw narrativeStatusConflict(narrative.status, 'draft');
  assertExpectedVersion(normalizeVersion(narrative.version), body.expectedVersion);
  if (!row.updated_row)
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Narrative edit conflicted with another lifecycle update.'
    );
  return NarrativeRunLifecycleResponseSchema.parse({
    record: toNarrativeRunRecord(narrativeRunFromJson(row.updated_row)),
    changed: true,
  });
}

export async function reviewNarrativeDraft(
  input: NarrativeRunLifecycleInput,
  options: NarrativeRunServiceOptions = {}
): Promise<NarrativeRunLifecycleResponse> {
  const database = options.database ?? db;
  const body = NarrativeRunReviewRequestSchema.parse(input.body);
  const lifecycleInput: NarrativeRunLifecycleInput = { ...input, body };
  await assertUserExists(database, input.userId);
  const row = await executeNarrativeMutation(
    database,
    input,
    'review',
    input.userId,
    body.expectedVersion,
    null
  );
  if (!row.metric_exists)
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  if (row.metric_status !== 'locked')
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Narrative lifecycle mutations require a locked metric run.',
      { expectedStatus: 'locked', actualStatus: row.metric_status }
    );
  if (!row.narrative_exists)
    throw new MetricRunCommitError(
      404,
      'NARRATIVE_RUN_NOT_FOUND',
      'Narrative draft was not found for this metric run.'
    );
  const narrative = narrativeRunFromJson(row.guard_row);
  if (isSameReviewRetry(narrative, lifecycleInput))
    return NarrativeRunLifecycleResponseSchema.parse({
      record: toNarrativeRunRecord(narrative),
      changed: false,
    });
  if (isDifferentUserReviewRetry(narrative, lifecycleInput))
    throw narrativeVersionConflict(normalizeVersion(narrative.version), body.expectedVersion);
  if (narrative.status !== 'draft') throw narrativeStatusConflict(narrative.status, 'draft');
  assertExpectedVersion(normalizeVersion(narrative.version), body.expectedVersion);
  assertEditedTextPresent(narrative);
  if (!row.updated_row)
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Narrative review conflicted with another lifecycle update.'
    );
  return NarrativeRunLifecycleResponseSchema.parse({
    record: toNarrativeRunRecord(narrativeRunFromJson(row.updated_row)),
    changed: true,
  });
}

export async function approveNarrativeDraft(
  input: NarrativeRunLifecycleInput,
  options: NarrativeRunServiceOptions = {}
): Promise<NarrativeRunLifecycleResponse> {
  const database = options.database ?? db;
  const body = NarrativeRunApproveRequestSchema.parse(input.body);
  const lifecycleInput: NarrativeRunLifecycleInput = { ...input, body };
  await assertUserExists(database, input.userId);
  const row = await executeNarrativeMutation(
    database,
    input,
    'approve',
    input.userId,
    body.expectedVersion,
    null
  );
  if (!row.metric_exists)
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  if (row.metric_status !== 'locked')
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Narrative lifecycle mutations require a locked metric run.',
      { expectedStatus: 'locked', actualStatus: row.metric_status }
    );
  if (!row.narrative_exists)
    throw new MetricRunCommitError(
      404,
      'NARRATIVE_RUN_NOT_FOUND',
      'Narrative draft was not found for this metric run.'
    );
  const narrative = narrativeRunFromJson(row.guard_row);
  if (isSameApproveRetry(narrative, lifecycleInput))
    return NarrativeRunLifecycleResponseSchema.parse({
      record: toNarrativeRunRecord(narrative),
      changed: false,
    });
  if (narrative.status !== 'reviewed') throw narrativeStatusConflict(narrative.status, 'reviewed');
  assertExpectedVersion(normalizeVersion(narrative.version), body.expectedVersion);
  assertEditedTextPresent(narrative);
  if (!row.updated_row)
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Narrative approval conflicted with another lifecycle update.'
    );
  return NarrativeRunLifecycleResponseSchema.parse({
    record: toNarrativeRunRecord(narrativeRunFromJson(row.updated_row)),
    changed: true,
  });
}
