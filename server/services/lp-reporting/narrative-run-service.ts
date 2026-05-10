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
  skipTransaction?: boolean;
}

interface ValidatedMetricRunSource {
  metricRun: LpMetricRun;
  results: LpMetricRunResults;
  diagnostics: LpMetricRunDiagnostics;
  sourceEventCount: number;
  sourceMarkCount: number;
  sourceEvidenceCount: number;
}

type TransactionCapableDatabase = NarrativeRunDatabase & {
  transaction?: <TResult>(
    callback: (tx: NarrativeRunDatabase) => Promise<TResult>
  ) => Promise<TResult>;
};

type ExecuteCapableDatabase = NarrativeRunDatabase & {
  execute?: (query: unknown) => Promise<unknown>;
};

const IdArraySchema = z.array(z.number().int().positive());

const NARRATIVE_TYPE_ORDER: NarrativeType[] = [
  'no_dpi',
  'methodology',
  'portfolio_update',
  'risk_disclosure',
];

function withTransaction<TResult>(
  database: NarrativeRunDatabase,
  skipTransaction: boolean,
  callback: (tx: NarrativeRunDatabase) => Promise<TResult>
): Promise<TResult> {
  const transactionCapable = database as TransactionCapableDatabase;
  if (!skipTransaction && typeof transactionCapable.transaction === 'function') {
    return transactionCapable.transaction((tx) => callback(tx));
  }
  return callback(database);
}

async function lockMetricRunRow(
  database: NarrativeRunDatabase,
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

async function lockNarrativeRunRow(
  database: NarrativeRunDatabase,
  fundId: number,
  metricRunId: number,
  narrativeRunId: number
): Promise<void> {
  const executeCapable = database as ExecuteCapableDatabase;
  if (typeof executeCapable.execute !== 'function') {
    return;
  }
  await executeCapable.execute(sql`
    SELECT id
      FROM narrative_runs
     WHERE fund_id = ${fundId}
       AND metric_run_id = ${metricRunId}
       AND id = ${narrativeRunId}
     FOR UPDATE
  `);
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

function assertMetricRunLockedForLifecycle(metricRun: LpMetricRun): void {
  if (metricRun.status !== 'locked') {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Narrative lifecycle mutations require a locked metric run.',
      { expectedStatus: 'locked', actualStatus: metricRun.status }
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

  return withTransaction(database, options.skipTransaction === true, async (tx) => {
    await lockMetricRunRow(tx, input.fundId, input.metricRunId);
    await lockNarrativeRunRow(tx, input.fundId, input.metricRunId, input.narrativeRunId);
    const metricRun = await loadMetricRun(tx, input.fundId, input.metricRunId);
    assertMetricRunLockedForLifecycle(metricRun);
    const row = await loadNarrativeById(tx, input.fundId, input.metricRunId, input.narrativeRunId);

    if (isSameEditRetry(row, lifecycleInput, body.editedText)) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(row),
        changed: false,
      });
    }
    if (row.status !== 'draft') {
      throw narrativeStatusConflict(row.status, 'draft');
    }
    assertExpectedVersion(normalizeVersion(row.version), body.expectedVersion);

    const now = new Date();
    const updatedRows = await tx
      .update(narrativeRuns)
      .set({
        editedText: body.editedText,
        editedBy: input.userId,
        version: body.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(narrativeRuns.fundId, input.fundId),
          eq(narrativeRuns.metricRunId, input.metricRunId),
          eq(narrativeRuns.id, input.narrativeRunId),
          eq(narrativeRuns.status, 'draft'),
          eq(narrativeRuns.version, body.expectedVersion)
        )
      )
      .returning();

    const updated = (updatedRows as NarrativeRun[])[0];
    if (updated) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(updated),
        changed: true,
      });
    }

    const current = await loadNarrativeById(
      tx,
      input.fundId,
      input.metricRunId,
      input.narrativeRunId
    );
    if (isSameEditRetry(current, lifecycleInput, body.editedText)) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(current),
        changed: false,
      });
    }
    if (current.status !== 'draft') {
      throw narrativeStatusConflict(current.status, 'draft');
    }
    assertExpectedVersion(normalizeVersion(current.version), body.expectedVersion);
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Narrative edit conflicted with another lifecycle update.'
    );
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

  return withTransaction(database, options.skipTransaction === true, async (tx) => {
    await lockMetricRunRow(tx, input.fundId, input.metricRunId);
    await lockNarrativeRunRow(tx, input.fundId, input.metricRunId, input.narrativeRunId);
    const metricRun = await loadMetricRun(tx, input.fundId, input.metricRunId);
    assertMetricRunLockedForLifecycle(metricRun);
    const row = await loadNarrativeById(tx, input.fundId, input.metricRunId, input.narrativeRunId);

    if (isSameReviewRetry(row, lifecycleInput)) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(row),
        changed: false,
      });
    }
    if (isDifferentUserReviewRetry(row, lifecycleInput)) {
      throw narrativeVersionConflict(normalizeVersion(row.version), body.expectedVersion);
    }
    if (row.status !== 'draft') {
      throw narrativeStatusConflict(row.status, 'draft');
    }
    assertExpectedVersion(normalizeVersion(row.version), body.expectedVersion);
    assertEditedTextPresent(row);

    const now = new Date();
    const updatedRows = await tx
      .update(narrativeRuns)
      .set({
        status: 'reviewed',
        reviewedBy: input.userId,
        reviewedAt: now,
        version: body.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(narrativeRuns.fundId, input.fundId),
          eq(narrativeRuns.metricRunId, input.metricRunId),
          eq(narrativeRuns.id, input.narrativeRunId),
          eq(narrativeRuns.status, 'draft'),
          eq(narrativeRuns.version, body.expectedVersion)
        )
      )
      .returning();

    const updated = (updatedRows as NarrativeRun[])[0];
    if (updated) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(updated),
        changed: true,
      });
    }

    const current = await loadNarrativeById(
      tx,
      input.fundId,
      input.metricRunId,
      input.narrativeRunId
    );
    if (isSameReviewRetry(current, lifecycleInput)) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(current),
        changed: false,
      });
    }
    if (isDifferentUserReviewRetry(current, lifecycleInput)) {
      throw narrativeVersionConflict(normalizeVersion(current.version), body.expectedVersion);
    }
    if (current.status !== 'draft') {
      throw narrativeStatusConflict(current.status, 'draft');
    }
    assertExpectedVersion(normalizeVersion(current.version), body.expectedVersion);
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Narrative review conflicted with another lifecycle update.'
    );
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

  return withTransaction(database, options.skipTransaction === true, async (tx) => {
    await lockMetricRunRow(tx, input.fundId, input.metricRunId);
    await lockNarrativeRunRow(tx, input.fundId, input.metricRunId, input.narrativeRunId);
    const metricRun = await loadMetricRun(tx, input.fundId, input.metricRunId);
    assertMetricRunLockedForLifecycle(metricRun);
    const row = await loadNarrativeById(tx, input.fundId, input.metricRunId, input.narrativeRunId);

    if (isSameApproveRetry(row, lifecycleInput)) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(row),
        changed: false,
      });
    }
    if (row.status !== 'reviewed') {
      throw narrativeStatusConflict(row.status, 'reviewed');
    }
    assertExpectedVersion(normalizeVersion(row.version), body.expectedVersion);
    assertEditedTextPresent(row);

    const now = new Date();
    const updatedRows = await tx
      .update(narrativeRuns)
      .set({
        status: 'approved',
        approvedBy: input.userId,
        approvedAt: now,
        version: body.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(narrativeRuns.fundId, input.fundId),
          eq(narrativeRuns.metricRunId, input.metricRunId),
          eq(narrativeRuns.id, input.narrativeRunId),
          eq(narrativeRuns.status, 'reviewed'),
          eq(narrativeRuns.version, body.expectedVersion)
        )
      )
      .returning();

    const updated = (updatedRows as NarrativeRun[])[0];
    if (updated) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(updated),
        changed: true,
      });
    }

    const current = await loadNarrativeById(
      tx,
      input.fundId,
      input.metricRunId,
      input.narrativeRunId
    );
    if (isSameApproveRetry(current, lifecycleInput)) {
      return NarrativeRunLifecycleResponseSchema.parse({
        record: toNarrativeRunRecord(current),
        changed: false,
      });
    }
    if (current.status !== 'reviewed') {
      throw narrativeStatusConflict(current.status, 'reviewed');
    }
    assertExpectedVersion(normalizeVersion(current.version), body.expectedVersion);
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Narrative approval conflicted with another lifecycle update.'
    );
  });
}
