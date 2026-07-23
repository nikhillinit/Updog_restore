import { describe, expect, it } from 'vitest';

import {
  CURRENT_FORECAST_CALCULATION_KEY,
  resolveCurrentForecastCalculationMode,
  type CurrentForecastModeReader,
} from '../../../server/services/current-forecast-calc-mode-resolver';

const reader =
  (row: { configuredMode: string; killSwitchActive: boolean } | null): CurrentForecastModeReader =>
  async () =>
    row;

describe('resolveCurrentForecastCalculationMode', () => {
  it('defaults to off when no row exists', async () => {
    expect(await resolveCurrentForecastCalculationMode(1, reader(null))).toBe('off');
  });

  it('returns shadow when configuredMode is shadow', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'shadow', killSwitchActive: false })
      )
    ).toBe('shadow');
  });

  it('returns on when configuredMode is on', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'on', killSwitchActive: false })
      )
    ).toBe('on');
  });

  it('collapses to off when the kill switch is active', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'on', killSwitchActive: true })
      )
    ).toBe('off');
  });

  it('fails safe to off on an unexpected configuredMode', async () => {
    expect(
      await resolveCurrentForecastCalculationMode(
        1,
        reader({ configuredMode: 'bogus', killSwitchActive: false })
      )
    ).toBe('off');
  });

  it('exposes the current-forecast calculation key', () => {
    expect(CURRENT_FORECAST_CALCULATION_KEY).toBe('current_forecast');
  });
});
