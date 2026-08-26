/**
 * Pacing substrate adapter tests (Tranche 2, ADR-043).
 *
 * Proves, per the tranche exit criteria:
 * (a) same context + inputs -> byte-identical result and identical resultHash
 *     across repeated runs;
 * (b) different seeds / inputs / as-of instants -> different hashes;
 * (c) adapter output matches the legacy PacingEngine exactly for the legacy
 *     effective seed (123) on hand-authored fixtures;
 * (d) basis cross-field behavior: off / kill-switched runs yield unavailable
 *     with the registered disclosure codes, shadow yields indicative, and
 *     invalid input yields failed with INPUT_INVALID - never a silent value.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  GenericCalcResultSchema,
  createCalculationContext,
} from '../../../shared/core/calc-substrate';
import { PacingEngine } from '../../../shared/core/pacing/PacingEngine';
import {
  PACING_CALCULATION_KEY,
  PacingCalcResultSchema,
  runPacingWithSubstrate,
  type PacingSubstrateOptions,
} from '../../../shared/core/pacing/pacing-substrate-adapter';
import type { PacingInput } from '../../../shared/types';

const LEGACY_SEED = 123;
const AS_OF = '2026-07-17T00:00:00Z';

const NEUTRAL_50M_Q1: PacingInput = {
  fundSize: 50_000_000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
};
const BULL_100M_Q3: PacingInput = {
  fundSize: 100_000_000,
  deploymentQuarter: 3,
  marketCondition: 'bull',
};
const BEAR_20M_Q10: PacingInput = {
  fundSize: 20_000_000,
  deploymentQuarter: 10,
  marketCondition: 'bear',
};

// Hand-authored from the LCG(123) recurrence; identical constants are pinned
// against the legacy engine in pacing-engine-characterization.test.ts.
const EXPECTED_NEUTRAL_50M_Q1 = [
  '5979671',
  '6168913',
  '5673314',
  '5901100',
  '6074284',
  '6362805',
  '6076601',
  '6033562',
];
const EXPECTED_BULL_100M_Q3 = [
  '15547145',
  '16039173',
  '14750617',
  '12982420',
  '13363424',
  '13998171',
  '9722562',
  '9653700',
];
const EXPECTED_BEAR_20M_Q10 = [
  '1674308',
  '1727296',
  '1588528',
  '2124396',
  '2186742',
  '2290610',
  '2916769',
  '2896110',
];
const EXPECTED_NEUTRAL_50M_Q1_ML = [
  '5225765',
  '6442743',
  '5851990',
  '6732204',
  '6562221',
  '7238359',
  '5330876',
  '6657064',
];

const ON: PacingSubstrateOptions = { configuredMode: 'on', killSwitchActive: false };

function pacingContext(seed: number, asOf: string = AS_OF) {
  return createCalculationContext({ calculationKey: PACING_CALCULATION_KEY, seed, asOf });
}

function scheduleDeployments(result: ReturnType<typeof runPacingWithSubstrate>): string[] {
  if (result.state !== 'available' && result.state !== 'indicative') {
    throw new Error(`expected a value-bearing result, got ${result.state}`);
  }
  return result.value.schedule.map((entry) => entry.deployment);
}

describe('runPacingWithSubstrate determinism and hash integrity', () => {
  it('(a) repeated runs with the same context and input are byte-identical with equal hashes', () => {
    const first = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, ON);
    const second = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, ON);

    expect(first.state).toBe('available');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    if (first.state === 'available' && second.state === 'available') {
      expect(second.resultHash).toBe(first.resultHash);
      expect(first.resultHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('(b) a different seed changes the result hash', () => {
    const seed123 = runPacingWithSubstrate(pacingContext(123), NEUTRAL_50M_Q1, ON);
    const seed456 = runPacingWithSubstrate(pacingContext(456), NEUTRAL_50M_Q1, ON);
    if (seed123.state !== 'available' || seed456.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(seed456.resultHash).not.toBe(seed123.resultHash);
  });

  it('(b) a different input changes the input hash and the result hash', () => {
    const neutral = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, ON);
    const bull = runPacingWithSubstrate(pacingContext(LEGACY_SEED), BULL_100M_Q3, ON);
    if (neutral.state !== 'available' || bull.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(bull.basis.inputHash).not.toBe(neutral.basis.inputHash);
    expect(bull.resultHash).not.toBe(neutral.resultHash);
  });

  it('(b) a different as-of instant changes the result hash (asOfUtc is part of the value)', () => {
    const base = runPacingWithSubstrate(pacingContext(LEGACY_SEED, AS_OF), NEUTRAL_50M_Q1, ON);
    const later = runPacingWithSubstrate(
      pacingContext(LEGACY_SEED, '2026-07-18T00:00:00Z'),
      NEUTRAL_50M_Q1,
      ON
    );
    if (base.state !== 'available' || later.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(later.resultHash).not.toBe(base.resultHash);
    expect(later.basis.inputHash).toBe(base.basis.inputHash);
  });

  it('every emitted result revalidates against the pacing and generic result schemas', () => {
    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, ON);
    expect(() => PacingCalcResultSchema.parse(result)).not.toThrow();
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });
});

describe('runPacingWithSubstrate parity with the legacy engine (effective seed 123)', () => {
  const savedAlgPacing = process.env['ALG_PACING'];

  afterEach(() => {
    if (savedAlgPacing === undefined) {
      delete process.env['ALG_PACING'];
    } else {
      process.env['ALG_PACING'] = savedAlgPacing;
    }
  });

  const ruleBasedFixtures: Array<[string, PacingInput, string[]]> = [
    ['neutral 50M q1', NEUTRAL_50M_Q1, EXPECTED_NEUTRAL_50M_Q1],
    ['bull 100M q3', BULL_100M_Q3, EXPECTED_BULL_100M_Q3],
    ['bear 20M q10', BEAR_20M_Q10, EXPECTED_BEAR_20M_Q10],
  ];

  it.each(ruleBasedFixtures)('(c) rule-based parity: %s', (_label, input, expectedDeployments) => {
    delete process.env['ALG_PACING'];
    const legacy = PacingEngine(input);
    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), input, ON);
    if (result.state !== 'available') {
      throw new Error(`expected available, got ${result.state}`);
    }

    // Both sides pinned to the same hand-authored constants...
    expect(scheduleDeployments(result)).toEqual(expectedDeployments);
    expect(legacy.map((o) => String(o.deployment))).toEqual(expectedDeployments);
    // ...and field-for-field agreement between adapter and legacy engine.
    result.value.schedule.forEach((entry, index) => {
      expect(Number(entry.deployment)).toBe(legacy[index]!.deployment);
      expect(entry.quarter).toBe(legacy[index]!.quarter);
      expect(entry.note).toBe(legacy[index]!.note);
    });
    const expectedTotal = legacy.reduce((sum, o) => sum + o.deployment, 0);
    expect(result.value.totalDeployment).toBe(String(expectedTotal));
    expect(result.value.avgQuarterlyDeployment).toBe(String(Math.round(expectedTotal / 8)));
    expect(result.value.asOfUtc).toBe('2026-07-17T00:00:00.000Z');
  });

  it('(c) ML-path parity: neutral 50M q1 with the explicit ml algorithm option', () => {
    process.env['ALG_PACING'] = 'true';
    const legacy = PacingEngine(NEUTRAL_50M_Q1);
    delete process.env['ALG_PACING'];

    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, {
      ...ON,
      algorithm: 'ml',
    });
    if (result.state !== 'available') {
      throw new Error(`expected available, got ${result.state}`);
    }
    expect(scheduleDeployments(result)).toEqual(EXPECTED_NEUTRAL_50M_Q1_ML);
    expect(legacy.map((o) => String(o.deployment))).toEqual(EXPECTED_NEUTRAL_50M_Q1_ML);
    expect(result.value.schedule[0]!.note).toBe('ML-optimized pacing (neutral trend analysis)');
  });

  it('(b) rule-based and ml algorithms produce different assumptions hashes and result hashes', () => {
    const ruleBased = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, ON);
    const ml = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, {
      ...ON,
      algorithm: 'ml',
    });
    if (ruleBased.state !== 'available' || ml.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(ml.basis.assumptionsHash).not.toBe(ruleBased.basis.assumptionsHash);
    expect(ml.resultHash).not.toBe(ruleBased.resultHash);
  });
});

describe('runPacingWithSubstrate mode and kill-switch invariants', () => {
  it('(d) configuredMode off yields unavailable with MODE_OFF and no value', () => {
    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, {
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
    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, {
      configuredMode: 'on',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE']);
    expect(result.basis.effectiveMode).toBe('off');
    expect(result.basis.configuredMode).toBe('on');
  });

  it('(d) kill switch plus configured off disclose both suppression codes', () => {
    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, {
      configuredMode: 'off',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE', 'MODE_OFF']);
  });

  it('(d) shadow mode yields an indicative value disclosed via SHADOW_ONLY', () => {
    const result = runPacingWithSubstrate(pacingContext(LEGACY_SEED), NEUTRAL_50M_Q1, {
      configuredMode: 'shadow',
      killSwitchActive: false,
    });
    expect(result.state).toBe('indicative');
    expect(result.reasonCodes).toEqual(['SHADOW_ONLY']);
    expect(scheduleDeployments(result)).toEqual(EXPECTED_NEUTRAL_50M_Q1);
  });

  it('(d) schema-invalid input yields failed with INPUT_INVALID and a diagnostic', () => {
    const result = runPacingWithSubstrate(
      pacingContext(LEGACY_SEED),
      { fundSize: -1, deploymentQuarter: 1, marketCondition: 'neutral' },
      ON
    );
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['INPUT_INVALID']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('pacing input rejected');
    }
    expect(result.basis.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('(d) hash-inadmissible input still gets a deterministic basis and INPUT_INVALID', () => {
    const inadmissible = { fundSize: Number.NaN, deploymentQuarter: 1, marketCondition: 'neutral' };
    const first = runPacingWithSubstrate(pacingContext(LEGACY_SEED), inadmissible, ON);
    const second = runPacingWithSubstrate(pacingContext(LEGACY_SEED), inadmissible, ON);
    expect(first.state).toBe('failed');
    expect(first.reasonCodes).toEqual(['INPUT_INVALID']);
    expect(first.basis.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.basis.inputHash).toBe(first.basis.inputHash);
  });

  it('rejects a context built for a different calculation key', () => {
    const ctx = createCalculationContext({ calculationKey: 'reserve', seed: 1, asOf: AS_OF });
    expect(() => runPacingWithSubstrate(ctx, NEUTRAL_50M_Q1, ON)).toThrow(TypeError);
  });
});
