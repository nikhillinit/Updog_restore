import { db } from '../db';

/** ADR-056 NET-NEW #2 per-fund calculation key. Free text; no migration. */
export const RANKED_RESERVE_ALLOCATION_CALCULATION_KEY = 'ranked_reserve_allocation';

export type RankedReserveCalculationMode = 'off' | 'shadow' | 'on';

/** Narrow read seam so tests need no live DB. */
export type RankedReserveModeReader = (
  fundId: number
) => Promise<{ configuredMode: string; killSwitchActive: boolean } | null | undefined>;

export const defaultRankedReserveModeReader: RankedReserveModeReader = (fundId) =>
  db.query.fundCalculationModes.findFirst({
    columns: { configuredMode: true, killSwitchActive: true },
    where: (row, { and, eq }) =>
      and(
        eq(row.fundId, fundId),
        eq(row.calculationKey, RANKED_RESERVE_ALLOCATION_CALCULATION_KEY)
      ),
  });

/**
 * Resolve the per-fund ranked-reserve calc mode. Collapses the kill switch to
 * `'off'` (mirroring `resolveReserveFactsCalculationMode`); unknown/absent values
 * fail safe to `'off'`. The global flag gate is applied by the caller (PR4 seam).
 */
export async function resolveRankedReserveCalculationMode(
  fundId: number,
  reader: RankedReserveModeReader = defaultRankedReserveModeReader
): Promise<RankedReserveCalculationMode> {
  const mode = await reader(fundId);
  if (mode?.killSwitchActive) return 'off';
  return mode?.configuredMode === 'shadow' || mode?.configuredMode === 'on'
    ? mode.configuredMode
    : 'off';
}
