import { and, asc, eq, lte, sql } from 'drizzle-orm';

import { capitalCallNotificationOutbox } from '@shared/schema/capital-call-notification-outbox';
import { lpCapitalCalls, lpNotifications } from '@shared/schema-lp-sprint3';
import { db } from '../db';
import { getCapitalCallStatusHardTimeoutMs, throwIfCapitalCallStatusAborted } from './capital-call-status-timeout';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const CAPITAL_CALL_OUTBOX_MAX_ATTEMPTS = 5;
export const CAPITAL_CALL_OUTBOX_BASE_BACKOFF_MS = 60_000;
export const CAPITAL_CALL_OUTBOX_BACKOFF_FACTOR = 4;
export const CAPITAL_CALL_OUTBOX_JITTER_MS = 1_000;

type TransitionKind = 'transition' | 'reminder';

export interface CapitalCallNotificationInput {
  capitalCallId: string;
  lpId: number;
  transitionKind: TransitionKind;
  dueDateBucket: string;
  notificationType: string;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
}

interface TransactionOptions {
  signal?: AbortSignal;
  hardTimeoutMs?: number;
}

function hardTimeoutMs(value?: number): number {
  return value ?? getCapitalCallStatusHardTimeoutMs();
}

function nextBackoffMs(attempt: number): number {
  const exponential =
    CAPITAL_CALL_OUTBOX_BASE_BACKOFF_MS *
    Math.pow(CAPITAL_CALL_OUTBOX_BACKOFF_FACTOR, Math.max(0, attempt - 1));
  return exponential + Math.floor(Math.random() * CAPITAL_CALL_OUTBOX_JITTER_MS);
}

async function setStatementTimeout(tx: DbTransaction, timeoutMs: number) {
  // SET LOCAL cannot take bind parameters; interpolate a validated integer.
  const ms = Math.trunc(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`Invalid statement timeout: ${timeoutMs}`);
  }
  await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${ms}`));
}

async function insertOutboxRow(
  tx: DbTransaction,
  input: CapitalCallNotificationInput
): Promise<boolean> {
  const inserted = await tx
    .insert(capitalCallNotificationOutbox)
    .values({
      capitalCallId: input.capitalCallId,
      lpId: input.lpId,
      transitionKind: input.transitionKind,
      dueDateBucket: input.dueDateBucket,
      notificationType: input.notificationType,
      title: input.title,
      message: input.message,
      ...(input.relatedEntityType !== undefined
        ? { relatedEntityType: input.relatedEntityType }
        : {}),
      ...(input.relatedEntityId !== undefined ? { relatedEntityId: input.relatedEntityId } : {}),
      ...(input.actionUrl !== undefined ? { actionUrl: input.actionUrl } : {}),
    })
    .onConflictDoNothing({
      target: [
        capitalCallNotificationOutbox.capitalCallId,
        capitalCallNotificationOutbox.transitionKind,
        capitalCallNotificationOutbox.dueDateBucket,
      ],
    })
    .returning({ id: capitalCallNotificationOutbox.id });
  return inserted.length > 0;
}

export async function transitionCapitalCallWithNotification(params: {
  callId: string;
  newStatus: 'pending' | 'due' | 'overdue' | 'paid' | 'partial';
  currentVersion: bigint;
  notification: CapitalCallNotificationInput;
} & TransactionOptions): Promise<boolean> {
  throwIfCapitalCallStatusAborted(params.signal);
  const timeoutMs = hardTimeoutMs(params.hardTimeoutMs);

  return db.transaction(async (tx) => {
    await setStatementTimeout(tx, timeoutMs);
    throwIfCapitalCallStatusAborted(params.signal);

    const transitioned = await tx
      .update(lpCapitalCalls)
      .set({
        status: params.newStatus,
        version: params.currentVersion + 1n,
        updatedAt: new Date(),
      })
      .where(and(eq(lpCapitalCalls.id, params.callId), eq(lpCapitalCalls.version, params.currentVersion)))
      .returning({ id: lpCapitalCalls.id });

    if (transitioned.length === 0) return false;

    throwIfCapitalCallStatusAborted(params.signal);
    await insertOutboxRow(tx, params.notification);
    return true;
  });
}

export async function transitionCapitalCallWithPayment(params: {
  callId: string;
  newStatus: 'paid' | 'partial';
  currentVersion: bigint;
  paidAmountCents: bigint;
  paidDate: string | null;
  notification?: CapitalCallNotificationInput;
} & TransactionOptions): Promise<boolean> {
  throwIfCapitalCallStatusAborted(params.signal);
  const timeoutMs = hardTimeoutMs(params.hardTimeoutMs);

  return db.transaction(async (tx) => {
    await setStatementTimeout(tx, timeoutMs);
    throwIfCapitalCallStatusAborted(params.signal);

    const transitioned = await tx
      .update(lpCapitalCalls)
      .set({
        status: params.newStatus,
        version: params.currentVersion + 1n,
        paidAmountCents: params.paidAmountCents,
        paidDate: params.paidDate,
        updatedAt: new Date(),
      })
      .where(and(eq(lpCapitalCalls.id, params.callId), eq(lpCapitalCalls.version, params.currentVersion)))
      .returning({ id: lpCapitalCalls.id });

    if (transitioned.length === 0) return false;

    if (params.notification) {
      throwIfCapitalCallStatusAborted(params.signal);
      await insertOutboxRow(tx, params.notification);
    }
    return true;
  });
}

export async function enqueueCapitalCallNotification(
  input: CapitalCallNotificationInput,
  options: TransactionOptions = {}
): Promise<boolean> {
  throwIfCapitalCallStatusAborted(options.signal);
  const timeoutMs = hardTimeoutMs(options.hardTimeoutMs);

  return db.transaction(async (tx) => {
    await setStatementTimeout(tx, timeoutMs);
    throwIfCapitalCallStatusAborted(options.signal);
    return insertOutboxRow(tx, input);
  });
}

export async function dispatchPendingCapitalCallNotifications(options: TransactionOptions = {}): Promise<{
  deliveredCount: number;
  exhaustedCount: number;
}> {
  const timeoutMs = hardTimeoutMs(options.hardTimeoutMs);
  let deliveredCount = 0;
  let exhaustedCount = 0;

  while (true) {
    throwIfCapitalCallStatusAborted(options.signal);
    let rowId: string | null = null;

    try {
      const delivered = await db.transaction(async (tx) => {
        await setStatementTimeout(tx, timeoutMs);
        throwIfCapitalCallStatusAborted(options.signal);
        const rows = await tx
          .select()
          .from(capitalCallNotificationOutbox)
          .where(
            and(
              eq(capitalCallNotificationOutbox.status, 'pending'),
              // Compare against the database clock: app and DB clocks can
              // skew (observed under the colima VM), and DB time wrote the row.
              lte(capitalCallNotificationOutbox.nextAttemptAt, sql`now()`)
            )
          )
          .orderBy(asc(capitalCallNotificationOutbox.nextAttemptAt), asc(capitalCallNotificationOutbox.createdAt))
          .limit(1)
          .for('update', { skipLocked: true });

        const row = rows[0];
        if (!row) return false;
        rowId = row.id;
        throwIfCapitalCallStatusAborted(options.signal);

        await tx
          .insert(lpNotifications)
          .values({
            id: row.id,
            lpId: row.lpId,
            type: row.notificationType,
            title: row.title,
            message: row.message,
            relatedEntityType: row.relatedEntityType,
            relatedEntityId: row.relatedEntityId,
            actionUrl: row.actionUrl,
            read: false,
            createdAt: new Date(),
          })
          .onConflictDoNothing({ target: lpNotifications.id });

        await tx
          .update(capitalCallNotificationOutbox)
          .set({
            status: 'delivered',
            deliveredAt: new Date(),
            updatedAt: new Date(),
            lastError: null,
          })
          .where(eq(capitalCallNotificationOutbox.id, row.id));
        return true;
      });

      if (!delivered) break;
      deliveredCount++;
    } catch (error) {
      if (!rowId) throw error;
      const failedRowId = rowId;
      const failure = await db.transaction(async (tx) => {
        await setStatementTimeout(tx, timeoutMs);
        const rows = await tx
          .select({ attemptCount: capitalCallNotificationOutbox.attemptCount })
          .from(capitalCallNotificationOutbox)
          .where(
            and(
              eq(capitalCallNotificationOutbox.id, failedRowId),
              eq(capitalCallNotificationOutbox.status, 'pending')
            )
          )
          .for('update');
        const row = rows[0];
        if (!row) return null;

        const attemptCount = row.attemptCount + 1;
        const exhausted = attemptCount >= CAPITAL_CALL_OUTBOX_MAX_ATTEMPTS;
        await tx
          .update(capitalCallNotificationOutbox)
          .set({
            status: exhausted ? 'exhausted' : 'pending',
            attemptCount,
            // DB-clock relative: app/DB clock skew must not shift the window.
            nextAttemptAt: sql`now() + make_interval(secs => ${nextBackoffMs(attemptCount) / 1000})`,
            lastAttemptAt: new Date(),
            lastError: error instanceof Error ? error.message : String(error),
            updatedAt: new Date(),
          })
          .where(eq(capitalCallNotificationOutbox.id, failedRowId));
        return exhausted;
      });
      if (failure) exhaustedCount++;
    }
  }

  return { deliveredCount, exhaustedCount };
}

export async function countExhaustedCapitalCallNotifications(
  options: Pick<TransactionOptions, 'hardTimeoutMs'> = {}
): Promise<number> {
  const timeoutMs = hardTimeoutMs(options.hardTimeoutMs);
  const rows = await db.transaction(async (tx) => {
    await setStatementTimeout(tx, timeoutMs);
    return tx
      .select({ count: sql<number>`count(*)::int` })
      .from(capitalCallNotificationOutbox)
      .where(eq(capitalCallNotificationOutbox.status, 'exhausted'));
  });
  return rows[0]?.count ?? 0;
}
