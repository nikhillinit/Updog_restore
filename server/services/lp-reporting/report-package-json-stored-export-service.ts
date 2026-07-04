/**
 * LP Reporting -- stored package JSON export service.
 *
 * Persists immutable JSON handoff artifacts under the fund/metric-run package
 * boundary. The live handoff service remains read-only; this service is the
 * only LP Reporting package path that writes stored export rows.
 *
 * @module server/services/lp-reporting/report-package-json-stored-export-service
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  ReportPackageExportContentHashConflictResponseSchema,
  ReportPackageExportNotFoundResponseSchema,
  ReportPackageExportRecordSchema,
  ReportPackageJsonExportArtifactSchema,
  ReportPackageJsonStoredArtifactResponseSchema,
  ReportPackageJsonStoredExportGetResponseSchema,
  ReportPackageJsonStoredExportResponseSchema,
  type ReportPackageExportRecord,
  type ReportPackageJsonExportArtifact,
  type ReportPackageJsonStoredArtifactResponse,
  type ReportPackageJsonStoredExportGetResponse,
  type ReportPackageJsonStoredExportResponse,
} from '@shared/contracts/lp-reporting';
import {
  lpMetricRuns,
  lpReportPackageExports,
  type InsertLpReportPackageExport,
  type LpReportPackageExport,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import { assertH9PackageExportable } from './h9-export-gate';
import { assertMetricRunExportWorkflowState } from './metric-run-export-workflow-gate';
import { MetricRunCommitError } from './metric-run-commit-service';
import {
  canonicalJson,
  getMetricRunReportPackageJsonExport,
} from './report-package-json-export-service';

type StoredExportDatabase = typeof db;

export interface ReportPackageStoredJsonExportInput {
  fundId: number;
  metricRunId: number;
}

export interface CreateReportPackageStoredJsonExportInput extends ReportPackageStoredJsonExportInput {
  userId: number;
}

export interface ReportPackageStoredJsonExportServiceOptions {
  database?: StoredExportDatabase;
  jsonExportService?: typeof getMetricRunReportPackageJsonExport;
}

export class ReportPackageExportContentHashConflictError extends MetricRunCommitError {
  readonly storedContentHash: string;
  readonly currentContentHash: string;

  constructor(storedContentHash: string, currentContentHash: string) {
    super(
      409,
      'EXPORT_CONTENT_HASH_CONFLICT',
      'Stored report package JSON export does not match the current deterministic artifact.'
    );
    this.name = 'ReportPackageExportContentHashConflictError';
    this.storedContentHash = storedContentHash;
    this.currentContentHash = currentContentHash;
  }
}

export class ReportPackageExportNotFoundError extends MetricRunCommitError {
  constructor() {
    super(
      404,
      'REPORT_PACKAGE_EXPORT_NOT_FOUND',
      'Stored report package JSON export was not found.'
    );
    this.name = 'ReportPackageExportNotFoundError';
  }
}

function isoDateTime(value: Date | string | null | undefined, field: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  throw new MetricRunCommitError(
    500,
    'REPORT_PACKAGE_EXPORT_ROW_INVALID',
    `${field} is required on stored export responses.`
  );
}

function artifactSizeBytes(artifact: ReportPackageJsonExportArtifact): number {
  return Buffer.byteLength(canonicalJson(artifact), 'utf8');
}

function toExportRecord(row: LpReportPackageExport): ReportPackageExportRecord {
  return ReportPackageExportRecordSchema.parse({
    reportPackageExportId: row.id,
    fundId: row.fundId,
    metricRunId: row.metricRunId,
    reportPackageId: row.reportPackageId,
    format: row.format,
    exportVersion: row.exportVersion,
    status: row.status,
    contentHashAlgorithm: row.contentHashAlgorithm,
    contentHash: row.contentHash,
    artifactSizeBytes: row.artifactSizeBytes,
    createdBy: row.createdBy,
    readyAt: isoDateTime(row.readyAt, 'readyAt'),
    createdAt: isoDateTime(row.createdAt, 'createdAt'),
    updatedAt: isoDateTime(row.updatedAt, 'updatedAt'),
  });
}

async function assertUserExists(database: StoredExportDatabase, userId: number): Promise<void> {
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

async function loadStoredExport(
  database: StoredExportDatabase,
  input: ReportPackageStoredJsonExportInput
): Promise<LpReportPackageExport | null> {
  const rows = await database
    .select()
    .from(lpReportPackageExports)
    .where(
      and(
        eq(lpReportPackageExports.fundId, input.fundId),
        eq(lpReportPackageExports.metricRunId, input.metricRunId),
        eq(lpReportPackageExports.format, 'json'),
        eq(lpReportPackageExports.exportVersion, 1)
      )
    )
    .limit(1);

  return (
    (rows as LpReportPackageExport[]).find(
      (row) =>
        row.fundId === input.fundId &&
        row.metricRunId === input.metricRunId &&
        row.format === 'json' &&
        row.exportVersion === 1
    ) ?? null
  );
}

function assertRouteScope(
  input: ReportPackageStoredJsonExportInput,
  artifact: ReportPackageJsonExportArtifact
): void {
  if (
    artifact.source.fundId !== input.fundId ||
    artifact.source.metricRunId !== input.metricRunId
  ) {
    throw new MetricRunCommitError(
      500,
      'REPORT_PACKAGE_EXPORT_SCOPE_MISMATCH',
      'Report package JSON export source does not match the route scope.'
    );
  }
}

function insertValues(
  input: CreateReportPackageStoredJsonExportInput,
  artifact: ReportPackageJsonExportArtifact,
  contentHash: string,
  now: Date
): InsertLpReportPackageExport {
  return {
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    reportPackageId: artifact.source.reportPackageId,
    format: 'json',
    exportVersion: 1,
    status: 'ready',
    contentHashAlgorithm: 'sha256',
    contentHash,
    artifactPayload: artifact,
    artifactSizeBytes: artifactSizeBytes(artifact),
    createdBy: input.userId,
    readyAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function assertHashMatch(row: LpReportPackageExport, currentContentHash: string): void {
  if (row.contentHash !== currentContentHash) {
    throw new ReportPackageExportContentHashConflictError(row.contentHash, currentContentHash);
  }
}

async function markMetricRunStoredJsonExported(
  database: StoredExportDatabase,
  input: ReportPackageStoredJsonExportInput
): Promise<void> {
  await database
    .update(lpMetricRuns)
    .set({ status: 'exported', updatedAt: new Date() })
    .where(
      and(
        eq(lpMetricRuns.fundId, input.fundId),
        eq(lpMetricRuns.id, input.metricRunId),
        eq(lpMetricRuns.status, 'locked')
      )
    )
    .returning({ id: lpMetricRuns.id });
}

export async function createMetricRunReportPackageStoredJsonExport(
  input: CreateReportPackageStoredJsonExportInput,
  options: ReportPackageStoredJsonExportServiceOptions = {}
): Promise<ReportPackageJsonStoredExportResponse> {
  const database = options.database ?? db;
  const jsonExportService = options.jsonExportService ?? getMetricRunReportPackageJsonExport;
  await assertUserExists(database, input.userId);

  const live = await jsonExportService(
    { fundId: input.fundId, metricRunId: input.metricRunId },
    { database }
  );
  const { contentHash, contentHashAlgorithm, ...artifactCandidate } = live.export;
  if (contentHashAlgorithm !== 'sha256') {
    throw new MetricRunCommitError(
      500,
      'REPORT_PACKAGE_EXPORT_HASH_INVALID',
      'Report package JSON export hash algorithm is not supported.'
    );
  }
  const artifact = ReportPackageJsonExportArtifactSchema.parse(artifactCandidate);
  assertRouteScope(input, artifact);

  const now = new Date();
  const insertedRows = await database
    .insert(lpReportPackageExports)
    .values(insertValues(input, artifact, contentHash, now))
    .onConflictDoNothing({
      target: [
        lpReportPackageExports.reportPackageId,
        lpReportPackageExports.format,
        lpReportPackageExports.exportVersion,
      ],
    })
    .returning();

  const inserted = (insertedRows as LpReportPackageExport[])[0];
  if (inserted) {
    await markMetricRunStoredJsonExported(database, input);
    return ReportPackageJsonStoredExportResponseSchema.parse({
      record: toExportRecord(inserted),
      inserted: true,
    });
  }

  const existing = await loadStoredExport(database, input);
  if (existing === null) {
    throw new MetricRunCommitError(
      409,
      'REPORT_PACKAGE_EXPORT_CREATE_CONFLICT',
      'Stored report package JSON export could not be created or reloaded.'
    );
  }
  assertHashMatch(existing, contentHash);
  await markMetricRunStoredJsonExported(database, input);
  return ReportPackageJsonStoredExportResponseSchema.parse({
    record: toExportRecord(existing),
    inserted: false,
  });
}

export async function getMetricRunReportPackageStoredJsonExport(
  input: ReportPackageStoredJsonExportInput,
  options: ReportPackageStoredJsonExportServiceOptions = {}
): Promise<ReportPackageJsonStoredExportGetResponse> {
  const database = options.database ?? db;
  await assertMetricRunExportWorkflowState({
    surface: 'stored_json_export',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
  });
  const existing = await loadStoredExport(database, input);
  return ReportPackageJsonStoredExportGetResponseSchema.parse({
    record: existing === null ? null : toExportRecord(existing),
  });
}

export async function getMetricRunReportPackageStoredJsonArtifact(
  input: ReportPackageStoredJsonExportInput,
  options: ReportPackageStoredJsonExportServiceOptions = {}
): Promise<ReportPackageJsonStoredArtifactResponse> {
  const database = options.database ?? db;
  await assertMetricRunExportWorkflowState({
    surface: 'stored_json_export',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
  });
  const existing = await loadStoredExport(database, input);
  if (existing === null) {
    throw new ReportPackageExportNotFoundError();
  }

  const parsedArtifact = ReportPackageJsonExportArtifactSchema.safeParse(existing.artifactPayload);
  if (!parsedArtifact.success) {
    throw new MetricRunCommitError(
      500,
      'REPORT_PACKAGE_EXPORT_ROW_INVALID',
      'Stored report package export artifact does not match the export contract.',
      parsedArtifact.error.issues
    );
  }
  const artifact = parsedArtifact.data;
  assertRouteScope(input, artifact);

  // Finding 8: the stored-readiness status endpoint (getMetricRunReportPackageStoredJsonExport)
  // defers to this authoritative artifact-GET gate; the artifact never serves on stale/non-actionable H9.
  await assertH9PackageExportable({
    surface: 'stored_json_export',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
  });

  return ReportPackageJsonStoredArtifactResponseSchema.parse({
    record: toExportRecord(existing),
    export: {
      ...artifact,
      contentHashAlgorithm: existing.contentHashAlgorithm,
      contentHash: existing.contentHash,
    },
  });
}

export function reportPackageExportContentHashConflictBody(
  err: ReportPackageExportContentHashConflictError
) {
  return ReportPackageExportContentHashConflictResponseSchema.parse({
    error: 'EXPORT_CONTENT_HASH_CONFLICT',
    message: err.message,
    storedContentHash: err.storedContentHash,
    currentContentHash: err.currentContentHash,
  });
}

export function reportPackageExportNotFoundBody(err: ReportPackageExportNotFoundError) {
  return ReportPackageExportNotFoundResponseSchema.parse({
    error: 'REPORT_PACKAGE_EXPORT_NOT_FOUND',
    message: err.message,
  });
}
