import { describe, it, expect, vi } from 'vitest';
import { serveConstrainedReserveCalculation } from '../../../server/services/constrained-reserve-substrate-promotion';
import type {
  ShadowLogger,
  SubstrateShadowReconciliationRecord,
} from '../../../server/services/constrained-reserve-substrate-shadow';
import type { SubstrateCalcModeResolution } from '../../../server/services/substrate-calc-mode-resolver';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';
import { ReserveInputSchema } from '../../../shared/schemas';

const FIXED_AS_OF = '2026-07-18T00:00:00.000Z';

// One seed company + one seed policy; a valid ReserveInput that reaches
// `available` under mode `on`. Same fixture family as the T7/T8/T9 helper
// tests so the adapter (which runs REAL here - it is pure and deterministic)
// produces a value the legacy engine reproduces exactly.
const VALID_INPUT = {
  availableReserves: 100_000,
  companies: [{ id: 'c1', name: 'Alpha', stage: 'seed', invested: 1_000_000, ownership: 0.1 }],
  stagePolicies: [{ stage: 'seed', reserveMultiple: 2, weight: 1 }],
};

/** The legacy engine output the route would compute and serve for VALID_INPUT. */
function computeLegacy() {
  return new ConstrainedReserveEngine().calculate(ReserveInputSchema.parse(VALID_INPUT));
}

function makeLog() {
  return { info: vi.fn(), warn: vi.fn() } satisfies ShadowLogger;
}

function resolverReturning(resolution: SubstrateCalcModeResolution) {
  return vi.fn(async () => resolution);
}

describe('serveConstrainedReserveCalculation', () => {
  it('off: serves legacy with MODE_OFF; delegation short-circuits (no adapter run, no log, no persist) exactly as T7-T10', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'off', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = computeLegacy();

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 1,
      input: VALID_INPUT,
      legacyResult,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('legacy');
    expect(outcome.reasonCodes).toEqual(['MODE_OFF']);
    expect(outcome.response).toEqual({
      allocations: legacyResult.allocations,
      totalAllocated: legacyResult.totalAllocated,
      remaining: legacyResult.remaining,
    });
    // The mode was resolved exactly once and passed pre-resolved into the
    // shadow helper (zero extra registry query).
    expect(resolveMode).toHaveBeenCalledOnce();
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('shadow: serves legacy with SHADOW_ONLY; delegation preserves the T7-T10 shadow + reconcile + persist behavior', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'shadow', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = computeLegacy();

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 2,
      input: VALID_INPUT,
      legacyResult,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('legacy');
    expect(outcome.reasonCodes).toEqual(['SHADOW_ONLY']);
    expect(outcome.response.allocations).toBe(legacyResult.allocations);
    expect(resolveMode).toHaveBeenCalledOnce();
    // T7 shadow disclosure + T8 reconciliation disclosure, both at info.
    expect(log.info.mock.calls.some((call) => call[0]!.state === 'indicative')).toBe(true);
    expect(log.info.mock.calls.some((call) => call[0]!.reconciliation === 'match')).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
    // T9 persistence: exactly one record with the shadow-mode identity.
    expect(persist).toHaveBeenCalledOnce();
    const record = persist.mock.calls[0]![0] as SubstrateShadowReconciliationRecord;
    expect(record).toMatchObject({
      fundId: 2,
      calculationKey: 'reserve-constrained',
      configuredMode: 'shadow',
      effectiveMode: 'shadow',
      killSwitchActive: false,
      substrateState: 'indicative',
      reconciliationStatus: 'match',
      mismatches: [],
    });
  });

  it('kill switch over configured `on`: serves legacy with KILL_SWITCH_ACTIVE; the shadow logs unavailable and persists nothing', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: true });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = computeLegacy();

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 3,
      input: VALID_INPUT,
      legacyResult,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('legacy');
    expect(outcome.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE']);
    expect(outcome.response.allocations).toBe(legacyResult.allocations);
    // Delegated shadow ran the adapter to its unavailable + KILL_SWITCH_ACTIVE
    // disclosure (non-collapse), produced no value, persisted nothing.
    expect(log.info).toHaveBeenCalledOnce();
    expect(log.info.mock.calls[0]![0]).toMatchObject({
      state: 'unavailable',
      configuredMode: 'on',
      killSwitchActive: true,
    });
    expect(log.info.mock.calls[0]![0].reasonCodes).toContain('KILL_SWITCH_ACTIVE');
    expect(persist).not.toHaveBeenCalled();
  });

  it('on + verified match: serves the substrate with the exact pinned projection and persists one effectiveMode-on match row', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = computeLegacy();

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 4,
      input: VALID_INPUT,
      legacyResult,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('substrate');
    expect(outcome.reasonCodes).toEqual([]);
    // Projection: LEGACY allocations in LEGACY order with spread-preserved key
    // set/order; `allocated` is Number(...) of the adapter's exact-2dp string,
    // which for this clean fixture equals the legacy number exactly.
    expect(outcome.response.allocations).not.toBe(legacyResult.allocations);
    expect(outcome.response.allocations).toEqual(legacyResult.allocations);
    expect(Object.keys(outcome.response.allocations[0]!)).toEqual([
      'id',
      'name',
      'stage',
      'allocated',
    ]);
    expect(outcome.response.totalAllocated).toBe(legacyResult.totalAllocated);
    expect(outcome.response.remaining).toBe(legacyResult.remaining);
    // Persistence continuity under `on`: one record through the T9 seam.
    expect(persist).toHaveBeenCalledOnce();
    const record = persist.mock.calls[0]![0] as SubstrateShadowReconciliationRecord;
    expect(record).toMatchObject({
      fundId: 4,
      calculationKey: 'reserve-constrained',
      configuredMode: 'on',
      effectiveMode: 'on',
      killSwitchActive: false,
      substrateState: 'available',
      reconciliationStatus: 'match',
      mismatches: [],
    });
    // Served-substrate info disclosure carries the substrate identity.
    const servedCall = log.info.mock.calls.find((call) => call[0]!.served === 'substrate');
    expect(servedCall).toBeDefined();
    expect(servedCall![0]).toMatchObject({ fundId: 4, calculationKey: 'reserve-constrained' });
    expect(servedCall![0].resultHash).toEqual(expect.any(String));
    expect(servedCall![0].inputHash).toEqual(expect.any(String));
    expect(record.resultHash).toBe(servedCall![0].resultHash);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('on + mismatch: a one-cent doctored legacy demotes to the passed legacy with RECONCILIATION_MISMATCH, warns, and persists the mismatch row', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacy = computeLegacy();
    // Doctored one cent off so the substrate CANNOT verify against it; the
    // fail-safe must serve THIS object back untouched.
    const doctoredLegacy = { ...legacy, totalAllocated: legacy.totalAllocated + 0.01 };

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 5,
      input: VALID_INPUT,
      legacyResult: doctoredLegacy,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('legacy');
    expect(outcome.reasonCodes).toEqual(['RECONCILIATION_MISMATCH']);
    expect(outcome.response).toEqual({
      allocations: doctoredLegacy.allocations,
      totalAllocated: doctoredLegacy.totalAllocated,
      remaining: doctoredLegacy.remaining,
    });
    // Demotion disclosure at warn, carrying the mismatches.
    expect(log.warn).toHaveBeenCalledOnce();
    const warnPayload = log.warn.mock.calls[0]![0];
    expect(warnPayload).toMatchObject({ served: 'legacy', reconciliation: 'mismatch' });
    expect((warnPayload.mismatches as string[]).length).toBeGreaterThan(0);
    // The mismatch observation still reaches the ledger (T9 continuity).
    expect(persist).toHaveBeenCalledOnce();
    const record = persist.mock.calls[0]![0] as SubstrateShadowReconciliationRecord;
    expect(record).toMatchObject({
      effectiveMode: 'on',
      substrateState: 'available',
      reconciliationStatus: 'mismatch',
    });
    expect(record.mismatches).toEqual(warnPayload.mismatches);
  });

  it('on + verified match with a THROWING persist: still serves the substrate, warns once, never rejects', async () => {
    const resolveMode = resolverReturning({ configuredMode: 'on', killSwitchActive: false });
    const log = makeLog();
    const persist = vi.fn(async () => {
      throw new Error('insert boom');
    });
    const legacyResult = computeLegacy();

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 6,
      input: VALID_INPUT,
      legacyResult,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('substrate');
    expect(outcome.response.allocations).toEqual(legacyResult.allocations);
    expect(persist).toHaveBeenCalledOnce();
    // Exactly one warn (the persist failure); the serving decision is not
    // affected by persistence.
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0]![0].error).toBe('insert boom');
  });

  it('throwing resolveMode: never rejects, warns, and fail-safes to the legacy response', async () => {
    const resolveMode = vi.fn(async () => {
      throw new Error('resolver boom');
    });
    const log = makeLog();
    const persist = vi.fn(async () => {});
    const legacyResult = computeLegacy();

    const outcome = await serveConstrainedReserveCalculation({
      fundId: 7,
      input: VALID_INPUT,
      legacyResult,
      resolveMode,
      persist,
      log,
      asOf: FIXED_AS_OF,
    });

    expect(outcome.served).toBe('legacy');
    expect(outcome.reasonCodes).toEqual(['PROMOTION_ERROR']);
    expect(outcome.response).toEqual({
      allocations: legacyResult.allocations,
      totalAllocated: legacyResult.totalAllocated,
      remaining: legacyResult.remaining,
    });
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0]![0].error).toBe('resolver boom');
    expect(persist).not.toHaveBeenCalled();
  });
});
