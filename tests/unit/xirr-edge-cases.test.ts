import { describe, expect, it } from 'vitest';
import { xirrNewtonBisection } from '@/lib/finance/xirr';

describe('xirr edge cases', () => {
  it('clamps guesses below -100% and still converges to the valid root', () => {
    const result = xirrNewtonBisection(
      [
        { date: new Date('2024-01-01T00:00:00Z'), amount: -100 },
        { date: new Date('2024-07-01T00:00:00Z'), amount: 10 },
      ],
      -1.5
    );

    expect(result.converged).toBe(true);
    expect(result.irr).not.toBeNull();
    expect(result.irr!).toBeGreaterThan(-1);
  });

  it('returns null when same-day cash flows have no zero crossing', () => {
    const result = xirrNewtonBisection(
      [
        { date: new Date('2024-01-01T00:00:00Z'), amount: -1000 },
        { date: new Date('2024-01-01T00:00:00Z'), amount: 999.99999999 },
      ],
      0.1,
      1e-12,
      20
    );

    expect(result.converged).toBe(false);
    expect(result.irr).toBeNull();
  });
});
