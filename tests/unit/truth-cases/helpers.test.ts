/**
 * Truth Case Helper Functions - Test Suite
 *
 * Tests for assertion helpers used across all truth case validation.
 * Following TDD: These tests are written FIRST, will FAIL, then implement to pass.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { assertNumericField, stripNotes, handleNullUndefined, assertRange } from './helpers';

describe('Truth Case Helpers', () => {
  describe('assertNumericField', () => {
    it('should pass when Decimal value matches expected within 6 decimals', () => {
      const actual = new Decimal('0.2010340779');
      const expected = 0.201034;

      // Should not throw
      expect(() => assertNumericField(actual, expected, 6)).not.toThrow();
    });

    it('should pass when number value matches expected within 6 decimals', () => {
      const actual = 1.234567;
      const expected = 1.234567;

      expect(() => assertNumericField(actual, expected, 6)).not.toThrow();
    });

    it('should throw when values differ beyond tolerance', () => {
      const actual = new Decimal('0.201034');
      const expected = 0.201035; // Differs at 6th decimal

      expect(() => assertNumericField(actual, expected, 6)).toThrow();
    });

    it('should handle edge case: zero values', () => {
      const actual = new Decimal('0');
      const expected = 0;

      expect(() => assertNumericField(actual, expected, 6)).not.toThrow();
    });

    it('should handle negative values', () => {
      const actual = new Decimal('-0.368923364');
      const expected = -0.368923;

      expect(() => assertNumericField(actual, expected, 6)).not.toThrow();
    });

    it('should use default 6 decimals when not specified', () => {
      const actual = new Decimal('1.2345678');
      const expected = 1.234568;

      // Should use 6 decimal default
      expect(() => assertNumericField(actual, expected)).not.toThrow();
    });
  });

  describe('stripNotes', () => {
    it('should remove notes field from object', () => {
      const input = { value: 100, notes: 'This is a comment' };
      const result = stripNotes(input);

      expect(result).toEqual({ value: 100 });
      expect(result).not.toHaveProperty('notes');
    });

    it('should preserve other fields', () => {
      const input = { value: 100, description: 'Test', notes: 'Comment' };
      const result = stripNotes(input);

      expect(result).toEqual({ value: 100, description: 'Test' });
    });

    it('should handle object without notes field', () => {
      const input = { value: 100 };
      const result = stripNotes(input);

      expect(result).toEqual({ value: 100 });
    });

    it('should return new object (immutable)', () => {
      const input = { value: 100, notes: 'Comment' };
      const result = stripNotes(input);

      expect(result).not.toBe(input);
    });
  });

  describe('handleNullUndefined', () => {
    it('should pass when expected is null and actual is undefined', () => {
      const expected = { gpClawback: null };
      const actual = { gpClawback: undefined };

      expect(() => handleNullUndefined(expected, actual, 'gpClawback')).not.toThrow();
    });

    it('should pass when expected is number and actual matches', () => {
      const expected = { gpClawback: 4000 };
      const actual = { gpClawback: 4000 };

      expect(() => handleNullUndefined(expected, actual, 'gpClawback')).not.toThrow();
    });

    it('should throw when expected is null but actual has value', () => {
      const expected = { gpClawback: null };
      const actual = { gpClawback: 4000 };

      expect(() => handleNullUndefined(expected, actual, 'gpClawback')).toThrow();
    });

    it('should throw when expected has value but actual is undefined', () => {
      const expected = { gpClawback: 4000 };
      const actual = { gpClawback: undefined };

      expect(() => handleNullUndefined(expected, actual, 'gpClawback')).toThrow();
    });
  });

  describe('assertRange', () => {
    it('should pass when value is within min/max range', () => {
      const actual = 50;
      const min = 0;
      const max = 100;

      expect(() => assertRange(actual, min, max)).not.toThrow();
    });

    it('should pass when value equals min', () => {
      const actual = 0;
      const min = 0;
      const max = 100;

      expect(() => assertRange(actual, min, max)).not.toThrow();
    });

    it('should pass when value equals max', () => {
      const actual = 100;
      const min = 0;
      const max = 100;

      expect(() => assertRange(actual, min, max)).not.toThrow();
    });

    it('should throw when value is below min', () => {
      const actual = -1;
      const min = 0;
      const max = 100;

      expect(() => assertRange(actual, min, max)).toThrow();
    });

    it('should throw when value is above max', () => {
      const actual = 101;
      const min = 0;
      const max = 100;

      expect(() => assertRange(actual, min, max)).toThrow();
    });

    it('should skip min check when min is undefined', () => {
      const actual = -100;
      const min = undefined;
      const max = 100;

      expect(() => assertRange(actual, min, max)).not.toThrow();
    });

    it('should skip max check when max is undefined', () => {
      const actual = 200;
      const min = 0;
      const max = undefined;

      expect(() => assertRange(actual, min, max)).not.toThrow();
    });

    it('should pass when both min and max are undefined', () => {
      const actual = 999;
      const min = undefined;
      const max = undefined;

      expect(() => assertRange(actual, min, max)).not.toThrow();
    });
  });
});
