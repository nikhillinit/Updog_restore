import { describe, it, expect } from 'vitest';
import { applyWaterfallChange, changeWaterfallType, isAmerican, isEuropean } from '../waterfall';
import { WaterfallSchema, type Waterfall } from '@shared/types';

describe('Waterfall type guards', () => {
  it('isAmerican identifies AMERICAN waterfall correctly', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    expect(isAmerican(american)).toBe(true);
    expect(isEuropean(american)).toBe(false);
  });

  it('isEuropean identifies EUROPEAN waterfall correctly', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    expect(isEuropean(european)).toBe(true);
    expect(isAmerican(european)).toBe(false);
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

  it('allows hurdle field on EUROPEAN waterfall', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    const result = applyWaterfallChange(european, 'hurdle', 0.12);
    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(0.12);
    }
  });
});

describe('applyWaterfallChange - Value clamping', () => {
  it('clamps hurdle to [0, 1] range (upper bound)', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    const result = applyWaterfallChange(european, 'hurdle', 1.5);
    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(1.0); // Clamped to max
    }
  });

  it('clamps hurdle to [0, 1] range (lower bound)', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    const result = applyWaterfallChange(european, 'hurdle', -0.5);
    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(0.0); // Clamped to min
    }
  });

  it('clamps catchUp to [0, 1] range', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    const result = applyWaterfallChange(european, 'catchUp', 2.0);
    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.catchUp).toBe(1.0); // Clamped to max
    }
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

describe('applyWaterfallChange - Type switching', () => {
  it('switches AMERICAN to EUROPEAN with default hurdle/catchUp', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 1, vestingYears: 4 }
    };
    const result = applyWaterfallChange(american, 'type', 'EUROPEAN');
    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(0.08);
      expect(result.catchUp).toBe(0.08);
      expect(result.carryVesting).toEqual({ cliffYears: 1, vestingYears: 4 });
    }
  });

  it('switches EUROPEAN to AMERICAN and strips hurdle/catchUp', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 2, vestingYears: 5 },
      hurdle: 0.12,
      catchUp: 0.15
    };
    const result = applyWaterfallChange(european, 'type', 'AMERICAN');
    expect(result.type).toBe('AMERICAN');
    expect(result).toEqual({
      type: 'AMERICAN',
      carryVesting: { cliffYears: 2, vestingYears: 5 }
    });
    // Verify hurdle/catchUp are NOT present
    expect('hurdle' in result).toBe(false);
    expect('catchUp' in result).toBe(false);
  });
});

describe('applyWaterfallChange - Immutability', () => {
  it('returns a new object, not mutating the original', () => {
    const original: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    const result = applyWaterfallChange(original, 'hurdle', 0.10);

    expect(result).not.toBe(original); // Different object reference
    expect(original.type).toBe('EUROPEAN');
    if (original.type === 'EUROPEAN') {
      expect(original.hurdle).toBe(0.08); // Original unchanged
    }
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(0.10); // New value
    }
  });
});

describe('changeWaterfallType - Schema-backed switching', () => {
  it('validates with schema when switching to EUROPEAN', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = changeWaterfallType(american, 'EUROPEAN');

    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(0.08); // Schema default
      expect(result.catchUp).toBe(0.08); // Schema default
      expect(result.carryVesting).toEqual({ cliffYears: 0, vestingYears: 4 });
    }
  });

  it('preserves existing values when already EUROPEAN', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 1, vestingYears: 5 },
      hurdle: 0.12,
      catchUp: 0.10
    };
    const result = changeWaterfallType(european, 'EUROPEAN');

    expect(result).toEqual(european); // Same values
  });

  it('drops EUROPEAN-only keys when switching to AMERICAN', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.20,
      catchUp: 0.15
    };
    const result = changeWaterfallType(european, 'AMERICAN');

    expect(result.type).toBe('AMERICAN');
    expect(result.carryVesting).toEqual({ cliffYears: 0, vestingYears: 4 });
    // Verify hurdle/catchUp are NOT present
    expect('hurdle' in result).toBe(false);
    expect('catchUp' in result).toBe(false);
  });

  it('no-ops when switching AMERICAN to AMERICAN (returns same reference)', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 2, vestingYears: 5 }
    };
    const result = changeWaterfallType(american, 'AMERICAN');

    expect(result).toBe(american); // Exact same reference (performance optimization)
  });

  it('no-ops when switching EUROPEAN to EUROPEAN (returns same reference)', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 1, vestingYears: 4 },
      hurdle: 0.08,
      catchUp: 0.08
    };
    const result = changeWaterfallType(european, 'EUROPEAN');

    expect(result).toBe(european); // Exact same reference
  });
});

describe('applyWaterfallChange - Overload behavior', () => {
  it('blocks hurdle field on AMERICAN waterfall', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(american, 'hurdle', 0.5);

    expect(result).toEqual(american); // Unchanged
  });

  it('clamps hurdle to [0,1] on EUROPEAN waterfall', () => {
    const european: Waterfall = {
      type: 'EUROPEAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 },
      hurdle: 0.10,
      catchUp: 0.10
    };
    const result = applyWaterfallChange(european, 'hurdle', 2.0);

    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(1.0); // Clamped to max
    }
  });

  it('routes type field to changeWaterfallType (schema-backed)', () => {
    const american: Waterfall = {
      type: 'AMERICAN',
      carryVesting: { cliffYears: 0, vestingYears: 4 }
    };
    const result = applyWaterfallChange(american, 'type', 'EUROPEAN');

    expect(result.type).toBe('EUROPEAN');
    if (result.type === 'EUROPEAN') {
      expect(result.hurdle).toBe(0.08); // Schema default via changeWaterfallType
      expect(result.catchUp).toBe(0.08);
    }
  });
});
