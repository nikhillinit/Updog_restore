import { describe, it, expect } from 'vitest';
import {
  resolveRankedReserveCalculationMode,
  RANKED_RESERVE_ALLOCATION_CALCULATION_KEY,
  type RankedReserveModeReader,
} from '../../../server/services/ranked-reserve-calc-mode-resolver';
import { FLAG_DEFAULTS } from '../../../shared/generated/flag-defaults';

const reader =
  (row: { configuredMode: string; killSwitchActive: boolean } | null): RankedReserveModeReader =>
  async () =>
    row;

describe('resolveRankedReserveCalculationMode', () => {
  it('defaults to off when no row exists', async () => {
    expect(await resolveRankedReserveCalculationMode(1, reader(null))).toBe('off');
  });

  it('returns shadow when configuredMode is shadow', async () => {
    expect(
      await resolveRankedReserveCalculationMode(
        1,
        reader({ configuredMode: 'shadow', killSwitchActive: false })
      )
    ).toBe('shadow');
  });

  it('returns on when configuredMode is on', async () => {
    expect(
      await resolveRankedReserveCalculationMode(
        1,
        reader({ configuredMode: 'on', killSwitchActive: false })
      )
    ).toBe('on');
  });

  it('collapses to off when the kill switch is active, even if configuredMode is on', async () => {
    expect(
      await resolveRankedReserveCalculationMode(
        1,
        reader({ configuredMode: 'on', killSwitchActive: true })
      )
    ).toBe('off');
  });

  it('fails safe to off on an unexpected configuredMode', async () => {
    expect(
      await resolveRankedReserveCalculationMode(
        1,
        reader({ configuredMode: 'bogus', killSwitchActive: false })
      )
    ).toBe('off');
  });

  it('exposes the calculation key constant', () => {
    expect(RANKED_RESERVE_ALLOCATION_CALCULATION_KEY).toBe('ranked_reserve_allocation');
  });

  it('ships the flag default-off', () => {
    expect(FLAG_DEFAULTS.enable_ranked_reserve_allocation).toBe(false);
  });
});
