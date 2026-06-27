/**
 * LP Reporting -- stored package CSV export service.
 *
 * Persists immutable CSV artifacts derived only from the already-stored JSON
 * package export row. This service intentionally does not call the live JSON
 * handoff, render-model services, queue services, storage services, or delivery
 * helpers.
 *
 * @module server/services/lp-reporting/report-package-csv-stored-export-service
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  ReportPackageCsvSourceJsonExportRequiredResponseSchema,
  ReportPackageCsvStoredArtifactResponseSchema,
  ReportPackageCsvStoredExportGetResponseSchema,
  ReportPackageCsvStoredExportResponseSchema,
  ReportPackageExportContentHashConflictResponseSchema,
  ReportPackageExportNotFoundResponseSchema,
  ReportPackageExportRecordSchema,
  ReportPackageCsvExportDocumentSchema,
  ReportPackageJsonExportArtifactSchema,
  type ReportPackageCsvExportDocument,
  type ReportPackageCsvStoredArtifactResponse,
  type ReportPackageCsvStoredExportGetResponse,
  type ReportPackageCsvStoredExportResponse,
  type ReportPackageExportRecord,
  type ReportPackageJsonExportArtifact,
  type ReportPackageRenderMetricId,
  type ReportPackageRenderMetricSection,
  type ReportPackageRenderMetricSectionId,
  type ReportPackageRenderNarrativeSection,
} from '@shared/contracts/lp-reporting';
import {
  lpReportPackageExports,
  type InsertLpReportPackageExport,
  type LpReportPackageExport,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import { assertH9PackageExportable } from './h9-export-gate';
import { MetricRunCommitError } from './metric-run-commit-service';

type StoredCsvExportDatabase = typeof db;
type CsvCell = string | number | boolean | null;

export interface ReportPackageStoredCsvExportInput {
  fundId: number;
  metricRunId: number;
}

export interface CreateReportPackageStoredCsvExportInput extends ReportPackageStoredCsvExportInput {
  userId: number;
}

export interface ReportPackageStoredCsvExportServiceOptions {
  database?: StoredCsvExportDatabase;
}

export class ReportPackageCsvSourceJsonExportRequiredError extends MetricRunCommitError {
  constructor() {
    super(
      409,
      'REPORT_PACKAGE_CSV_SOURCE_JSON_EXPORT_REQUIRED',
      'Stored report package JSON export is required before creating a CSV export.'
    );
    this.name = 'ReportPackageCsvSourceJsonExportRequiredError';
  }
}

export class ReportPackageCsvExportNotFoundError extends MetricRunCommitError {
  constructor() {
    super(
      404,
      'REPORT_PACKAGE_EXPORT_NOT_FOUND',
      'Stored report package CSV export was not found.'
    );
    this.name = 'ReportPackageCsvExportNotFoundError';
  }
}

export class ReportPackageCsvExportContentHashConflictError extends MetricRunCommitError {
  readonly storedContentHash: string;
  readonly currentContentHash: string;

  constructor(storedContentHash: string, currentContentHash: string) {
    super(
      409,
      'EXPORT_CONTENT_HASH_CONFLICT',
      'Stored report package CSV export does not match the current deterministic artifact.'
    );
    this.name = 'ReportPackageCsvExportContentHashConflictError';
    this.storedContentHash = storedContentHash;
    this.currentContentHash = currentContentHash;
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

async function assertUserExists(database: StoredCsvExportDatabase, userId: number): Promise<void> {
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
  database: StoredCsvExportDatabase,
  input: ReportPackageStoredCsvExportInput,
  format: 'json' | 'csv'
): Promise<LpReportPackageExport | null> {
  const rows = await database
    .select()
    .from(lpReportPackageExports)
    .where(
      and(
        eq(lpReportPackageExports.fundId, input.fundId),
        eq(lpReportPackageExports.metricRunId, input.metricRunId),
        eq(lpReportPackageExports.format, format),
        eq(lpReportPackageExports.exportVersion, 1)
      )
    )
    .limit(1);

  return (
    (rows as LpReportPackageExport[]).find(
      (row) =>
        row.fundId === input.fundId &&
        row.metricRunId === input.metricRunId &&
        row.format === format &&
        row.exportVersion === 1
    ) ?? null
  );
}

function assertJsonSourceRouteScope(
  input: ReportPackageStoredCsvExportInput,
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

function csvCellText(value: CsvCell): string {
  if (value === null) return '[null]';
  return String(value);
}

function escapeCsvCell(value: CsvCell): string {
  const raw = csvCellText(value);
  const formulaRisk = raw.length > 0 && /^[=+\-@\t\r]/.test(raw);
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const safe = formulaRisk ? `'${normalized}` : normalized;
  if (!/[",\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: CsvCell[][]): string {
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;
}

function sortedNumbers(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

const metricSectionOrder: Record<ReportPackageRenderMetricSectionId, number> = {
  performance: 0,
  capital: 1,
  mark_confidence: 2,
};

const metricRowOrder: Record<ReportPackageRenderMetricId, number> = {
  dpi: 0,
  rvpi: 1,
  tvpi: 2,
  moic: 3,
  netIrr: 4,
  grossIrr: 5,
  contributionsTotal: 6,
  distributionsTotal: 7,
  currentNav: 8,
  markConfidenceHigh: 9,
  markConfidenceMedium: 10,
  markConfidenceLow: 11,
};

const narrativeSectionOrder: Record<ReportPackageRenderNarrativeSection['sectionId'], number> = {
  no_dpi: 0,
  methodology: 1,
  portfolio_update: 2,
  risk_disclosure: 3,
};

function sortedMetricSections(
  sections: readonly ReportPackageRenderMetricSection[]
): ReportPackageRenderMetricSection[] {
  return [...sections].sort(
    (a, b) => metricSectionOrder[a.sectionId] - metricSectionOrder[b.sectionId]
  );
}

function sortedNarrativeSections(
  sections: readonly ReportPackageRenderNarrativeSection[]
): ReportPackageRenderNarrativeSection[] {
  return [...sections].sort(
    (a, b) => narrativeSectionOrder[a.sectionId] - narrativeSectionOrder[b.sectionId]
  );
}

export function buildReportPackageCsv(artifact: ReportPackageJsonExportArtifact): string {
  const { renderModel } = artifact;
  const rows: CsvCell[][] = [
    ['section', 'field', 'value'],
    ['Package', '', ''],
    ['Package', 'Report package ID', renderModel.source.reportPackageId],
    ['Package', 'Fund ID', renderModel.source.fundId],
    ['Package', 'Metric run ID', renderModel.source.metricRunId],
    ['Package', 'As of date', renderModel.source.asOfDate],
    ['Package', 'Metric run version', renderModel.source.metricRunVersion],
    ['Package', 'Package version', renderModel.source.packageVersion],
    ['Fund', '', ''],
    ['Fund', 'Name', renderModel.fundDisplay.name],
    ['Fund', 'Vintage year', renderModel.fundDisplay.vintageYear],
    ['Fund', 'Size', renderModel.fundDisplay.size],
  ];

  for (const section of sortedMetricSections(renderModel.metricSections)) {
    const sectionName = `Metrics: ${section.title}`;
    rows.push([sectionName, '', '']);
    for (const row of [...section.rows].sort(
      (a, b) => metricRowOrder[a.metricId] - metricRowOrder[b.metricId]
    )) {
      rows.push([sectionName, row.label, row.value]);
    }
  }

  for (const section of sortedNarrativeSections(renderModel.narrativeSections)) {
    const sectionName = `Narrative: ${section.title}`;
    rows.push([sectionName, '', '']);
    rows.push([sectionName, 'Narrative run ID', section.narrativeRunId]);
    rows.push([sectionName, 'Narrative version', section.narrativeVersion]);
    rows.push([sectionName, 'Approved by', section.approvedBy]);
    rows.push([sectionName, 'Approved at', section.approvedAt]);
    rows.push([sectionName, 'Text hash', section.textHash]);
    rows.push([sectionName, 'Body', section.body]);
  }

  rows.push(['Diagnostics', '', '']);
  rows.push(['Diagnostics', 'Engine version', renderModel.diagnostics.engineVersion]);
  rows.push(['Diagnostics', 'Decimal precision', renderModel.diagnostics.decimalPrecision]);
  rows.push([
    'Diagnostics',
    'Excluded future marks',
    sortedNumbers(renderModel.diagnostics.excludedFutureMarks).join(';'),
  ]);
  for (const warning of [...renderModel.diagnostics.warnings].sort((a, b) =>
    `${a.code}:${a.message}`.localeCompare(`${b.code}:${b.message}`)
  )) {
    rows.push(['Diagnostics warning', warning.code, warning.message]);
  }
  rows.push(['Diagnostics XIRR net', 'Convergence', renderModel.diagnostics.xirr.net.convergence]);
  rows.push(['Diagnostics XIRR net', 'Iterations', renderModel.diagnostics.xirr.net.iterations]);
  rows.push([
    'Diagnostics XIRR gross',
    'Convergence',
    renderModel.diagnostics.xirr.gross.convergence,
  ]);
  rows.push([
    'Diagnostics XIRR gross',
    'Iterations',
    renderModel.diagnostics.xirr.gross.iterations,
  ]);

  rows.push(['References', '', '']);
  rows.push([
    'References',
    'Source event IDs',
    sortedNumbers(renderModel.references.sourceEventIds).join(';'),
  ]);
  rows.push([
    'References',
    'Source mark IDs',
    sortedNumbers(renderModel.references.sourceMarkIds).join(';'),
  ]);
  rows.push([
    'References',
    'Evidence record IDs',
    sortedNumbers(renderModel.references.evidenceRecordIds).join(';'),
  ]);
  rows.push([
    'References',
    'Narrative run IDs',
    sortedNumbers(renderModel.references.narrativeRunIds).join(';'),
  ]);

  return toCsv(rows);
}

function sha256Csv(csv: string): string {
  return createHash('sha256').update(csv, 'utf8').digest('hex');
}

function csvFilename(input: ReportPackageStoredCsvExportInput): string {
  return `lp-report-package-${input.fundId}-${input.metricRunId}-csv-v1.csv`;
}

function buildCsvDocument(
  input: ReportPackageStoredCsvExportInput,
  sourceJsonRow: LpReportPackageExport,
  sourceArtifact: ReportPackageJsonExportArtifact
): ReportPackageCsvExportDocument {
  return ReportPackageCsvExportDocumentSchema.parse({
    exportVersion: 1,
    format: 'csv',
    sourceJsonExportId: sourceJsonRow.id,
    sourceJsonContentHash: sourceJsonRow.contentHash,
    contentType: 'text/csv; charset=utf-8',
    filename: csvFilename(input),
    csv: buildReportPackageCsv(sourceArtifact),
  });
}

function insertValues(
  input: CreateReportPackageStoredCsvExportInput,
  sourceArtifact: ReportPackageJsonExportArtifact,
  csvDocument: ReportPackageCsvExportDocument,
  contentHash: string,
  now: Date
): InsertLpReportPackageExport {
  return {
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    reportPackageId: sourceArtifact.source.reportPackageId,
    format: 'csv',
    exportVersion: 1,
    status: 'ready',
    contentHashAlgorithm: 'sha256',
    contentHash,
    artifactPayload: csvDocument,
    artifactSizeBytes: Buffer.byteLength(csvDocument.csv, 'utf8'),
    createdBy: input.userId,
    readyAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function csvMetadata(document: ReportPackageCsvExportDocument) {
  return {
    sourceJsonExportId: document.sourceJsonExportId,
    sourceJsonContentHash: document.sourceJsonContentHash,
    contentType: document.contentType,
    filename: document.filename,
  };
}

function assertHashMatch(row: LpReportPackageExport, currentContentHash: string): void {
  if (row.contentHash !== currentContentHash) {
    throw new ReportPackageCsvExportContentHashConflictError(row.contentHash, currentContentHash);
  }
}

export async function createMetricRunReportPackageStoredCsvExport(
  input: CreateReportPackageStoredCsvExportInput,
  options: ReportPackageStoredCsvExportServiceOptions = {}
): Promise<ReportPackageCsvStoredExportResponse> {
  const database = options.database ?? db;
  await assertUserExists(database, input.userId);

  const sourceJson = await loadStoredExport(database, input, 'json');
  if (sourceJson === null) {
    throw new ReportPackageCsvSourceJsonExportRequiredError();
  }

  const sourceArtifact = ReportPackageJsonExportArtifactSchema.parse(sourceJson.artifactPayload);
  assertJsonSourceRouteScope(input, sourceArtifact);
  const csvDocument = buildCsvDocument(input, sourceJson, sourceArtifact);
  const contentHash = sha256Csv(csvDocument.csv);
  const now = new Date();

  const insertedRows = await database
    .insert(lpReportPackageExports)
    .values(insertValues(input, sourceArtifact, csvDocument, contentHash, now))
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
    return ReportPackageCsvStoredExportResponseSchema.parse({
      record: toExportRecord(inserted),
      inserted: true,
      ...csvMetadata(csvDocument),
    });
  }

  const existing = await loadStoredExport(database, input, 'csv');
  if (existing === null) {
    throw new MetricRunCommitError(
      409,
      'REPORT_PACKAGE_EXPORT_CREATE_CONFLICT',
      'Stored report package CSV export could not be created or reloaded.'
    );
  }
  assertHashMatch(existing, contentHash);
  const existingDocument = ReportPackageCsvExportDocumentSchema.parse(existing.artifactPayload);
  return ReportPackageCsvStoredExportResponseSchema.parse({
    record: toExportRecord(existing),
    inserted: false,
    ...csvMetadata(existingDocument),
  });
}

export async function getMetricRunReportPackageStoredCsvExport(
  input: ReportPackageStoredCsvExportInput,
  options: ReportPackageStoredCsvExportServiceOptions = {}
): Promise<ReportPackageCsvStoredExportGetResponse> {
  const database = options.database ?? db;
  const existing = await loadStoredExport(database, input, 'csv');
  if (existing === null) {
    return ReportPackageCsvStoredExportGetResponseSchema.parse({ record: null });
  }

  const document = ReportPackageCsvExportDocumentSchema.parse(existing.artifactPayload);
  return ReportPackageCsvStoredExportGetResponseSchema.parse({
    record: toExportRecord(existing),
    ...csvMetadata(document),
  });
}

export async function getMetricRunReportPackageStoredCsvArtifact(
  input: ReportPackageStoredCsvExportInput,
  options: ReportPackageStoredCsvExportServiceOptions = {}
): Promise<ReportPackageCsvStoredArtifactResponse> {
  const database = options.database ?? db;
  const existing = await loadStoredExport(database, input, 'csv');
  if (existing === null) {
    throw new ReportPackageCsvExportNotFoundError();
  }

  await assertH9PackageExportable({
    surface: 'stored_csv_export',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
  });

  const document = ReportPackageCsvExportDocumentSchema.parse(existing.artifactPayload);
  return ReportPackageCsvStoredArtifactResponseSchema.parse({
    record: toExportRecord(existing),
    csv: document,
  });
}

export function reportPackageCsvSourceJsonExportRequiredBody(
  err: ReportPackageCsvSourceJsonExportRequiredError
) {
  return ReportPackageCsvSourceJsonExportRequiredResponseSchema.parse({
    error: 'REPORT_PACKAGE_CSV_SOURCE_JSON_EXPORT_REQUIRED',
    message: err.message,
  });
}

export function reportPackageCsvExportNotFoundBody(err: ReportPackageCsvExportNotFoundError) {
  return ReportPackageExportNotFoundResponseSchema.parse({
    error: 'REPORT_PACKAGE_EXPORT_NOT_FOUND',
    message: err.message,
  });
}

export function reportPackageCsvExportContentHashConflictBody(
  err: ReportPackageCsvExportContentHashConflictError
) {
  return ReportPackageExportContentHashConflictResponseSchema.parse({
    error: 'EXPORT_CONTENT_HASH_CONFLICT',
    message: err.message,
    storedContentHash: err.storedContentHash,
    currentContentHash: err.currentContentHash,
  });
}
