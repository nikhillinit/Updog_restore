/**
 * Path Utils Tests
 * Comprehensive test suite for safe path traversal utilities
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  deepSet,
  deepGet,
  deepHas,
  deepDelete,
  deepMerge
} from '../path-utils';

// ============================================================================
// NORMALIZE PATH
// ============================================================================

describe('normalizePath', () => {
  it('handles double dots', () => {
    expect(normalizePath('a..b')).toEqual(['a', 'b']);
  });

  it('handles whitespace', () => {
    expect(normalizePath('a. b')).toEqual(['a', 'b']);
    expect(normalizePath('a .b')).toEqual(['a', 'b']);
  });

  it('handles trailing dots', () => {
    expect(normalizePath('a.')).toEqual(['a']);
    expect(normalizePath('a.b.')).toEqual(['a', 'b']);
  });

  it('handles leading dots', () => {
    expect(normalizePath('.a')).toEqual(['a']);
    expect(normalizePath('.a.b')).toEqual(['a', 'b']);
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toEqual([]);
  });

  it('handles normal paths', () => {
    expect(normalizePath('a.b.c')).toEqual(['a', 'b', 'c']);
  });
});

// ============================================================================
// DEEP SET
// ============================================================================

describe('deepSet', () => {
  it('sets nested property', () => {
    const obj = {};
    deepSet(obj, 'a.b.c', 42);
    expect(obj).toEqual({ a: { b: { c: 42 } } });
  });

  it('handles malformed paths', () => {
    const obj = {};
    deepSet(obj, 'a..b', 42);
    expect(obj).toEqual({ a: { b: 42 } });
  });

  it('overwrites primitives with objects', () => {
    const obj = { a: 123 };
    deepSet(obj, 'a.b', 42);
    expect(obj).toEqual({ a: { b: 42 } });
  });

  it('overwrites null with objects', () => {
    const obj = { a: null };
    deepSet(obj, 'a.b', 42);
    expect(obj).toEqual({ a: { b: 42 } });
  });

  it('creates arrays for numeric indices', () => {
    const obj = {};
    deepSet(obj, 'arr.0', 'first');
    expect(obj).toEqual({ arr: ['first'] });
  });

  it('creates nested arrays', () => {
    const obj = {};
    deepSet(obj, 'arr.0.name', 'Alice');
    expect(obj).toEqual({ arr: [{ name: 'Alice' }] });
  });

  it('converts objects to arrays for numeric indices', () => {
    const obj = { arr: { foo: 'bar' } };
    deepSet(obj, 'arr.0', 'first');
    expect(obj).toEqual({ arr: ['first'] });
  });

  it('converts arrays to objects for non-numeric keys', () => {
    const obj = { arr: ['a', 'b'] };
    deepSet(obj, 'arr.foo', 'bar');
    expect(obj).toEqual({ arr: { foo: 'bar' } });
  });

  it('handles empty path gracefully', () => {
    const obj = { a: 1 };
    deepSet(obj, '', 42);
    expect(obj).toEqual({ a: 1 });
  });

  it('preserves existing properties', () => {
    const obj = { a: { b: 1, c: 2 } };
    deepSet(obj, 'a.d', 3);
    expect(obj).toEqual({ a: { b: 1, c: 2, d: 3 } });
  });
});

// ============================================================================
// DEEP GET
// ============================================================================

describe('deepGet', () => {
  it('gets nested property', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(deepGet(obj, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing path', () => {
    const obj = { a: { b: 1 } };
    expect(deepGet(obj, 'a.x')).toBeUndefined();
  });

  it('returns default for missing path', () => {
    const obj = { a: { b: 1 } };
    expect(deepGet(obj, 'a.x', 'default')).toBe('default');
  });

  it('handles arrays with numeric indices', () => {
    const obj = { items: [{ name: 'Alice' }, { name: 'Bob' }] };
    expect(deepGet(obj, 'items.0.name')).toBe('Alice');
    expect(deepGet(obj, 'items.1.name')).toBe('Bob');
  });

  it('returns default for out-of-bounds array index', () => {
    const obj = { items: ['a', 'b'] };
    expect(deepGet(obj, 'items.5', 'default')).toBe('default');
  });

  it('handles null nodes', () => {
    const obj = { a: null };
    expect(deepGet(obj, 'a.b', 'default')).toBe('default');
  });

  it('handles undefined nodes', () => {
    const obj = { a: undefined };
    expect(deepGet(obj, 'a.b', 'default')).toBe('default');
  });

  it('returns falsy values correctly', () => {
    const obj = { a: { b: 0 } };
    expect(deepGet(obj, 'a.b')).toBe(0);

    const obj2 = { a: { b: false } };
    expect(deepGet(obj2, 'a.b')).toBe(false);

    const obj3 = { a: { b: '' } };
    expect(deepGet(obj3, 'a.b')).toBe('');
  });

  it('handles empty path', () => {
    const obj = { a: 1 };
    expect(deepGet(obj, '', 'default')).toBe('default');
  });
});

// ============================================================================
// DEEP HAS
// ============================================================================

describe('deepHas', () => {
  it('returns true for existing path', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(deepHas(obj, 'a.b.c')).toBe(true);
  });

  it('returns false for missing path', () => {
    const obj = { a: { b: 1 } };
    expect(deepHas(obj, 'a.x')).toBe(false);
  });

  it('returns true for falsy values', () => {
    const obj = { a: { b: 0 } };
    expect(deepHas(obj, 'a.b')).toBe(true);

    const obj2 = { a: { b: false } };
    expect(deepHas(obj2, 'a.b')).toBe(true);

    const obj3 = { a: { b: null } };
    expect(deepHas(obj3, 'a.b')).toBe(true);
  });

  it('handles arrays', () => {
    const obj = { items: ['a', 'b'] };
    expect(deepHas(obj, 'items.0')).toBe(true);
    expect(deepHas(obj, 'items.5')).toBe(false);
  });

  it('returns false for empty path', () => {
    const obj = { a: 1 };
    expect(deepHas(obj, '')).toBe(false);
  });
});

// ============================================================================
// DEEP DELETE
// ============================================================================

describe('deepDelete', () => {
  it('deletes nested property', () => {
    const obj = { a: { b: { c: 42 } } };
    deepDelete(obj, 'a.b.c');
    expect(obj).toEqual({ a: { b: {} } });
  });

  it('handles missing path gracefully', () => {
    const obj = { a: { b: 1 } };
    deepDelete(obj, 'a.x');
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it('handles arrays', () => {
    const obj = { items: ['a', 'b', 'c'] };
    deepDelete(obj, 'items.1');
    expect(obj).toEqual({ items: ['a', undefined, 'c'] });
  });

  it('handles empty path gracefully', () => {
    const obj = { a: 1 };
    deepDelete(obj, '');
    expect(obj).toEqual({ a: 1 });
  });
});

// ============================================================================
// DEEP MERGE
// ============================================================================

describe('deepMerge', () => {
  it('merges objects at path', () => {
    const obj = { a: { b: 1, c: 2 } };
    deepMerge(obj, 'a', { c: 3, d: 4 });
    expect(obj).toEqual({ a: { b: 1, c: 3, d: 4 } });
  });

  it('creates object if path missing', () => {
    const obj = { a: {} };
    deepMerge(obj, 'a.b', { x: 1, y: 2 });
    expect(obj).toEqual({ a: { b: { x: 1, y: 2 } } });
  });

  it('overwrites non-objects', () => {
    const obj = { a: 123 };
    deepMerge(obj, 'a', { x: 1 });
    expect(obj).toEqual({ a: { x: 1 } });
  });

  it('merges at root level', () => {
    const obj = { a: 1, b: 2 };
    deepMerge(obj, '', { b: 3, c: 4 });
    expect(obj).toEqual({ a: 1, b: 3, c: 4 });
  });
});

// ============================================================================
// EDGE CASES & INTEGRATION
// ============================================================================

describe('Edge cases', () => {
  it('handles very deep paths', () => {
    const obj = {};
    deepSet(obj, 'a.b.c.d.e.f.g.h.i.j', 42);
    expect(deepGet(obj, 'a.b.c.d.e.f.g.h.i.j')).toBe(42);
  });

  it('handles paths with many dots', () => {
    const obj = {};
    deepSet(obj, 'a......b', 42);
    expect(obj).toEqual({ a: { b: 42 } });
  });

  it('handles mixed arrays and objects', () => {
    const obj = {};
    deepSet(obj, 'arr.0.obj.name', 'Alice');
    deepSet(obj, 'arr.0.obj.age', 30);
    deepSet(obj, 'arr.1.obj.name', 'Bob');

    expect(obj).toEqual({
      arr: [
        { obj: { name: 'Alice', age: 30 } },
        { obj: { name: 'Bob' } }
      ]
    });

    expect(deepGet(obj, 'arr.0.obj.name')).toBe('Alice');
    expect(deepGet(obj, 'arr.1.obj.name')).toBe('Bob');
  });

  it('handles unicode and special characters in keys', () => {
    const obj = {};
    deepSet(obj, 'user.☺.name', 'Smiley');
    expect(deepGet(obj, 'user.☺.name')).toBe('Smiley');
  });
});
