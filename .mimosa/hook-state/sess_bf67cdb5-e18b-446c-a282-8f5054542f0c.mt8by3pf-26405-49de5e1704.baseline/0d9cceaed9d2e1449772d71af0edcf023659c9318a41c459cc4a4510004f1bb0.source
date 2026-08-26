import { describe, expect, it } from 'vitest';
import {
  assertDefined,
  filterDefined,
  hasProperty,
  isNonEmptyString,
  isValidNumber,
  safeAccess,
  safeArray,
  safeObjectAccess,
  safeString,
} from '@shared/utils/type-guards';

describe('shared type guard compatibility helpers', () => {
  it('preserves client facade string and number semantics', () => {
    expect(isNonEmptyString(' value ')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber(Infinity)).toBe(false);
  });

  it('keeps null-safe property helpers', () => {
    const obj = { name: 'Fund I', size: 100 };

    expect(hasProperty(obj, 'name')).toBe(true);
    expect(hasProperty(null, 'name')).toBe(false);
    expect(safeObjectAccess(obj, 'size')).toBe(100);
    expect(safeObjectAccess(undefined, 'size' as never)).toBeUndefined();
  });

  it('keeps return-value assertion and safe fallback helpers', () => {
    expect(assertDefined('ready')).toBe('ready');
    expect(() => assertDefined(null)).toThrow('Expected value to be defined');
    expect(safeString('')).toBe('');
    expect(safeString(' ', 'fallback')).toBe('fallback');
    expect(safeArray(null, [1])).toEqual([1]);
  });

  it('keeps safe access and defined filtering behavior', () => {
    expect(safeAccess({ nested: { value: 3 } }, (obj) => obj.nested.value)).toBe(3);
    expect(safeAccess({}, (obj: { nested?: { value: number } }) => obj.nested!.value)).toBeUndefined();
    expect(filterDefined([0, null, false, undefined, ''])).toEqual([0, false, '']);
  });
});
