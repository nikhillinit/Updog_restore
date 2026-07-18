import { describe, it, expect, vi } from 'vitest';
import {
  observeConstrainedReserveSubstrateShadow,
  type ShadowLogger,
} from '../../../server/services/constrained-reserve-substrate-shadow';
import type { SubstrateCalcModeResolution } from '../../../server/services/substrate-calc-mode-resolver';

const FIXED_AS_OF = '2026-07-17T00:00:00.000Z';

// One seed company + one seed policy; a valid ReserveInput that reaches
// `available` under mode `on`.
const VALID_INPUT = {
  availableReserves: 100_000,
  companies: [{ id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 }],
  stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
};

function makeLog() {
  return { info: vi.fn(), warn: vi.fn() } satisfies ShadowLogger;
}

function resolverReturning(resolution: SubstrateCalcModeResolution) {
  return vi.fn(async () => resolution);
}

describe('observeConstrainedReserveSubstrateShadow', () => {
  it('mode gate: off and not kill-switched returns { ran: false } without running the adapter or logging', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'off', killSwitchActive: false });
    const log = makeLog();

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 1,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
    });

    expect(result).toEqual({ ran: false });
    expect(resolveMode).toHaveBeenCalledOnce();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('shadow: runs the adapter, logs one indicative + SHADOW_ONLY line, returns { ran: true }', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 7,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
    });

    expect(result).toEqual({ ran: true });
    expect(log.info).toHaveBeenCalledOnce();
    const payload = log.info.mock.calls[0]![0];
    expect(payload).toMatchObject({
      fundId: 7,
      calculationKey: 'reserve-constrained',
      state: 'indicative',
      reasonCodes: ['SHADOW_ONLY'],
      configuredMode: 'shadow',
      killSwitchActive: false,
    });
    expect(payload.resultHash).toEqual(expect.any(String));
    expect(payload.inputHash).toEqual(expect.any(String));
  });

  it('on: runs the adapter and logs an available result', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: false });
    const log = makeLog();

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 2,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
    });

    expect(result).toEqual({ ran: true });
    const payload = log.info.mock.calls[0]![0];
    expect(payload).toMatchObject({ state: 'available', reasonCodes: [] });
    expect(payload.resultHash).toEqual(expect.any(String));
  });

  it('non-collapse: kill switch over configuredMode `on` yields unavailable + KILL_SWITCH_ACTIVE and NOT MODE_OFF', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: true });
    const log = makeLog();

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 3,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
    });

    expect(result).toEqual({ ran: true });
    const payload = log.info.mock.calls[0]![0];
    expect(payload).toMatchObject({
      state: 'unavailable',
      configuredMode: 'on',
      killSwitchActive: true,
    });
    expect(payload.reasonCodes).toContain('KILL_SWITCH_ACTIVE');
    expect(payload.reasonCodes).not.toContain('MODE_OFF');
  });

  it('best-effort: a rejecting resolver is swallowed to { ran: false } and warns, never rethrows', async () => {
    const resolveMode = vi.fn(async () => {
      throw new Error('resolver boom');
    });
    const log = makeLog();

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 4,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
    });

    expect(result).toEqual({ ran: false });
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.info).not.toHaveBeenCalled();
  });
});
