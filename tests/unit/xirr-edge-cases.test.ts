import { describe, expect, it, vi } from 'vitest';
import { serialDayUtc, xirrNewtonBisection } from '@shared/lib/finance/xirr';

describe('xirr edge cases', () => {
  it('serialDayUtc is pure w.r.t. local Date getters (regression for #1256)', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const fy = vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(1999);
    const mo = vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
    const da = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1);

    const result = serialDayUtc(date);

    fy.mockRestore();
    mo.mockRestore();
    da.mockRestore();

    expect(result).toBe(Date.UTC(2024, 0, 1) / (24 * 60 * 60 * 1000));
  });

  it('returns the expected serial day for an ordinary UTC date', () => {
    expect(serialDayUtc(new Date('2024-01-01T00:00:00.000Z'))).toBe(19_723);
  });

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
