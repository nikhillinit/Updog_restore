import { describe, it, expect } from 'vitest';
/**
 * Type Guards Test Suite
 *
 * Comprehensive tests for type guard utilities to ensure they correctly
 * identify types and handle edge cases safely.
 */

import {
  isDefined,
  isNotNull,
  isNotUndefined,
  isNonEmptyString,
  isValidNumber,
  hasElements,
  hasProperty,
  assertDefined,
  safeGet,
  safeString,
  safeNumber,
  safeArray,
  safeAccess,
  filterDefined,
  mapDefined,
  safeObjectAccess,
  getValidProperty
} from '../type-guards';

describe('Type Guards', () => {
  describe('isDefined', () => {
    it('returns true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('returns false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isNotNull', () => {
    it('returns true for non-null values including undefined', () => {
      expect(isNotNull(0)).toBe(true);
      expect(isNotNull('')).toBe(true);
      expect(isNotNull(undefined)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isNotNull(null)).toBe(false);
    });
  });

  describe('isNotUndefined', () => {
    it('returns true for non-undefined values including null', () => {
      expect(isNotUndefined(0)).toBe(true);
      expect(isNotUndefined('')).toBe(true);
      expect(isNotUndefined(null)).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(isNotUndefined(undefined)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('returns true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
      expect(isNonEmptyString('0')).toBe(true);
    });

    it('returns false for empty or non-string values', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(0 as any)).toBe(false);
    });
  });

  describe('isValidNumber', () => {
    it('returns true for valid numbers', () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(42)).toBe(true);
      expect(isValidNumber(-42)).toBe(true);
      expect(isValidNumber(3.14)).toBe(true);
    });

    it('returns false for invalid numbers', () => {
      expect(isValidNumber(NaN)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber('42' as any)).toBe(false);
    });
  });

  describe('hasElements', () => {
    it('returns true for non-empty arrays', () => {
      expect(hasElements([1])).toBe(true);
      expect(hasElements(['a', 'b'])).toBe(true);
      expect(hasElements([null])).toBe(true);
    });

    it('returns false for empty or non-arrays', () => {
      expect(hasElements([])).toBe(false);
      expect(hasElements(null)).toBe(false);
      expect(hasElements(undefined)).toBe(false);
      expect(hasElements('string' as any)).toBe(false);
    });
  });

  describe('hasProperty', () => {
    it('returns true when object has property', () => {
      const obj = { name: 'test', value: 42 };
      expect(hasProperty(obj, 'name')).toBe(true);
      expect(hasProperty(obj, 'value')).toBe(true);
    });

    it('returns false when object lacks property or is null/undefined', () => {
      const obj = { name: 'test' };
      expect(hasProperty(obj, 'missing')).toBe(false);
      expect(hasProperty(null, 'name')).toBe(false);
      expect(hasProperty(undefined, 'name')).toBe(false);
    });
  });

  describe('assertDefined', () => {
    it('returns value when defined', () => {
      expect(assertDefined(42)).toBe(42);
      expect(assertDefined('')).toBe('');
      expect(assertDefined(false)).toBe(false);
    });

    it('throws error when value is null or undefined', () => {
      expect(() => assertDefined(null)).toThrow('Expected value to be defined');
      expect(() => assertDefined(undefined)).toThrow('Expected value to be defined');
    });

    it('throws custom error message', () => {
      expect(() => assertDefined(null, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('safeGet', () => {
    it('returns value when defined', () => {
      expect(safeGet(42, 0)).toBe(42);
      expect(safeGet('hello', '')).toBe('hello');
    });

    it('returns fallback when undefined', () => {
      expect(safeGet(null, 42)).toBe(42);
      expect(safeGet(undefined, 'fallback')).toBe('fallback');
    });
  });

  describe('safeString', () => {
    it('returns string when valid and non-empty', () => {
      expect(safeString('hello')).toBe('hello');
      expect(safeString('test', 'fallback')).toBe('test');
    });

    it('returns fallback for invalid strings', () => {
      expect(safeString(null)).toBe('');
      expect(safeString('', 'fallback')).toBe('fallback');
      expect(safeString('   ', 'fallback')).toBe('fallback');
    });
  });

  describe('safeNumber', () => {
    it('returns number when valid', () => {
      expect(safeNumber(42)).toBe(42);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-5)).toBe(-5);
    });

    it('returns fallback for invalid numbers', () => {
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber(NaN, 100)).toBe(100);
      expect(safeNumber(Infinity, 50)).toBe(50);
    });
  });

  describe('safeArray', () => {
    it('returns array when valid', () => {
      const arr = [1, 2, 3];
      expect(safeArray(arr)).toBe(arr);
      expect(safeArray([])).toEqual([]);
    });

    it('returns fallback for non-arrays', () => {
      expect(safeArray(null)).toEqual([]);
      expect(safeArray(undefined, [1, 2])).toEqual([1, 2]);
      expect(safeArray('string' as any)).toEqual([]);
    });
  });

  describe('safeAccess', () => {
    it('returns accessed value when object is valid', () => {
      const obj = { nested: { value: 42 } };
      const result = safeAccess(obj, (o) => o.nested.value);
      expect(result).toBe(42);
    });

    it('returns undefined when object is null/undefined', () => {
      const result = safeAccess(null, (o: any) => o?.nested?.value);
      expect(result).toBeUndefined();
    });

    it('returns undefined when accessor throws', () => {
      const obj = {};
      const result = safeAccess(obj, (o) => (o as any).nested.value);
      expect(result).toBeUndefined();
    });
  });

  describe('filterDefined', () => {
    it('filters out null and undefined values', () => {
      const input = [1, null, 2, undefined, 3];
      const result = filterDefined(input);
      expect(result).toEqual([1, 2, 3]);
    });

    it('preserves all defined values including falsy ones', () => {
      const input = [0, false, '', null, undefined];
      const result = filterDefined(input);
      expect(result).toEqual([0, false, '']);
    });
  });

  describe('mapDefined', () => {
    it('maps and filters undefined results', () => {
      const input = [1, 2, 3, 4];
      const result = mapDefined(input, (x) => x % 2 === 0 ? x * 2 : undefined);
      expect(result).toEqual([4, 8]);
    });

    it('handles empty arrays', () => {
      const result = mapDefined([], (x) => x);
      expect(result).toEqual([]);
    });
  });

  describe('safeObjectAccess', () => {
    it('returns property value when object and property exist', () => {
      const obj = { name: 'test', value: 42 };
      expect(safeObjectAccess(obj, 'name')).toBe('test');
      expect(safeObjectAccess(obj, 'value')).toBe(42);
    });

    it('returns undefined when object is null/undefined or property missing', () => {
      const obj = { name: 'test' };
      expect(safeObjectAccess(obj, 'missing' as keyof typeof obj)).toBeUndefined();
      expect(safeObjectAccess(null as any, 'name')).toBeUndefined();
      expect(safeObjectAccess(undefined as any, 'name')).toBeUndefined();
    });
  });

  describe('getValidProperty', () => {
    it('returns property value when valid', () => {
      const obj = { name: 'test', age: 25 };
      const result = getValidProperty(obj, 'name', (v): v is string => typeof v === 'string');
      expect(result).toBe('test');
    });

    it('returns undefined when property is invalid', () => {
      const obj = { name: 123 };
      const result = getValidProperty(obj, 'name', (v): v is string => typeof v === 'string');
      expect(result).toBeUndefined();
    });

    it('returns undefined when object is null/undefined', () => {
      const result = getValidProperty(null as any, 'name', (v): v is string => typeof v === 'string');
      expect(result).toBeUndefined();
    });
  });
});

// Type-level tests to ensure proper type inference
describe('Type Inference Tests', () => {
  it('ensures proper type narrowing', () => {
    const value: string | null = 'test';

    if (isDefined(value)) {
      // TypeScript should know value is string here
      expect(value.length).toBe(4);
    }

    const maybeNumber: number | undefined = 42;
    if (isValidNumber(maybeNumber)) {
      // TypeScript should know maybeNumber is number here
      expect(maybeNumber.toFixed(2)).toBe('42.00');
    }
  });

  it('ensures proper type inference with generic helpers', () => {
    const items: (string | null)[] = ['a', null, 'b'];
    const defined = filterDefined(items);

    // Should be string[], not (string | null)[]
    expect(defined).toEqual(['a', 'b']);
    const first = defined[0];
    expect(first).toBeDefined();
    expect(first?.length).toBe(1); // Safe access with optional chaining
  });
});