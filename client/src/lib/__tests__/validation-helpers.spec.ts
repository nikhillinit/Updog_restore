/**
 * Validation Helpers Test Suite
 *
 * Comprehensive tests for validation helper utilities to ensure they correctly
 * validate, transform, and sanitize data while handling edge cases safely.
 */

import {
  ensureFinancialNumber,
  ensurePercentage,
  ensureRatio,
  ensureDisplayString,
  ensureDateString,
  ensureValidArray,
  ensureValidObject,
  extractValidProperty,
  sanitizeUserInput,
  ensureRange,
  isValidArrayIndex,
  safeArrayAccess,
  formatCurrencySafe,
  formatPercentageSafe
} from '../validation-helpers';

describe('Validation Helpers', () => {
  describe('ensureFinancialNumber', () => {
    it('returns valid numbers unchanged', () => {
      expect(ensureFinancialNumber(42)).toBe(42);
      expect(ensureFinancialNumber(0)).toBe(0);
      expect(ensureFinancialNumber(-5.5)).toBe(-5.5);
    });

    it('parses valid string numbers', () => {
      expect(ensureFinancialNumber('42')).toBe(42);
      expect(ensureFinancialNumber('3.14')).toBe(3.14);
      expect(ensureFinancialNumber('-10')).toBe(-10);
    });

    it('parses formatted currency strings', () => {
      expect(ensureFinancialNumber('$1,000')).toBe(1000);
      expect(ensureFinancialNumber('€2,500.50')).toBe(2500.50);
      expect(ensureFinancialNumber('50%')).toBe(50);
    });

    it('returns fallback for invalid values', () => {
      expect(ensureFinancialNumber(NaN, 100)).toBe(100);
      expect(ensureFinancialNumber(Infinity, 50)).toBe(50);
      expect(ensureFinancialNumber(null, 0)).toBe(0);
      expect(ensureFinancialNumber(undefined, 25)).toBe(25);
      expect(ensureFinancialNumber('invalid', 42)).toBe(42);
      expect(ensureFinancialNumber({}, 10)).toBe(10);
    });

    it('uses default fallback of 0', () => {
      expect(ensureFinancialNumber(null)).toBe(0);
      expect(ensureFinancialNumber('invalid')).toBe(0);
    });
  });

  describe('ensurePercentage', () => {
    it('returns valid percentages unchanged', () => {
      expect(ensurePercentage(50)).toBe(50);
      expect(ensurePercentage(0)).toBe(0);
      expect(ensurePercentage(100)).toBe(100);
    });

    it('clamps values to 0-100 range', () => {
      expect(ensurePercentage(-10)).toBe(0);
      expect(ensurePercentage(150)).toBe(100);
      expect(ensurePercentage(999)).toBe(100);
    });

    it('handles string input', () => {
      expect(ensurePercentage('75')).toBe(75);
      expect(ensurePercentage('150')).toBe(100);
      expect(ensurePercentage('-50')).toBe(0);
    });

    it('uses fallback for invalid input', () => {
      expect(ensurePercentage('invalid', 25)).toBe(25);
      expect(ensurePercentage(null, 50)).toBe(50);
    });
  });

  describe('ensureRatio', () => {
    it('returns valid ratios unchanged', () => {
      expect(ensureRatio(0.5)).toBe(0.5);
      expect(ensureRatio(0)).toBe(0);
      expect(ensureRatio(1)).toBe(1);
    });

    it('clamps values to 0-1 range', () => {
      expect(ensureRatio(-0.5)).toBe(0);
      expect(ensureRatio(1.5)).toBe(1);
      expect(ensureRatio(10)).toBe(1);
    });

    it('handles string input', () => {
      expect(ensureRatio('0.75')).toBe(0.75);
      expect(ensureRatio('2')).toBe(1);
      expect(ensureRatio('-1')).toBe(0);
    });
  });

  describe('ensureDisplayString', () => {
    it('returns strings unchanged after trimming', () => {
      expect(ensureDisplayString('hello')).toBe('hello');
      expect(ensureDisplayString('  test  ')).toBe('test');
    });

    it('converts numbers to strings', () => {
      expect(ensureDisplayString(42)).toBe('42');
      expect(ensureDisplayString(0)).toBe('0');
      expect(ensureDisplayString(3.14)).toBe('3.14');
    });

    it('returns fallback for null/undefined', () => {
      expect(ensureDisplayString(null)).toBe('');
      expect(ensureDisplayString(undefined)).toBe('');
      expect(ensureDisplayString(null, 'N/A')).toBe('N/A');
    });

    it('converts other types to strings', () => {
      expect(ensureDisplayString(true)).toBe('true');
      expect(ensureDisplayString({})).toBe('[object Object]');
    });
  });

  describe('ensureDateString', () => {
    it('returns valid date strings unchanged', () => {
      expect(ensureDateString('2023-12-25')).toBe('2023-12-25');
      expect(ensureDateString('2023-01-01T00:00:00Z')).toBe('2023-01-01T00:00:00Z');
    });

    it('converts Date objects to ISO strings', () => {
      const date = new Date('2023-12-25');
      const result = ensureDateString(date);
      expect(result).toBe('2023-12-25');
    });

    it('returns fallback for invalid dates', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(ensureDateString('invalid')).toBe(today);
      expect(ensureDateString(null)).toBe(today);
      expect(ensureDateString('', '2023-01-01')).toBe('2023-01-01');
    });
  });

  describe('ensureValidArray', () => {
    it('returns arrays unchanged', () => {
      const arr = [1, 2, 3];
      expect(ensureValidArray(arr)).toBe(arr);
      expect(ensureValidArray([])).toEqual([]);
    });

    it('returns empty array for non-arrays', () => {
      expect(ensureValidArray(null)).toEqual([]);
      expect(ensureValidArray(undefined)).toEqual([]);
      expect(ensureValidArray('string')).toEqual([]);
      expect(ensureValidArray(42)).toEqual([]);
    });

    it('filters with validator function', () => {
      const mixed = [1, 'a', 2, 'b', 3];
      const numbers = ensureValidArray(mixed, (x): x is number => typeof x === 'number');
      expect(numbers).toEqual([1, 2, 3]);
    });

    it('filters out null/undefined without validator', () => {
      const withNulls = [1, null, 2, undefined, 3];
      const result = ensureValidArray(withNulls);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('ensureValidObject', () => {
    it('returns object when all required properties exist', () => {
      const obj = { id: 1, name: 'test', value: 42 };
      const result = ensureValidObject(obj, ['id', 'name']);
      expect(result).toBe(obj);
    });

    it('returns null when required properties missing', () => {
      const obj = { id: 1 };
      const result = ensureValidObject(obj, ['id', 'name']);
      expect(result).toBeNull();
    });

    it('returns null for non-objects', () => {
      expect(ensureValidObject(null, ['id'])).toBeNull();
      expect(ensureValidObject('string', ['id'])).toBeNull();
      expect(ensureValidObject(42, ['id'])).toBeNull();
    });

    it('returns null when properties are null/undefined', () => {
      const obj = { id: 1, name: null };
      const result = ensureValidObject(obj, ['id', 'name']);
      expect(result).toBeNull();
    });
  });

  describe('extractValidProperty', () => {
    const isString = (value: unknown): value is string => typeof value === 'string';

    it('returns property value when valid', () => {
      const obj = { name: 'test', age: 25 };
      const result = extractValidProperty(obj, 'name', isString, 'default');
      expect(result).toBe('test');
    });

    it('returns fallback when property invalid', () => {
      const obj = { name: 123 };
      const result = extractValidProperty(obj, 'name', isString, 'default');
      expect(result).toBe('default');
    });

    it('returns fallback when object null/undefined', () => {
      const result = extractValidProperty(null, 'name', isString, 'default');
      expect(result).toBe('default');
    });

    it('returns fallback when property missing', () => {
      const obj = {};
      const result = extractValidProperty(obj, 'name', isString, 'default');
      expect(result).toBe('default');
    });
  });

  describe('sanitizeUserInput', () => {
    it('removes dangerous characters', () => {
      expect(sanitizeUserInput('<script>alert("hack")</script>')).toBe('scriptalert("hack")/script');
      expect(sanitizeUserInput('hello{world}')).toBe('helloworld');
      expect(sanitizeUserInput('javascript:void(0)')).toBe('void(0)');
    });

    it('trims whitespace', () => {
      expect(sanitizeUserInput('  hello world  ')).toBe('hello world');
    });

    it('limits length', () => {
      const longString = 'a'.repeat(2000);
      const result = sanitizeUserInput(longString, 100);
      expect(result.length).toBe(100);
    });

    it('handles non-string input', () => {
      expect(sanitizeUserInput(null)).toBe('');
      expect(sanitizeUserInput(42)).toBe('42');
      expect(sanitizeUserInput({})).toBe('[object Object]');
    });
  });

  describe('ensureRange', () => {
    it('returns value when within range', () => {
      expect(ensureRange(50, 0, 100)).toBe(50);
      expect(ensureRange(0, 0, 100)).toBe(0);
      expect(ensureRange(100, 0, 100)).toBe(100);
    });

    it('clamps values to range', () => {
      expect(ensureRange(-10, 0, 100)).toBe(0);
      expect(ensureRange(150, 0, 100)).toBe(100);
    });

    it('rounds to step when provided', () => {
      expect(ensureRange(47.3, 0, 100, 5)).toBe(45);
      expect(ensureRange(48.7, 0, 100, 5)).toBe(50);
    });

    it('handles invalid input', () => {
      expect(ensureRange('invalid', 0, 100)).toBe(0);
      expect(ensureRange(null, 10, 20)).toBe(10);
    });
  });

  describe('isValidArrayIndex', () => {
    it('returns true for valid indices', () => {
      expect(isValidArrayIndex(0, 5)).toBe(true);
      expect(isValidArrayIndex(4, 5)).toBe(true);
      expect(isValidArrayIndex(2, 10)).toBe(true);
    });

    it('returns false for invalid indices', () => {
      expect(isValidArrayIndex(-1, 5)).toBe(false);
      expect(isValidArrayIndex(5, 5)).toBe(false);
      expect(isValidArrayIndex(1.5, 5)).toBe(false);
      expect(isValidArrayIndex('0', 5)).toBe(false);
      expect(isValidArrayIndex(null, 5)).toBe(false);
    });
  });

  describe('safeArrayAccess', () => {
    const array = ['a', 'b', 'c'];

    it('returns element when index is valid', () => {
      expect(safeArrayAccess(array, 0, 'default')).toBe('a');
      expect(safeArrayAccess(array, 2, 'default')).toBe('c');
    });

    it('returns fallback for invalid index', () => {
      expect(safeArrayAccess(array, -1, 'default')).toBe('default');
      expect(safeArrayAccess(array, 5, 'default')).toBe('default');
      expect(safeArrayAccess(array, 'invalid', 'default')).toBe('default');
    });

    it('returns fallback for null/undefined array', () => {
      expect(safeArrayAccess(null, 0, 'default')).toBe('default');
      expect(safeArrayAccess(undefined, 0, 'default')).toBe('default');
    });

    it('returns fallback for undefined element', () => {
      const sparseArray = ['a', , 'c']; // eslint-disable-line no-sparse-arrays
      expect(safeArrayAccess(sparseArray, 1, 'default')).toBe('default');
    });
  });

  describe('formatCurrencySafe', () => {
    it('formats valid numbers as currency', () => {
      const result = formatCurrencySafe(1000);
      expect(result).toMatch(/^\$1,?000$/); // Account for locale differences
    });

    it('handles invalid input gracefully', () => {
      expect(() => formatCurrencySafe(null)).not.toThrow();
      expect(() => formatCurrencySafe('invalid')).not.toThrow();
      expect(() => formatCurrencySafe({})).not.toThrow();

      expect(formatCurrencySafe(null)).toMatch(/^\$0$/);
    });

    it('supports different currencies and locales', () => {
      const result = formatCurrencySafe(1000, 'EUR', 'en-US');
      expect(result).toMatch(/€/);
    });

    it('falls back to simple formatting on error', () => {
      // Mock Intl.NumberFormat to throw
      const originalFormat = Intl.NumberFormat;
      (global as any).Intl = {
        NumberFormat: () => {
          throw new Error('Mock error');
        }
      };

      const result = formatCurrencySafe(1000);
      expect(result).toBe('$1,000');

      // Restore
      (global as any).Intl = { NumberFormat: originalFormat };
    });
  });

  describe('formatPercentageSafe', () => {
    it('formats ratios as percentages', () => {
      expect(formatPercentageSafe(0.5)).toBe('50.0%');
      expect(formatPercentageSafe(0.25)).toBe('25.0%');
      expect(formatPercentageSafe(1)).toBe('100.0%');
    });

    it('handles different decimal places', () => {
      expect(formatPercentageSafe(0.123, 0)).toBe('12%');
      expect(formatPercentageSafe(0.123, 2)).toBe('12.30%');
      expect(formatPercentageSafe(0.123, 3)).toBe('12.300%');
    });

    it('handles invalid input gracefully', () => {
      expect(formatPercentageSafe(null)).toBe('0.0%');
      expect(formatPercentageSafe('invalid')).toBe('0.0%');
      expect(formatPercentageSafe({})).toBe('0.0%');
    });
  });
});

// Integration tests that combine multiple helpers
describe('Integration Tests', () => {
  describe('Financial data processing pipeline', () => {
    it('safely processes mixed financial data', () => {
      const rawData = [
        { amount: 1000, rate: '5%' },
        { amount: '$2,500', rate: 0.1 },
        { amount: null, rate: 'invalid' },
        { amount: 'invalid', rate: undefined }
      ];

      const processed = rawData.map(item => ({
        amount: ensureFinancialNumber(item.amount, 0),
        rate: ensureRatio(item.rate, 0),
        formatted: formatCurrencySafe(ensureFinancialNumber(item.amount, 0))
      }));

      expect(processed).toEqual([
        { amount: 1000, rate: 0.05, formatted: expect.stringMatching(/\$1,?000/) },
        { amount: 2500, rate: 0.1, formatted: expect.stringMatching(/\$2,?500/) },
        { amount: 0, rate: 0, formatted: expect.stringMatching(/\$0/) },
        { amount: 0, rate: 0, formatted: expect.stringMatching(/\$0/) }
      ]);
    });
  });

  describe('User input validation pipeline', () => {
    it('safely processes and validates user form data', () => {
      const userInput = {
        name: '  John Doe  ',
        email: 'john@example.com',
        age: '25',
        salary: '$50,000',
        tags: ['developer', null, 'typescript', undefined]
      };

      const validated = {
        name: sanitizeUserInput(userInput.name, 100),
        email: ensureDisplayString(userInput.email, ''),
        age: ensureRange(userInput.age, 0, 120),
        salary: ensureFinancialNumber(userInput.salary, 0),
        tags: ensureValidArray(userInput.tags, (x): x is string => typeof x === 'string')
      };

      expect(validated).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
        salary: 50000,
        tags: ['developer', 'typescript']
      });
    });
  });
});