/**
 * LP Reporting -- Import Commit Service.
 *
 * Re-runs the dry-run parser from the original payload, verifies the preview
 * hash, validates typed CREATE contracts, then inserts only eligible rows.
 *
 * @module server/services/lp-reporting/import-commit-service
 */

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import {
  CashFlowEventCreateSchema,
  ValuationMarkCreateSchema,
  type CashFlowEventCreate,
  type ImportCommitResponse,
  type SourceType,
  type ValuationMarkCreate,
} from '@shared/contracts/lp-reporting';
import {
  cashFlowEvents,
  valuationMarks,
  vehicles,
  type InsertCashFlowEvent,
  type InsertValuationMark,
} from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';
import { users } from '@shared/schema/user';
import { lpFundCommitments } from '@shared/schema-lp-reporting';
import {
  computeSourceRowHash,
  detectLedgerDuplicates,
  parseLedgerCsv,
  parseLedgerNotionExport,
  parseValuationMarksCsv,
  runLedgerDryRun,
  runValuationMarkDryRun,
  type ImportKind,
  type ParsedLedgerRow,
  type ParsedValuationMarkRow,
} from './import-reconciliation-service';

type CommitDatabase = typeof db;

export class ImportCommitError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ImportCommitError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface CommitInput {
  fundId: number;
  sourceType: SourceType;
  payload: string;
  previewHash: string;
  userId: number;
}

interface CommitOptions {
  database?: CommitDatabase;
}

interface Candidate<TCreate> {
  create: TCreate;
  sourceHash: string;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function decodePayload(payload: string): Buffer {
  return Buffer.from(payload, 'base64');
}

function toIsoDateTime(value: string): string {
  if (ISO_DATE_REGEX.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  return value;
}

function parseCreateSchemaFailure(kind: ImportKind, rowIndex: number, error: unknown): never {
  throw new ImportCommitError(
    422,
    'IMPORT_ROW_SCHEMA_REJECTED',
    `${kind} row ${rowIndex} did not satisfy the typed CREATE contract.`,
    error
  );
}

function requireCleanDryRun(errors: unknown[]): void {
  if (errors.length > 0) {
    throw new ImportCommitError(
      422,
      'IMPORT_HAS_PARSE_ERRORS',
      'Commit requires a dry-run with zero parse errors.',
      errors
    );
  }
}

function verifyPreviewHash(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ImportCommitError(
      409,
      'PREVIEW_HASH_MISMATCH',
      'Dry-run preview hash no longer matches the submitted payload.'
    );
  }
}

function toCashFlowCreate(row: ParsedLedgerRow, fundId: number): CashFlowEventCreate {
  const raw: Record<string, unknown> = {
    fundId,
    eventType: row.eventType,
    amount: row.amount,
    currency: 'USD',
    eventDate: toIsoDateTime(row.eventDate),
    perspective: row.perspective,
    ...(row.companyId !== undefined && { companyId: row.companyId }),
    ...(row.lpId !== undefined && { lpId: row.lpId }),
    ...(row.vehicleId !== undefined && { vehicleId: row.vehicleId }),
    ...(row.description !== undefined && { description: row.description }),
  };

  if (row.eventType === 'fund_expense') {
    raw['payload'] = { category: 'other' };
  } else if (row.eventType !== 'reversal') {
    raw['payload'] = {};
  }

  const parsed = CashFlowEventCreateSchema.safeParse(raw);
  if (!parsed.success) {
    parseCreateSchemaFailure('ledger', row.rowIndex, parsed.error.issues);
  }
  return parsed.data;
}

function toValuationMarkCreate(row: ParsedValuationMarkRow, fundId: number): ValuationMarkCreate {
  const parsed = ValuationMarkCreateSchema.safeParse({
    fundId,
    companyId: row.companyId,
    markDate: row.markDate,
    asOfDate: row.asOfDate,
    fairValue: row.fairValue,
    currency: 'USD',
    markSource: row.markSource,
    confidenceLevel: row.confidenceLevel,
    valuationMethod: row.valuationMethod,
    ...(row.vehicleId !== undefined && { vehicleId: row.vehicleId }),
    ...(row.costBasis !== undefined && { costBasis: row.costBasis }),
  });

  if (!parsed.success) {
    parseCreateSchemaFailure('valuation-marks', row.rowIndex, parsed.error.issues);
  }
  return parsed.data;
}

function uniquePositive(values: Array<number | undefined>): number[] {
  return Array.from(new Set(values.filter((value): value is number => value !== undefined)));
}

async function assertReferencesBelongToFund(
  database: CommitDatabase,
  fundId: number,
  creates: Array<CashFlowEventCreate | ValuationMarkCreate>
): Promise<void> {
  const companyIds = uniquePositive(creates.map((row) => row.companyId));
  const vehicleIds = uniquePositive(creates.map((row) => row.vehicleId));
  const lpIds = uniquePositive(creates.map((row) => ('lpId' in row ? row.lpId : undefined)));

  if (companyIds.length > 0) {
    const rows = await database
      .select({ id: portfolioCompanies.id })
      .from(portfolioCompanies)
      .where(
        and(inArray(portfolioCompanies.id, companyIds), eq(portfolioCompanies.fundId, fundId))
      );
    const found = new Set(rows.map((row) => row.id));
    const missing = companyIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ImportCommitError(
        403,
        'CROSS_FUND_COMPANY_REFERENCE',
        'One or more company_id values do not belong to this fund.',
        { companyIds: missing }
      );
    }
  }

  if (vehicleIds.length > 0) {
    const rows = await database
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(inArray(vehicles.id, vehicleIds), eq(vehicles.fundId, fundId)));
    const found = new Set(rows.map((row) => row.id));
    const missing = vehicleIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ImportCommitError(
        403,
        'CROSS_FUND_VEHICLE_REFERENCE',
        'One or more vehicle_id values do not belong to this fund.',
        { vehicleIds: missing }
      );
    }
  }

  if (lpIds.length > 0) {
    const rows = await database
      .select({ lpId: lpFundCommitments.lpId })
      .from(lpFundCommitments)
      .where(and(inArray(lpFundCommitments.lpId, lpIds), eq(lpFundCommitments.fundId, fundId)));
    const found = new Set(rows.map((row) => row.lpId));
    const missing = lpIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ImportCommitError(
        403,
        'CROSS_FUND_LP_REFERENCE',
        'One or more lp_id values do not belong to this fund.',
        { lpIds: missing }
      );
    }
  }
}

async function assertUserExists(database: CommitDatabase, userId: number): Promise<void> {
  const rows = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!rows[0]) {
    throw new ImportCommitError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
}

async function existingCashFlowHashes(
  database: CommitDatabase,
  fundId: number,
  sourceHashes: string[]
): Promise<Set<string>> {
  if (sourceHashes.length === 0) {
    return new Set();
  }
  const rows = await database
    .select({ sourceHash: cashFlowEvents.sourceHash })
    .from(cashFlowEvents)
    .where(
      and(eq(cashFlowEvents.fundId, fundId), inArray(cashFlowEvents.sourceHash, sourceHashes))
    );
  return new Set(rows.map((row) => row.sourceHash).filter((hash): hash is string => hash !== null));
}

async function existingValuationMarkHashes(
  database: CommitDatabase,
  fundId: number,
  sourceHashes: string[]
): Promise<Set<string>> {
  if (sourceHashes.length === 0) {
    return new Set();
  }
  const rows = await database
    .select({ sourceHash: valuationMarks.sourceHash })
    .from(valuationMarks)
    .where(
      and(eq(valuationMarks.fundId, fundId), inArray(valuationMarks.sourceHash, sourceHashes))
    );
  return new Set(rows.map((row) => row.sourceHash).filter((hash): hash is string => hash !== null));
}

function cashFlowInsertValues(
  candidates: Candidate<CashFlowEventCreate>[],
  sourceType: SourceType,
  importBatchId: string,
  userId: number
): InsertCashFlowEvent[] {
  return candidates.map(({ create, sourceHash }) => ({
    fundId: create.fundId,
    eventType: create.eventType,
    amount: create.amount,
    currency: create.currency,
    eventDate: new Date(create.eventDate),
    perspective: create.perspective,
    payload: create.payload,
    importedFrom: sourceType,
    importBatchId,
    sourceHash,
    createdBy: userId,
    ...(create.vehicleId !== undefined && { vehicleId: create.vehicleId }),
    ...(create.companyId !== undefined && { companyId: create.companyId }),
    ...('lpId' in create && create.lpId !== undefined ? { lpId: create.lpId } : {}),
    ...(create.description !== undefined && { description: create.description }),
    ...('reversalOfEventId' in create && create.reversalOfEventId !== undefined
      ? { reversalOfEventId: create.reversalOfEventId }
      : {}),
  }));
}

function valuationMarkInsertValues(
  candidates: Candidate<ValuationMarkCreate>[],
  sourceType: SourceType,
  importBatchId: string,
  userId: number
): InsertValuationMark[] {
  return candidates.map(({ create, sourceHash }) => ({
    fundId: create.fundId,
    companyId: create.companyId,
    markDate: create.markDate,
    asOfDate: create.asOfDate,
    fairValue: create.fairValue,
    currency: create.currency,
    markSource: create.markSource,
    confidenceLevel: create.confidenceLevel,
    valuationMethod: create.valuationMethod,
    importedFrom: sourceType,
    importBatchId,
    sourceHash,
    createdBy: userId,
    ...(create.vehicleId !== undefined && { vehicleId: create.vehicleId }),
    ...(create.costBasis !== undefined && { costBasis: create.costBasis }),
    ...(create.methodologyNotes !== undefined && { methodologyNotes: create.methodologyNotes }),
    ...(create.priorMarkId !== undefined && { priorMarkId: create.priorMarkId }),
  }));
}

export async function commitLedgerImport(
  input: CommitInput,
  options: CommitOptions = {}
): Promise<ImportCommitResponse> {
  const database = options.database ?? db;
  const buffer = decodePayload(input.payload);
  const dryRun = runLedgerDryRun(buffer, input.sourceType, input.fundId);
  verifyPreviewHash(dryRun.previewHash, input.previewHash);
  requireCleanDryRun(dryRun.errors);

  const parsed =
    input.sourceType === 'notion'
      ? parseLedgerNotionExport(buffer, input.fundId)
      : parseLedgerCsv(buffer, input.fundId);
  const duplicates = detectLedgerDuplicates(parsed.rows);
  const candidates = parsed.rows
    .filter((row) => !duplicates.has(row.rowIndex))
    .map((row) => {
      const create = toCashFlowCreate(row, input.fundId);
      const sourceHash = computeSourceRowHash({
        fundId: input.fundId,
        importKind: 'ledger',
        sourceType: input.sourceType,
        row: create,
      });
      return { create, sourceHash };
    });

  await assertUserExists(database, input.userId);
  await assertReferencesBelongToFund(
    database,
    input.fundId,
    candidates.map((candidate) => candidate.create)
  );

  const existingHashes = await existingCashFlowHashes(
    database,
    input.fundId,
    candidates.map((candidate) => candidate.sourceHash)
  );
  const newCandidates = candidates.filter((candidate) => !existingHashes.has(candidate.sourceHash));
  const importBatchId = randomUUID();
  const inserted = newCandidates.length
    ? await database
        .insert(cashFlowEvents)
        .values(cashFlowInsertValues(newCandidates, input.sourceType, importBatchId, input.userId))
        .onConflictDoNothing()
        .returning({ id: cashFlowEvents.id, sourceHash: cashFlowEvents.sourceHash })
    : [];

  return {
    importBatchId,
    previewHash: dryRun.previewHash,
    insertedCount: inserted.length,
    skippedExistingCount: candidates.length - inserted.length,
    skippedDuplicateCount: duplicates.size,
    skippedExcludedCount: 0,
    insertedIds: inserted.map((row) => row.id),
  };
}

export async function commitValuationMarkImport(
  input: CommitInput,
  options: CommitOptions = {}
): Promise<ImportCommitResponse> {
  const database = options.database ?? db;
  const buffer = decodePayload(input.payload);
  const dryRun = runValuationMarkDryRun(buffer, input.sourceType, input.fundId);
  verifyPreviewHash(dryRun.previewHash, input.previewHash);
  requireCleanDryRun(dryRun.errors);

  const parsed = parseValuationMarksCsv(buffer, input.fundId);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  let skippedExcludedCount = 0;
  let skippedDuplicateCount = 0;
  const candidates: Candidate<ValuationMarkCreate>[] = [];

  for (const row of parsed.rows) {
    if (row.asOfDate > today) {
      skippedExcludedCount += 1;
      continue;
    }
    const create = toValuationMarkCreate(row, input.fundId);
    const sourceHash = computeSourceRowHash({
      fundId: input.fundId,
      importKind: 'valuation-marks',
      sourceType: input.sourceType,
      row: create,
    });
    if (seen.has(sourceHash)) {
      skippedDuplicateCount += 1;
      continue;
    }
    seen.add(sourceHash);
    candidates.push({ create, sourceHash });
  }

  await assertUserExists(database, input.userId);
  await assertReferencesBelongToFund(
    database,
    input.fundId,
    candidates.map((candidate) => candidate.create)
  );

  const existingHashes = await existingValuationMarkHashes(
    database,
    input.fundId,
    candidates.map((candidate) => candidate.sourceHash)
  );
  const newCandidates = candidates.filter((candidate) => !existingHashes.has(candidate.sourceHash));
  const importBatchId = randomUUID();
  const inserted = newCandidates.length
    ? await database
        .insert(valuationMarks)
        .values(
          valuationMarkInsertValues(newCandidates, input.sourceType, importBatchId, input.userId)
        )
        .onConflictDoNothing()
        .returning({ id: valuationMarks.id, sourceHash: valuationMarks.sourceHash })
    : [];

  return {
    importBatchId,
    previewHash: dryRun.previewHash,
    insertedCount: inserted.length,
    skippedExistingCount: candidates.length - inserted.length,
    skippedDuplicateCount,
    skippedExcludedCount,
    insertedIds: inserted.map((row) => row.id),
  };
}
