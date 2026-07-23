import { db } from '../db';

export const CURRENT_FORECAST_CALCULATION_KEY = 'current_forecast';

export type CurrentForecastCalculationMode = 'off' | 'shadow' | 'on' | 'held';

export interface CurrentForecastModeRow {
  configuredMode: string;
  killSwitchActive: boolean;
  activatedAt: Date | string | null;
  cutoverReferenceId: number | null;
}

export type CurrentForecastModeReader = (
  fundId: number
) => Promise<CurrentForecastModeRow | null | undefined>;

export const defaultCurrentForecastModeReader: CurrentForecastModeReader = (fundId) =>
  db.query.fundCalculationModes.findFirst({
    columns: {
      configuredMode: true,
      killSwitchActive: true,
      activatedAt: true,
      cutoverReferenceId: true,
    },
    where: (row, { and, eq }) =>
      and(eq(row.fundId, fundId), eq(row.calculationKey, CURRENT_FORECAST_CALCULATION_KEY)),
  });

export interface CurrentForecastModeResolution {
  mode: CurrentForecastCalculationMode;
  /**
   * P1 (13.1 adjudication): the LIVE served-pointer head from
   * `fund_calculation_modes.cutover_reference_id`, advanced on every
   * pointer-advance while `on`. Set post-cutover, null pre-cutover. `held`
   * serves exactly this pointer — never a "latest accepted" query.
   */
  cutoverReferenceId: number | null;
}

/**
 * Resolve the current-forecast mode with the R24/D9 held-state map.
 *
 * Pre-cutover (`activatedAt` null): the kill switch and unknown/absent modes
 * fail safe to the legacy byte-compatible `off` path. Post-cutover
 * (`activatedAt` set): only effective `on` serves V2 live; EVERY other state
 * (kill, off, configured shadow) resolves `held`, serving the pinned pointer
 * head instead of ever re-entering the legacy lane.
 */
export async function resolveCurrentForecastModeResolution(
  fundId: number,
  reader: CurrentForecastModeReader = defaultCurrentForecastModeReader
): Promise<CurrentForecastModeResolution> {
  const row = await reader(fundId);
  const activated = row?.activatedAt !== null && row?.activatedAt !== undefined;

  if (!activated) {
    if (
      !row?.killSwitchActive &&
      (row?.configuredMode === 'shadow' || row?.configuredMode === 'on')
    ) {
      return { mode: row.configuredMode, cutoverReferenceId: null };
    }
    return { mode: 'off', cutoverReferenceId: null };
  }

  const cutoverReferenceId = row?.cutoverReferenceId ?? null;
  if (!row?.killSwitchActive && row?.configuredMode === 'on') {
    return { mode: 'on', cutoverReferenceId };
  }
  return { mode: 'held', cutoverReferenceId };
}

/** Bare-mode convenience wrapper over {@link resolveCurrentForecastModeResolution}. */
export async function resolveCurrentForecastCalculationMode(
  fundId: number,
  reader: CurrentForecastModeReader = defaultCurrentForecastModeReader
): Promise<CurrentForecastCalculationMode> {
  return (await resolveCurrentForecastModeResolution(fundId, reader)).mode;
}

export interface CurrentForecastServingSeams<T> {
  runLegacy: () => Promise<T>;
  runV2: () => Promise<T>;
  serveHeld: (cutoverReferenceId: number) => Promise<T>;
}

/**
 * Map a mode resolution onto the serving lanes (13.2 consumer seam).
 *
 * `off`/`shadow` serve legacy (shadow observation is a separate plane); `on`
 * serves V2, degrading to the held pointer head on a post-cutover V2 failure —
 * never back to legacy (R24/D9). `held` serves the pointer head and by
 * construction can never invoke the legacy `ProjectedMetricsCalculator` lane.
 */
export async function dispatchCurrentForecastServing<T>(
  resolution: CurrentForecastModeResolution,
  seams: CurrentForecastServingSeams<T>
): Promise<T> {
  switch (resolution.mode) {
    case 'off':
    case 'shadow':
      return seams.runLegacy();
    case 'on': {
      if (resolution.cutoverReferenceId === null) {
        return seams.runV2();
      }
      const cutoverReferenceId = resolution.cutoverReferenceId;
      try {
        return await seams.runV2();
      } catch {
        return seams.serveHeld(cutoverReferenceId);
      }
    }
    case 'held': {
      if (resolution.cutoverReferenceId === null) {
        throw new Error('current-forecast held resolution has no served-pointer head');
      }
      return seams.serveHeld(resolution.cutoverReferenceId);
    }
  }
}
