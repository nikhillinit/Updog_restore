import { db } from '../db';

export const CURRENT_FORECAST_CALCULATION_KEY = 'current_forecast';

export type CurrentForecastCalculationMode = 'off' | 'shadow' | 'on';

export type CurrentForecastModeReader = (
  fundId: number
) => Promise<{ configuredMode: string; killSwitchActive: boolean } | null | undefined>;

export const defaultCurrentForecastModeReader: CurrentForecastModeReader = (fundId) =>
  db.query.fundCalculationModes.findFirst({
    columns: { configuredMode: true, killSwitchActive: true },
    where: (row, { and, eq }) =>
      and(eq(row.fundId, fundId), eq(row.calculationKey, CURRENT_FORECAST_CALCULATION_KEY)),
  });

/**
 * Resolve the current-forecast mode with a fail-safe off default.
 * TODO(13.1): map the held state once current_forecast_references exists.
 */
export async function resolveCurrentForecastCalculationMode(
  fundId: number,
  reader: CurrentForecastModeReader = defaultCurrentForecastModeReader
): Promise<CurrentForecastCalculationMode> {
  const mode = await reader(fundId);
  if (mode?.killSwitchActive) return 'off';
  if (mode?.configuredMode === 'shadow' || mode?.configuredMode === 'on') {
    return mode.configuredMode;
  }
  return 'off';
}
