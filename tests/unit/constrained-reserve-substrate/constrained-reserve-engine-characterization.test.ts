/**
 * Characterization tests for the legacy ConstrainedReserveEngine
 * (Tranche 5, ADR-046).
 *
 * These pin the engine's CURRENT behavior BEFORE substrate adoption; they are
 * evidence, not aspiration. The engine is fully deterministic and ambient-free:
 * no randomness, no wall-clock read, no process.env, no cache, no global
 * mutation. Money is exact BigInt cents. Every golden in fixtures.ts is
 * therefore hand-derived (see the derivation comments there), and the engine
 * output is asserted against it here so the adapter parity suite can, in turn,
 * pin itself to the same hand-derived numbers.
 */

import { describe, expect, it } from 'vitest';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine';
import { toCents } from '../../../shared/lib/cents';
import {
  CENTS_PRECISION,
  COMPANY_CAP,
  EMPTY_COMPANIES,
  INVALID_DISCOUNT_THROW,
  INVALID_DISCOUNT_THROW_MESSAGE,
  MIN_CHECK_SKIP,
  NO_POLICY_THROW,
  NO_POLICY_THROW_MESSAGE,
  STAGE_CAP,
  TIE_BREAK,
  TWO_COMPANY_EXHAUST,
  VALUE_FIXTURES,
} from './fixtures';

const engine = new ConstrainedReserveEngine();

describe('ConstrainedReserveEngine characterization: hand-derived goldens', () => {
  it('A: ranks by score across stages, exhausts reserves, drops the zero-allocation company', () => {
    expect(engine.calculate(TWO_COMPANY_EXHAUST.input)).toEqual(TWO_COMPANY_EXHAUST.expected);
  });

  it('B: honors maxPerCompany and breaks the score tie on name (Alpha before Beta)', () => {
    expect(engine.calculate(COMPANY_CAP.input)).toEqual(COMPANY_CAP.expected);
  });

  it('C: honors maxPerStage and skips a company left with zero stage room', () => {
    expect(engine.calculate(STAGE_CAP.input)).toEqual(STAGE_CAP.expected);
  });

  it('D: skips a company whose remaining room is below minCheck', () => {
    expect(engine.calculate(MIN_CHECK_SKIP.input)).toEqual(MIN_CHECK_SKIP.expected);
  });

  it('E: returns a faithful empty result for empty companies (zeros, full remaining)', () => {
    expect(engine.calculate(EMPTY_COMPANIES.input)).toEqual(EMPTY_COMPANIES.expected);
  });

  it('H: applies the full tie-break ladder score -> name -> id', () => {
    const result = engine.calculate(TIE_BREAK.input);
    expect(result).toEqual(TIE_BREAK.expected);
    // The ordering itself is the observable proof of the sort.
    expect(result.allocations.map((a) => a.id)).toEqual(['m5', 'a1', 'z9']);
  });

  it('I: preserves cent-level precision (100.55, not a whole-dollar rounding)', () => {
    expect(engine.calculate(CENTS_PRECISION.input)).toEqual(CENTS_PRECISION.expected);
  });
});

describe('ConstrainedReserveEngine characterization: throwing paths', () => {
  it('F: throws "No policy for {stage}" (status 400) when a company stage has no policy', () => {
    expect(() => engine.calculate(NO_POLICY_THROW.input)).toThrow(NO_POLICY_THROW_MESSAGE);
    try {
      engine.calculate(NO_POLICY_THROW.input);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400);
    }
  });

  it('G: throws "Invalid discount calculation" when discountFactor overflows to non-finite', () => {
    expect(() => engine.calculate(INVALID_DISCOUNT_THROW.input)).toThrow(
      INVALID_DISCOUNT_THROW_MESSAGE
    );
    try {
      engine.calculate(INVALID_DISCOUNT_THROW.input);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400);
    }
  });
});

describe('ConstrainedReserveEngine characterization: invariants across value fixtures', () => {
  it('conservation: totalAllocated + remaining equals availableReserves to the cent, conservationOk true', () => {
    for (const { label, input, expected } of VALUE_FIXTURES) {
      const result = engine.calculate(input);
      expect(result.conservationOk, label).toBe(true);
      const outCents = toCents(result.totalAllocated) + toCents(result.remaining);
      expect(outCents === toCents(input.availableReserves), label).toBe(true);
      // The golden itself must satisfy conservation.
      expect(toCents(expected.totalAllocated) + toCents(expected.remaining), label).toBe(
        toCents(input.availableReserves)
      );
    }
  });

  it('bounds: total never exceeds availableReserves and every allocation meets any minCheck', () => {
    for (const { label, input } of VALUE_FIXTURES) {
      const result = engine.calculate(input);
      expect(toCents(result.totalAllocated) <= toCents(input.availableReserves), label).toBe(true);
      const minCheck = input.constraints?.minCheck ?? 0;
      for (const allocation of result.allocations) {
        expect(
          toCents(allocation.allocated) >= toCents(minCheck),
          `${label}:${allocation.id}`
        ).toBe(true);
        expect(allocation.allocated >= 0, `${label}:${allocation.id}`).toBe(true);
      }
    }
  });

  it('determinism: repeated calls on the same input are byte-identical', () => {
    for (const { label, input } of VALUE_FIXTURES) {
      const first = JSON.stringify(engine.calculate(input));
      const second = JSON.stringify(engine.calculate(input));
      expect(second, label).toBe(first);
    }
  });
});
