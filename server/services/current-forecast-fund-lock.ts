import { sql, type SQL } from 'drizzle-orm';

/**
 * Class key of the per-fund current-forecast advisory lock, taken in the
 * two-key form `pg_advisory_xact_lock(class, fund_id)`. Manual-recompute claim,
 * fresh shadow transition, successful manual reconciliation/finalization, and
 * activation check-and-flip share it so their fund-scoped boundaries have one
 * serial order (F_1.11.0 P0b item 4). Existing single-key (bigint) advisory
 * locks in this codebase live in a different key space and cannot collide; do
 * not reuse this class value for another two-key lock.
 */
export const CURRENT_FORECAST_FUND_LOCK_CLASS = 1_110_004;

type LockExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

/** Take the per-fund lock; it releases when the caller's transaction ends. */
export async function lockCurrentForecastFund(
  executor: LockExecutor,
  fundId: number
): Promise<void> {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(${CURRENT_FORECAST_FUND_LOCK_CLASS}::integer, ${fundId}::integer)`
  );
}
