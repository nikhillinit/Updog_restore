import { describe, expect, it } from 'vitest';
import { analyzeDistributionVariances } from '../../../../server/services/variance-tracking/distribution-variance';

describe('distribution variance helpers', () => {
  it('computes delta, deltaPct, and count shares for matching keys', () => {
    const result = analyzeDistributionVariances(
      { Technology: 5, Healthcare: 3 },
      { Technology: 4, Healthcare: 2 }
    );

    expect(result.Technology).toMatchObject({
      current: 5,
      baseline: 4,
      delta: 1,
      deltaPct: 0.25,
    });
    expect(result.Technology.currentCountShare).toBeCloseTo(5 / 8, 10);
    expect(result.Technology.baselineCountShare).toBeCloseTo(4 / 6, 10);
    expect(result.Technology.countShareDelta).toBeCloseTo(5 / 8 - 4 / 6, 10);
    expect(result.Technology.countShareDeltaPct).toBeCloseTo((5 / 8 - 4 / 6) / (4 / 6), 10);

    expect(result.Healthcare).toMatchObject({
      current: 3,
      baseline: 2,
      delta: 1,
      deltaPct: 0.5,
    });
    expect(result.Healthcare.currentCountShare).toBeCloseTo(3 / 8, 10);
    expect(result.Healthcare.baselineCountShare).toBeCloseTo(2 / 6, 10);
  });

  it('handles keys only in current with baseline 0 and null deltaPct', () => {
    const result = analyzeDistributionVariances(
      { Technology: 3, 'Clean Energy': 2 },
      { Technology: 3 }
    );

    expect(result['Clean Energy']).toMatchObject({
      current: 2,
      baseline: 0,
      delta: 2,
      deltaPct: null,
    });
    expect(result['Clean Energy'].currentCountShare).toBeCloseTo(2 / 5, 10);
    expect(result['Clean Energy'].baselineCountShare).toBe(0);
    expect(result['Clean Energy'].countShareDelta).toBeCloseTo(2 / 5, 10);
    expect(result['Clean Energy'].countShareDeltaPct).toBeNull();
    expect(result.Technology.delta).toBe(0);
  });

  it('handles keys only in baseline with current 0 and deltaPct -1 where applicable', () => {
    const result = analyzeDistributionVariances({ Technology: 3 }, { Technology: 3, Consumer: 2 });

    expect(result.Consumer).toMatchObject({
      current: 0,
      baseline: 2,
      delta: -2,
      deltaPct: -1,
    });
    expect(result.Consumer.currentCountShare).toBe(0);
    expect(result.Consumer.baselineCountShare).toBeCloseTo(2 / 5, 10);
    expect(result.Consumer.countShareDelta).toBeCloseTo(-2 / 5, 10);
    expect(result.Consumer.countShareDeltaPct).toBe(-1);
  });

  it('returns an empty object for empty inputs', () => {
    expect(analyzeDistributionVariances({}, {})).toEqual({});
  });
});
