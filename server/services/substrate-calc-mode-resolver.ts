/**
 * Generic substrate calculation-mode resolver (Tranche 6, ADR-047).
 *
 * Turns a `(fundId, calculationKey)` pair into the
 * `{ configuredMode, killSwitchActive }` shape the four ADR-042 substrate
 * adapters accept as the leading prefix of their `*SubstrateOptions`. This is
 * the READ seam only: it runs no adapter, mounts no route, and writes no row.
 * Routing a live consumer through it is Tranche 7.
 *
 * The `fund_calculation_modes` registry (schema
 * `shared/schema/fund-calculation-modes.ts`, migration 0017) already exists and
 * is already read by per-key readers; this seam does not rebuild it. What is new
 * is the SHAPE it returns.
 *
 * Difference from the existing per-key readers
 * (`resolveReserveFactsCalculationMode` in `reserve-calculation-service.ts`,
 * `resolveMonteCarloActualsCalculationMode` in `monte-carlo-simulation.ts`):
 * those COLLAPSE the kill switch into a single `'off'` mode string. This
 * resolver must NOT collapse it. The substrate adapters compute
 * `effectiveMode = killSwitchActive ? 'off' : configuredMode` themselves and
 * disclose `KILL_SWITCH_ACTIVE` vs `MODE_OFF` based on WHICH of the two is set
 * (both codes when both apply). Collapsing here would erase that distinction and
 * misreport the reason code, so the uncollapsed two-field shape is the whole
 * point of this seam.
 *
 * Safety posture (technical invariants, not governance):
 * - Safe default: with no row, the substrate is off
 *   (`{ configuredMode: 'off', killSwitchActive: false }`); the adapter then
 *   returns unavailable + MODE_OFF. Absent an explicit per-fund opt-in the
 *   substrate never runs, and this seam never defaults to a more permissive
 *   mode.
 * - Fail-safe validation: the stored `configuredMode` is validated with
 *   `CalcModeSchema`; on any unexpected value (the DB check constraint should
 *   prevent this, but drift/corruption is defended against) it falls back to
 *   `'off'`, never `'shadow'`/`'on'`. `killSwitchActive` coerces to a strict
 *   boolean (default false).
 */

import { CalcModeSchema, CalculationKeySchema, type CalcMode } from '@shared/core/calc-substrate';
import { db } from '../db';

/**
 * The two fields every `*SubstrateOptions` shares as its leading prefix. A
 * caller spreads this straight into any adapter's options object, e.g.
 * `runConstrainedReserveWithSubstrate(ctx, input, { ...resolution })`.
 */
export interface SubstrateCalcModeResolution {
  configuredMode: CalcMode;
  killSwitchActive: boolean;
}

/**
 * A raw `fund_calculation_modes` row projection over exactly the two columns
 * this seam reads. `configuredMode` is typed as `string` on purpose: the reader
 * returns whatever is stored and `resolveSubstrateCalcMode` validates it.
 */
export interface SubstrateCalcModeRow {
  configuredMode: string;
  killSwitchActive: boolean;
}

/** Narrow read seam so tests need no live DB. */
export type SubstrateCalcModeReader = (
  fundId: number,
  calculationKey: string
) => Promise<SubstrateCalcModeRow | null | undefined>;

/**
 * Default reader: the same `(fundId, calculationKey)`-keyed lookup the existing
 * per-key readers issue, selecting only the two columns this seam needs.
 */
export const defaultSubstrateCalcModeReader: SubstrateCalcModeReader = (fundId, calculationKey) =>
  db.query.fundCalculationModes.findFirst({
    columns: { configuredMode: true, killSwitchActive: true },
    where: (row, { and, eq }) =>
      and(eq(row.fundId, fundId), eq(row.calculationKey, calculationKey)),
  });

export interface ResolveSubstrateCalcModeParams {
  fundId: number;
  calculationKey: string;
  reader?: SubstrateCalcModeReader;
}

/**
 * Resolve the substrate mode for a `(fundId, calculationKey)`. Returns the
 * uncollapsed `{ configuredMode, killSwitchActive }` an adapter consumes.
 *
 * @throws {TypeError} if `calculationKey` is not a valid substrate calculation
 *   key (programmer error, mirroring the adapters' key guard).
 */
export async function resolveSubstrateCalcMode({
  fundId,
  calculationKey,
  reader = defaultSubstrateCalcModeReader,
}: ResolveSubstrateCalcModeParams): Promise<SubstrateCalcModeResolution> {
  if (!CalculationKeySchema.safeParse(calculationKey).success) {
    throw new TypeError(
      `substrate calc-mode resolver requires a valid calculationKey, received '${String(
        calculationKey
      )}'`
    );
  }

  const row = await reader(fundId, calculationKey);
  if (!row) {
    return { configuredMode: 'off', killSwitchActive: false };
  }

  const parsedMode = CalcModeSchema.safeParse(row.configuredMode);
  return {
    configuredMode: parsedMode.success ? parsedMode.data : 'off',
    killSwitchActive: row.killSwitchActive === true,
  };
}
