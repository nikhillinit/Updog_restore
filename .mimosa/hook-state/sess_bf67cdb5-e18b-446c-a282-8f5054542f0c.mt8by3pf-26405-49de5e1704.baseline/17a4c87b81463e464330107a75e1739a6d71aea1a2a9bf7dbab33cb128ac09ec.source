import { describe, expect, it } from 'vitest';
import { calculateCanonicalIrr, type CashFlow } from '@shared/lib/finance/xirr';

describe('calculateCanonicalIrr', () => {
  it('returns null for fewer than two meaningful cashflows', () => {
    const cashflows: CashFlow[] = [{ date: new Date('2024-01-01'), amount: -100 }];
    expect(calculateCanonicalIrr(cashflows)).toBeNull();
  });

  it('returns null when there are no contributions', () => {
    const cashflows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: 50 },
      { date: new Date('2024-06-01'), amount: 75 },
    ];
    expect(calculateCanonicalIrr(cashflows)).toBeNull();
  });

  it('returns null when there are no returns', () => {
    const cashflows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: -100 },
      { date: new Date('2024-06-01'), amount: -50 },
    ];
    expect(calculateCanonicalIrr(cashflows)).toBeNull();
  });

  it('filters zero and non-finite cashflows before validating the series', () => {
    const cashflows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: 0 },
      { date: new Date('2024-06-01'), amount: Number.NaN },
      { date: new Date('2024-12-01'), amount: -100 },
    ];
    expect(calculateCanonicalIrr(cashflows)).toBeNull();
  });

  it('returns a finite annualized rate for a standard contribution and return pair', () => {
    const cashflows: CashFlow[] = [
      { date: new Date('2024-01-01'), amount: -1000 },
      { date: new Date('2025-01-01'), amount: 1200 },
    ];

    const result = calculateCanonicalIrr(cashflows);

    expect(result).not.toBeNull();
    expect(Number.isFinite(result as number)).toBe(true);
    expect(result).toBeGreaterThan(0.18);
    expect(result).toBeLessThan(0.22);
  });
});
