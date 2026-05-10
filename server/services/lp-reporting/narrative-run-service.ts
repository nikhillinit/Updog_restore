/**
 * LP Reporting -- narrative draft service.
 *
 * Narrative drafts are generated from persisted locked metric-run rows. The
 * template source is deliberately limited to the locked row plus validated
 * metric results/diagnostics payloads; live evidence_records content is not a
 * source for generated text.
 *
 * @module server/services/lp-reporting/narrative-run-service
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  LpMetricRunDiagnosticsSchema,
  LpMetricRunResultsSchema,
  NarrativeRunCreateRequestSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunListResponseSchema,
  NarrativeRunRecordSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunResults,
  type NarrativeRunCreateRequest,
  type NarrativeRunCreateResponse,
  type NarrativeRunDetailResponse,
  type NarrativeRunListResponse,
  type NarrativeRunRecord,
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

const IdArraySchema = z.array(z.number().int().positive());

const NARRATIVE_TYPE_ORDER: NarrativeType[] = [
  'no_dpi',
  'methodology',
  'portfolio_update',
  'risk_disclosure',
];

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
    approvedBy: row.approvedBy ?? null,
    approvedAt: isoDateTimeNullable(row.approvedAt),
    exportedAt: isoDateTimeNullable(row.exportedAt),
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

  const rows = await database
    .select()
    .from(narrativeRuns)
    .where(
      and(
        eq(narrativeRuns.fundId, input.fundId),
        eq(narrativeRuns.metricRunId, input.metricRunId),
        eq(narrativeRuns.id, input.narrativeRunId)
      )
    )
    .limit(1);
  const row = (rows as NarrativeRun[]).find(
    (candidate) =>
      candidate.id === input.narrativeRunId &&
      candidate.fundId === input.fundId &&
      candidate.metricRunId === input.metricRunId
  );
  if (!row) {
    throw new MetricRunCommitError(
      404,
      'NARRATIVE_RUN_NOT_FOUND',
      'Narrative draft was not found for this metric run.'
    );
  }

  return NarrativeRunDetailResponseSchema.parse({ record: toNarrativeRunRecord(row) });
}
