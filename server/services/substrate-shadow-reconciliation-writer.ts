/**
 * Default persistence writer for constrained-reserve substrate shadow
 * reconciliation observations (Tranche 9, ADR-050).
 *
 * The real writer behind the injectable `persist` seam on
 * `observeConstrainedReserveSubstrateShadow`. It issues ONE idempotent,
 * fund-scoped, append-only insert into `substrate_shadow_reconciliations`:
 * `onConflictDoNothing()` makes a duplicate (same request -> same substrate
 * result -> same `(fund_id, calculation_key, input_hash, result_hash)`) a no-op
 * rather than an error, so replays and retries never double-write.
 *
 * This function does NOT catch its own errors: the caller (the shadow helper)
 * owns the best-effort try/catch so a DB failure is logged once and swallowed
 * off the response path. Keeping the swallow in the caller lets tests inject a
 * throwing `persist` and prove the helper never rethrows.
 */

import { db } from '../db';
import { substrateShadowReconciliations } from '@shared/schema';
import type { SubstrateShadowReconciliationRecord } from './constrained-reserve-substrate-shadow';

export async function persistSubstrateShadowReconciliation(
  record: SubstrateShadowReconciliationRecord
): Promise<void> {
  await db.insert(substrateShadowReconciliations).values(record).onConflictDoNothing();
}
