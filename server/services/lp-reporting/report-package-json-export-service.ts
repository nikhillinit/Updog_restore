/**
 * LP Reporting -- package JSON handoff export service.
 *
 * Produces a deterministic, package-scoped JSON handoff over the read-only
 * report package render model. The service intentionally performs no export
 * lifecycle writes and owns no file, queue, URL, or storage side effects.
 *
 * @module server/services/lp-reporting/report-package-json-export-service
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import {
  ReportPackageJsonExportArtifactSchema,
  ReportPackageJsonExportResponseSchema,
  type ReportPackageJsonExportBlocker,
  type ReportPackageJsonExportResponse,
} from '@shared/contracts/lp-reporting';
import { evidenceRecords, type EvidenceRecord } from '@shared/schema/lp-reporting-evidence';
import { MetricRunCommitError } from './metric-run-commit-service';
import { getMetricRunReportPackageRenderModel } from './report-package-render-model-service';

type ReportPackageJsonExportDatabase = typeof db;

export interface ReportPackageJsonExportInput {
  fundId: number;
  metricRunId: number;
}

export interface ReportPackageJsonExportServiceOptions {
  database?: ReportPackageJsonExportDatabase;
  renderModelService?: typeof getMetricRunReportPackageRenderModel;
}

export class ReportPackageJsonExportBlockedError extends MetricRunCommitError {
  readonly blockers: ReportPackageJsonExportBlocker[];

  constructor(blockers: ReportPackageJsonExportBlocker[]) {
    super(
      409,
      'REPORT_PACKAGE_JSON_EXPORT_BLOCKED',
      'Report package JSON export is blocked by readiness checks.',
      blockers
    );
    this.name = 'ReportPackageJsonExportBlockedError';
    this.blockers = blockers;
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Cannot canonicalize non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (!isPlainObject(value)) {
      throw new TypeError('Cannot canonicalize non-plain objects.');
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const fieldValue = value[key];
        if (fieldValue === undefined) {
          throw new TypeError(`Cannot canonicalize undefined field "${key}".`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(fieldValue)}`;
      })
      .join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value} values.`);
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function uniqueSorted(values: readonly number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function sortedEvidenceRows(rows: EvidenceRecord[]): EvidenceRecord[] {
  return [...rows].sort((a, b) => a.id - b.id);
}

async function loadReferencedEvidenceRows(
  database: ReportPackageJsonExportDatabase,
  fundId: number,
  metricRunId: number,
  evidenceRecordIds: readonly number[]
): Promise<EvidenceRecord[]> {
  const uniqueIds = uniqueSorted(evidenceRecordIds);
  if (uniqueIds.length === 0) return [];

  const rows = await database
    .select()
    .from(evidenceRecords)
    .where(
      and(
        eq(evidenceRecords.fundId, fundId),
        eq(evidenceRecords.metricRunId, metricRunId),
        inArray(evidenceRecords.id, uniqueIds)
      )
    );

  return (rows as EvidenceRecord[]).filter(
    (row) => row.fundId === fundId && row.metricRunId === metricRunId && uniqueIds.includes(row.id)
  );
}

function buildEvidenceBlockers(
  evidenceRecordIds: readonly number[],
  rows: EvidenceRecord[]
): ReportPackageJsonExportBlocker[] {
  const uniqueIds = uniqueSorted(evidenceRecordIds);
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const invalidIds = uniqueIds.filter((id) => !rowsById.has(id));
  const blockers: ReportPackageJsonExportBlocker[] = [];

  if (invalidIds.length > 0) {
    blockers.push({
      code: 'EVIDENCE_REFERENCE_INVALID',
      message: 'One or more evidence references could not be resolved for this report package.',
      evidenceRecordIds: invalidIds,
    });
  }

  for (const row of sortedEvidenceRows(rows)) {
    if (row.confidentiality === 'restricted') {
      blockers.push({
        code: 'EVIDENCE_RESTRICTED',
        message: 'Evidence is restricted and cannot be included in the JSON handoff.',
        evidenceRecordId: row.id,
      });
    }
    if (row.redactionRequired) {
      blockers.push({
        code: 'EVIDENCE_REDACTION_REQUIRED',
        message: 'Evidence requires redaction before the JSON handoff can be produced.',
        evidenceRecordId: row.id,
      });
    }
  }

  return blockers;
}

export async function getMetricRunReportPackageJsonExport(
  input: ReportPackageJsonExportInput,
  options: ReportPackageJsonExportServiceOptions = {}
): Promise<ReportPackageJsonExportResponse> {
  const database = options.database ?? db;
  const renderModelService = options.renderModelService ?? getMetricRunReportPackageRenderModel;
  const { renderModel } = await renderModelService(input, { database });

  const evidenceRecordIds = uniqueSorted(renderModel.references.evidenceRecordIds);
  const evidenceRows = await loadReferencedEvidenceRows(
    database,
    input.fundId,
    input.metricRunId,
    evidenceRecordIds
  );
  const blockers = buildEvidenceBlockers(evidenceRecordIds, evidenceRows);

  if (blockers.length > 0) {
    throw new ReportPackageJsonExportBlockedError(blockers);
  }

  const artifact = ReportPackageJsonExportArtifactSchema.parse({
    exportVersion: 1,
    format: 'json',
    source: renderModel.source,
    renderModel,
  });

  return ReportPackageJsonExportResponseSchema.parse({
    export: {
      ...artifact,
      contentHashAlgorithm: 'sha256',
      contentHash: sha256CanonicalJson(artifact),
    },
  });
}
