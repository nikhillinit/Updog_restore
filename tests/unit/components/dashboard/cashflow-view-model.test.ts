import { describe, expect, it } from 'vitest';

import { currentMonthKey, currentMonthNetFlow } from '@/components/dashboard/cashflow-view-model';

const now = new Date(2026, 8, 15); // local September 2026

describe('currentMonthKey', () => {
  it('zero-pads the local month', () => {
    expect(currentMonthKey(now)).toBe('2026-09');
    expect(currentMonthKey(new Date(2026, 10, 1))).toBe('2026-11');
  });
});

describe('currentMonthNetFlow', () => {
  it('returns the current month bucket, not the prior month or the running net', () => {
    const byMonth = [
      { month: '2026-08', netFlow: -4_000_000 },
      { month: '2026-09', netFlow: 1_250_000 },
    ];
    expect(currentMonthNetFlow(byMonth, now)).toBe(1_250_000);
  });

  it('returns null when no bucket exists for the current month', () => {
    expect(currentMonthNetFlow([{ month: '2026-08', netFlow: -4_000_000 }], now)).toBeNull();
    expect(currentMonthNetFlow([], now)).toBeNull();
  });
});
