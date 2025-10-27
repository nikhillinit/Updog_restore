import { describe, it, expect } from 'vitest';
import { applyWaterfallChange, isAmerican } from '../waterfall';
import { type Waterfall } from '@shared/types';

describe('Waterfall type guards', () => {
  it('isAmerican identifies AMERICAN waterfall correctly', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    expect(isAmerican(american)).toBe(true);
  });
});

describe('applyWaterfallChange - Field validation', () => {
  it('blocks hurdle field on AMERICAN waterfall', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(american, 'hurdle', 0.1);
    expect(result).toEqual(american); // Should return unchanged
  });

  it('blocks catchUp field on AMERICAN waterfall', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(american, 'catchUp', 0.2);
    expect(result).toEqual(american); // Should return unchanged
  });

});


describe('applyWaterfallChange - CarryVesting validation', () => {
  it('clamps cliffYears to [0, 10] range', () => {
    const waterfall: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(waterfall, 'carryVesting', {
      cliffYears: 15,
      vestingYears: 4
    });
    expect(result.carryVesting.cliffYears).toBe(10); // Clamped to max
  });

  it('clamps vestingYears to [1, 10] range (lower bound)', () => {
    const waterfall: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(waterfall, 'carryVesting', {
      cliffYears: 0,
      vestingYears: 0
    });
    expect(result.carryVesting.vestingYears).toBe(1); // Clamped to min
  });

  it('truncates decimal values for cliffYears', () => {
    const waterfall: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(waterfall, 'carryVesting', {
      cliffYears: 2.7,
      vestingYears: 4
    });
    expect(result.carryVesting.cliffYears).toBe(2); // Truncated
  });
});


describe('applyWaterfallChange - Immutability', () => {
  it('returns a new object, not mutating the original', () => {
    const original: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(original, 'carryVesting', {
      cliffYears: 2,
      vestingYears: 5
    });

    expect(result).not.toBe(original); // Different object reference
    expect(original.carryVesting).toEqual({ cliffYears: 0, vestingYears: 4 }); // Original unchanged
    expect(result.carryVesting).toEqual({ cliffYears: 2, vestingYears: 5 }); // New value
  });
});
