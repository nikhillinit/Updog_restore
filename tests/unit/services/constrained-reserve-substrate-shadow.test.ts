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

  // Tranche 9 (ADR-050): best-effort, idempotent persistence of the value-producing
  // reconciliation observation via the injectable `persist` seam. DB-free: a fake
  // `persist` proves shape, gate, and swallow without touching a database.

  it('persistence MATCH: persists exactly one correctly-shaped record (status match, empty mismatches)', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    // MATCH: legacy computed from the SAME parse the adapter uses.
    const legacyResult = new ConstrainedReserveEngine().calculate(
      ReserveInputSchema.parse(VALID_INPUT)
    );

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 21,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult,
      persist,
    });

    expect(result).toEqual({ ran: true });
    expect(persist).toHaveBeenCalledOnce();
    const record = persist.mock.calls[0]![0] as SubstrateShadowReconciliationRecord;
    expect(record).toMatchObject({
      fundId: 21,
      calculationKey: 'reserve-constrained',
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      killSwitchActive: false,
      substrateState: 'indicative',
      reconciliationStatus: 'match',
      mismatches: [],
    });
    expect(record.inputHash).toEqual(expect.any(String));
    expect(record.resultHash).toEqual(expect.any(String));
    expect(record.assumptionsHash).toEqual(expect.any(String));
    // The persisted identity/status equals the logged reconciliation disclosure.
    const reconCall = log.info.mock.calls.find((call) => call[0]!.reconciliation === 'match');
    expect(reconCall).toBeDefined();
    expect(record.resultHash).toBe(reconCall![0].resultHash);
  });

  it('persistence MISMATCH: persists one record whose status/mismatches match the warn disclosure', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const tamperedLegacy = {
      allocations: [{ id: 'c1', allocated: 42 }],
      totalAllocated: 42,
      remaining: 0,
      conservationOk: true,
    };

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 22,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult: tamperedLegacy,
      persist,
    });

    expect(result).toEqual({ ran: true });
    expect(persist).toHaveBeenCalledOnce();
    const record = persist.mock.calls[0]![0] as SubstrateShadowReconciliationRecord;
    expect(record).toMatchObject({
      fundId: 22,
      calculationKey: 'reserve-constrained',
      configuredMode: 'on',
      effectiveMode: 'on',
      killSwitchActive: false,
      substrateState: 'available',
      reconciliationStatus: 'mismatch',
    });
    expect(record.mismatches.length).toBeGreaterThan(0);
    // The persisted mismatches are exactly the ones logged at warn.
    const warnPayload = log.warn.mock.calls[0]![0];
    expect(record.mismatches).toEqual(warnPayload.mismatches);
  });

  it('persistence: NOT called when legacyResult is absent (no reconciliation, nothing to persist)', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 23,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      persist,
    });

    expect(result).toEqual({ ran: true });
    expect(persist).not.toHaveBeenCalled();
  });

  it('persistence: NOT called when mode-gated off (the shadow never runs)', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'off', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = new ConstrainedReserveEngine().calculate(
      ReserveInputSchema.parse(VALID_INPUT)
    );

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 24,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult,
      persist,
    });

    expect(result).toEqual({ ran: false });
    expect(persist).not.toHaveBeenCalled();
  });

  it('persistence: NOT called when the substrate produced no value (kill switch -> unavailable) even with legacyResult', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: true });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = new ConstrainedReserveEngine().calculate(
      ReserveInputSchema.parse(VALID_INPUT)
    );

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 25,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult,
      persist,
    });

    expect(result).toEqual({ ran: true });
    expect(persist).not.toHaveBeenCalled();
  });

  it('persistence best-effort: a THROWING persist is swallowed to { ran: true } with one warn and no rethrow', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {
      throw new Error('insert boom');
    });
    // A MATCH, so the only warn possible is the persist-failure warn.
    const legacyResult = new ConstrainedReserveEngine().calculate(
      ReserveInputSchema.parse(VALID_INPUT)
    );

    const result = await observeConstrainedReserveSubstrateShadow({
      fundId: 26,
      input: VALID_INPUT,
      resolveMode,
      asOf: FIXED_AS_OF,
      log,
      legacyResult,
      persist,
    });

    expect(result).toEqual({ ran: true });
    expect(persist).toHaveBeenCalledOnce();
    // The reconciliation MATCH still logged at info; the persist failure logs
    // exactly one warn and never rethrows.
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0]![0]).toMatchObject({
      fundId: 26,
      calculationKey: 'reserve-constrained',
    });
    expect(log.warn.mock.calls[0]![0].error).toBe('insert boom');
  });
});
