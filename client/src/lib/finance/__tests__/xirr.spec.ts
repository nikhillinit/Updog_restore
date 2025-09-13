import { describe, test, expect } from 'vitest';
import { xirr } from '../xirr';
import cases from './fixtures/xirr-cases.json';

describe('XIRR Golden Vectors', () => {
  (test as any).each(cases)('$name', ({ cfs, expected }: any) => {
    const cashFlows = cfs.map(({ d, a }: any) => ({
      date: new Date(d),
      amount: a
    }));

    const result = xirr(cashFlows);

    if (expected === null) {
      expect(result).toBeNull();
    } else {
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(expected, 4);
    }
  });

  test('handles empty cash flows', () => {
    expect(xirr([])).toBeNull();
  });

  test('handles single cash flow', () => {
    expect(xirr([{ date: new Date('2024-01-01'), amount: 1000 }])).toBeNull();
  });

  test('handles all zero amounts', () => {
    expect(xirr([
      { date: new Date('2024-01-01'), amount: 0 },
      { date: new Date('2024-12-31'), amount: 0 }
    ])).toBeNull();
  });
});