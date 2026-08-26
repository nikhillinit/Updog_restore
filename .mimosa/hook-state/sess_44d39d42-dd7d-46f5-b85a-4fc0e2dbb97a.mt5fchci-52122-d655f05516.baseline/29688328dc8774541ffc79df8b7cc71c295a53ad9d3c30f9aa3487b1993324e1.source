/**
 * ConstrainedReserveEngine substrate adapter tests (Tranche 5, ADR-046).
 *
 * Proves, per the tranche exit criteria:
 * (a) same context + input -> byte-identical result and identical resultHash
 *     across repeated runs;
 * (b) different inputs -> different input+result hashes; a different asOf ->
 *     different result hash but same input hash; and a disclosed seed-invariance
 *     property (different ctx seeds -> identical value and hash, since the engine
 *     draws no randomness);
 * (c) the adapter value matches a freshly constructed engine field-for-field on
 *     the shared fixtures, and matches the hand-derived goldens in fixtures.ts;
 * (d) mode / kill-switch / invalid-input / engine-throw invariants validated
 *     against BOTH the tranche result schema and GenericCalcResultSchema, with a
 *     registered reason code on every non-available path.
 *
 * Plus: the assumptions restatement is pinned honest against the live
 * ConstraintsSchema defaults; the emitted value round-trips through
 * admitForHashing; and the money boundary is proven cent-faithful.
 */

import { describe, expect, it } from 'vitest';
import {
  GenericCalcResultSchema,
  admitForHashing,
  createCalculationContext,
} from '../../../shared/core/calc-substrate';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';
import {
  CONSTRAINED_RESERVE_ASSUMPTIONS_VIEW,
  CONSTRAINED_RESERVE_CALCULATION_KEY,
  ConstrainedReserveCalcResultSchema,
  computeConstrainedReserveAssumptionsHash,
  runConstrainedReserveWithSubstrate,
  type ConstrainedReserveSubstrateOptions,
} from '../../../shared/core/reserves/constrained-reserve-substrate-adapter';
import { ConstraintsSchema } from '../../../shared/schemas';
import {
  CENTS_PRECISION,
  COMPANY_CAP,
  EXPLICIT_INFINITY_CAP,
  INVALID_DISCOUNT_THROW,
  INVALID_EMPTY_STAGE_POLICIES,
  NO_POLICY_THROW,
  TIE_BREAK,
  TWO_COMPANY_EXHAUST,
  VALUE_FIXTURES,
} from './fixtures';

const AS_OF = '2026-07-18T00:00:00Z';
const AS_OF_ISO = '2026-07-18T00:00:00.000Z';
const ON: ConstrainedReserveSubstrateOptions = { configuredMode: 'on', killSwitchActive: false };

function ctx(seed = 1, asOf: string = AS_OF) {
  return createCalculationContext({
    calculationKey: CONSTRAINED_RESERVE_CALCULATION_KEY,
    seed,
    asOf,
  });
}

/** Same 2dp rendering the adapter uses, to derive expected strings from goldens. */
function money(amount: number): string {
  const cents = Math.round(amount * 100);
  const whole = Math.trunc(cents / 100);
  const frac = cents % 100;
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

describe('runConstrainedReserveWithSubstrate determinism and hash integrity', () => {
  it('(a) repeated runs with the same context and input are byte-identical with equal hashes', () => {
    const first = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, ON);
    const second = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, ON);
    expect(first.state).toBe('available');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    if (first.state === 'available' && second.state === 'available') {
      expect(first.resultHash).toMatch(/^[0-9a-f]{64}$/);
      expect(second.resultHash).toBe(first.resultHash);
    }
  });

  it('(b) a different input changes both the input hash and the result hash', () => {
    const a = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, ON);
    const b = runConstrainedReserveWithSubstrate(ctx(), COMPANY_CAP.input, ON);
    if (a.state !== 'available' || b.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(b.basis.inputHash).not.toBe(a.basis.inputHash);
    expect(b.resultHash).not.toBe(a.resultHash);
  });

  it('(b) a different as-of instant changes the result hash but not the input hash', () => {
    const base = runConstrainedReserveWithSubstrate(ctx(1, AS_OF), TWO_COMPANY_EXHAUST.input, ON);
    const later = runConstrainedReserveWithSubstrate(
      ctx(1, '2026-07-19T00:00:00Z'),
      TWO_COMPANY_EXHAUST.input,
      ON
    );
    if (base.state !== 'available' || later.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(later.basis.inputHash).toBe(base.basis.inputHash);
    expect(later.resultHash).not.toBe(base.resultHash);
    expect(base.value.asOfUtc).toBe(AS_OF_ISO);
  });

  it('(b, disclosed) the value is seed-invariant, so the result hash is too', () => {
    // The engine draws no randomness and the seed is not part of the basis, so
    // equal inputs yield equal values and hashes across different ctx seeds.
    const seed1 = runConstrainedReserveWithSubstrate(ctx(1), TIE_BREAK.input, ON);
    const seed999 = runConstrainedReserveWithSubstrate(ctx(999), TIE_BREAK.input, ON);
    if (seed1.state !== 'available' || seed999.state !== 'available') {
      throw new Error('expected available results');
    }
    expect(JSON.stringify(seed999.value)).toBe(JSON.stringify(seed1.value));
    expect(seed999.resultHash).toBe(seed1.resultHash);
    expect(seed999.basis.inputHash).toBe(seed1.basis.inputHash);
  });

  it('every emitted result revalidates against the tranche and generic result schemas', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, ON);
    expect(() => ConstrainedReserveCalcResultSchema.parse(result)).not.toThrow();
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  });

  it('the emitted value round-trips through admitForHashing (hash-admissible)', () => {
    for (const fixture of VALUE_FIXTURES) {
      const result = runConstrainedReserveWithSubstrate(ctx(), fixture.input, ON);
      if (result.state !== 'available') {
        throw new Error(`expected available for ${fixture.label}`);
      }
      expect(() => admitForHashing(result.value), fixture.label).not.toThrow();
    }
  });
});

describe('runConstrainedReserveWithSubstrate parity with the engine and hand-derived goldens', () => {
  it('(c) the adapter value matches a freshly constructed engine field-for-field', () => {
    const engine = new ConstrainedReserveEngine();
    for (const fixture of VALUE_FIXTURES) {
      const engineOut = engine.calculate(fixture.input);
      const result = runConstrainedReserveWithSubstrate(ctx(), fixture.input, ON);
      if (result.state !== 'available') {
        throw new Error(`expected available for ${fixture.label}`);
      }
      expect(result.value.conservationOk, fixture.label).toBe(engineOut.conservationOk);
      expect(Number(result.value.totalAllocated), fixture.label).toBe(engineOut.totalAllocated);
      expect(Number(result.value.remaining), fixture.label).toBe(engineOut.remaining);
      expect(result.value.allocations.length, fixture.label).toBe(engineOut.allocations.length);
      result.value.allocations.forEach((allocation, index) => {
        const engineAllocation = engineOut.allocations[index]!;
        expect(allocation.id, fixture.label).toBe(engineAllocation.id);
        expect(allocation.name, fixture.label).toBe(engineAllocation.name);
        expect(allocation.stage, fixture.label).toBe(engineAllocation.stage);
        expect(Number(allocation.allocated), fixture.label).toBe(engineAllocation.allocated);
      });
    }
  });

  it('(c) the adapter value matches the hand-derived goldens (2dp strings)', () => {
    for (const fixture of VALUE_FIXTURES) {
      const result = runConstrainedReserveWithSubstrate(ctx(), fixture.input, ON);
      if (result.state !== 'available') {
        throw new Error(`expected available for ${fixture.label}`);
      }
      expect(result.value.totalAllocated, fixture.label).toBe(
        money(fixture.expected.totalAllocated)
      );
      expect(result.value.remaining, fixture.label).toBe(money(fixture.expected.remaining));
      expect(
        result.value.allocations.map((a) => [a.id, a.allocated]),
        fixture.label
      ).toEqual(fixture.expected.allocations.map((a) => [a.id, money(a.allocated)]));
    }
  });

  it('(c) money is rendered cent-faithfully, not rounded to whole dollars', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), CENTS_PRECISION.input, ON);
    if (result.state !== 'available') {
      throw new Error('expected available');
    }
    expect(result.value.allocations[0]!.allocated).toBe('100.55');
    expect(result.value.totalAllocated).toBe('100.55');
    expect(result.value.remaining).toBe('0.00');
  });

  it('(c) the tie-break order survives the boundary (score -> name -> id)', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), TIE_BREAK.input, ON);
    if (result.state !== 'available') {
      throw new Error('expected available');
    }
    expect(result.value.allocations.map((a) => a.id)).toEqual(['m5', 'a1', 'z9']);
  });
});

describe('runConstrainedReserveWithSubstrate mode and kill-switch invariants', () => {
  function bothSchemas(result: unknown): void {
    expect(() => ConstrainedReserveCalcResultSchema.parse(result)).not.toThrow();
    expect(() => GenericCalcResultSchema.parse(result)).not.toThrow();
  }

  it('(d) configured off yields unavailable with MODE_OFF and no value', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, {
      configuredMode: 'off',
      killSwitchActive: false,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['MODE_OFF']);
    expect('value' in result).toBe(false);
    expect('resultHash' in result).toBe(false);
    expect(result.basis.effectiveMode).toBe('off');
    bothSchemas(result);
  });

  it('(d) an active kill switch forces effective off and discloses KILL_SWITCH_ACTIVE', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, {
      configuredMode: 'on',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE']);
    expect(result.basis.effectiveMode).toBe('off');
    expect(result.basis.configuredMode).toBe('on');
    bothSchemas(result);
  });

  it('(d) kill switch plus configured off disclose both suppression codes', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, {
      configuredMode: 'off',
      killSwitchActive: true,
    });
    expect(result.state).toBe('unavailable');
    expect(result.reasonCodes).toEqual(['KILL_SWITCH_ACTIVE', 'MODE_OFF']);
    bothSchemas(result);
  });

  it('(d) shadow mode yields an indicative value disclosed via SHADOW_ONLY', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), TWO_COMPANY_EXHAUST.input, {
      configuredMode: 'shadow',
      killSwitchActive: false,
    });
    expect(result.state).toBe('indicative');
    expect(result.reasonCodes).toEqual(['SHADOW_ONLY']);
    if (result.state === 'indicative') {
      expect(result.value.totalAllocated).toBe('100000.00');
      expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/);
    }
    bothSchemas(result);
  });

  it('(d) schema-invalid input (empty stagePolicies) yields failed with INPUT_INVALID', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), INVALID_EMPTY_STAGE_POLICIES, ON);
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['INPUT_INVALID']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('constrained reserve input rejected');
    }
    expect(result.basis.inputHash).toMatch(/^[0-9a-f]{64}$/);
    bothSchemas(result);
  });

  it('(d) a "No policy for {stage}" engine throw yields failed with ENGINE_ERROR', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), NO_POLICY_THROW.input, ON);
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['ENGINE_ERROR']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('No policy for series_b');
    }
    bothSchemas(result);
  });

  it('(d) an invalid-discount engine throw yields failed with ENGINE_ERROR', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), INVALID_DISCOUNT_THROW.input, ON);
    expect(result.state).toBe('failed');
    expect(result.reasonCodes).toEqual(['ENGINE_ERROR']);
    if (result.state === 'failed') {
      expect(result.diagnostic).toContain('Invalid discount calculation');
    }
    bothSchemas(result);
  });

  it('rejects a context built for a different calculation key', () => {
    const wrongCtx = createCalculationContext({ calculationKey: 'reserve', seed: 1, asOf: AS_OF });
    expect(() =>
      runConstrainedReserveWithSubstrate(wrongCtx, TWO_COMPANY_EXHAUST.input, ON)
    ).toThrow(TypeError);
  });
});

describe('runConstrainedReserveWithSubstrate raw-input hashing (disclosed)', () => {
  it('an explicit non-finite maxPerCompany still runs (available) via the sentinel input hash', () => {
    const result = runConstrainedReserveWithSubstrate(ctx(), EXPLICIT_INFINITY_CAP, ON);
    expect(result.state).toBe('available');
    expect(result.basis.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two inputs that differ only elsewhere but both pin maxPerCompany: Infinity collide on input hash', () => {
    const other = {
      ...EXPLICIT_INFINITY_CAP,
      companies: [{ id: 'zzz', name: 'Different', stage: 'seed', invested: 42, ownership: 0.9 }],
    };
    const a = runConstrainedReserveWithSubstrate(ctx(), EXPLICIT_INFINITY_CAP, ON);
    const b = runConstrainedReserveWithSubstrate(ctx(), other, ON);
    // Disclosed raw-hashing consequence: both collapse onto the inadmissible
    // sentinel, so their input identities coincide despite different companies.
    expect(b.basis.inputHash).toBe(a.basis.inputHash);
  });
});

describe('constrained reserve assumptions restatement parity', () => {
  /** Walk ZodOptional(ZodDefault(...)) to recover a field's documented default. */
  function schemaDefault(field: unknown): unknown {
    let node = field as { _def?: Record<string, unknown> } | undefined;
    for (let i = 0; i < 6 && node?._def; i++) {
      const def = node._def as Record<string, unknown>;
      if (def['typeName'] === 'ZodDefault') {
        return (def['defaultValue'] as () => unknown)();
      }
      node = (def['innerType'] ?? def['schema'] ?? def['type']) as typeof node;
    }
    throw new Error('no ZodDefault found in field chain');
  }

  it('restated constraint defaults match the live ConstraintsSchema', () => {
    const shape = (ConstraintsSchema as unknown as { shape: Record<string, unknown> }).shape;
    const documented = CONSTRAINED_RESERVE_ASSUMPTIONS_VIEW.constraintDefaults;
    expect(schemaDefault(shape['minCheck'])).toBe(documented.minCheck);
    expect(schemaDefault(shape['discountRateAnnual'])).toBe(documented.discountRateAnnual);
    expect(schemaDefault(shape['maxPerStage'])).toEqual(documented.maxPerStage);
    expect(schemaDefault(shape['graduationYears'])).toEqual(documented.graduationYears);
    expect(schemaDefault(shape['graduationProb'])).toEqual(documented.graduationProb);
    // maxPerCompany's schema default is Infinity, restated as the 'unbounded'
    // sentinel because non-finite numbers are not hash-admissible.
    expect(schemaDefault(shape['maxPerCompany'])).toBe(Number.POSITIVE_INFINITY);
    expect(documented.maxPerCompany).toBe('unbounded');
  });

  it('the assumptions hash is a stable 64-hex digest', () => {
    const first = computeConstrainedReserveAssumptionsHash();
    const second = computeConstrainedReserveAssumptionsHash();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });
});
