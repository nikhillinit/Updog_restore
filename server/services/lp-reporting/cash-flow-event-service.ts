import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import type {
  LpCapitalCall,
  LpCapitalCallPatch,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import { cashFlowEvents, type CashFlowEvent } from '@shared/schema/lp-reporting-evidence';

type CashFlowEventDatabase = typeof db;

interface CashFlowEventServiceOptions {
  database?: CashFlowEventDatabase;
}

export interface CashFlowEventRow {
  row: CashFlowEvent;
  /** Postgres xmin system column as text -- opaque per-row concurrency token. */
  xmin: string;
}

// Explicit column map + xmin::text. getTableColumns is unused elsewhere in this
// repo, so we list columns rather than rely on an unproven import.
const columnsWithXmin = {
  id: cashFlowEvents.id,
  fundId: cashFlowEvents.fundId,
  vehicleId: cashFlowEvents.vehicleId,
  companyId: cashFlowEvents.companyId,
  lpId: cashFlowEvents.lpId,
  eventType: cashFlowEvents.eventType,
  amount: cashFlowEvents.amount,
  currency: cashFlowEvents.currency,
  eventDate: cashFlowEvents.eventDate,
  perspective: cashFlowEvents.perspective,
  description: cashFlowEvents.description,
  payload: cashFlowEvents.payload,
  status: cashFlowEvents.status,
  lockedAt: cashFlowEvents.lockedAt,
  lockedBy: cashFlowEvents.lockedBy,
  supersedesEventId: cashFlowEvents.supersedesEventId,
  reversalOfEventId: cashFlowEvents.reversalOfEventId,
  importedFrom: cashFlowEvents.importedFrom,
  importBatchId: cashFlowEvents.importBatchId,
  sourceHash: cashFlowEvents.sourceHash,
  createdBy: cashFlowEvents.createdBy,
  createdAt: cashFlowEvents.createdAt,
  updatedAt: cashFlowEvents.updatedAt,
  rowXmin: sql<string>`xmin::text`,
} as const;

function splitXmin(record: CashFlowEvent & { rowXmin: string }): CashFlowEventRow {
  const { rowXmin, ...row } = record;
  return { row: row as CashFlowEvent, xmin: rowXmin };
}

export async function createLpCapitalCallEvent(
  input: LpCapitalCall,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEventRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .insert(cashFlowEvents)
    .values({
      fundId: input.fundId,
      eventType: 'lp_capital_call',
      amount: input.amount,
      currency: 'USD',
      eventDate: new Date(input.eventDate),
      perspective: input.perspective,
      description: input.description ?? null,
      payload: input.payload,
      status: 'draft',
    })
    .returning(columnsWithXmin);

  return record ? splitXmin(record) : undefined;
}

export async function listCashFlowEventsForFund(
  fundId: number,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEventRow[]> {
  const database = options.database ?? db;
  // Newest-first; hits idx_cash_flow_fund_date (fund_id, event_date DESC).
  const records = await database
    .select(columnsWithXmin)
    .from(cashFlowEvents)
    .where(eq(cashFlowEvents.fundId, fundId))
    .orderBy(desc(cashFlowEvents.eventDate));
  return records.map(splitXmin);
}

export async function loadCashFlowEvent(
  fundId: number,
  eventId: number,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEventRow | undefined> {
  const database = options.database ?? db;
  const [record] = await database
    .select(columnsWithXmin)
    .from(cashFlowEvents)
    .where(and(eq(cashFlowEvents.fundId, fundId), eq(cashFlowEvents.id, eventId)))
    .limit(1);
  return record ? splitXmin(record) : undefined;
}

interface UpdateDraftArgs {
  fundId: number;
  eventId: number;
  expectedXmin: string;
  currentRow: CashFlowEvent;
  patch: LpCapitalCallPatch;
}

/**
 * Atomic draft update. WHERE pins fund/id/status='draft'/xmin, so locked or
 * concurrently-modified rows update zero rows -> returns undefined. sourceHash
 * is NEVER written here (manual edits are not import-identity events).
 */
export async function updateLpCapitalCallDraft(
  args: UpdateDraftArgs,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEventRow | undefined> {
  const database = options.database ?? db;
  const { fundId, eventId, expectedXmin, currentRow, patch } = args;

  const setValues: Partial<typeof cashFlowEvents.$inferInsert> = { updatedAt: new Date() };
  if (patch.amount !== undefined) setValues.amount = patch.amount;
  if ('description' in patch) setValues.description = patch.description ?? null;
  if (patch.eventDate !== undefined) setValues.eventDate = new Date(patch.eventDate);
  if (patch.payload !== undefined) {
    const base = (currentRow.payload ?? {}) as Record<string, unknown>;
    setValues.payload = { ...base, ...patch.payload };
  }

  const updated = await database
    .update(cashFlowEvents)
    .set(setValues)
    .where(
      and(
        eq(cashFlowEvents.fundId, fundId),
        eq(cashFlowEvents.id, eventId),
        eq(cashFlowEvents.status, 'draft'),
        sql`xmin = ${expectedXmin}::xid`
      )
    )
    .returning({ id: cashFlowEvents.id });

  if (updated.length === 0) return undefined;
  // Reload for the fresh row + fresh xmin token (post-update).
  return loadCashFlowEvent(fundId, eventId, options);
}

interface ApproveArgs {
  fundId: number;
  eventId: number;
  expectedXmin: string;
}

/**
 * Atomic draft->approved transition. WHERE pins fund/id/status='draft'/xmin, so a
 * locked, already-approved, or concurrently-modified row updates zero rows ->
 * returns undefined. Writes ONLY status + updatedAt (no approve-audit columns
 * exist). sourceHash is never written.
 */
export async function approveLpCapitalCallEvent(
  args: ApproveArgs,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEventRow | undefined> {
  const database = options.database ?? db;
  const { fundId, eventId, expectedXmin } = args;

  const updated = await database
    .update(cashFlowEvents)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(
      and(
        eq(cashFlowEvents.fundId, fundId),
        eq(cashFlowEvents.id, eventId),
        eq(cashFlowEvents.status, 'draft'),
        sql`xmin = ${expectedXmin}::xid`
      )
    )
    .returning({ id: cashFlowEvents.id });

  if (updated.length === 0) return undefined;
  return loadCashFlowEvent(fundId, eventId, options);
}

interface LockArgs {
  fundId: number;
  eventId: number;
  expectedXmin: string;
  /** Best-effort actor id (nullable users.id FK); NULL when identity is not numeric. */
  lockedBy: number | null;
}

/**
 * Atomic approved->locked transition. WHERE pins fund/id/status='approved'/xmin.
 * Sets lockedAt=now() (DB check requires it for locked), updatedAt=now() (the
 * client-visible mutation timestamp; lockedAt is not in the response serializer),
 * and best-effort lockedBy. sourceHash is never written; locked rows are terminal.
 */
export async function lockLpCapitalCallEvent(
  args: LockArgs,
  options: CashFlowEventServiceOptions = {}
): Promise<CashFlowEventRow | undefined> {
  const database = options.database ?? db;
  const { fundId, eventId, expectedXmin, lockedBy } = args;
  const now = new Date();

  const updated = await database
    .update(cashFlowEvents)
    .set({ status: 'locked', lockedAt: now, lockedBy, updatedAt: now })
    .where(
      and(
        eq(cashFlowEvents.fundId, fundId),
        eq(cashFlowEvents.id, eventId),
        eq(cashFlowEvents.status, 'approved'),
        sql`xmin = ${expectedXmin}::xid`
      )
    )
    .returning({ id: cashFlowEvents.id });

  if (updated.length === 0) return undefined;
  return loadCashFlowEvent(fundId, eventId, options);
}
