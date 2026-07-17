/**
 * Reserve substrate adapter tests (Tranche 3, ADR-044).
 *
 * Proves, per the tranche exit criteria:
 * (a) same context + inputs -> byte-identical result and identical resultHash
 *     across repeated runs;
 * (b) different seeds (ML path) / inputs / as-of instants / algorithm choices
 *     -> different hashes;
 * (c) adapter output matches the legacy ReserveEngine exactly for the legacy
 *     effective seed (42) on hand-authored fixtures, rule-based AND ML;
 * (d) basis cross-field behavior: off / kill-switched runs yield unavailable
 *     with the registered disclosure codes, shadow yields indicative, and
 *     invalid input yields failed with INPUT_INVALID - never a silent value.
 *
 * Seed caveat, disclosed deliberately: the rule-based kernel draws no
 * randomness, so its value and result hash are seed-invariant; the
 * different-seed evidence therefore runs on the ML path, where the LCG gate
 * and adjustment draws consume the stream.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  GenericCalcResultSchema,
  createCalculationContext,
} from '../../../shared/core/calc-substrate';
import { ReserveEngine, generateReserveSummary } from '../../../shared/core/reserves/ReserveEngine';
import {
  RESERVE_CALCULATION_KEY,
  ReserveCalcResultSchema,
  runReserveWithSubstrate,
  type ReserveSubstrateOptions,
} from '../../../shared/core/reserves/reserve-substrate-adapter';
import type { ReserveCompanyInput } from '../../../shared/types';

const LEGACY_SEED = 42;
const AS_OF = '2026-07-17T00:00:00Z';

// Same hand-authored fixtures pinned against the legacy engine in
// reserve-engine-characterization.test.ts.
const SERIES_A_FINTECH_BOOST: ReserveCompanyInput = {
  id: 1,
  invested: 2_000_000,
  ownership: 0.15,
  stage: 'Series A',
  sector: 'Fintech',
};
const SEED_SAAS_PENALTY: ReserveCompanyInput = {
  id: 2,
  invested: 500_000,
  ownership: 0.02,
  stage: 'Seed',
  sector: 'SaaS',
};
const UNKNOWN_STAGE_SECTOR_COLD: ReserveCompanyInput = {
  id: 3,
  invested: 1_000_000,
  ownership: 0,
  stage: 'Series D',
  sector: 'Robotics',
};
const SERIES_B_HEALTHCARE_MID: ReserveCompanyInput = {
  id: 4,
  invested: 3_000_000,
  ownership: 0.08,
  stage: 'Series B',
  sector: 'Healthcare',
};

const RULE_BASED_PORTFOLIO = [
  SERIES_A_FINTECH_BOOST,
  SEED_SAAS_PENALTY,
  UNKNOWN_STAGE_SECTOR_COLD,
  SERIES_B_HEALTHCARE_MID,
];
const ML_PORTFOLIO = [SERIES_A_FINTECH_BOOST, SEED_SAAS_PENALTY, SERIES_B_HEALTHCARE_MID];

// Hand-authored from the multiplier tables and the LCG(42) recurrence;
// identical constants are pinned against the legacy engine in
// reserve-engine-characterization.test.ts.
const EXPECTED_RULE_BASED_ALLOCATIONS = ['5760000', '660000', '1600000', '9750000'];
const EXPECTED_RULE_BASED_CONFIDENCES = ['0.7', '0.65', '0.5', '0.7'];
// Seed-42 ML stream: gates fail for companies 1-2, pass for company 3, whose
// adjustment draw prices round(9750000 * 0.8890217063948512) = 8667962.
const EXPECTED_ML_SEED42_ALLOCATIONS = ['5760000', '660000', '8667962'];
// Seed-43 ML stream: every gate fails, so all three stay rule-based.
const EXPECTED_ML_SEED43_ALLOCATIONS = ['5760000', '660000', '9750000'];

const ON: ReserveSubstrateOptions = { configuredMode: 'on', killSwitchActive: false };

function reserveContext(seed: number, asOf: string = AS_OF) {
  return createCalculationContext({ calculationKey: RESERVE_CALCULATION_KEY, seed, asOf });
}

function allocationAmounts(result: ReturnType<typeof runReserveWithSubstrate>): string[] {
  if (result.state !== 'available' && result.state !== 'indicative') {
    throw new Error(`expected a value-bearing result, got ${result.state}`);
  }
  return result.value.allocations.map((entry) => entry.allocation);
}

describe('runReserveWithSubstrate determinism and hash integrity', () => {
  it('(a) repeated runs with the same context and input are byte-identical with equal hashes', () => {
    const first = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);
    const second = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);

    expect(first.state).toBe('available');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    if (first.state === 'available' && second.state === 'available') {
      expect(second.resultHash).toBe(first.resultHash);
      expect(first.resultHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('(a) repeated ML runs are also byte-identical with equal hashes', () => {
    const first = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    const second = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    expect(first.state).toBe('available');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('(b) a different seed changes the ML-path value and result hash', () => {
    const seed42 = runReserveWithSubstrate(reserveContext(42), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    const seed43 = runReserveWithSubstrate(reserveContext(43), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    if (seed42.state !== 'available' || seed43.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(allocationAmounts(seed42)).toEqual(EXPECTED_ML_SEED42_ALLOCATIONS);
    expect(allocationAmounts(seed43)).toEqual(EXPECTED_ML_SEED43_ALLOCATIONS);
    expect(seed43.resultHash).not.toBe(seed42.resultHash);
  });

  it('(b, disclosed caveat) the rule-based value is seed-invariant, so its hash is too', () => {
    // The rule-based kernel draws nothing from the stream; the seed is not
    // part of the basis, so equal inputs yield equal hashes across seeds.
    const seed42 = runReserveWithSubstrate(reserveContext(42), RULE_BASED_PORTFOLIO, ON);
    const seed999 = runReserveWithSubstrate(reserveContext(999), RULE_BASED_PORTFOLIO, ON);
    if (seed42.state !== 'available' || seed999.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(JSON.stringify(seed999.value)).toBe(JSON.stringify(seed42.value));
    expect(seed999.resultHash).toBe(seed42.resultHash);
  });

  it('(b) a different input changes the input hash and the result hash', () => {
    const full = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);
    const partial = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, ON);
    if (full.state !== 'available' || partial.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(partial.basis.inputHash).not.toBe(full.basis.inputHash);
    expect(partial.resultHash).not.toBe(full.resultHash);
  });

  it('(b) portfolio order is part of input identity', () => {
    const forward = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);
    const reversed = runReserveWithSubstrate(
      reserveContext(LEGACY_SEED),
      [...RULE_BASED_PORTFOLIO].reverse(),
      ON
    );
    if (forward.state !== 'available' || reversed.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(reversed.basis.inputHash).not.toBe(forward.basis.inputHash);
    expect(reversed.resultHash).not.toBe(forward.resultHash);
  });

  it('(b) a different as-of instant changes the result hash (asOfUtc is part of the value)', () => {
    const base = runReserveWithSubstrate(
      reserveContext(LEGACY_SEED, AS_OF),
      RULE_BASED_PORTFOLIO,
      ON
    );
    const later = runReserveWithSubstrate(
      reserveContext(LEGACY_SEED, '2026-07-18T00:00:00Z'),
      RULE_BASED_PORTFOLIO,
      ON
    );
    if (base.state !== 'available' || later.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(later.resultHash).not.toBe(base.resultHash);
    expect(later.basis.inputHash).toBe(base.basis.inputHash);
  });

  it('(b) rule-based and ml algorithms produce different assumptions hashes and result hashes', () => {
    const ruleBased = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, ON);
    const ml = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    if (ruleBased.state !== 'available' || ml.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(ml.basis.assumptionsHash).not.toBe(ruleBased.basis.assumptionsHash);
    expect(ml.resultHash).not.toBe(ruleBased.resultHash);
  });

  it('every emitted result revalidates against the reserve and generic result schemas', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);
    expect(() => ReserveCalcResultSchema.parse(result)).not.toThrow();
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });
});

describe('runReserveWithSubstrate parity with the legacy engine (effective seed 42)', () => {
  const savedAlgReserve = process.env['ALG_RESERVE'];

  afterEach(() => {
    if (savedAlgReserve === undefined) {
      delete process.env['ALG_RESERVE'];
    } else {
      process.env['ALG_RESERVE'] = savedAlgReserve;
    }
  });

  it('(c) rule-based parity: allocation, confidence, and rationale field-for-field', () => {
    delete process.env['ALG_RESERVE'];
    const legacy = ReserveEngine(RULE_BASED_PORTFOLIO);
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);
    if (result.state !== 'available') {
      throw new Error(`expected available, got ${result.state}`);
    }

    // Both sides pinned to the same hand-authored constants...
    expect(allocationAmounts(result)).toEqual(EXPECTED_RULE_BASED_ALLOCATIONS);
    expect(legacy.map((o) => String(o.allocation))).toEqual(EXPECTED_RULE_BASED_ALLOCATIONS);
    expect(result.value.allocations.map((e) => e.confidence)).toEqual(
      EXPECTED_RULE_BASED_CONFIDENCES
    );
    // ...and field-for-field agreement between adapter and legacy engine. The
    // boundary confidence rounding (2dp) is legacy-identical for rule-based
    // outputs, which the engine already rounds.
    result.value.allocations.forEach((entry, index) => {
      expect(Number(entry.allocation)).toBe(legacy[index]!.allocation);
      expect(Number(entry.confidence)).toBe(Math.round(legacy[index]!.confidence * 100) / 100);
      expect(Number(entry.confidence)).toBe(legacy[index]!.confidence);
      expect(entry.rationale).toBe(legacy[index]!.rationale);
    });
    expect(result.value.asOfUtc).toBe('2026-07-17T00:00:00.000Z');
  });

  it('(c) ML-path parity: gate interleave and adjustment via the explicit ml algorithm option', () => {
    process.env['ALG_RESERVE'] = 'true';
    const legacy = ReserveEngine(ML_PORTFOLIO);
    delete process.env['ALG_RESERVE'];

    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    if (result.state !== 'available') {
      throw new Error(`expected available, got ${result.state}`);
    }
    expect(allocationAmounts(result)).toEqual(EXPECTED_ML_SEED42_ALLOCATIONS);
    expect(legacy.map((o) => String(o.allocation))).toEqual(EXPECTED_ML_SEED42_ALLOCATIONS);
    result.value.allocations.forEach((entry, index) => {
      expect(Number(entry.allocation)).toBe(legacy[index]!.allocation);
      expect(Number(entry.confidence)).toBe(Math.round(legacy[index]!.confidence * 100) / 100);
      expect(entry.rationale).toBe(legacy[index]!.rationale);
    });
    expect(result.value.allocations[2]!.confidence).toBe('0.95');
    expect(result.value.allocations[2]!.rationale).toBe(
      'ML-enhanced allocation (Series B stage, Healthcare sector)'
    );
  });

  it('(c) summary-aggregate parity with generateReserveSummary (rule-based)', () => {
    delete process.env['ALG_RESERVE'];
    const legacySummary = generateReserveSummary(7, RULE_BASED_PORTFOLIO);
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, ON);
    if (result.state !== 'available') {
      throw new Error(`expected available, got ${result.state}`);
    }
    expect(result.value.totalAllocation).toBe('17770000');
    expect(Number(result.value.totalAllocation)).toBe(legacySummary.totalAllocation);
    expect(result.value.avgConfidence).toBe('0.64');
    expect(Number(result.value.avgConfidence)).toBe(legacySummary.avgConfidence);
    expect(result.value.highConfidenceCount).toBe(2);
    expect(result.value.highConfidenceCount).toBe(legacySummary.highConfidenceCount);
  });

  it('(c) ML summary aggregates restate the legacy math on unrounded confidences', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), ML_PORTFOLIO, {
      ...ON,
      algorithm: 'ml',
    });
    if (result.state !== 'available') {
      throw new Error(`expected available, got ${result.state}`);
    }
    expect(result.value.totalAllocation).toBe('15087962');
    expect(result.value.avgConfidence).toBe('0.77'); // round(((0.7+0.65+0.95)/3)*100)/100
    expect(result.value.highConfidenceCount).toBe(2);
  });
});

describe('runReserveWithSubstrate mode and kill-switch invariants', () => {
  it('(d) configuredMode off yields unavailable with MODE_OFF and no value', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, {
      configuredMode: 'off',
      killSwitchActive: false,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['MODE_OFF']);
    expect('value' in result).toBe(false);
    expect('resultHash' in result).toBe(false);
    expect(result.basis.effectiveMode).toBe('off');
  });

  it('(d) an active kill switch forces effectiveMode off and discloses KILL_SWITCH_ACTIVE', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, {
      configuredMode: 'on',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE']);
    expect(result.basis.effectiveMode).toBe('off');
    expect(result.basis.configuredMode).toBe('on');
  });

  it('(d) kill switch plus configured off disclose both suppression codes', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, {
      configuredMode: 'off',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE', 'MODE_OFF']);
  });

  it('(d) shadow mode yields an indicative value disclosed via SHADOW_ONLY', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), RULE_BASED_PORTFOLIO, {
      configuredMode: 'shadow',
      killSwitchActive: false,
    });
    expect(result.state).toBe('indicative');
    expect(result.reasonCodes).toEqual(['SHADOW_ONLY']);
    expect(allocationAmounts(result)).toEqual(EXPECTED_RULE_BASED_ALLOCATIONS);
  });

  it('(d) a schema-invalid company element yields failed with INPUT_INVALID and a diagnostic', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), [{ id: 1 }], ON);
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['INPUT_INVALID']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('reserve input rejected');
    }
    expect(result.basis.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(d, deviation) non-array input yields failed with INPUT_INVALID instead of the legacy silent []', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), null, ON);
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['INPUT_INVALID']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('reserve input rejected');
    }
  });

  it('(d, deviation) an empty portfolio yields available with empty allocations and zero totals', () => {
    const result = runReserveWithSubstrate(reserveContext(LEGACY_SEED), [], ON);
    expect(result.state).toBe('available');
    if (result.state !== 'available') {
      throw new Error('expected available');
    }
    expect(result.value.allocations).toEqual([]);
    expect(result.value.totalAllocation).toBe('0');
    expect(result.value.avgConfidence).toBe('0');
    expect(result.value.highConfidenceCount).toBe(0);
    expect(result.reasonCodes).toEqual([]);
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(d) hash-inadmissible input still gets a deterministic basis and INPUT_INVALID', () => {
    const inadmissible = [
      { id: 1, invested: Number.NaN, ownership: 0.1, stage: 'Seed', sector: 'SaaS' },
    ];
    const first = runReserveWithSubstrate(reserveContext(LEGACY_SEED), inadmissible, ON);
    const second = runReserveWithSubstrate(reserveContext(LEGACY_SEED), inadmissible, ON);
    expect(first.state).toBe('failed');
    expect(first.reasonCodes).toEqual(['INPUT_INVALID']);
    expect(first.basis.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.basis.inputHash).toBe(first.basis.inputHash);
  });

  it('rejects a context built for a different calculation key', () => {
    const ctx = createCalculationContext({ calculationKey: 'pacing', seed: 1, asOf: AS_OF });
    expect(() => runReserveWithSubstrate(ctx, RULE_BASED_PORTFOLIO, ON)).toThrow(TypeError);
  });
});
