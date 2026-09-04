import { sql } from 'drizzle-orm';

import type { db } from '../../db';

export interface FinancialFactsFundLockTimeouts {
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds.`);
  }
}

export async function lockFinancialFactsFund(
  transaction: typeof db,
  fundId: number,
  timeouts?: FinancialFactsFundLockTimeouts
): Promise<void> {
  if (timeouts !== undefined) {
    assertPositiveInteger('statementTimeoutMs', timeouts.statementTimeoutMs);
    assertPositiveInteger('lockTimeoutMs', timeouts.lockTimeoutMs);
    await transaction.execute(sql.raw(`SET LOCAL statement_timeout = ${timeouts.statementTimeoutMs}`));
    await transaction.execute(sql.raw(`SET LOCAL lock_timeout = ${timeouts.lockTimeoutMs}`));
  }

  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`financial-facts:${fundId}`}))`
  );
}
