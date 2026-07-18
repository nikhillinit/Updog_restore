import { describe, it, expect, vi } from 'vitest';
import {
  observeConstrainedReserveSubstrateShadow,
  type ShadowLogger,
} from '../../../server/services/constrained-reserve-substrate-shadow';
import type { SubstrateCalcModeResolution } from '../../../server/services/substrate-calc-mode-resolver';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';
import { ReserveInputSchema } from '../../../shared/schemas';

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

  it('reconciliation MATCH: a matching legacyResult logs the reconciliation line at info alongside the shadow line', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();
    // Computed from the SAME parse the adapter uses, so the substrate and legacy
    // engine outputs are identical and the reconciliation must be a match.
    const legacyResult = new ConstrainedReserveEngine().calculate(
      ReserveInputSchema.parse(VALID_INPUT)
    );

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 11,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult,
    });

    expect(result).toEqual({ ran: true });
    // The original shadow disclosure still logs.
    expect(log.info.mock.calls.some((call) => call[0]!.state === 'indicative')).toBe(true);
    // The reconciliation disclosure logs at info with status 'match'.
    const reconCall = log.info.mock.calls.find((call) => call[0]!.reconciliation === 'match');
    expect(reconCall).toBeDefined();
    expect(reconCall![0]).toMatchObject({
      fundId: 11,
      calculationKey: 'reserve-constrained',
      reconciliation: 'match',
      substrateState: 'indicative',
    });
    expect(reconCall![0].resultHash).toEqual(expect.any(String));
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('reconciliation MISMATCH: a tampered legacyResult logs at warn with mismatch and non-empty mismatches', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: false });
    const log = makeLog();
    // Deliberately wrong legacy output for the same request: a real divergence
    // (not a vacuous always-match) must fire the warn path.
    const tamperedLegacy = {
      allocations: [{ id: 'c1', allocated: 42 }],
      totalAllocated: 42,
      remaining: 0,
      conservationOk: true,
    };

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 12,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult: tamperedLegacy,
    });

    expect(result).toEqual({ ran: true });
    expect(log.warn).toHaveBeenCalledOnce();
    const warnPayload = log.warn.mock.calls[0]![0];
    expect(warnPayload).toMatchObject({
      fundId: 12,
      calculationKey: 'reserve-constrained',
      reconciliation: 'mismatch',
      substrateState: 'available',
    });
    expect(Array.isArray(warnPayload.mismatches)).toBe(true);
    expect((warnPayload.mismatches as string[]).length).toBeGreaterThan(0);
  });

  it('no legacyResult: behaves exactly as Tranche 7 - only the shadow line, no reconciliation line', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 13,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
    });

    expect(result).toEqual({ ran: true });
    expect(log.info).toHaveBeenCalledOnce();
    expect(log.info.mock.calls[0]![0]).toMatchObject({ state: 'indicative' });
    expect(log.info.mock.calls[0]![0]).not.toHaveProperty('reconciliation');
    expect(log.warn).not.toHaveBeenCalled();
  });
});
