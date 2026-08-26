import { describe, expect, it } from 'vitest';

import type { EconomicsFeeTierV1 } from '@shared/contracts/economics-v1.contract';
import {
  compileAnnualFeeDrag,
  FeeProfileAbsentError,
  InvalidFeeDragHorizonError,
} from '@shared/lib/economics/fee-drag-compiler';

describe('fee-drag compiler', () => {
  it('compiles a full-horizon fee tier to a 12dp annual rate', () => {
    const result = compileAnnualFeeDrag([feeTier({ rate: 0.02 })], { horizonYears: 10 });

    expect(result).toEqual({
      annualFeeDragPct: '0.020000000000',
      compilerVersion: 'fee-drag-compiler/1.0.0',
    });
  });

  it('computes the time-weighted average of step-down tiers', () => {
    const result = compileAnnualFeeDrag(
      [
        feeTier({ id: 'fee-tier-1', rate: 0.02, startYear: 1, endYear: 5 }),
        feeTier({ id: 'fee-tier-2', rate: 0.015, startYear: 6, endYear: 10 }),
      ],
      { horizonYears: 10 }
    );

    expect(result.annualFeeDragPct).toBe('0.017500000000');
  });

  it('uses the last matching tier in array order when tiers overlap', () => {
    const firstTier = feeTier({ id: 'fee-tier-1', rate: 0.01 });
    const secondTier = feeTier({ id: 'fee-tier-2', rate: 0.03 });

    expect(
      compileAnnualFeeDrag([firstTier, secondTier], { horizonYears: 1 }).annualFeeDragPct
    ).toBe('0.030000000000');
    expect(
      compileAnnualFeeDrag([secondTier, firstTier], { horizonYears: 1 }).annualFeeDragPct
    ).toBe('0.010000000000');
  });

  it('treats years without a matching tier as zero rate', () => {
    const result = compileAnnualFeeDrag([feeTier({ rate: 0.03, startYear: 2, endYear: 2 })], {
      horizonYears: 3,
    });

    expect(result.annualFeeDragPct).toBe('0.010000000000');
  });

  it('returns the same rate for repeated compilation of the same input', () => {
    const tiers = [
      feeTier({ id: 'fee-tier-1', rate: 0.02, endYear: 2 }),
      feeTier({ id: 'fee-tier-2', rate: 0.015, startYear: 3 }),
    ];

    const first = compileAnnualFeeDrag(tiers, { horizonYears: 5 });
    const second = compileAnnualFeeDrag(tiers, { horizonYears: 5 });

    expect(second).toEqual(first);
  });

  it('returns a 12dp rate within the inclusive ratio range', () => {
    const result = compileAnnualFeeDrag([feeTier({ rate: 1 })], { horizonYears: 1 });

    expect(result.annualFeeDragPct).toBe('1.000000000000');
    expect(result.annualFeeDragPct).toMatch(/^(?:0\.\d{12}|1\.0{12})$/);
  });

  it.each([undefined, []] as const)('rejects an absent fee profile', (tiers) => {
    let thrown: unknown;

    try {
      compileAnnualFeeDrag(tiers, { horizonYears: 10 });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FeeProfileAbsentError);
    expect(thrown).toMatchObject({ code: 'FEE_PROFILE_ABSENT' });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a non-positive-integer horizon of %s',
    (horizonYears) => {
      let thrown: unknown;

      try {
        compileAnnualFeeDrag([feeTier()], { horizonYears });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InvalidFeeDragHorizonError);
      expect(thrown).toMatchObject({ code: 'INVALID_FEE_DRAG_HORIZON' });
    }
  );
});

function feeTier(overrides: Partial<EconomicsFeeTierV1> = {}): EconomicsFeeTierV1 {
  return {
    id: 'fee-tier-1',
    name: 'Management fee',
    rate: 0.02,
    basis: 'committed_capital',
    startYear: 1,
    ...overrides,
  };
}
