/**
 * LP Reporting -- Import Commit Service (Phase 1c.2).
 *
 * Persists a previously-previewed CSV import into cash_flow_events or
 * valuation_marks under a single Drizzle transaction.
 *
 * Handshake (per Phase 1c contract):
 *   1. Client posts to .../dry-run, receives { ..., previewHash }.
 *   2. Client posts to .../commit with that previewHash, the original
 *      base64 payload, and the importBatchId.
 *   3. This service re-parses the payload, recomputes the previewHash
 *      against the same canonicalization rule the dry-run uses, and
 *      throws PreviewDriftError if they diverge. Otherwise it INSERTs
 *      the rows in a single transaction.
 *
 * No money math is performed here -- amounts flow through as decimal
 * strings (NUMERIC(20,6) on the wire and on the column). The
 * import-reconciliation-service is the only place that touches Decimal
 * for the reconciliation summary; this commit path is a thin persister.
 *
 * @module server/services/lp-reporting/import-commit-service
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { createHash } from 'node:crypto';

import {
  cashFlowEvents,
  valuationMarks,
  type InsertCashFlowEvent,
  type InsertValuationMark,
} from '@shared/schema/lp-reporting-evidence';
import type {
  LedgerImportCommitRequest,
  LedgerImportCommitResponse,
  PreviewDriftError as PreviewDriftErrorPayload,
  ValuationMarkImportCommitRequest,
  ValuationMarkImportCommitResponse,
} from '@shared/contracts/lp-reporting';
import {
  LedgerImportCommitResponseSchema,
  ValuationMarkImportCommitResponseSchema,
} from '@shared/contracts/lp-reporting';

import {
  computePreviewHash,
  parseLedgerCsv,
  parseLedgerNotionExport,
  parseValuationMarksCsv,
  type ParsedLedgerRow,
  type ParsedValuationMarkRow,
} from './import-reconciliation-service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal Drizzle handle this service depends on. The real db (NodePgDatabase)
 * satisfies this shape; tests pass a mock with the same surface so we can
 * assert insert sequencing without standing up Postgres.
 */
export interface DrizzleDb {
  transaction<T>(cb: (tx: DrizzleTx) => Promise<T>): Promise<T>;
}

export interface DrizzleTx {
  insert(table: unknown): {
    values(rows: ReadonlyArray<Record<string, unknown>>): {
      returning(selection: Record<string, unknown>): Promise<Array<{ id: number }>>;
    };
  };
}

export interface CommitOpts {
  db: DrizzleDb;
  userId: number;
}

// ---------------------------------------------------------------------------
// PreviewDriftError -- thrown on hash mismatch, surfaced to the route as 409.
// ---------------------------------------------------------------------------

export class PreviewDriftError extends Error {
  public readonly expectedPreviewHash: string;
  public readonly actualPreviewHash: string;
  public readonly diff: PreviewDriftErrorPayload['diff'];

  constructor(args: {
    expectedPreviewHash: string;
    actualPreviewHash: string;
    diff: PreviewDriftErrorPayload['diff'];
  }) {
    super(
      `Preview hash drift: expected ${args.expectedPreviewHash}, got ${args.actualPreviewHash}.`
    );
    this.name = 'PreviewDriftError';
    this.expectedPreviewHash = args.expectedPreviewHash;
    this.actualPreviewHash = args.actualPreviewHash;
    this.diff = args.diff;
  }

  toJSON(): PreviewDriftErrorPayload {
    return {
      code: 'PREVIEW_DRIFT',
      expectedPreviewHash: this.expectedPreviewHash,
      actualPreviewHash: this.actualPreviewHash,
      diff: this.diff,
    };
  }
}

/**
 * Custom error thrown when the decoded payload contains zero parseable
 * rows. The route maps this to HTTP 400 (don't open a transaction for
 * an empty insert, don't pollute the audit log).
 */
export class EmptyPayloadError extends Error {
  constructor(message = 'EMPTY_PAYLOAD: decoded CSV contains no rows.') {
    super(message);
    this.name = 'EmptyPayloadError';
  }
}

// ---------------------------------------------------------------------------
// Per-row source hash (sha256 hex of canonicalized row payload).
// Deterministic, independent of object key insertion order.
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function computeRowSourceHash(row: unknown): string {
  return createHash('sha256').update(stableStringify(row)).digest('hex');
}

// ---------------------------------------------------------------------------
// Drift detection -- symmetric difference of per-row source hashes.
// ---------------------------------------------------------------------------

function buildDriftDiff(
  serverRows: ReadonlyArray<unknown>,
  clientRows: ReadonlyArray<unknown>
): PreviewDriftErrorPayload['diff'] {
  const serverIds = new Set(serverRows.map(computeRowSourceHash));
  const clientIds = new Set(clientRows.map(computeRowSourceHash));

  const added = [...serverIds].filter((id) => !clientIds.has(id));
  const removed = [...clientIds].filter((id) => !serverIds.has(id));

  return {
    addedSourceIds: added,
    removedSourceIds: removed,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodePayload(payloadBase64: string): Buffer {
  return Buffer.from(payloadBase64, 'base64');
}

// ---------------------------------------------------------------------------
// Ledger commit
// ---------------------------------------------------------------------------

export async function commitLedgerImport(
  input: LedgerImportCommitRequest,
  opts: CommitOpts
): Promise<LedgerImportCommitResponse> {
  const buffer = decodePayload(input.payload);

  const parsed =
    input.sourceType === 'notion'
      ? parseLedgerNotionExport(buffer, input.fundId)
      : parseLedgerCsv(buffer, input.fundId);

  // Parse errors are surfaced (and accepted by the user) at dry-run; the
  // previewHash on parsed.rows -- the *successfully parsed* rows -- is
  // what binds the commit to the preview. Reject only when there is
  // nothing valid to persist (avoids opening a tx for an empty insert).
  if (parsed.rows.length === 0) {
    throw new EmptyPayloadError();
  }

  const recomputedHash = computePreviewHash(parsed.rows);

  if (recomputedHash !== input.previewHash) {
    // Drift envelope -- the server treats the dry-run preview hash as
    // the source of truth for "what the user saw." We don't know the
    // dry-run rows here, so the diff reports the current rows as
    // "added" relative to whatever the client previewed.
    throw new PreviewDriftError({
      expectedPreviewHash: input.previewHash,
      actualPreviewHash: recomputedHash,
      diff: buildDriftDiff(parsed.rows, []),
    });
  }

  const persistedEventIds = await opts.db.transaction(async (tx) => {
    const insertRows: InsertCashFlowEvent[] = parsed.rows.map((row) =>
      buildLedgerInsertRow(row, input, opts.userId)
    );

    const inserted = await tx
      .insert(cashFlowEvents)
      .values(insertRows)
      .returning({ id: cashFlowEvents.id });

    return inserted.map((r) => r.id);
  });

  const response: LedgerImportCommitResponse = {
    persistedEventIds,
    importBatchId: input.importBatchId,
    committedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    previewHash: input.previewHash,
    rowCount: parsed.rows.length,
  };

  return LedgerImportCommitResponseSchema.parse(response);
}

function buildLedgerInsertRow(
  row: ParsedLedgerRow,
  input: LedgerImportCommitRequest,
  userId: number
): InsertCashFlowEvent {
  const eventDate =
    row.eventDate.length === 10 ? new Date(`${row.eventDate}T00:00:00Z`) : new Date(row.eventDate);
  return {
    fundId: input.fundId,
    eventType: row.eventType,
    amount: row.amount,
    currency: row.currency,
    eventDate,
    perspective: row.perspective,
    status: 'draft',
    importedFrom: input.sourceType,
    importBatchId: input.importBatchId,
    sourceHash: computeRowSourceHash(row),
    createdBy: userId,
    ...(row.companyId !== undefined && { companyId: row.companyId }),
    ...(row.lpId !== undefined && { lpId: row.lpId }),
    ...(row.vehicleId !== undefined && { vehicleId: row.vehicleId }),
    ...(row.description !== undefined && { description: row.description }),
  };
}

// ---------------------------------------------------------------------------
// Valuation-mark commit
// ---------------------------------------------------------------------------

export async function commitValuationMarkImport(
  input: ValuationMarkImportCommitRequest,
  opts: CommitOpts
): Promise<ValuationMarkImportCommitResponse> {
  const buffer = decodePayload(input.payload);
  const parsed = parseValuationMarksCsv(buffer, input.fundId);

  // Mirror the ledger-commit policy: trust the dry-run handshake. The
  // previewHash binds to parsed.rows (valid only). Reject only on a
  // fully-empty payload to avoid wasted transactions.
  if (parsed.rows.length === 0) {
    throw new EmptyPayloadError();
  }

  const recomputedHash = computePreviewHash(parsed.rows);

  if (recomputedHash !== input.previewHash) {
    throw new PreviewDriftError({
      expectedPreviewHash: input.previewHash,
      actualPreviewHash: recomputedHash,
      diff: buildDriftDiff(parsed.rows, []),
    });
  }

  const persistedMarkIds = await opts.db.transaction(async (tx) => {
    const insertRows: InsertValuationMark[] = parsed.rows.map((row) =>
      buildValuationMarkInsertRow(row, input, opts.userId)
    );

    const inserted = await tx
      .insert(valuationMarks)
      .values(insertRows)
      .returning({ id: valuationMarks.id });

    return inserted.map((r) => r.id);
  });

  const response: ValuationMarkImportCommitResponse = {
    persistedMarkIds,
    importBatchId: input.importBatchId,
    committedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    previewHash: input.previewHash,
    rowCount: parsed.rows.length,
  };

  return ValuationMarkImportCommitResponseSchema.parse(response);
}

function buildValuationMarkInsertRow(
  row: ParsedValuationMarkRow,
  input: ValuationMarkImportCommitRequest,
  userId: number
): InsertValuationMark {
  return {
    fundId: input.fundId,
    companyId: row.companyId,
    markDate: row.markDate,
    asOfDate: row.asOfDate,
    fairValue: row.fairValue,
    currency: row.currency,
    markSource: row.markSource,
    confidenceLevel: row.confidenceLevel,
    valuationMethod: row.valuationMethod,
    status: 'draft',
    importedFrom: input.sourceType,
    importBatchId: input.importBatchId,
    sourceHash: computeRowSourceHash(row),
    createdBy: userId,
    ...(row.vehicleId !== undefined && { vehicleId: row.vehicleId }),
    ...(row.costBasis !== undefined && { costBasis: row.costBasis }),
  };
}
