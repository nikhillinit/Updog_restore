/**
 * LP Reporting -- report package render model service.
 *
 * This read-only projection maps an assembled report package into a stable
 * renderer-facing model. It does not create export jobs, mutate package rows,
 * or call file-generation services.
 *
 * @module server/services/lp-reporting/report-package-render-model-service
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  ReportPackagePayloadSchema,
  ReportPackageRecordSchema,
  ReportPackageRenderModelResponseSchema,
  type NarrativeType,
  type ReportPackagePayload,
  type ReportPackageRecord,
  type ReportPackageRenderMetricRow,
  type ReportPackageRenderMetricSection,
  type ReportPackageRenderModelResponse,
  type ReportPackageRenderNarrativeSection,
} from '@shared/contracts/lp-reporting';
import { funds, type Fund } from '@shared/schema/fund';
import {
  lpMetricRuns,
  lpReportPackages,
  type LpMetricRun,
  type LpReportPackage,
} from '@shared/schema/lp-reporting-evidence';
import { assertH9ExportActionable, type H9ExportSurface } from './h9-export-gate';
import { assertMetricRunExportWorkflowState } from './metric-run-export-workflow-gate';
import { MetricRunCommitError } from './metric-run-commit-service';

type ReportPackageRenderModelDatabase = typeof db;

export interface ReportPackageRenderModelInput {
  fundId: number;
  metricRunId: number;
}

interface ReportPackageRenderModelServiceOptions {
  database?: ReportPackageRenderModelDatabase;
  h9Surface?: H9ExportSurface;
}

interface NarrativeTitle {
  narrativeType: NarrativeType;
  title: string;
}

const IdArraySchema = z.array(z.number().int().positive());
const NARRATIVE_TITLES: NarrativeTitle[] = [
  { narrativeType: 'no_dpi', title: 'No DPI' },
  { narrativeType: 'methodology', title: 'Methodology' },
  { narrativeType: 'portfolio_update', title: 'Portfolio update' },
  { narrativeType: 'risk_disclosure', title: 'Risk disclosure' },
];

function isoDateTime(value: Date | string | null | undefined, field: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  throw new MetricRunCommitError(
    500,
    'REPORT_PACKAGE_ROW_INVALID',
    `${field} is required on report package render-model responses.`
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

function normalizeVersion(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeIdArray(value: unknown, code = 'REPORT_PACKAGE_PAYLOAD_INVALID'): number[] {
  const parsed = IdArraySchema.safeParse(value ?? []);
  if (!parsed.success) {
    throw new MetricRunCommitError(
      500,
      code,
      'Report-package render-model ID arrays do not match the locked contract.',
      parsed.error.issues
    );
  }
  return parsed.data;
}

function uniqueSortedIds(ids: number[]): number[] {
  return Array.from(new Set(ids)).sort((left, right) => left - right);
}

function reportPackagePayloadInvalid(message: string, details?: unknown): never {
  throw new MetricRunCommitError(500, 'REPORT_PACKAGE_PAYLOAD_INVALID', message, details);
}

async function loadMetricRun(
  database: ReportPackageRenderModelDatabase,
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
  database: ReportPackageRenderModelDatabase,
  fundId: number,
  metricRunId: number
): Promise<LpReportPackage> {
  const rows = await database
    .select()
    .from(lpReportPackages)
    .where(and(eq(lpReportPackages.fundId, fundId), eq(lpReportPackages.metricRunId, metricRunId)))
    .limit(1);
  const row = (rows as LpReportPackage[]).find(
    (candidate) => candidate.fundId === fundId && candidate.metricRunId === metricRunId
  );
  if (!row) {
    throw new MetricRunCommitError(
      404,
      'REPORT_PACKAGE_NOT_FOUND',
      'Report package was not found for this metric run.'
    );
  }
  return row;
}

async function loadFundDisplay(
  database: ReportPackageRenderModelDatabase,
  fundId: number
): Promise<ReportPackageRenderModelResponse['renderModel']['fundDisplay']> {
  const rows = await database.select().from(funds).where(eq(funds.id, fundId)).limit(1);
  const row = (rows as Fund[]).find((candidate) => candidate.id === fundId);
  if (!row) {
    throw new MetricRunCommitError(404, 'FUND_NOT_FOUND', 'Fund was not found.');
  }
  return {
    fundId: row.id,
    name: row.name,
    vintageYear: row.vintageYear ?? null,
    size: row.size === null || row.size === undefined ? null : String(row.size),
  };
}

function toReportPackageRecord(row: LpReportPackage): ReportPackageRecord {
  const payload = ReportPackagePayloadSchema.safeParse(row.payload);
  if (!payload.success) {
    throw new MetricRunCommitError(
      500,
      'REPORT_PACKAGE_PAYLOAD_INVALID',
      'Report package payload does not match the render-model source contract.',
      payload.error.issues
    );
  }

  const record = ReportPackageRecordSchema.safeParse({
    reportPackageId: row.id,
    fundId: row.fundId,
    metricRunId: row.metricRunId,
    status: row.status,
    asOfDate: isoDay(row.asOfDate),
    metricRunVersion: row.metricRunVersion,
    metricRunLockedBy: row.metricRunLockedBy ?? null,
    metricRunLockedAt: isoDateTimeNullable(row.metricRunLockedAt),
    narrativeRefs: row.narrativeRefs,
    payload: payload.data,
    h9Metadata:
      row.h9ActionabilityStatus == null
        ? null
        : {
            moicSourceInputHash: row.h9MoicSourceInputHash,
            roundEvidenceInputHash: row.h9RoundEvidenceInputHash,
            roundEvidenceAssumptionsHash: row.h9RoundEvidenceAssumptionsHash,
            fingerprintHash: row.h9FingerprintHash,
            policyVersion: row.h9PolicyVersion,
            actionabilityStatus: row.h9ActionabilityStatus,
          },
    assembledBy: row.assembledBy,
    assembledAt: isoDateTime(row.assembledAt, 'assembledAt'),
    version: normalizeVersion(row.version),
    createdAt: isoDateTime(row.createdAt, 'createdAt'),
    updatedAt: isoDateTime(row.updatedAt, 'updatedAt'),
  });
  if (!record.success) {
    throw new MetricRunCommitError(
      500,
      'REPORT_PACKAGE_ROW_INVALID',
      'Report package row does not match the render-model source contract.',
      record.error.issues
    );
  }
  return record.data;
}

function metricRow(
  metricId: ReportPackageRenderMetricRow['metricId'],
  label: string,
  value: ReportPackageRenderMetricRow['value'],
  valueKind: ReportPackageRenderMetricRow['valueKind'],
  currency: ReportPackageRenderMetricRow['currency'] = null
): ReportPackageRenderMetricRow {
  return { metricId, label, value, valueKind, currency };
}

function buildMetricSections(
  payload: ReportPackagePayload,
  metricRun: LpMetricRun
): ReportPackageRenderMetricSection[] {
  const { results } = payload;
  const provenance = {
    inputsHash: metricRun.inputsHash,
    inputsHashShort: metricRun.inputsHash.slice(0, 12),
    methodologyVersion: metricRun.methodologyVersion,
    calculationVersion: metricRun.calculationVersion,
  };
  return [
    {
      sectionId: 'performance',
      title: 'Performance',
      ...provenance,
      rows: [
        metricRow('dpi', 'DPI', results.dpi, 'multiple'),
        metricRow('rvpi', 'RVPI', results.rvpi, 'multiple'),
        metricRow('tvpi', 'TVPI', results.tvpi, 'multiple'),
        metricRow('moic', 'MOIC', results.moic, 'multiple'),
        metricRow('netIrr', 'Net IRR', results.netIrr, 'irr'),
        metricRow('grossIrr', 'Gross IRR', results.grossIrr, 'irr'),
      ],
    },
    {
      sectionId: 'capital',
      title: 'Capital',
      ...provenance,
      rows: [
        metricRow(
          'contributionsTotal',
          'Contributions total',
          results.contributionsTotal,
          'money',
          'USD'
        ),
        metricRow(
          'distributionsTotal',
          'Distributions total',
          results.distributionsTotal,
          'money',
          'USD'
        ),
        metricRow('currentNav', 'Current NAV', results.currentNav, 'money', 'USD'),
      ],
    },
    {
      sectionId: 'mark_confidence',
      title: 'Mark confidence',
      ...provenance,
      rows: [
        metricRow(
          'markConfidenceHigh',
          'High confidence marks',
          results.markConfidenceMix.high,
          'count'
        ),
        metricRow(
          'markConfidenceMedium',
          'Medium confidence marks',
          results.markConfidenceMix.medium,
          'count'
        ),
        metricRow(
          'markConfidenceLow',
          'Low confidence marks',
          results.markConfidenceMix.low,
          'count'
        ),
      ],
    },
  ];
}

function buildNarrativeSections(
  payload: ReportPackagePayload
): ReportPackageRenderNarrativeSection[] {
  const byType = new Map<NarrativeType, ReportPackagePayload['narratives'][number]>();
  for (const narrative of payload.narratives) {
    if (byType.has(narrative.narrativeType)) {
      reportPackagePayloadInvalid('Report package payload contains duplicate narrative sections.', {
        narrativeType: narrative.narrativeType,
      });
    }
    byType.set(narrative.narrativeType, narrative);
  }

  return NARRATIVE_TITLES.map(({ narrativeType, title }) => {
    const narrative = byType.get(narrativeType);
    if (!narrative) {
      reportPackagePayloadInvalid(
        'Report package payload is missing a required narrative section.',
        {
          narrativeType,
        }
      );
    }
    return {
      sectionId: narrative.narrativeType,
      title,
      narrativeType: narrative.narrativeType,
      narrativeRunId: narrative.narrativeRunId,
      narrativeVersion: narrative.narrativeVersion,
      approvedBy: narrative.approvedBy,
      approvedAt: narrative.approvedAt,
      textHash: narrative.textHash,
      body: narrative.effectiveText,
    };
  });
}

function buildReferences(
  payload: ReportPackagePayload
): ReportPackageRenderModelResponse['renderModel']['references'] {
  return {
    sourceEventIds: uniqueSortedIds(normalizeIdArray(payload.sourceEventIds)),
    sourceMarkIds: uniqueSortedIds(normalizeIdArray(payload.sourceMarkIds)),
    evidenceRecordIds: uniqueSortedIds(normalizeIdArray(payload.evidenceRecordIds)),
    narrativeRunIds: uniqueSortedIds(
      payload.narratives.map((narrative) => narrative.narrativeRunId)
    ),
  };
}

export async function getMetricRunReportPackageRenderModel(
  input: ReportPackageRenderModelInput,
  options: ReportPackageRenderModelServiceOptions = {}
): Promise<ReportPackageRenderModelResponse> {
  const database = options.database ?? db;
  const metricRun = await loadMetricRun(database, input.fundId, input.metricRunId);
  await assertMetricRunExportWorkflowState({
    surface: options.h9Surface ?? 'render_model',
    fundId: input.fundId,
    metricRunId: input.metricRunId,
    database,
    preloaded: metricRun,
  });
  const rawPackage = await loadReportPackage(database, input.fundId, input.metricRunId);
  await assertH9ExportActionable({
    surface: options.h9Surface ?? 'render_model',
    fundId: input.fundId,
    stored: rawPackage,
    database,
  });
  const reportPackage = toReportPackageRecord(rawPackage);
  const fundDisplay = await loadFundDisplay(database, input.fundId);
  const payload = reportPackage.payload;
  if (reportPackage.h9Metadata == null) {
    throw new MetricRunCommitError(
      500,
      'REPORT_PACKAGE_ROW_INVALID',
      'Report package H9 metadata is required on render-model responses.'
    );
  }

  return ReportPackageRenderModelResponseSchema.parse({
    renderModel: {
      renderModelVersion: 1,
      source: {
        reportPackageId: reportPackage.reportPackageId,
        fundId: reportPackage.fundId,
        metricRunId: reportPackage.metricRunId,
        reportPackageStatus: reportPackage.status,
        asOfDate: reportPackage.asOfDate,
        metricRunVersion: reportPackage.metricRunVersion,
        metricRunLockedBy: reportPackage.metricRunLockedBy,
        metricRunLockedAt: reportPackage.metricRunLockedAt,
        assembledBy: reportPackage.assembledBy,
        assembledAt: reportPackage.assembledAt,
        packageVersion: reportPackage.version,
        payloadVersion: payload.payloadVersion,
        h9Stamp: {
          fingerprintHash: reportPackage.h9Metadata.fingerprintHash,
          policyVersion: reportPackage.h9Metadata.policyVersion,
          actionabilityStatus: reportPackage.h9Metadata.actionabilityStatus,
        },
      },
      fundDisplay,
      metricSections: buildMetricSections(payload, metricRun),
      narrativeSections: buildNarrativeSections(payload),
      diagnostics: {
        engineVersion: payload.diagnostics.engineVersion,
        decimalPrecision: payload.diagnostics.decimalPrecision,
        excludedFutureMarks: uniqueSortedIds(
          normalizeIdArray(payload.diagnostics.excludedFutureMarks)
        ),
        warnings: payload.diagnostics.warnings,
        xirr: payload.results.xirrDiagnostic,
      },
      references: buildReferences(payload),
    },
  });
}
