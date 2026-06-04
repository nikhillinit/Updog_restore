/**
 * LP Reporting -- approved internal report package assembly service.
 *
 * Assembly is scoped to one locked metric run and the complete approved
 * narrative set. The service persists a durable package snapshot without
 * mutating export fields or source rows.
 *
 * @module server/services/lp-reporting/report-package-service
 */

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  LpMetricRunDiagnosticsSchema,
  LpMetricRunResultsSchema,
  ReportPackageAssembleRequestSchema,
  ReportPackageAssembleResponseSchema,
  ReportPackageGetResponseSchema,
  ReportPackageNarrativeRefSchema,
  ReportPackagePayloadSchema,
  ReportPackageRecordSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunResults,
  type NarrativeType,
  type ReportPackageAssembleRequest,
  type ReportPackageAssembleResponse,
  type ReportPackageGetResponse,
  type ReportPackageNarrativeRef,
  type ReportPackagePayload,
  type ReportPackageRecord,
} from '@shared/contracts/lp-reporting';
import {
  evidenceRecords,
  lpMetricRuns,
  lpReportPackages,
  narrativeRuns,
  type EvidenceRecord,
  type InsertLpReportPackage,
  type LpMetricRun,
  type LpReportPackage,
  type NarrativeRun,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import { MetricRunCommitError } from './metric-run-commit-service';

type ReportPackageDatabase = typeof db;

export interface ReportPackageGetInput {
  fundId: number;
  metricRunId: number;
}

export interface ReportPackageAssembleInput extends ReportPackageGetInput {
  userId: number;
  body: ReportPackageAssembleRequest;
}

interface ReportPackageServiceOptions {
  database?: ReportPackageDatabase;
  skipTransaction?: boolean;
}

interface ValidatedSource {
  metricRun: LpMetricRun;
  results: LpMetricRunResults;
  diagnostics: LpMetricRunDiagnostics;
  sourceEventIds: number[];
  sourceMarkIds: number[];
  evidenceRecordIds: number[];
}

type TransactionCapableDatabase = ReportPackageDatabase & {
  transaction?: <TResult>(
    callback: (tx: ReportPackageDatabase) => Promise<TResult>
  ) => Promise<TResult>;
};

type ExecuteCapableDatabase = ReportPackageDatabase & {
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
  database: ReportPackageDatabase,
  skipTransaction: boolean,
  callback: (tx: ReportPackageDatabase) => Promise<TResult>
): Promise<TResult> {
  const transactionCapable = database as TransactionCapableDatabase;
  if (!skipTransaction && typeof transactionCapable.transaction === 'function') {
    return transactionCapable.transaction((tx) => callback(tx));
  }
  return callback(database);
}

async function lockMetricRunRow(
  database: ReportPackageDatabase,
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
  database: ReportPackageDatabase,
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
    'REPORT_PACKAGE_ROW_INVALID',
    `${field} is required on report package responses.`
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

function normalizeIdArray(value: unknown, code = 'METRIC_RUN_PAYLOAD_INVALID'): number[] {
  const parsed = IdArraySchema.safeParse(value ?? []);
  if (!parsed.success) {
    throw new MetricRunCommitError(
      500,
      code,
      'Metric-run ID arrays do not match the locked contract.',
      parsed.error.issues
    );
  }
  return parsed.data;
}

function uniqueSortedIds(...arrays: number[][]): number[] {
  return Array.from(new Set(arrays.flat())).sort((left, right) => left - right);
}

function normalizeVersion(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function typeOrder(value: NarrativeType): number {
  return NARRATIVE_TYPE_ORDER.indexOf(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function assertUserExists(database: ReportPackageDatabase, userId: number): Promise<void> {
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
  database: ReportPackageDatabase,
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

async function loadReportPackage(
  database: ReportPackageDatabase,
  fundId: number,
  metricRunId: number
): Promise<LpReportPackage | null> {
  const rows = await database
    .select()
    .from(lpReportPackages)
    .where(and(eq(lpReportPackages.fundId, fundId), eq(lpReportPackages.metricRunId, metricRunId)))
    .limit(1);
  return (
    (rows as LpReportPackage[]).find(
      (row) => row.fundId === fundId && row.metricRunId === metricRunId
    ) ?? null
  );
}

async function loadNarrativeById(
  database: ReportPackageDatabase,
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

async function loadEvidenceIds(
  database: ReportPackageDatabase,
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
    .sort((left, right) => left - right);
}

function validateMetricRunSource(metricRun: LpMetricRun, evidenceIds: number[]): ValidatedSource {
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
    sourceEventIds: normalizeIdArray(metricRun.sourceEventIds),
    sourceMarkIds: normalizeIdArray(metricRun.sourceMarkIds),
    evidenceRecordIds: uniqueSortedIds(
      normalizeIdArray(metricRun.sourceEvidenceIds),
      normalizeIdArray(evidenceIds)
    ),
  };
}

function assertMetricRunLocked(metricRun: LpMetricRun): void {
  if (metricRun.status !== 'locked') {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_STATUS_CONFLICT',
      'Report package assembly requires a locked metric run.',
      { expectedStatus: 'locked', actualStatus: metricRun.status }
    );
  }
}

function assertMetricRunVersion(metricRun: LpMetricRun, expectedVersion: number): void {
  const actualVersion = normalizeVersion(metricRun.version);
  if (actualVersion !== expectedVersion) {
    throw new MetricRunCommitError(
      409,
      'METRIC_RUN_VERSION_CONFLICT',
      'Metric run version no longer matches the report package request.',
      { expectedVersion, actualVersion }
    );
  }
}

function narrativeSetInvalid(message: string, details?: unknown): MetricRunCommitError {
  return new MetricRunCommitError(409, 'REPORT_PACKAGE_NARRATIVE_SET_INVALID', message, details);
}

function validateExpectedNarrativeSet(
  expectedNarratives: ReportPackageAssembleRequest['expectedNarratives']
): ReportPackageAssembleRequest['expectedNarratives'] {
  const required = new Set<NarrativeType>(NARRATIVE_TYPE_ORDER);
  const seen = new Map<NarrativeType, number>();
  for (const ref of expectedNarratives) {
    seen.set(ref.narrativeType, (seen.get(ref.narrativeType) ?? 0) + 1);
  }

  const missing = NARRATIVE_TYPE_ORDER.filter((type) => !seen.has(type));
  const duplicates = Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([type]) => type);
  const extra = Array.from(seen.keys()).filter((type) => !required.has(type));
  if (missing.length > 0 || duplicates.length > 0 || extra.length > 0) {
    throw narrativeSetInvalid('Report package requires exactly one approved narrative per type.', {
      missing,
      duplicates,
      extra,
    });
  }

  return [...expectedNarratives].sort(
    (left, right) => typeOrder(left.narrativeType) - typeOrder(right.narrativeType)
  );
}

function narrativeVersionConflict(actualVersion: number, expectedVersion: number): never {
  throw new MetricRunCommitError(
    409,
    'NARRATIVE_RUN_VERSION_CONFLICT',
    'Narrative run version no longer matches the report package request.',
    { expectedVersion, actualVersion }
  );
}

function assertNarrativeApproved(row: NarrativeRun): void {
  if (row.status !== 'approved') {
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Report package assembly requires approved narratives.',
      { expectedStatus: 'approved', actualStatus: row.status }
    );
  }
}

function assertNarrativeMatchesExpected(
  row: NarrativeRun,
  expected: ReportPackageAssembleRequest['expectedNarratives'][number]
): void {
  if (row.narrativeType !== expected.narrativeType) {
    throw new MetricRunCommitError(
      404,
      'NARRATIVE_RUN_NOT_FOUND',
      'Narrative draft was not found for the requested type.'
    );
  }
  const actualVersion = normalizeVersion(row.version);
  if (actualVersion !== expected.expectedVersion) {
    narrativeVersionConflict(actualVersion, expected.expectedVersion);
  }
  assertNarrativeApproved(row);
}

function effectiveText(row: NarrativeRun): string {
  return (row.editedText ?? row.generatedText).trim();
}

function buildNarrativeRef(row: NarrativeRun): ReportPackageNarrativeRef {
  const text = effectiveText(row);
  if (text.length === 0) {
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_TEXT_REQUIRED',
      'Approved narratives require non-empty effective text.'
    );
  }
  if (row.approvedAt === null || row.approvedAt === undefined) {
    throw new MetricRunCommitError(
      409,
      'NARRATIVE_RUN_STATUS_CONFLICT',
      'Approved narratives require approval audit timestamps.'
    );
  }
  return ReportPackageNarrativeRefSchema.parse({
    narrativeType: row.narrativeType,
    narrativeRunId: row.id,
    narrativeVersion: normalizeVersion(row.version),
    approvedBy: row.approvedBy ?? null,
    approvedAt: isoDateTime(row.approvedAt, 'approvedAt'),
    textHash: sha256Text(text),
  });
}

function buildPayload(
  source: ValidatedSource,
  narrativeRows: NarrativeRun[]
): ReportPackagePayload {
  return ReportPackagePayloadSchema.parse({
    payloadVersion: 1,
    results: source.results,
    diagnostics: source.diagnostics,
    sourceEventIds: source.sourceEventIds,
    sourceMarkIds: source.sourceMarkIds,
    evidenceRecordIds: source.evidenceRecordIds,
    narratives: narrativeRows.map((row) => ({
      ...buildNarrativeRef(row),
      effectiveText: effectiveText(row),
    })),
  });
}

function sameRefsAndPayload(
  existing: LpReportPackage,
  desiredRefs: ReportPackageNarrativeRef[],
  desiredPayload: ReportPackagePayload,
  expectedMetricRunVersion: number
): boolean {
  const parsedRefs = z.array(ReportPackageNarrativeRefSchema).safeParse(existing.narrativeRefs);
  const parsedPayload = ReportPackagePayloadSchema.safeParse(existing.payload);
  return (
    existing.metricRunVersion === expectedMetricRunVersion &&
    parsedRefs.success &&
    parsedPayload.success &&
    stableJson(parsedRefs.data) === stableJson(desiredRefs) &&
    stableJson(parsedPayload.data) === stableJson(desiredPayload)
  );
}

function packageAlreadyAssembled(): never {
  throw new MetricRunCommitError(
    409,
    'REPORT_PACKAGE_ALREADY_ASSEMBLED',
    'A report package already exists for this metric run with different refs.'
  );
}

function toReportPackageRecord(row: LpReportPackage): ReportPackageRecord {
  return ReportPackageRecordSchema.parse({
    reportPackageId: row.id,
    fundId: row.fundId,
    metricRunId: row.metricRunId,
    status: row.status,
    asOfDate: isoDay(row.asOfDate),
    metricRunVersion: row.metricRunVersion,
    metricRunLockedBy: row.metricRunLockedBy ?? null,
    metricRunLockedAt: isoDateTimeNullable(row.metricRunLockedAt),
    narrativeRefs: row.narrativeRefs,
    payload: row.payload,
    assembledBy: row.assembledBy,
    assembledAt: isoDateTime(row.assembledAt, 'assembledAt'),
    version: normalizeVersion(row.version),
    createdAt: isoDateTime(row.createdAt, 'createdAt'),
    updatedAt: isoDateTime(row.updatedAt, 'updatedAt'),
  });
}

function insertValues(
  input: ReportPackageAssembleInput,
  source: ValidatedSource,
  narrativeRefs: ReportPackageNarrativeRef[],
  payload: ReportPackagePayload,
  now: Date
): InsertLpReportPackage {
  return {
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    status: 'assembled',
    asOfDate: isoDay(source.metricRun.asOfDate),
    metricRunVersion: normalizeVersion(source.metricRun.version),
    metricRunLockedBy: source.metricRun.lockedBy ?? null,
    metricRunLockedAt: source.metricRun.lockedAt ?? null,
    narrativeRefs,
    payload,
    assembledBy: input.userId,
    assembledAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getMetricRunReportPackage(
  input: ReportPackageGetInput,
  options: ReportPackageServiceOptions = {}
): Promise<ReportPackageGetResponse> {
  const database = options.database ?? db;
  await loadMetricRun(database, input.fundId, input.metricRunId);
  const existing = await loadReportPackage(database, input.fundId, input.metricRunId);
  return ReportPackageGetResponseSchema.parse({
    record: existing === null ? null : toReportPackageRecord(existing),
  });
}

export async function assembleMetricRunReportPackage(
  input: ReportPackageAssembleInput,
  options: ReportPackageServiceOptions = {}
): Promise<ReportPackageAssembleResponse> {
  const database = options.database ?? db;
  const body = ReportPackageAssembleRequestSchema.parse(input.body);
  await assertUserExists(database, input.userId);

  return withTransaction(database, options.skipTransaction === true, async (tx) => {
    await lockMetricRunRow(tx, input.fundId, input.metricRunId);
    const metricRun = await loadMetricRun(tx, input.fundId, input.metricRunId);
    assertMetricRunLocked(metricRun);
    assertMetricRunVersion(metricRun, body.expectedMetricRunVersion);

    const expectedNarratives = validateExpectedNarrativeSet(body.expectedNarratives);
    for (const expected of expectedNarratives) {
      await lockNarrativeRunRow(tx, input.fundId, input.metricRunId, expected.narrativeRunId);
    }

    const narrativeRows: NarrativeRun[] = [];
    for (const expected of expectedNarratives) {
      const row = await loadNarrativeById(
        tx,
        input.fundId,
        input.metricRunId,
        expected.narrativeRunId
      );
      assertNarrativeMatchesExpected(row, expected);
      narrativeRows.push(row);
    }

    const evidenceIds = await loadEvidenceIds(tx, input.fundId, input.metricRunId);
    const source = validateMetricRunSource(metricRun, evidenceIds);
    const narrativeRefs = narrativeRows.map(buildNarrativeRef);
    const payload = buildPayload(source, narrativeRows);

    const existing = await loadReportPackage(tx, input.fundId, input.metricRunId);
    if (existing !== null) {
      if (sameRefsAndPayload(existing, narrativeRefs, payload, body.expectedMetricRunVersion)) {
        return ReportPackageAssembleResponseSchema.parse({
          record: toReportPackageRecord(existing),
          inserted: false,
        });
      }
      packageAlreadyAssembled();
    }

    const now = new Date();
    const insertedRows = await tx
      .insert(lpReportPackages)
      .values(insertValues(input, source, narrativeRefs, payload, now))
      .onConflictDoNothing({ target: lpReportPackages.metricRunId })
      .returning();

    const inserted = (insertedRows as LpReportPackage[])[0];
    if (inserted) {
      return ReportPackageAssembleResponseSchema.parse({
        record: toReportPackageRecord(inserted),
        inserted: true,
      });
    }

    const racedExisting = await loadReportPackage(tx, input.fundId, input.metricRunId);
    if (
      racedExisting !== null &&
      sameRefsAndPayload(racedExisting, narrativeRefs, payload, body.expectedMetricRunVersion)
    ) {
      return ReportPackageAssembleResponseSchema.parse({
        record: toReportPackageRecord(racedExisting),
        inserted: false,
      });
    }

    packageAlreadyAssembled();
  });
}
