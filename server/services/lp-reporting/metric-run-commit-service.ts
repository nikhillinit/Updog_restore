/**
 * LP Reporting -- Metric-run dry-run preview and commit service.
 *
 * Commit re-runs the metric calculation from persisted source rows and compares
 * a server-owned preview hash before writing a draft lp_metric_runs row.
 *
 * @module server/services/lp-reporting/metric-run-commit-service
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import { logger } from '../../lib/logger';
import {
  LpMetricRunCreateSchema,
  type LpMetricRunDiagnostics,
  type LpMetricRunPerspective,
  type LpMetricRunResults,
  type LpMetricRunType,
  type MetricRunCommitResponse,
  type MetricRunDryRunResponse,
  type MetricRunSourceMarkSelection,
} from '@shared/contracts/lp-reporting';
import {
  cashFlowEvents,
  lpMetricRuns,
  valuationMarks,
  type CashFlowEvent,
  type InsertLpMetricRun,
  type LpMetricRun,
  type ValuationMark,
} from '@shared/schema/lp-reporting-evidence';
import { users } from '@shared/schema/user';
import {
  computeMetrics,
  type CashFlowEventType,
  type CashFlowPerspectiveLite,
  type ConfidenceLevel,
  type EventStatus,
  type MarkStatus,
  type MetricsPerspective,
  type ParsedCashFlowEvent,
  type ParsedValuationMark,
} from './metrics-engine';
import { selectActiveValuationMarks } from './active-valuation-mark-selector';

type MetricRunDatabase = typeof db;

const log = logger.child({ module: 'lp-reporting:metric-run-commit' });

export class MetricRunCommitError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'MetricRunCommitError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface MetricRunRequestInput {
  fundId: number;
  asOfDate: string;
  runType: LpMetricRunType;
  perspective: LpMetricRunPerspective;
  sourceEventIds?: number[];
  sourceMarkIds?: number[];
  sourceMarkSelection?: MetricRunSourceMarkSelection;
}

export interface MetricRunCommitInput extends MetricRunRequestInput {
  previewHash: string;
  userId: number;
}

interface MetricRunServiceOptions {
  database?: MetricRunDatabase;
}

interface MetricRunSources {
  eventRows: CashFlowEvent[];
  markRows: ValuationMark[];
  sourceMarkIds: number[];
}

interface MetricRunPreviewParts {
  fundId: number;
  asOfDate: string;
  runType: LpMetricRunType;
  perspective: LpMetricRunPerspective;
  sourceMarkSelection: MetricRunSourceMarkSelection;
  sourceEventIds: number[];
  sourceMarkIds: number[];
  eventRows: CashFlowEvent[];
  markRows: ValuationMark[];
  results: LpMetricRunResults;
  diagnostics: LpMetricRunDiagnostics;
  inputsHash: string;
  previewHash: string;
}

const METHODOLOGY_VERSION = 'lp-reporting-methodology-v1';
const CALCULATION_VERSION = 'lp-reporting-metrics-engine-1.0.0';

function uniqueSorted(values: number[] | undefined): number[] {
  return Array.from(new Set(values ?? [])).sort((a, b) => a - b);
}

function isoDateTime(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function isoDay(value: Date | string): string {
  return isoDateTime(value)?.slice(0, 10) ?? '';
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

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function assertSupportedPerspective(
  perspective: LpMetricRunPerspective
): asserts perspective is MetricsPerspective {
  if (perspective !== 'lp_net' && perspective !== 'fund_gross') {
    throw new MetricRunCommitError(
      400,
      'UNSUPPORTED_PERSPECTIVE',
      'metric-run commit currently supports lp_net and fund_gross only.'
    );
  }
}

function assertAllRequestedRowsFound(
  requestedIds: number[],
  foundIds: number[],
  code: string,
  message: string
): void {
  const found = new Set(foundIds);
  const missing = requestedIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new MetricRunCommitError(404, code, message, { ids: missing });
  }
}

function assertActiveAsOfRequestIsImplicit(sourceMarkIds: number[]): void {
  if (sourceMarkIds.length > 0) {
    throw new MetricRunCommitError(
      400,
      'ACTIVE_AS_OF_SOURCE_MARK_IDS_NOT_ALLOWED',
      'sourceMarkIds must be empty when sourceMarkSelection is active_as_of.'
    );
  }
}

function assertRowsBelongToFund(
  fundId: number,
  eventRows: CashFlowEvent[],
  markRows: ValuationMark[]
): void {
  const wrongFundEventIds = eventRows.filter((row) => row.fundId !== fundId).map((row) => row.id);
  const wrongFundMarkIds = markRows.filter((row) => row.fundId !== fundId).map((row) => row.id);
  if (wrongFundEventIds.length > 0 || wrongFundMarkIds.length > 0) {
    throw new MetricRunCommitError(
      403,
      'CROSS_FUND_RESOURCE',
      'one or more requested event/mark IDs do not belong to this fund',
      { eventIds: wrongFundEventIds, markIds: wrongFundMarkIds }
    );
  }
}

function assertRealizedProceedsValid(eventRows: CashFlowEvent[]): void {
  const offending = eventRows
    .filter((row) => row.eventType === 'realized_proceeds')
    .filter((row) => {
      const amount = Number(row.amount);
      return (
        row.status !== 'locked' ||
        row.reversalOfEventId != null ||
        !Number.isFinite(amount) ||
        amount <= 0
      );
    })
    .map((row) => row.id);

  if (offending.length > 0) {
    throw new MetricRunCommitError(
      422,
      'REALIZED_PROCEEDS_INVALID',
      'One or more realized-proceeds source events are not locked, are reversed, or have a non-positive amount.',
      { eventIds: offending }
    );
  }
}

function eventFingerprint(row: CashFlowEvent): Record<string, unknown> {
  return {
    id: row.id,
    amount: row.amount,
    eventDate: isoDateTime(row.eventDate),
    eventType: row.eventType,
    fundId: row.fundId,
    importBatchId: row.importBatchId ?? null,
    perspective: row.perspective,
    reversalOfEventId: row.reversalOfEventId ?? null,
    sourceHash: row.sourceHash ?? null,
    status: row.status ?? null,
    updatedAt: isoDateTime(row.updatedAt),
  };
}

function markFingerprint(row: ValuationMark): Record<string, unknown> {
  return {
    id: row.id,
    asOfDate: isoDateTime(row.asOfDate),
    companyId: row.companyId,
    confidenceLevel: row.confidenceLevel,
    fairValue: row.fairValue,
    fundId: row.fundId,
    importBatchId: row.importBatchId ?? null,
    markDate: isoDateTime(row.markDate),
    sourceHash: row.sourceHash ?? null,
    status: row.status ?? null,
    updatedAt: isoDateTime(row.updatedAt),
  };
}

function computePreviewHash(parts: MetricRunPreviewParts): string {
  return sha256({
    fundId: parts.fundId,
    asOfDate: parts.asOfDate,
    runType: parts.runType,
    perspective: parts.perspective,
    sourceMarkSelection: parts.sourceMarkSelection,
    sourceEventIds: parts.sourceEventIds,
    sourceMarkIds: parts.sourceMarkIds,
    eventFingerprints: parts.eventRows
      .map(eventFingerprint)
      .sort((a, b) => Number(a['id']) - Number(b['id'])),
    markFingerprints: parts.markRows
      .map(markFingerprint)
      .sort((a, b) => Number(a['id']) - Number(b['id'])),
    results: parts.results,
    diagnostics: parts.diagnostics,
    inputsHash: parts.inputsHash,
  });
}

function toParsedCashFlowEvent(row: CashFlowEvent): ParsedCashFlowEvent {
  return {
    id: row.id,
    eventType: row.eventType as CashFlowEventType,
    amount: row.amount,
    eventDate: isoDateTime(row.eventDate) ?? '',
    perspective: row.perspective as CashFlowPerspectiveLite,
    ...(row.status != null && { status: row.status as EventStatus }),
    reversalOfEventId: row.reversalOfEventId ?? null,
  };
}

function toParsedValuationMark(row: ValuationMark): ParsedValuationMark {
  return {
    id: row.id,
    fairValue: row.fairValue,
    markDate: isoDay(row.markDate),
    asOfDate: isoDay(row.asOfDate),
    ...(row.status != null && { status: row.status as MarkStatus }),
    confidenceLevel: row.confidenceLevel as ConfidenceLevel,
    ...(row.companyId != null && { companyId: row.companyId }),
  };
}

async function loadSources(
  database: MetricRunDatabase,
  fundId: number,
  asOfDate: string,
  sourceEventIds: number[],
  requestedSourceMarkIds: number[],
  sourceMarkSelection: MetricRunSourceMarkSelection
): Promise<MetricRunSources> {
  const eventRows = sourceEventIds.length
    ? await database.select().from(cashFlowEvents).where(inArray(cashFlowEvents.id, sourceEventIds))
    : [];
  let markRows: ValuationMark[] = [];
  let sourceMarkIds = requestedSourceMarkIds;

  if (sourceMarkSelection === 'explicit') {
    markRows = requestedSourceMarkIds.length
      ? await database
          .select()
          .from(valuationMarks)
          .where(inArray(valuationMarks.id, requestedSourceMarkIds))
      : [];
  } else {
    assertActiveAsOfRequestIsImplicit(requestedSourceMarkIds);
    const candidateRows = await database
      .select()
      .from(valuationMarks)
      .where(eq(valuationMarks.fundId, fundId));
    const fundRows = candidateRows.filter((row) => row.fundId === fundId);
    const selection = selectActiveValuationMarks(fundRows.map(toParsedValuationMark), asOfDate);
    sourceMarkIds = uniqueSorted(selection.active.map((mark) => mark.id));
    markRows = fundRows;
    log.info(
      {
        fundId,
        asOfDate,
        sourceMarkIds,
        excludedFutureMarkIds: selection.excludedFutureMarkIds,
      },
      'lp_reporting.metric_run.active_as_of_selection'
    );
  }

  assertAllRequestedRowsFound(
    sourceEventIds,
    eventRows.map((row) => row.id),
    'SOURCE_EVENT_NOT_FOUND',
    'One or more source event IDs were not found.'
  );
  if (sourceMarkSelection === 'explicit') {
    assertAllRequestedRowsFound(
      requestedSourceMarkIds,
      markRows.map((row) => row.id),
      'SOURCE_MARK_NOT_FOUND',
      'One or more source mark IDs were not found.'
    );
  }
  assertRowsBelongToFund(fundId, eventRows, markRows);
  assertRealizedProceedsValid(eventRows);

  return { eventRows, markRows, sourceMarkIds };
}

async function assertUserExists(database: MetricRunDatabase, userId: number): Promise<void> {
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

async function findExistingMetricRun(
  database: MetricRunDatabase,
  input: MetricRunRequestInput,
  inputsHash: string
): Promise<Pick<LpMetricRun, 'id' | 'status' | 'inputsHash'> | null> {
  const rows = await database
    .select({
      id: lpMetricRuns.id,
      status: lpMetricRuns.status,
      inputsHash: lpMetricRuns.inputsHash,
    })
    .from(lpMetricRuns)
    .where(
      and(
        eq(lpMetricRuns.fundId, input.fundId),
        eq(lpMetricRuns.runType, input.runType),
        eq(lpMetricRuns.perspective, input.perspective),
        eq(lpMetricRuns.asOfDate, input.asOfDate),
        eq(lpMetricRuns.inputsHash, inputsHash)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

function metricRunInsertValues(
  input: MetricRunCommitInput,
  preview: MetricRunPreviewParts
): InsertLpMetricRun {
  const create = LpMetricRunCreateSchema.parse({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    runType: input.runType,
    perspective: input.perspective,
    status: 'draft',
    inputsHash: preview.inputsHash,
    sourceEventIds: uniqueSorted(input.sourceEventIds),
    sourceMarkIds: preview.sourceMarkIds,
    sourceEvidenceIds: [],
    methodologyVersion: METHODOLOGY_VERSION,
    calculationVersion: CALCULATION_VERSION,
    resultsJson: preview.results,
    diagnosticsJson: preview.diagnostics,
  });

  return {
    fundId: create.fundId,
    ...(create.vehicleId !== undefined && { vehicleId: create.vehicleId }),
    asOfDate: create.asOfDate,
    runType: create.runType,
    perspective: create.perspective,
    status: create.status,
    inputsHash: create.inputsHash,
    sourceEventIds: create.sourceEventIds,
    sourceMarkIds: create.sourceMarkIds,
    sourceEvidenceIds: create.sourceEvidenceIds,
    resultsJson: create.resultsJson,
    diagnosticsJson: create.diagnosticsJson ?? {},
    methodologyVersion: create.methodologyVersion,
    calculationVersion: create.calculationVersion,
    generatedBy: input.userId,
  };
}

async function buildMetricRunPreviewParts(
  input: MetricRunRequestInput,
  options: MetricRunServiceOptions = {}
): Promise<MetricRunPreviewParts> {
  const database = options.database ?? db;
  assertSupportedPerspective(input.perspective);
  const sourceEventIds = uniqueSorted(input.sourceEventIds);
  const requestedSourceMarkIds = uniqueSorted(input.sourceMarkIds);
  const sourceMarkSelection = input.sourceMarkSelection ?? 'explicit';
  const { eventRows, markRows, sourceMarkIds } = await loadSources(
    database,
    input.fundId,
    input.asOfDate,
    sourceEventIds,
    requestedSourceMarkIds,
    sourceMarkSelection
  );

  const computed = computeMetrics({
    fundId: input.fundId,
    asOfDate: input.asOfDate,
    perspective: input.perspective,
    cashFlowEvents: eventRows.map(toParsedCashFlowEvent),
    valuationMarks: markRows.map(toParsedValuationMark),
  });
  const parts = {
    ...input,
    sourceMarkSelection,
    sourceEventIds,
    sourceMarkIds,
    eventRows,
    markRows,
    results: computed.results,
    diagnostics: computed.diagnostics,
    inputsHash: computed.inputsHash,
    previewHash: '',
  };

  return {
    ...parts,
    previewHash: computePreviewHash(parts),
  };
}

export async function buildMetricRunDryRun(
  input: MetricRunRequestInput,
  options: MetricRunServiceOptions = {}
): Promise<MetricRunDryRunResponse> {
  const preview = await buildMetricRunPreviewParts(input, options);
  return {
    results: preview.results,
    diagnostics: preview.diagnostics,
    inputsHash: preview.inputsHash,
    runType: preview.runType,
    previewHash: preview.previewHash,
  };
}

export async function commitMetricRun(
  input: MetricRunCommitInput,
  options: MetricRunServiceOptions = {}
): Promise<MetricRunCommitResponse> {
  const database = options.database ?? db;
  const preview = await buildMetricRunPreviewParts(input, { database });
  if (preview.previewHash !== input.previewHash) {
    throw new MetricRunCommitError(
      409,
      'PREVIEW_HASH_MISMATCH',
      'Metric-run preview hash no longer matches the selected source rows.'
    );
  }

  await assertUserExists(database, input.userId);

  const existing = await findExistingMetricRun(database, input, preview.inputsHash);
  if (existing) {
    return {
      metricRunId: existing.id,
      status: existing.status as MetricRunCommitResponse['status'],
      inputsHash: existing.inputsHash,
      previewHash: preview.previewHash,
      inserted: false,
    };
  }

  const inserted = await database
    .insert(lpMetricRuns)
    .values(metricRunInsertValues(input, preview))
    .onConflictDoNothing()
    .returning({
      id: lpMetricRuns.id,
      status: lpMetricRuns.status,
      inputsHash: lpMetricRuns.inputsHash,
    });

  const insertedRow = inserted[0];
  if (insertedRow) {
    return {
      metricRunId: insertedRow.id,
      status: insertedRow.status as MetricRunCommitResponse['status'],
      inputsHash: insertedRow.inputsHash,
      previewHash: preview.previewHash,
      inserted: true,
    };
  }

  const racedExisting = await findExistingMetricRun(database, input, preview.inputsHash);
  if (racedExisting) {
    return {
      metricRunId: racedExisting.id,
      status: racedExisting.status as MetricRunCommitResponse['status'],
      inputsHash: racedExisting.inputsHash,
      previewHash: preview.previewHash,
      inserted: false,
    };
  }

  throw new MetricRunCommitError(
    409,
    'METRIC_RUN_COMMIT_CONFLICT',
    'Metric-run commit conflicted but no existing row could be loaded.'
  );
}
