/**
 * ledger-allocation-v1.ts
 *
 * Allocation-safe wrapper around calculateAmericanWaterfallLedger.
 *
 * Design invariants
 * -----------------
 *   - Recycling and clawback are structurally OFF.  The wrapper builds
 *     the ledger config itself and never forwards recycling/clawback
 *     fields (omitted optionals are disabled in the ledger), regardless
 *     of caller intent.
 *   - No hurdle: V1 permits hurdle basis 'none' only, and the ledger's
 *     flat-at-event hurdle is never exposed (ADR-065). The config type
 *     surfaces carryPct alone.
 *   - Invocation-level assertions: after every ledger call the wrapper
 *     verifies the disabled features left no trace in the result and
 *     throws LedgerAllocationInvariantError otherwise.
 *   - Pure function, no side-effects, no I/O.
 *   - Returns the ledger result type unchanged; callers can inspect
 *     rows and totals identically to a direct ledger call.
 */

import {
  calculateAmericanWaterfallLedger,
  type AmericanWaterfallResult,
  type ContributionCF,
  type ExitCF,
} from '../waterfall/american-ledger';

// ── public types ─────────────────────────────────────────────────────

/**
 * Narrowed config for the allocation interface.
 * Only carryPct is exposed; hurdle, recycling, and clawback fields are
 * intentionally absent.
 */
export interface LedgerAllocationConfigV1 {
  carryPct: number;
}

/** Thrown when a structurally disabled ledger feature leaks into the result. */
export class LedgerAllocationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerAllocationInvariantError';
  }
}

// ── builder ──────────────────────────────────────────────────────────

/**
 * Compute an American waterfall ledger with hurdle, recycling, and
 * clawback structurally disabled.
 *
 * @param config       - Narrowed config (carryPct only)
 * @param contributions - Capital calls (positive amounts)
 * @param exits         - Exit events (chronological by quarter)
 * @returns The same AmericanWaterfallResult as the underlying ledger
 */
export function computeLedgerAllocationV1(
  config: LedgerAllocationConfigV1,
  contributions: readonly ContributionCF[],
  exits: readonly ExitCF[]
): AmericanWaterfallResult {
  const result = calculateAmericanWaterfallLedger(
    {
      carryPct: config.carryPct,
      // hurdleRate, recyclingEnabled, and clawbackEnabled intentionally
      // omitted — omitted optionals are disabled in the ledger.
    },
    // Defensive copy: ledger mutates its internal map from contributions
    contributions.map((c) => ({ quarter: c.quarter, amount: c.amount })),
    exits.map((e) => ({ quarter: e.quarter, grossProceeds: e.grossProceeds }))
  );

  if (result.totals.recycled !== 0) {
    throw new LedgerAllocationInvariantError(
      `Recycling is structurally off but totals.recycled = ${result.totals.recycled}`
    );
  }
  if (result.totals.gpClawback !== undefined) {
    throw new LedgerAllocationInvariantError(
      'Clawback is structurally off but totals.gpClawback is present'
    );
  }
  for (const row of result.rows) {
    if (row.recycledAmount !== 0) {
      throw new LedgerAllocationInvariantError(
        `Recycling is structurally off but row (quarter ${row.quarter}) has recycledAmount = ${row.recycledAmount}`
      );
    }
    if (row.gpClawback !== undefined) {
      throw new LedgerAllocationInvariantError(
        `Clawback is structurally off but row (quarter ${row.quarter}) has gpClawback`
      );
    }
  }

  return result;
}
