/**
 * MOIC input mapper.
 *
 * Relocated from server/routes/moic.ts (#1036 burn-down): the /api/moic router
 * was a superseded, uncalled Docker-only route and was removed, but this DB-row
 * adapter is a live dependency of fund-moic-ranking-service (the on-makeApp
 * /api/funds/:id/moic/rankings path), so it lives here as a plain lib helper.
 */

import type { Investment as MOICInvestment } from '../../shared/core/moic/MOICCalculator.js';

/**
 * Canonical adapter: database portfolio company / investment row → MOIC input.
 *
 * Prevents the "Investment 6-way duality" collision where a Drizzle row
 * (with `amount`, `round`, `ownershipPercentage`) is passed to MOICCalculator
 * which expects `currentValuation`, `projectedExitValue`, etc.
 *
 * @param row - Raw database row from portfolioCompanies + investments join
 * @returns MOICInvestment ready for MOICCalculator
 */
export function dbToMOICInvestment(row: {
  id: number | string;
  name: string;
  investmentAmount?: string | number | null;
  currentValuation?: string | number | null;
  projectedExitValue?: string | number | null;
  exitProbability?: string | number | null;
  plannedReservesCents?: number | bigint | null;
  exitMoicBps?: number | null;
  investmentDate?: Date | string | null;
  followOnAmount?: string | number | null;
}): MOICInvestment {
  const toNumber = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'string') return Number(v);
    return 0;
  };

  // exitMoicBps is stored in basis points (e.g. 250 = 2.5x)
  const exitMoic = toNumber(row.exitMoicBps) / 100;

  return {
    id: String(row.id),
    name: row.name,
    initialInvestment: toNumber(row.investmentAmount),
    followOnInvestment: toNumber(row.followOnAmount),
    currentValuation: toNumber(row.currentValuation),
    projectedExitValue: toNumber(row.projectedExitValue),
    exitProbability: toNumber(row.exitProbability),
    plannedReserves: toNumber(row.plannedReservesCents) / 100, // cents → dollars
    reserveExitMultiple: exitMoic > 0 ? exitMoic : 1,
    investmentDate: row.investmentDate ? new Date(row.investmentDate) : new Date(),
  };
}
