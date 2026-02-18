/**
 * Tests for Safe XIRR Wrapper Functions
 *
 * Validates that safeXIRR handles all error conditions gracefully
 * without throwing exceptions.
 */

import { describe, it, expect } from 'vitest';
import { safeXIRR } from '@/lib/finance/xirr';
import type { CashFlowEvent } from '@/lib/finance/xirr';

describe('Safe XIRR Wrappers', () => {
  describe('safeXIRR', () => {
    it('returns irr: null on insufficient cashflows (< 2)', () => {
      const emptyCashFlows: CashFlowEvent[] = [];
      const result1 = safeXIRR(emptyCashFlows);

      expect(result1.irr).toBe(null);
      expect(result1.converged).toBe(false);

      const singleCashFlow: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
      ];
      const result2 = safeXIRR(singleCashFlow);

      expect(result2.irr).toBe(null);
      expect(result2.converged).toBe(false);
    });

    it('returns irr: null when all cashflows have same sign', () => {
      const allNegative: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
        { date: '2021-01-01', amount: -50000, type: 'capital_call' },
        { date: '2022-01-01', amount: -25000, type: 'capital_call' },
      ];
      const result1 = safeXIRR(allNegative);

      expect(result1.irr).toBe(null);
      expect(result1.converged).toBe(false);

      const allPositive: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 100000, type: 'distribution' },
        { date: '2021-01-01', amount: 50000, type: 'distribution' },
        { date: '2022-01-01', amount: 25000, type: 'distribution' },
      ];
      const result2 = safeXIRR(allPositive);

      expect(result2.irr).toBe(null);
      expect(result2.converged).toBe(false);

      const allZero: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 0, type: 'distribution' },
        { date: '2021-01-01', amount: 0, type: 'distribution' },
      ];
      const result3 = safeXIRR(allZero);

      expect(result3.irr).toBe(null);
      expect(result3.converged).toBe(false);
    });

    it('never throws exception under any circumstance', () => {
      const invalidDates: CashFlowEvent[] = [
        { date: 'not-a-date', amount: -100000, type: 'capital_call' },
        { date: '2021-01-01', amount: 50000, type: 'distribution' },
      ];
      expect(() => safeXIRR(invalidDates)).not.toThrow();

      expect(() => safeXIRR([])).not.toThrow();

      const sameSign: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 100, type: 'distribution' },
        { date: '2021-01-01', amount: 200, type: 'distribution' },
      ];
      expect(() => safeXIRR(sameSign)).not.toThrow();

      const pathological: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -1e10, type: 'capital_call' },
        { date: '2020-01-02', amount: 1e-10, type: 'distribution' },
      ];
      expect(() => safeXIRR(pathological)).not.toThrow();

      const extremeValues: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -Number.MAX_SAFE_INTEGER, type: 'capital_call' },
        { date: '2020-01-02', amount: 1, type: 'distribution' },
      ];
      expect(() => safeXIRR(extremeValues)).not.toThrow();
    });

    it('returns irr: null or error on failure cases', () => {
      // Insufficient cashflows
      const insufficient: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
      ];
      const result1 = safeXIRR(insufficient);
      expect(result1.irr).toBe(null);
      expect(result1.converged).toBe(false);

      // Same sign
      const sameSign: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 100, type: 'distribution' },
        { date: '2021-01-01', amount: 200, type: 'distribution' },
      ];
      const result2 = safeXIRR(sameSign);
      expect(result2.irr).toBe(null);
      expect(result2.converged).toBe(false);

      // Invalid date -- should return error
      const invalidDate: CashFlowEvent[] = [
        { date: 'invalid-date', amount: -100, type: 'capital_call' },
        { date: '2021-01-01', amount: 200, type: 'distribution' },
      ];
      const result3 = safeXIRR(invalidDate);
      expect(result3.irr).toBe(null);
      expect(result3.converged).toBe(false);
    });

    it('returns successful result with valid cashflows', () => {
      const validCashFlows: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
        { date: '2021-06-15', amount: 25000, type: 'distribution' },
        { date: '2023-12-31', amount: 120000, type: 'distribution' },
      ];

      const result = safeXIRR(validCashFlows);

      expect(result.irr).not.toBe(null);
      expect(typeof result.irr).toBe('number');
      expect(result.converged).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.irr).toBeGreaterThan(0);
      expect(result.irr).toBeLessThan(1);
    });
  });

  describe('safeXIRR: undefined/null input handling', () => {
    it('handles undefined/null inputs gracefully', () => {
      // @ts-expect-error - Testing runtime behavior with invalid types
      expect(() => safeXIRR(undefined)).not.toThrow();
      // @ts-expect-error - Testing runtime behavior with invalid types
      expect(() => safeXIRR(null)).not.toThrow();

      // @ts-expect-error - Testing runtime behavior with invalid types
      const xirrResult = safeXIRR(undefined);
      expect(xirrResult.irr).toBe(null);
      expect(xirrResult.converged).toBe(false);
    });

    it('handles cashflows with undefined/null values', () => {
      const problematicCashFlows: any[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
        null,
        { date: '2021-01-01', amount: 50000, type: 'distribution' },
        undefined,
      ];

      expect(() => safeXIRR(problematicCashFlows as CashFlowEvent[])).not.toThrow();

      const result = safeXIRR(problematicCashFlows as CashFlowEvent[]);
      expect(result.irr).toBe(null);
      expect(result.converged).toBe(false);
    });
  });
});
