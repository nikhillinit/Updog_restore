import { metricsAggregator } from './metrics-aggregator';
import { logger } from '../lib/logger';

const log = logger.child({ service: 'h9-artifact-invalidation' });

/**
 * H9 artifact invalidation seam.
 *
 * Source-mutation sites (rounds, investments, MOIC inputs, reconciliations,
 * calculation-mode changes, realized proceeds, Planning-FMV mark writes) call
 * this AFTER a successful write so stale current/actionable artifacts cannot be
 * reused, cached, or exported after the source changed.
 *
 * Today the only live fund-keyed cache is the 300s metrics cache, which is NOT
 * fingerprint-protected, so it must be busted explicitly on mutation. The
 * fingerprinted snapshots (fund_snapshots, pacing_history) are self-invalidating
 * via the in-transaction drift recompute on reuse/export, so this seam does NOT
 * mutate snapshots.
 *
 * Best-effort: a cache-bust failure must never roll back or reject the
 * underlying financial write, so errors are swallowed and logged.
 */
export async function invalidateH9Artifacts(fundId: number): Promise<void> {
  try {
    await metricsAggregator.invalidateCache(fundId);
  } catch (error) {
    log.warn({ fundId, err: error }, 'H9 artifact invalidation failed (best-effort)');
  }
}
