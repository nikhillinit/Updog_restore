/**
 * LegacyReserveMultiplierNote - Q28 disclosure for legacy reserve engine output.
 *
 * The legacy reserve engine sizes reserves with fixed multipliers that have no
 * derivation (RESERVE_ASSUMPTIONS in shared/core/reserves/reserve-substrate-adapter.ts).
 * Rendered wherever that engine's allocations or confidence scores are shown:
 * the published RESERVE snapshot and reserve scenario summaries.
 *
 * ponytail: static copy assumes the legacy engine and is wrong for a fund with
 * enable_ranked_reserve_allocation on; delete with the multiplier table when the
 * capital plan work derives reserves from pipeline profiles.
 *
 * @module client/components/fund-results/LegacyReserveMultiplierNote
 */

import { cn } from '@/lib/utils';

export const LEGACY_RESERVE_MULTIPLIER_DISCLOSURE =
  'Engine reserve allocations use fixed rule-of-thumb multipliers, not fund-specific data: ' +
  'invested capital x stage multiplier (Seed 1.5x, Series A 2.0x, Series B 2.5x, ' +
  'Series C 1.8x, Growth 1.2x; 2.0x for any other round) x sector factor (SaaS 1.1, ' +
  'Fintech 1.2, Healthcare 1.3, Analytics 1.0, Infrastructure 0.9, Enterprise 0.8; ' +
  '1.0 for any other sector), then x1.2 above 10% ownership or x0.8 below 5%. ' +
  'Confidence scores come from fixed rules too.';

export function LegacyReserveMultiplierNote({ className }: { className?: string }) {
  return (
    <p
      data-testid="legacy-reserve-multiplier-note"
      className={cn('font-poppins text-xs text-presson-textMuted', className)}
    >
      {LEGACY_RESERVE_MULTIPLIER_DISCLOSURE}
    </p>
  );
}
