/**
 * Substrate calculation-mode resolver tests (Tranche 6, ADR-047).
 *
 * Proves the read seam that turns a (fundId, calculationKey) into the
 * uncollapsed { configuredMode, killSwitchActive } shape the ADR-042 substrate
 * adapters consume:
 * - on/shadow/off rows (killSwitch false) map to the matching mode;
 * - killSwitch true with configuredMode 'on' stays { on, true } (NON-collapse) -
 *   the distinction the existing per-key readers destroy;
 * - no row -> safe default { off, false };
 * - a row for a different calculationKey does not leak (query isolation);
 * - an invalid stored configuredMode fails safe to off, never on/shadow;
 * - the default reader selects the two columns and keys on (fundId, key);
 * - the resolution spreads straight into runConstrainedReserveWithSubstrate and
 *   drives the correct disclosure (available / SHADOW_ONLY / MODE_OFF /
 *   KILL_SWITCH_ACTIVE), proving the uncollapsed shape is what the adapter needs.
 *
 * No live DB: db is mocked, and every case but the default-reader one injects a
 * fake reader.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCalculationContext } from '../../../shared/core/calc-substrate';
import {
  CONSTRAINED_RESERVE_CALCULATION_KEY,
  runConstrainedReserveWithSubstrate,
} from '../../../shared/core/reserves/constrained-reserve-substrate-adapter';
import {
  resolveSubstrateCalcMode,
  type SubstrateCalcModeResolution,
  type SubstrateCalcModeRow,
} from '../../../server/services/substrate-calc-mode-resolver';

const { modeFindFirst } = vi.hoisted(() => ({ modeFindFirst: vi.fn() }));

vi.mock('../../../server/db', () => ({
  db: { query: { fundCalculationModes: { findFirst: modeFindFirst } } },
}));

beforeEach(() => {
  modeFindFirst.mockReset();
});

/** Resolve against an injected reader that returns a fixed row (no live DB). */
async function resolveWith(
  row: SubstrateCalcModeRow | null | undefined,
  calculationKey: string = CONSTRAINED_RESERVE_CALCULATION_KEY
): Promise<SubstrateCalcModeResolution> {
  return resolveSubstrateCalcMode({
    fundId: 1,
    calculationKey,
    reader: async () => row,
  });
}

describe('resolveSubstrateCalcMode', () => {
  it.each(['on', 'shadow', 'off'] as const)(
    'returns { %s, false } for a stored %s row with the kill switch off',
    async (stored) => {
      const resolution = await resolveWith({ configuredMode: stored, killSwitchActive: false });
      expect(resolution).toEqual({ configuredMode: stored, killSwitchActive: false });
    }
  );

  it('does NOT collapse the kill switch: configuredMode on + killSwitch true -> { on, true }', async () => {
    const resolution = await resolveWith({ configuredMode: 'on', killSwitchActive: true });
    // The existing per-key readers would collapse this to a single 'off' string,
    // erasing whether the suppression is MODE_OFF or KILL_SWITCH_ACTIVE. This
    // seam keeps both fields verbatim.
    expect(resolution).toEqual({ configuredMode: 'on', killSwitchActive: true });
  });

  it('returns the safe default { off, false } when no row exists', async () => {
    expect(await resolveWith(undefined)).toEqual({
      configuredMode: 'off',
      killSwitchActive: false,
    });
    expect(await resolveWith(null)).toEqual({ configuredMode: 'off', killSwitchActive: false });
  });

  it('isolates by calculationKey: a row for another key does not leak', async () => {
    // Reader models the DB: it only returns a row for the 'reserve' key.
    const keyedReader = async (
      _fundId: number,
      key: string
    ): Promise<SubstrateCalcModeRow | undefined> =>
      key === 'reserve' ? { configuredMode: 'on', killSwitchActive: false } : undefined;

    const matched = await resolveSubstrateCalcMode({
      fundId: 1,
      calculationKey: 'reserve',
      reader: keyedReader,
    });
    expect(matched).toEqual({ configuredMode: 'on', killSwitchActive: false });

    const other = await resolveSubstrateCalcMode({
      fundId: 1,
      calculationKey: 'reserve-constrained',
      reader: keyedReader,
    });
    expect(other).toEqual({ configuredMode: 'off', killSwitchActive: false });
  });

  it('fails safe to off on an invalid stored configuredMode, never on/shadow', async () => {
    const resolution = await resolveWith({ configuredMode: 'bogus', killSwitchActive: false });
    expect(resolution.configuredMode).toBe('off');
    expect(resolution.configuredMode).not.toBe('on');
    expect(resolution.configuredMode).not.toBe('shadow');

    // The kill switch still passes through verbatim even when the mode is invalid.
    const killed = await resolveWith({ configuredMode: 'bogus', killSwitchActive: true });
    expect(killed).toEqual({ configuredMode: 'off', killSwitchActive: true });
  });

  it('coerces a non-boolean killSwitchActive to strict false', async () => {
    // Defends against drift/corruption: only an explicit boolean true activates
    // the kill switch.
    const row = { configuredMode: 'on', killSwitchActive: 1 as unknown as boolean };
    expect(await resolveWith(row)).toEqual({ configuredMode: 'on', killSwitchActive: false });
  });

  it('throws a TypeError on an invalid calculationKey and never reads', async () => {
    const reader = vi.fn();
    await expect(
      resolveSubstrateCalcMode({ fundId: 1, calculationKey: '123-invalid', reader })
    ).rejects.toBeInstanceOf(TypeError);
    expect(reader).not.toHaveBeenCalled();
  });
});

describe('defaultSubstrateCalcModeReader (via the default-reader path)', () => {
  it('selects only the two columns and keys the query on (fundId, calculationKey)', async () => {
    interface FakeOperators {
      and: (...conditions: unknown[]) => { op: 'and'; conditions: unknown[] };
      eq: (column: unknown, value: unknown) => { op: 'eq'; column: unknown; value: unknown };
    }
    interface CapturedFindFirst {
      columns: Record<string, boolean>;
      where: (row: Record<string, unknown>, operators: FakeOperators) => unknown;
    }

    let captured: CapturedFindFirst | undefined;
    modeFindFirst.mockImplementation((options: CapturedFindFirst) => {
      captured = options;
      return Promise.resolve({ configuredMode: 'shadow', killSwitchActive: false });
    });

    // No injected reader -> exercises the default reader over the mocked db.
    const resolution = await resolveSubstrateCalcMode({
      fundId: 42,
      calculationKey: 'reserve-constrained',
    });

    expect(resolution).toEqual({ configuredMode: 'shadow', killSwitchActive: false });
    expect(modeFindFirst).toHaveBeenCalledTimes(1);
    expect(captured?.columns).toEqual({ configuredMode: true, killSwitchActive: true });

    const eqCalls: Array<{ column: unknown; value: unknown }> = [];
    const fakeRow = { fundId: 'FUND_ID_COL', calculationKey: 'CALC_KEY_COL' };
    const operators: FakeOperators = {
      and: (...conditions) => ({ op: 'and', conditions }),
      eq: (column, value) => {
        eqCalls.push({ column, value });
        return { op: 'eq', column, value };
      },
    };
    const whereResult = captured?.where(fakeRow, operators);

    expect(whereResult).toEqual({
      op: 'and',
      conditions: [
        { op: 'eq', column: 'FUND_ID_COL', value: 42 },
        { op: 'eq', column: 'CALC_KEY_COL', value: 'reserve-constrained' },
      ],
    });
    expect(eqCalls).toEqual([
      { column: 'FUND_ID_COL', value: 42 },
      { column: 'CALC_KEY_COL', value: 'reserve-constrained' },
    ]);
  });
});

describe('adapter drop-in: the resolution spreads straight into the adapter', () => {
  const RESERVE_INPUT = {
    availableReserves: 100_000,
    companies: [{ id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 }],
    stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
  };

  function ctx() {
    return createCalculationContext({
      calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
      seed: 1,
      asOf: '2026-07-18T00:00:00Z',
    });
  }

  it('on -> available', async () => {
    const resolution = await resolveWith({ configuredMode: 'on', killSwitchActive: false });
    const result = runConstrainedReserveWithSubstrate(ctx(), RESERVE_INPUT, { ...resolution });
    expect(result.state).toBe('available');
    expect(result.reasonCodes).toEqual([]);
  });

  it('shadow -> indicative + SHADOW_ONLY', async () => {
    const resolution = await resolveWith({ configuredMode: 'shadow', killSwitchActive: false });
    const result = runConstrainedReserveWithSubstrate(ctx(), RESERVE_INPUT, { ...resolution });
    expect(result.state).toBe('indicative');
    expect(result.reasonCodes).toContain('SHADOW_ONLY');
  });

  it('off -> unavailable + MODE_OFF (no kill-switch code)', async () => {
    const resolution = await resolveWith({ configuredMode: 'off', killSwitchActive: false });
    const result = runConstrainedReserveWithSubstrate(ctx(), RESERVE_INPUT, { ...resolution });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toContain('MODE_OFF');
    expect(result.reasonCodes).not.toContain('KILL_SWITCH_ACTIVE');
  });

  it('killSwitch true (configuredMode on) -> unavailable + KILL_SWITCH_ACTIVE only', async () => {
    const resolution = await resolveWith({ configuredMode: 'on', killSwitchActive: true });
    const result = runConstrainedReserveWithSubstrate(ctx(), RESERVE_INPUT, { ...resolution });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
    // configuredMode was 'on', so MODE_OFF must NOT appear. A collapsed resolver
    // (configuredMode -> 'off', killSwitch -> false) would invert both codes.
    expect(result.reasonCodes).not.toContain('MODE_OFF');
  });
});
