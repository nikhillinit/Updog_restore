/**
 * Tests for Safe XIRR Wrapper Functions
 *
 * Validates that safeCalculateXIRR and safeCalculateSimpleIRR handle
 * all error conditions gracefully without throwing exceptions.
 */

import { describe, it, expect } from 'vitest';
import { safeCalculateXIRR, safeCalculateSimpleIRR } from '@/core/selectors/xirr';
import type { CashFlowEvent } from '@/core/types/fund-domain';

describe('Safe XIRR Wrappers', () => {
  describe('safeCalculateXIRR', () => {
    it('returns rate: null on insufficient cashflows (< 2)', () => {
      // Test with 0 cashflows
      const emptyCashFlows: CashFlowEvent[] = [];
      const result1 = safeCalculateXIRR(emptyCashFlows);

      expect(result1.rate).toBe(null);
      expect(result1.converged).toBe(false);
      expect(result1.error).toBeDefined();
      expect(result1.error).toContain('At least 2 cash flows required');

      // Test with 1 cashflow
      const singleCashFlow: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
      ];
      const result2 = safeCalculateXIRR(singleCashFlow);

      expect(result2.rate).toBe(null);
      expect(result2.converged).toBe(false);
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain('At least 2 cash flows required');
    });

    it('returns rate: null when all cashflows have same sign', () => {
      // All negative
      const allNegative: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
        { date: '2021-01-01', amount: -50000, type: 'capital_call' },
        { date: '2022-01-01', amount: -25000, type: 'capital_call' },
      ];
      const result1 = safeCalculateXIRR(allNegative);

      expect(result1.rate).toBe(null);
      expect(result1.converged).toBe(false);
      expect(result1.error).toBeDefined();
      expect(result1.error).toContain('at least one positive and one negative');

      // All positive
      const allPositive: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 100000, type: 'distribution' },
        { date: '2021-01-01', amount: 50000, type: 'distribution' },
        { date: '2022-01-01', amount: 25000, type: 'distribution' },
      ];
      const result2 = safeCalculateXIRR(allPositive);

      expect(result2.rate).toBe(null);
      expect(result2.converged).toBe(false);
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain('at least one positive and one negative');

      // All zero (edge case)
      const allZero: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 0, type: 'distribution' },
        { date: '2021-01-01', amount: 0, type: 'distribution' },
      ];
      const result3 = safeCalculateXIRR(allZero);

      expect(result3.rate).toBe(null);
      expect(result3.converged).toBe(false);
      expect(result3.error).toBeDefined();
    });

    it('never throws exception under any circumstance', () => {
      // Test various error conditions - none should throw

      // Invalid dates
      const invalidDates: CashFlowEvent[] = [
        { date: 'not-a-date', amount: -100000, type: 'capital_call' },
        { date: '2021-01-01', amount: 50000, type: 'distribution' },
      ];
      expect(() => safeCalculateXIRR(invalidDates)).not.toThrow();

      // Empty array
      expect(() => safeCalculateXIRR([])).not.toThrow();

      // Same sign
      const sameSign: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 100, type: 'distribution' },
        { date: '2021-01-01', amount: 200, type: 'distribution' },
      ];
      expect(() => safeCalculateXIRR(sameSign)).not.toThrow();

      // Pathological inputs that might cause convergence issues
      const pathological: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -1e10, type: 'capital_call' },
        { date: '2020-01-02', amount: 1e-10, type: 'distribution' },
      ];
      expect(() => safeCalculateXIRR(pathological)).not.toThrow();

      // Non-converging scenario with extreme values
      const extremeValues: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -Number.MAX_SAFE_INTEGER, type: 'capital_call' },
        { date: '2020-01-02', amount: 1, type: 'distribution' },
      ];
      expect(() => safeCalculateXIRR(extremeValues)).not.toThrow();
    });

    it('populates error field with descriptive message on failure', () => {
      // Test insufficient cashflows
      const insufficient: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
      ];
      const result1 = safeCalculateXIRR(insufficient);

      expect(result1.error).toBeDefined();
      expect(typeof result1.error).toBe('string');
      expect(result1.error!.length).toBeGreaterThan(0);
      expect(result1.error).toContain('At least 2 cash flows required');

      // Test same sign
      const sameSign: CashFlowEvent[] = [
        { date: '2020-01-01', amount: 100, type: 'distribution' },
        { date: '2021-01-01', amount: 200, type: 'distribution' },
      ];
      const result2 = safeCalculateXIRR(sameSign);

      expect(result2.error).toBeDefined();
      expect(typeof result2.error).toBe('string');
      expect(result2.error).toContain('positive and one negative');

      // Test invalid date
      const invalidDate: CashFlowEvent[] = [
        { date: 'invalid-date', amount: -100, type: 'capital_call' },
        { date: '2021-01-01', amount: 200, type: 'distribution' },
      ];
      const result3 = safeCalculateXIRR(invalidDate);

      expect(result3.error).toBeDefined();
      expect(typeof result3.error).toBe('string');
      expect(result3.error!.length).toBeGreaterThan(0);

      // Test convergence failure (pathological case)
      const nonConverging: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -1e15, type: 'capital_call' },
        { date: '2020-01-02', amount: 1, type: 'distribution' },
      ];
      const result4 = safeCalculateXIRR(nonConverging, { maxIterations: 5 });

      if (result4.error) {
        expect(typeof result4.error).toBe('string');
        expect(result4.error.length).toBeGreaterThan(0);
      }
    });

    it('returns successful result with valid cashflows', () => {
      // Verify the safe wrapper works for valid cases too
      const validCashFlows: CashFlowEvent[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
        { date: '2021-06-15', amount: 25000, type: 'distribution' },
        { date: '2023-12-31', amount: 120000, type: 'distribution' },
      ];

      const result = safeCalculateXIRR(validCashFlows);

      expect(result.rate).not.toBe(null);
      expect(typeof result.rate).toBe('number');
      expect(result.converged).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.rate).toBeGreaterThan(0); // Should be positive return
      expect(result.rate).toBeLessThan(1); // Should be reasonable (< 100%)
    });
  });

  describe('safeCalculateSimpleIRR', () => {
    it('returns null (not throw) for invalid inputs', () => {
      // Should not throw for any invalid input
      expect(() => safeCalculateSimpleIRR([])).not.toThrow();
      expect(() => safeCalculateSimpleIRR([100])).not.toThrow();
      expect(() => safeCalculateSimpleIRR([100, 200, 300])).not.toThrow();

      // Verify all return null
      expect(safeCalculateSimpleIRR([])).toBe(null);
      expect(safeCalculateSimpleIRR([100])).toBe(null);
      expect(safeCalculateSimpleIRR([100, 200, 300])).toBe(null);
    });

    it('returns null for arrays with < 2 elements', () => {
      // Empty array
      const result1 = safeCalculateSimpleIRR([]);
      expect(result1).toBe(null);

      // Single element
      const result2 = safeCalculateSimpleIRR([1000]);
      expect(result2).toBe(null);
    });

    it('returns null when all elements have same sign', () => {
      // All negative
      const allNegative = [-100, -50, -25];
      const result1 = safeCalculateSimpleIRR(allNegative);
      expect(result1).toBe(null);

      // All positive
      const allPositive = [100, 50, 25];
      const result2 = safeCalculateSimpleIRR(allPositive);
      expect(result2).toBe(null);

      // All zero
      const allZero = [0, 0, 0];
      const result3 = safeCalculateSimpleIRR(allZero);
      expect(result3).toBe(null);
    });

    it('returns valid IRR for valid inputs', () => {
      // Classic investment scenario: -100k investment, returns over 3 years
      const validCashFlows = [-100000, 30000, 30000, 60000];

      const result = safeCalculateSimpleIRR(validCashFlows);

      expect(result).not.toBe(null);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0); // Positive return
      expect(result).toBeLessThan(0.5); // Reasonable IRR (< 50%)
    });
  });

  describe('Safe wrappers: undefined/null input handling', () => {
    it('handles undefined/null inputs gracefully', () => {
      // safeCalculateXIRR with edge cases
      // @ts-expect-error - Testing runtime behavior with invalid types
      expect(() => safeCalculateXIRR(undefined)).not.toThrow();
      // @ts-expect-error - Testing runtime behavior with invalid types
      expect(() => safeCalculateXIRR(null)).not.toThrow();

      // safeCalculateSimpleIRR with edge cases
      // @ts-expect-error - Testing runtime behavior with invalid types
      expect(() => safeCalculateSimpleIRR(undefined)).not.toThrow();
      // @ts-expect-error - Testing runtime behavior with invalid types
      expect(() => safeCalculateSimpleIRR(null)).not.toThrow();

      // Verify they return null/safe defaults
      // @ts-expect-error - Testing runtime behavior with invalid types
      const xirrResult = safeCalculateXIRR(undefined);
      expect(xirrResult.rate).toBe(null);
      expect(xirrResult.converged).toBe(false);

      // @ts-expect-error - Testing runtime behavior with invalid types
      const irrResult = safeCalculateSimpleIRR(undefined);
      expect(irrResult).toBe(null);
    });

    it('handles cashflows with undefined/null values', () => {
      // CashFlowEvent array with problematic data
      const problematicCashFlows: any[] = [
        { date: '2020-01-01', amount: -100000, type: 'capital_call' },
        null,
        { date: '2021-01-01', amount: 50000, type: 'distribution' },
        undefined,
      ];

      // Should not throw
      expect(() => safeCalculateXIRR(problematicCashFlows as CashFlowEvent[])).not.toThrow();

      const result = safeCalculateXIRR(problematicCashFlows as CashFlowEvent[]);
      expect(result.rate).toBe(null); // Should fail gracefully
      expect(result.converged).toBe(false);

      // SimpleIRR with undefined/null elements
      const problematicNumbers: any[] = [-100, null, 50, undefined, 25];

      expect(() => safeCalculateSimpleIRR(problematicNumbers)).not.toThrow();
      const irrResult = safeCalculateSimpleIRR(problematicNumbers);
      // May return null or a number depending on how the calculation handles it
      // The key is it doesn't throw
      expect(typeof irrResult === 'number' || irrResult === null).toBe(true);
    });
  });
});
