/**
 * ledger-allocation-v1.ts
 *
 * Allocation-safe wrapper around calculateAmericanWaterfallLedger.
 *
 * Design invariants
 * -----------------
 *   - Recycling and clawback are structurally OFF.  The wrapper always
 *     passes recyclingEnabled: false and clawbackEnabled: false to the
 *     underlying ledger, regardless of caller intent.
 *   - Exposes a narrower config type (LedgerAllocationConfigV1) that
 *     surfaces only carryPct and hurdleRate -- no recycling/clawback
 *     fields leak into the caller's type surface.
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
 * Only carryPct and hurdleRate are exposed; recycling and clawback
 * fields are intentionally absent.
 */
export interface LedgerAllocationConfigV1 {
  carryPct: number;
  hurdleRate?: number;
}

// ── builder ──────────────────────────────────────────────────────────

/**
 * Compute an American waterfall ledger with recycling and clawback
 * structurally disabled.
 *
 * @param config       - Narrowed config (carryPct + optional hurdleRate)
 * @param contributions - Capital calls (positive amounts)
 * @param exits         - Exit events (chronological by quarter)
 * @returns The same AmericanWaterfallResult as the underlying ledger
 */
export function computeLedgerAllocationV1(
  config: LedgerAllocationConfigV1,
  contributions: readonly ContributionCF[],
  exits: readonly ExitCF[]
): AmericanWaterfallResult {
  return calculateAmericanWaterfallLedger(
    {
      carryPct: config.carryPct,
      // Spread hurdleRate only when defined — exactOptionalPropertyTypes
      // forbids assigning `undefined` to an optional `number?` property.
      ...(config.hurdleRate !== undefined && { hurdleRate: config.hurdleRate }),
      // recyclingEnabled and clawbackEnabled intentionally omitted —
      // optional fields default to off.
    },
    // Defensive copy: ledger mutates its internal map from contributions
    contributions.map((c) => ({ quarter: c.quarter, amount: c.amount })),
    exits.map((e) => ({ quarter: e.quarter, grossProceeds: e.grossProceeds }))
  );
}
