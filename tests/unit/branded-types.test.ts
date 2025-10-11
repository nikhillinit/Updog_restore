/**
 * COMPREHENSIVE TEST SUITE: Branded Types
 *
 * Tests for nominal branded types used in financial calculations.
 * Ensures type safety, validation, conversion, and arithmetic operations.
 *
 * Coverage areas:
 * - Branded type constructors (money, rate, percentage, multiple, etc.)
 * - Validation (error handling for invalid inputs)
 * - Unit conversions (rate ↔ percentage, years ↔ months, etc.)
 * - Type guards (isMoney, isRate, etc.)
 * - Arithmetic operations (multiply, divide, add, subtract, sum)
 * - Edge cases (zero, negative, infinity, NaN)
 */

import { describe, it, expect } from 'vitest';
import {
  // Type constructors
  money,
  rate,
  percentage,
  multiple,
  months,
  years,
  probability,
  // Unit conversions
  rateToPercentage,
  percentageToRate,
  yearsToMonths,
  monthsToYears,
  moneyToCents,
  centsToMoney,
  // Type guards
  isMoney,
  isRate,
  isPercentage,
  isMultiple,
  isProbability,
  // Arithmetic operations
  multiplyMoneyByRate,
  divideMoney,
  addMoney,
  subtractMoney,
  sumMoney,
  // Utility functions
  unsafeCast,
  rebrand,
  // Types
  type Money,
  type Rate,
  type Percentage,
  type Multiple,
  type Months,
  type Years,
  type Probability,
} from '@shared/types/branded-types';

// ============================================================================
// BRANDED TYPE CONSTRUCTORS
// ============================================================================

describe('Branded Type Constructors', () => {
  describe('money()', () => {
    it('should create valid Money from positive number', () => {
      const result = money(100_000_000);
      expect(result).toBe(100_000_000);
    });

    it('should create Money from zero', () => {
      const result = money(0);
      expect(result).toBe(0);
    });

    it('should create Money from decimal values', () => {
      const result = money(123.45);
      expect(result).toBe(123.45);
    });

    it('should throw error for negative values', () => {
      expect(() => money(-100)).toThrow('Invalid Money value: -100');
    });

    it('should throw error for NaN', () => {
      expect(() => money(NaN)).toThrow('Invalid Money value: NaN');
    });

    it('should throw error for Infinity', () => {
      expect(() => money(Infinity)).toThrow('Invalid Money value: Infinity');
    });

    it('should throw error for -Infinity', () => {
      expect(() => money(-Infinity)).toThrow('Invalid Money value: -Infinity');
    });
  });

  describe('rate()', () => {
    it('should create valid Rate from decimal', () => {
      const result = rate(0.02);
      expect(result).toBe(0.02);
    });

    it('should create Rate from zero', () => {
      const result = rate(0);
      expect(result).toBe(0);
    });

    it('should create Rate from 1.0', () => {
      const result = rate(1.0);
      expect(result).toBe(1.0);
    });

    it('should throw error for negative values', () => {
      expect(() => rate(-0.01)).toThrow('Invalid Rate value: -0.01');
    });

    it('should throw error for values > 1', () => {
      expect(() => rate(1.5)).toThrow('Invalid Rate value: 1.5');
    });

    it('should throw error for NaN', () => {
      expect(() => rate(NaN)).toThrow('Invalid Rate value: NaN');
    });

    it('should throw error for Infinity', () => {
      expect(() => rate(Infinity)).toThrow('Invalid Rate value: Infinity');
    });
  });

  describe('percentage()', () => {
    it('should create valid Percentage from number', () => {
      const result = percentage(25.5);
      expect(result).toBe(25.5);
    });

    it('should create Percentage from zero', () => {
      const result = percentage(0);
      expect(result).toBe(0);
    });

    it('should create Percentage from 100', () => {
      const result = percentage(100);
      expect(result).toBe(100);
    });

    it('should throw error for negative values', () => {
      expect(() => percentage(-10)).toThrow('Invalid Percentage value: -10');
    });

    it('should throw error for values > 100', () => {
      expect(() => percentage(150)).toThrow('Invalid Percentage value: 150');
    });

    it('should throw error for NaN', () => {
      expect(() => percentage(NaN)).toThrow('Invalid Percentage value: NaN');
    });
  });

  describe('multiple()', () => {
    it('should create valid Multiple from number', () => {
      const result = multiple(2.5);
      expect(result).toBe(2.5);
    });

    it('should create Multiple from zero', () => {
      const result = multiple(0);
      expect(result).toBe(0);
    });

    it('should create Multiple from large values', () => {
      const result = multiple(100.5);
      expect(result).toBe(100.5);
    });

    it('should throw error for negative values', () => {
      expect(() => multiple(-2.5)).toThrow('Invalid Multiple value: -2.5');
    });

    it('should throw error for NaN', () => {
      expect(() => multiple(NaN)).toThrow('Invalid Multiple value: NaN');
    });
  });

  describe('months()', () => {
    it('should create valid Months from integer', () => {
      const result = months(36);
      expect(result).toBe(36);
    });

    it('should create Months from zero', () => {
      const result = months(0);
      expect(result).toBe(0);
    });

    it('should throw error for non-integer values', () => {
      expect(() => months(36.5)).toThrow('Invalid Months value: 36.5');
    });

    it('should throw error for negative values', () => {
      expect(() => months(-12)).toThrow('Invalid Months value: -12');
    });
  });

  describe('years()', () => {
    it('should create valid Years from number', () => {
      const result = years(10);
      expect(result).toBe(10);
    });

    it('should create Years from decimal', () => {
      const result = years(5.5);
      expect(result).toBe(5.5);
    });

    it('should create Years from zero', () => {
      const result = years(0);
      expect(result).toBe(0);
    });

    it('should throw error for negative values', () => {
      expect(() => years(-5)).toThrow('Invalid Years value: -5');
    });
  });

  describe('probability()', () => {
    it('should create valid Probability from decimal', () => {
      const result = probability(0.3);
      expect(result).toBe(0.3);
    });

    it('should create Probability from zero', () => {
      const result = probability(0);
      expect(result).toBe(0);
    });

    it('should create Probability from 1.0', () => {
      const result = probability(1.0);
      expect(result).toBe(1.0);
    });

    it('should throw error for negative values', () => {
      expect(() => probability(-0.1)).toThrow('Invalid Probability value: -0.1');
    });

    it('should throw error for values > 1', () => {
      expect(() => probability(1.5)).toThrow('Invalid Probability value: 1.5');
    });
  });
});

// ============================================================================
// UNIT CONVERSIONS
// ============================================================================

describe('Unit Conversions', () => {
  describe('rateToPercentage()', () => {
    it('should convert rate to percentage', () => {
      const r = rate(0.02);
      const result = rateToPercentage(r);
      expect(result).toBe(2.0);
    });

    it('should convert zero rate', () => {
      const r = rate(0);
      const result = rateToPercentage(r);
      expect(result).toBe(0);
    });

    it('should convert 100% rate', () => {
      const r = rate(1.0);
      const result = rateToPercentage(r);
      expect(result).toBe(100);
    });

    it('should handle fractional rates', () => {
      const r = rate(0.025);
      const result = rateToPercentage(r);
      expect(result).toBe(2.5);
    });
  });

  describe('percentageToRate()', () => {
    it('should convert percentage to rate', () => {
      const p = percentage(2.0);
      const result = percentageToRate(p);
      expect(result).toBe(0.02);
    });

    it('should convert zero percentage', () => {
      const p = percentage(0);
      const result = percentageToRate(p);
      expect(result).toBe(0);
    });

    it('should convert 100%', () => {
      const p = percentage(100);
      const result = percentageToRate(p);
      expect(result).toBe(1.0);
    });

    it('should handle fractional percentages', () => {
      const p = percentage(2.5);
      const result = percentageToRate(p);
      expect(result).toBe(0.025);
    });

    it('should round-trip with rateToPercentage', () => {
      const originalRate = rate(0.15);
      const pct = rateToPercentage(originalRate);
      const backToRate = percentageToRate(pct);
      expect(backToRate).toBe(0.15);
    });
  });

  describe('yearsToMonths()', () => {
    it('should convert years to months', () => {
      const y = years(10);
      const result = yearsToMonths(y);
      expect(result).toBe(120);
    });

    it('should convert zero years', () => {
      const y = years(0);
      const result = yearsToMonths(y);
      expect(result).toBe(0);
    });

    it('should round fractional months', () => {
      const y = years(5.5);
      const result = yearsToMonths(y);
      expect(result).toBe(66); // 5.5 * 12 = 66
    });

    it('should handle decimal years with rounding', () => {
      const y = years(0.1); // 1.2 months
      const result = yearsToMonths(y);
      expect(result).toBe(1); // Rounded to nearest integer
    });
  });

  describe('monthsToYears()', () => {
    it('should convert months to years', () => {
      const m = months(120);
      const result = monthsToYears(m);
      expect(result).toBe(10);
    });

    it('should convert zero months', () => {
      const m = months(0);
      const result = monthsToYears(m);
      expect(result).toBe(0);
    });

    it('should handle non-divisible months', () => {
      const m = months(13);
      const result = monthsToYears(m);
      expect(result).toBeCloseTo(1.0833, 4);
    });

    it('should round-trip with yearsToMonths for integer years', () => {
      const originalYears = years(5);
      const m = yearsToMonths(originalYears);
      const backToYears = monthsToYears(m);
      expect(backToYears).toBe(5);
    });
  });

  describe('moneyToCents() and centsToMoney()', () => {
    it('should convert money to cents', () => {
      const m = money(100.50);
      const result = moneyToCents(m);
      expect(result).toBe(10050);
    });

    it('should convert cents to money', () => {
      const result = centsToMoney(10050);
      expect(result).toBe(100.50);
    });

    it('should round cents properly', () => {
      const m = money(100.506); // 3 decimals
      const cents = moneyToCents(m);
      expect(cents).toBe(10051); // Rounds to 10051
    });

    it('should handle zero', () => {
      const m = money(0);
      expect(moneyToCents(m)).toBe(0);
      expect(centsToMoney(0)).toBe(0);
    });

    it('should round-trip conversion', () => {
      const original = money(12345.67);
      const cents = moneyToCents(original);
      const backToMoney = centsToMoney(cents);
      expect(backToMoney).toBe(12345.67);
    });

    it('should handle large values', () => {
      const m = money(100_000_000);
      const cents = moneyToCents(m);
      expect(cents).toBe(10_000_000_000);
      expect(centsToMoney(cents)).toBe(100_000_000);
    });
  });
});

// ============================================================================
// TYPE GUARDS
// ============================================================================

describe('Type Guards', () => {
  describe('isMoney()', () => {
    it('should return true for valid money values', () => {
      expect(isMoney(100)).toBe(true);
      expect(isMoney(0)).toBe(true);
      expect(isMoney(123.45)).toBe(true);
    });

    it('should return false for negative values', () => {
      expect(isMoney(-100)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isMoney('100')).toBe(false);
      expect(isMoney(null)).toBe(false);
      expect(isMoney(undefined)).toBe(false);
      expect(isMoney({})).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isMoney(NaN)).toBe(false);
    });

    it('should return false for Infinity', () => {
      expect(isMoney(Infinity)).toBe(false);
      expect(isMoney(-Infinity)).toBe(false);
    });
  });

  describe('isRate()', () => {
    it('should return true for valid rate values', () => {
      expect(isRate(0.02)).toBe(true);
      expect(isRate(0)).toBe(true);
      expect(isRate(1.0)).toBe(true);
      expect(isRate(0.5)).toBe(true);
    });

    it('should return false for out-of-range values', () => {
      expect(isRate(-0.01)).toBe(false);
      expect(isRate(1.5)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isRate('0.02')).toBe(false);
      expect(isRate(null)).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isRate(NaN)).toBe(false);
    });
  });

  describe('isPercentage()', () => {
    it('should return true for valid percentage values', () => {
      expect(isPercentage(25.5)).toBe(true);
      expect(isPercentage(0)).toBe(true);
      expect(isPercentage(100)).toBe(true);
    });

    it('should return false for out-of-range values', () => {
      expect(isPercentage(-10)).toBe(false);
      expect(isPercentage(150)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isPercentage('25')).toBe(false);
    });
  });

  describe('isMultiple()', () => {
    it('should return true for valid multiple values', () => {
      expect(isMultiple(2.5)).toBe(true);
      expect(isMultiple(0)).toBe(true);
      expect(isMultiple(100)).toBe(true);
    });

    it('should return false for negative values', () => {
      expect(isMultiple(-2.5)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isMultiple('2.5')).toBe(false);
    });
  });

  describe('isProbability()', () => {
    it('should return true for valid probability values', () => {
      expect(isProbability(0.3)).toBe(true);
      expect(isProbability(0)).toBe(true);
      expect(isProbability(1.0)).toBe(true);
    });

    it('should return false for out-of-range values', () => {
      expect(isProbability(-0.1)).toBe(false);
      expect(isProbability(1.5)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isProbability('0.5')).toBe(false);
    });
  });
});

// ============================================================================
// ARITHMETIC OPERATIONS
// ============================================================================

describe('Arithmetic Operations', () => {
  describe('multiplyMoneyByRate()', () => {
    it('should multiply money by rate', () => {
      const m = money(100_000_000);
      const r = rate(0.02);
      const result = multiplyMoneyByRate(m, r);
      expect(result).toBe(2_000_000);
    });

    it('should handle zero money', () => {
      const m = money(0);
      const r = rate(0.5);
      const result = multiplyMoneyByRate(m, r);
      expect(result).toBe(0);
    });

    it('should handle zero rate', () => {
      const m = money(1000);
      const r = rate(0);
      const result = multiplyMoneyByRate(m, r);
      expect(result).toBe(0);
    });

    it('should handle 100% rate', () => {
      const m = money(1000);
      const r = rate(1.0);
      const result = multiplyMoneyByRate(m, r);
      expect(result).toBe(1000);
    });
  });

  describe('divideMoney()', () => {
    it('should divide money by money to get multiple', () => {
      const numerator = money(250_000_000);
      const denominator = money(100_000_000);
      const result = divideMoney(numerator, denominator);
      expect(result).toBe(2.5);
    });

    it('should handle equal values', () => {
      const m = money(1000);
      const result = divideMoney(m, m);
      expect(result).toBe(1.0);
    });

    it('should handle zero numerator', () => {
      const numerator = money(0);
      const denominator = money(1000);
      const result = divideMoney(numerator, denominator);
      expect(result).toBe(0);
    });

    it('should throw error for zero denominator', () => {
      const numerator = money(1000);
      const denominator = money(0);
      expect(() => divideMoney(numerator, denominator)).toThrow('Division by zero');
    });

    it('should handle fractional results', () => {
      const numerator = money(150);
      const denominator = money(100);
      const result = divideMoney(numerator, denominator);
      expect(result).toBe(1.5);
    });
  });

  describe('addMoney()', () => {
    it('should add two money values', () => {
      const a = money(1000);
      const b = money(2000);
      const result = addMoney(a, b);
      expect(result).toBe(3000);
    });

    it('should handle adding zero', () => {
      const a = money(1000);
      const b = money(0);
      const result = addMoney(a, b);
      expect(result).toBe(1000);
    });

    it('should handle decimal values', () => {
      const a = money(100.50);
      const b = money(200.25);
      const result = addMoney(a, b);
      expect(result).toBe(300.75);
    });
  });

  describe('subtractMoney()', () => {
    it('should subtract money values', () => {
      const a = money(2000);
      const b = money(500);
      const result = subtractMoney(a, b);
      expect(result).toBe(1500);
    });

    it('should handle equal values', () => {
      const a = money(1000);
      const result = subtractMoney(a, a);
      expect(result).toBe(0);
    });

    it('should throw error for negative result', () => {
      const a = money(500);
      const b = money(1000);
      expect(() => subtractMoney(a, b)).toThrow('Subtraction would result in negative Money');
    });

    it('should handle decimal values', () => {
      const a = money(300.75);
      const b = money(100.50);
      const result = subtractMoney(a, b);
      expect(result).toBe(200.25);
    });
  });

  describe('sumMoney()', () => {
    it('should sum array of money values', () => {
      const amounts = [money(100), money(200), money(300)];
      const result = sumMoney(amounts);
      expect(result).toBe(600);
    });

    it('should handle empty array', () => {
      const result = sumMoney([]);
      expect(result).toBe(0);
    });

    it('should handle single value', () => {
      const result = sumMoney([money(1000)]);
      expect(result).toBe(1000);
    });

    it('should handle array with zeros', () => {
      const amounts = [money(100), money(0), money(200)];
      const result = sumMoney(amounts);
      expect(result).toBe(300);
    });

    it('should handle decimal values', () => {
      const amounts = [money(100.25), money(200.50), money(300.75)];
      const result = sumMoney(amounts);
      expect(result).toBe(601.50);
    });
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('Utility Functions', () => {
  describe('unsafeCast()', () => {
    it('should cast Money to number', () => {
      const m = money(1000);
      const result = unsafeCast(m);
      expect(result).toBe(1000);
      expect(typeof result).toBe('number');
    });

    it('should cast Rate to number', () => {
      const r = rate(0.02);
      const result = unsafeCast(r);
      expect(result).toBe(0.02);
    });

    it('should cast Multiple to number', () => {
      const mult = multiple(2.5);
      const result = unsafeCast(mult);
      expect(result).toBe(2.5);
    });
  });

  describe('rebrand()', () => {
    it('should rebrand number as Money', () => {
      const num = 1000;
      const result = rebrand<Money>(num, money);
      expect(result).toBe(1000);
      expect(isMoney(result)).toBe(true);
    });

    it('should rebrand number as Rate', () => {
      const num = 0.02;
      const result = rebrand<Rate>(num, rate);
      expect(result).toBe(0.02);
      expect(isRate(result)).toBe(true);
    });

    it('should rebrand after calculations', () => {
      const a = unsafeCast(money(100));
      const b = unsafeCast(money(200));
      const sum = a + b;
      const result = rebrand<Money>(sum, money);
      expect(result).toBe(300);
      expect(isMoney(result)).toBe(true);
    });

    it('should throw error for invalid values', () => {
      expect(() => rebrand<Money>(-100, money)).toThrow('Invalid Money value');
      expect(() => rebrand<Rate>(1.5, rate)).toThrow('Invalid Rate value');
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  describe('Boundary Values', () => {
    it('should handle maximum safe integer for Money', () => {
      const max = Number.MAX_SAFE_INTEGER;
      const m = money(max);
      expect(m).toBe(max);
    });

    it('should handle very small positive numbers', () => {
      const small = 0.000001;
      const m = money(small);
      expect(m).toBe(small);
    });

    it('should handle rate boundary values', () => {
      expect(rate(0)).toBe(0);
      expect(rate(1.0)).toBe(1.0);
    });

    it('should handle percentage boundary values', () => {
      expect(percentage(0)).toBe(0);
      expect(percentage(100)).toBe(100);
    });
  });

  describe('Precision', () => {
    it('should preserve decimal precision in conversions', () => {
      const r = rate(0.025);
      const pct = rateToPercentage(r);
      expect(pct).toBe(2.5);
      const backToRate = percentageToRate(pct);
      expect(backToRate).toBe(0.025);
    });

    it('should handle floating-point arithmetic correctly', () => {
      const a = money(0.1);
      const b = money(0.2);
      const result = addMoney(a, b);
      // This should be handled by precision module in real use
      expect(result).toBeCloseTo(0.3, 10);
    });
  });

  describe('Zero Handling', () => {
    it('should handle zero in all operations', () => {
      const zero = money(0);
      expect(addMoney(zero, zero)).toBe(0);
      expect(multiplyMoneyByRate(zero, rate(0.5))).toBe(0);
      expect(sumMoney([zero, zero, zero])).toBe(0);
    });

    it('should handle zero in conversions', () => {
      expect(rateToPercentage(rate(0))).toBe(0);
      expect(percentageToRate(percentage(0))).toBe(0);
      expect(moneyToCents(money(0))).toBe(0);
      expect(centsToMoney(0)).toBe(0);
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error messages', () => {
      expect(() => money(-100)).toThrow('must be non-negative');
      expect(() => rate(1.5)).toThrow('must be in range [0.0, 1.0]');
      expect(() => percentage(150)).toThrow('must be in range [0.0, 100.0]');
      expect(() => months(36.5)).toThrow('must be non-negative integer');
    });
  });
});
