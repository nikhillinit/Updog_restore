/**
 * Substrate adapter suite for the DeterministicReserveEngine
 * (Tranche 4, ADR-045).
 *
 * Four-part evidence, mirroring Tranches 2/3:
 * (a) repeat-run byte-identical results with equal 64-hex result hashes;
 * (b) different inputs, asOf instants, and feature flags change hashes,
 *     while different SEEDS do not - the engine draws no randomness, so
 *     seed-invariance is pinned as a disclosed property (no fork label is
 *     consumed or reserved);
 * (c) the adapter matches the seam-injected legacy engine field-for-field at
 *     the same instant, and matches the captured characterization goldens;
 * (d) mode/kill-switch/invalid-input invariants validate against both the
 *     deterministic-reserve result schema and GenericCalcResultSchema.
 *
 * No fake timers here: the adapter must be clock-injected via ctx, so these
 * tests run under the REAL system clock and still come out deterministic -
 * that is itself the point.
 */

import { describe, expect, it } from 'vitest';
import {
  GenericCalcResultSchema,
  admitForHashing,
  computeResultHash,
  createCalculationContext,
} from '../../../shared/core/calc-substrate';
import { DeterministicReserveEngine } from '../../../shared/core/reserves/DeterministicReserveEngine';
import {
  DEFAULT_DETERMINISTIC_RESERVE_FEATURE_FLAGS,
  DETERMINISTIC_RESERVE_CALCULATION_KEY,
  DETERMINISTIC_RESERVE_CALCULATION_VERSION,
  DETERMINISTIC_RESERVE_ENGINE_VERSION,
  DETERMINISTIC_RESERVE_METHODOLOGY_VERSION,
  computeDeterministicReserveCacheKey,
  runDeterministicReserveWithSubstrate,
  serializeDeterministicReserveInput,
  type DeterministicReserveCalcResult,
} from '../../../shared/core/reserves/deterministic-reserve-substrate-adapter';
import { ReserveAllocationInputSchema } from '../../../shared/schemas/reserves-schemas';
import {
  ALPHA_ID,
  BETA_ID,
  GAMMA_ID,
  T1_ISO,
  T1_MS,
  T2_ISO,
  baseInput,
  collidingInput,
} from './fixtures';

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

// CAPTURED goldens (see the characterization suite): ranking B/A/C at T1,
// with Beta Bio taking the 0.9 age multiplier at T2.
const GOLDEN_T1_ALLOCATIONS = [1_054_687.5, 724_570.3125, 216_554.079];
const GOLDEN_T1_TOTAL = 1_995_811.8915;
const GOLDEN_T2_BETA_ALLOCATION = 949_218.75;

function makeCtx(overrides: { seed?: number; asOf?: string } = {}) {
  return createCalculationContext({
    calculationKey: DETERMINISTIC_RESERVE_CALCULATION_KEY,
    seed: overrides.seed ?? 42,
    asOf: overrides.asOf ?? T1_ISO,
  });
}

const ON = { configuredMode: 'on', killSwitchActive: false } as const;

function expectAvailable(
  result: DeterministicReserveCalcResult
): Extract<DeterministicReserveCalcResult, { state: 'available' }> {
  if (result.state !== 'available') {
    throw new Error(`expected available result, got ${result.state}`);
  }
  return result;
}

describe('deterministic reserve adapter: context guards', () => {
  it('rejects a context with the wrong calculationKey', async () => {
    const ctx = createCalculationContext({ calculationKey: 'reserve', seed: 42, asOf: T1_ISO });
    await expect(runDeterministicReserveWithSubstrate(ctx, baseInput(), ON)).rejects.toThrow(
      TypeError
    );
  });

  it('rejects a context with the wrong contract version', async () => {
    const bogus = {
      ...makeCtx(),
      contractVersion: 'calc-substrate/0.0.1',
    } as unknown as ReturnType<typeof makeCtx>;
    await expect(runDeterministicReserveWithSubstrate(bogus, baseInput(), ON)).rejects.toThrow(
      TypeError
    );
  });
});

describe('deterministic reserve adapter: mode and kill-switch disclosure (evidence d)', () => {
  it('configured off is unavailable with MODE_OFF, valid under both schemas', async () => {
    const result = await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), {
      configuredMode: 'off',
      killSwitchActive: false,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['MODE_OFF']);
    expect(result.basis.effectiveMode).toBe('off');
    expect('value' in result).toBe(false);
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });

  it('kill switch forces unavailable with KILL_SWITCH_ACTIVE even when configured on', async () => {
    const result = await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), {
      configuredMode: 'on',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE']);
    expect(result.basis.effectiveMode).toBe('off');
    expect(result.basis.killSwitchActive).toBe(true);
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });

  it('kill switch plus configured off discloses both codes', async () => {
    const result = await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), {
      configuredMode: 'off',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE', 'MODE_OFF']);
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });

  it('shadow mode is indicative with SHADOW_ONLY and carries a hash-bound value', async () => {
    const result = await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), {
      configuredMode: 'shadow',
      killSwitchActive: false,
    });
    expect(result.state).toBe('indicative');
    expect(result.reasonCodes).toEqual(['SHADOW_ONLY']);
    if (result.state === 'indicative') {
      expect(result.resultHash).toMatch(SHA256_HEX_RE);
      expect(result.value.allocations.length).toBeGreaterThan(0);
    }
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });

  it('on mode is available with empty reason codes', async () => {
    const result = await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON);
    const available = expectAvailable(result);
    expect(available.reasonCodes).toEqual([]);
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });
});

describe('deterministic reserve adapter: failure disclosure (evidence d)', () => {
  it('schema-invalid input is failed + INPUT_INVALID with a diagnostic', async () => {
    const result = await runDeterministicReserveWithSubstrate(makeCtx(), 42, ON);
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['INPUT_INVALID']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('deterministic reserve input rejected');
    }
    expect(result.basis.inputHash).toMatch(SHA256_HEX_RE);
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });

  it('hash-inadmissible garbage collapses onto the disclosed sentinel identity', async () => {
    const garbageA = { portfolio: () => [] };
    const garbageB = new Map([['portfolio', []]]);
    const resultA = await runDeterministicReserveWithSubstrate(makeCtx(), garbageA, ON);
    const resultB = await runDeterministicReserveWithSubstrate(makeCtx(), garbageB, ON);
    expect(resultA.state).toBe('failed');
    expect(resultA.reasonCodes).toEqual(['INPUT_INVALID']);
    // Both are unparseable AND inadmissible, so both hash the sentinel.
    expect(resultB.basis.inputHash).toBe(resultA.basis.inputHash);
  });

  it('an engine throw (ReserveCalculationError) is failed + ENGINE_ERROR, never a silent value', async () => {
    // An empty portfolio passes the input schema but the engine rejects it.
    const result = await runDeterministicReserveWithSubstrate(
      makeCtx(),
      baseInput({ portfolio: [] }),
      ON
    );
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['ENGINE_ERROR']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('Portfolio cannot be empty');
    }
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });
});

describe('deterministic reserve adapter: legacy parity at a fixed instant (evidence c)', () => {
  it('matches the seam-injected legacy engine field-for-field, plus asOfUtc', async () => {
    const result = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );

    const legacy = await new DeterministicReserveEngine(undefined, {
      now: () => T1_MS,
      debugMode: false,
    }).calculateOptimalReserveAllocation(ReserveAllocationInputSchema.parse(baseInput()));

    expect(result.value).toEqual({
      ...(serializeDeterministicReserveInput(legacy) as Record<string, unknown>),
      asOfUtc: T1_ISO,
    });
  });

  it('matches the captured characterization goldens at T1', async () => {
    const result = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    expect(result.value.allocations.map((a) => a.companyId)).toEqual([BETA_ID, ALPHA_ID, GAMMA_ID]);
    expect(result.value.allocations.map((a) => a.recommendedAllocation)).toEqual(
      GOLDEN_T1_ALLOCATIONS
    );
    expect(result.value.inputSummary.totalAllocated).toBe(GOLDEN_T1_TOTAL);
    expect(result.value.metadata.calculationDate).toBe(T1_ISO);
    expect(result.value.metadata.modelVersion).toBe(DETERMINISTIC_RESERVE_CALCULATION_VERSION);
    expect(result.value.metadata.deterministicHash).toBe(
      computeDeterministicReserveCacheKey(ReserveAllocationInputSchema.parse(baseInput()))
    );
    expect(result.value.asOfUtc).toBe(T1_ISO);
  });

  it('pins calculationDuration to exactly 0 under the injected fixed clock', async () => {
    const result = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    expect(result.value.metadata.calculationDuration).toBe(0);
  });

  it('derives the age-based risk multiplier from ctx asOf: T2 applies the 0.9 multiplier', async () => {
    const result = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx({ asOf: T2_ISO }), baseInput(), ON)
    );
    const beta = result.value.allocations.find((a) => a.companyId === BETA_ID)!;
    expect(beta.recommendedAllocation).toBe(GOLDEN_T2_BETA_ALLOCATION);
    expect(beta.riskFactors).toEqual(['Risk adjustment applied due to company factors']);
    expect(result.value.metadata.calculationDate).toBe(T2_ISO);
    expect(result.value.asOfUtc).toBe(T2_ISO);
  });
});

describe('deterministic reserve adapter: determinism and hash evidence (a, b)', () => {
  it('repeat runs are byte-identical with equal 64-hex result hashes (a)', async () => {
    const first = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    const second = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    expect(second).toEqual(first);
    expect(first.resultHash).toMatch(SHA256_HEX_RE);
    expect(second.resultHash).toBe(first.resultHash);
  });

  it('is seed-invariant, disclosed: the engine draws no randomness (b)', async () => {
    const seed42 = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx({ seed: 42 }), baseInput(), ON)
    );
    const seedOther = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx({ seed: 20260717 }), baseInput(), ON)
    );
    expect(seedOther.value).toEqual(seed42.value);
    expect(seedOther.resultHash).toBe(seed42.resultHash);
  });

  it('different inputs change the input hash and the result hash (b)', async () => {
    const one = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    const two = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), collidingInput(), ON)
    );
    expect(two.basis.inputHash).not.toBe(one.basis.inputHash);
    expect(two.resultHash).not.toBe(one.resultHash);
  });

  it('a different asOf changes the value and result hash but not the input hash (b)', async () => {
    const atT1 = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx({ asOf: T1_ISO }), baseInput(), ON)
    );
    const atT2 = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx({ asOf: T2_ISO }), baseInput(), ON)
    );
    expect(atT2.basis.inputHash).toBe(atT1.basis.inputHash);
    expect(atT2.resultHash).not.toBe(atT1.resultHash);
  });

  it('different feature flags change the assumptions hash and the result hash (b)', async () => {
    const defaults = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    const diversified = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), {
        ...ON,
        featureFlags: {
          ...DEFAULT_DETERMINISTIC_RESERVE_FEATURE_FLAGS,
          enableAdvancedDiversification: true,
        },
      })
    );
    expect(diversified.basis.assumptionsHash).not.toBe(defaults.basis.assumptionsHash);
    expect(diversified.resultHash).not.toBe(defaults.resultHash);
    // The flag is behavioral, not just declarative: unique-sector companies
    // receive the 1.1 diversification bonus.
    expect(diversified.value.allocations[0]!.calculationMetadata.diversificationBonus).toBe(0.1);
  });

  it('omitting the featureFlags option equals passing the engine defaults explicitly', async () => {
    const implicit = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    const explicit = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), {
        ...ON,
        featureFlags: { ...DEFAULT_DETERMINISTIC_RESERVE_FEATURE_FLAGS },
      })
    );
    expect(explicit).toEqual(implicit);
    expect(explicit.resultHash).toBe(implicit.resultHash);
  });

  it('canonical input identity: Date instances, ISO strings, and schema defaults share one hash', async () => {
    const withDates = baseInput();
    // JSON round-trip spells every Date as its ISO string.
    const withStrings = JSON.parse(JSON.stringify(baseInput())) as unknown;
    // Dropping fields that sit at their schema defaults must not change
    // identity: parsing fills them back in before hashing.
    const withDefaultsOmitted = (() => {
      const input = baseInput() as unknown as Record<string, unknown>;
      delete input['scenarioType']; // schema default: 'base'
      delete input['timeHorizon']; // schema default: 84
      delete input['maxPortfolioConcentration']; // schema default: 0.1
      return input;
    })();

    const a = expectAvailable(await runDeterministicReserveWithSubstrate(makeCtx(), withDates, ON));
    const b = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), withStrings, ON)
    );
    const c = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), withDefaultsOmitted, ON)
    );
    expect(b.basis.inputHash).toBe(a.basis.inputHash);
    expect(c.basis.inputHash).toBe(a.basis.inputHash);
    expect(b.resultHash).toBe(a.resultHash);
    expect(c.resultHash).toBe(a.resultHash);
  });
});

describe('deterministic reserve adapter: hash integrity', () => {
  it('the value round-trips hash admission and the result hash recomputes (no Dates, no undefined)', async () => {
    const result = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    expect(() => admitForHashing(result.value)).not.toThrow();
    expect(computeResultHash(result.basis, result.value)).toBe(result.resultHash);
  });

  it('pins the basis identity fields', async () => {
    const result = expectAvailable(
      await runDeterministicReserveWithSubstrate(makeCtx(), baseInput(), ON)
    );
    expect(result.basis.calculationKey).toBe('reserve-deterministic');
    expect(result.basis.engineVersion).toBe(DETERMINISTIC_RESERVE_ENGINE_VERSION);
    expect(result.basis.methodologyVersion).toBe(DETERMINISTIC_RESERVE_METHODOLOGY_VERSION);
    expect(result.basis.inputHash).toMatch(SHA256_HEX_RE);
    expect(result.basis.assumptionsHash).toMatch(SHA256_HEX_RE);
  });
});
