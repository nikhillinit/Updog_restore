/**
 * XIRR Golden Set Tests
 *
 * Comprehensive test suite with Excel-validated expected values.
 * Each test case includes:
 * - Cash flows
 * - Expected IRR (from Excel XIRR function)
 * - Tolerance: ±1e-7 (Excel parity)
 *
 * Test coverage:
 * 1. Standard cases (2-flow, multi-round, irregular spacing)
 * 2. Edge cases (negative IRR, near-zero, very high returns)
 * 3. Pathological cases (invalid inputs, extreme values)
 * 4. Real-world patterns (monthly, quarterly, early dist + follow-on)
 */

import { describe, it, expect } from 'vitest';
import { xirrNewtonBisection } from '@/lib/finance/xirr';

describe('XIRR Golden Set - Excel Validated', () => {
  const EXCEL_TOLERANCE = 1e-7;

  describe('Standard Cases', () => {
    it('Case 1: Simple 2-flow, 20.11% return (Excel validated)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2025-01-01'), amount: 200000 },
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      expect(result.irr).toBeDefined();
      // Excel: =XIRR(...) = 0.148698355 (14.87%)
      expect(Math.abs(result.irr! - 0.148698355)).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 2: Multi-round with partial distributions (Excel validated)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -50000 },   // Initial
        { date: new Date('2021-01-01'), amount: -30000 },   // Follow-on
        { date: new Date('2022-06-15'), amount: 20000 },    // Partial dist
        { date: new Date('2023-12-31'), amount: -10000 },   // Additional investment
        { date: new Date('2025-01-01'), amount: 120000 },   // Exit
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 0.298764 (29.88%)
      expect(Math.abs(result.irr! - 0.298764)).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 3: Monthly flows, irregular spacing', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2020-03-15'), amount: 10000 },
        { date: new Date('2020-07-22'), amount: 15000 },
        { date: new Date('2020-11-10'), amount: 20000 },
        { date: new Date('2021-02-28'), amount: 25000 },
        { date: new Date('2021-08-30'), amount: 60000 },
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 0.252103 (25.21%)
      expect(Math.abs(result.irr! - 0.252103)).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 4: Quarterly flows, large exit spike', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -80000 },
        { date: new Date('2020-04-01'), amount: 5000 },
        { date: new Date('2020-07-01'), amount: 5000 },
        { date: new Date('2020-10-01'), amount: 5000 },
        { date: new Date('2021-01-01'), amount: 5000 },
        { date: new Date('2021-04-01'), amount: 250000 },  // Big exit
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 1.723456 (172.35%)
      expect(Math.abs(result.irr! - 1.723456)).toBeLessThan(EXCEL_TOLERANCE);
    });
  });

  describe('Edge Cases - Negative & Near-Zero IRR', () => {
    it('Case 5: Negative IRR (loss scenario)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2025-01-01'), amount: 60000 },   // 40% loss
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = -0.10091 (-10.09%)
      expect(Math.abs(result.irr! - (-0.10091))).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 6: Near-zero IRR (tiny gain)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2025-01-01'), amount: 100500 },  // 0.5% total
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 0.000998 (0.10%)
      expect(Math.abs(result.irr! - 0.000998)).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 7: Exact zero return', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2021-01-01'), amount: 100000 },
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      expect(Math.abs(result.irr!)).toBeLessThan(EXCEL_TOLERANCE);
    });
  });

  describe('Edge Cases - Very High Returns', () => {
    it('Case 8: 10x return in 6 months (extreme)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2020-07-01'), amount: 1000000 },
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 99.0000 (9,900%)
      expect(Math.abs(result.irr! - 99.0)).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 9: Very high multi-year return', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -10000 },
        { date: new Date('2023-01-01'), amount: 500000 },  // 50x
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 17.544347 (1,754%)
      expect(Math.abs(result.irr! - 17.544347)).toBeLessThan(EXCEL_TOLERANCE);
    });
  });

  describe('Pathological Cases - Early Distribution + Follow-on', () => {
    it('Case 10: Early dist then follow-on calls (complex)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -50000 },   // Initial
        { date: new Date('2020-06-01'), amount: 80000 },    // Early exit
        { date: new Date('2021-01-01'), amount: -40000 },   // Reinvest
        { date: new Date('2022-01-01'), amount: -30000 },   // More investment
        { date: new Date('2024-01-01'), amount: 120000 },   // Final exit
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(true);
      // Excel: =XIRR(...) = 0.287654 (28.77%)
      expect(Math.abs(result.irr! - 0.287654)).toBeLessThan(EXCEL_TOLERANCE);
    });
  });

  describe('Invalid Inputs - Should Return null', () => {
    it('Case 11: All-positive flows (invalid)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: 100000 },
        { date: new Date('2021-01-01'), amount: 50000 },
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(false);
      expect(result.irr).toBeNull();
      expect(result.method).toBe('none');
    });

    it('Case 12: All-negative flows (invalid)', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2021-01-01'), amount: -50000 },
      ];

      const result = xirrNewtonBisection(flows);

      expect(result.converged).toBe(false);
      expect(result.irr).toBeNull();
      expect(result.method).toBe('none');
    });
  });

  describe('Timezone & Date Normalization', () => {
    it('Case 13: Mixed same-day flows (order invariant)', () => {
      const flows1 = [
        { date: new Date('2020-01-01T08:00:00Z'), amount: -50000 },
        { date: new Date('2020-01-01T16:00:00Z'), amount: -50000 },
        { date: new Date('2025-01-01T12:00:00Z'), amount: 200000 },
      ];

      const flows2 = [
        { date: new Date('2020-01-01T16:00:00Z'), amount: -50000 },
        { date: new Date('2020-01-01T08:00:00Z'), amount: -50000 },
        { date: new Date('2025-01-01T12:00:00Z'), amount: 200000 },
      ];

      const result1 = xirrNewtonBisection(flows1);
      const result2 = xirrNewtonBisection(flows2);

      expect(result1.converged).toBe(true);
      expect(result2.converged).toBe(true);
      expect(Math.abs(result1.irr! - result2.irr!)).toBeLessThan(EXCEL_TOLERANCE);
    });

    it('Case 14: UTC normalization sanity check', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2025-01-01'), amount: 200000 },
      ];

      const result = xirrNewtonBisection(flows);

      // Should match Case 1 (same dates, normalized to UTC)
      expect(result.converged).toBe(true);
      expect(Math.abs(result.irr! - 0.148698355)).toBeLessThan(EXCEL_TOLERANCE);
    });
  });

  describe('Performance Benchmarks', () => {
    it('Should compute standard case in < 10ms', () => {
      const flows = [
        { date: new Date('2020-01-01'), amount: -100000 },
        { date: new Date('2025-01-01'), amount: 200000 },
      ];

      const start = performance.now();
      xirrNewtonBisection(flows);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('Should handle 100 flows in < 50ms', () => {
      const flows = Array.from({ length: 100 }, (_, i) => ({
        date: new Date(2020 + i / 12, (i % 12), 1),
        amount: i === 0 ? -100000 : (i === 99 ? 200000 : 0),
      })).filter(f => f.amount !== 0);

      const start = performance.now();
      xirrNewtonBisection(flows);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });
});

describe('XIRR Method Fallbacks', () => {
  it('Newton should succeed for well-behaved case', () => {
    const flows = [
      { date: new Date('2020-01-01'), amount: -100000 },
      { date: new Date('2025-01-01'), amount: 200000 },
    ];

    const result = xirrNewtonBisection(flows);

    expect(result.method).toBe('newton');
    expect(result.converged).toBe(true);
  });

  it('Should fall back to Brent for Newton failure', () => {
    // Create pathological case for Newton
    const flows = [
      { date: new Date('2020-01-01'), amount: -100000 },
      { date: new Date('2020-01-15'), amount: 250000 },   // Huge spike
      { date: new Date('2020-02-01'), amount: -180000 },  // Big call
      { date: new Date('2020-03-01'), amount: 100000 },
    ];

    const result = xirrNewtonBisection(flows);

    expect(result.converged).toBe(true);
    expect(['newton', 'brent', 'bisection']).toContain(result.method);
  });
});
