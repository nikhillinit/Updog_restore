/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * tests/utils/array-safety.test.ts
 *
 * Tests for array-safety.ts utility functions.
 * These tests verify that:
 *  - safeArray returns a default empty array for null/undefined
 *  - forEach invokes callbacks with correct value and index, and skips null/undefined
 *  - map/filter/reduce behave correctly on populated, empty, null, and undefined inputs
 *  - type parameters are preserved
 *  - map works on complex object arrays
 */

import React from 'react';
import { safeArray, forEach, map, filter, reduce } from '@/utils/array-safety';

describe('ArraySafety utilities', () => {
  test('safeArray returns default for null/undefined', () => {
    expect(safeArray<number>(null)).toEqual([]);
    expect(safeArray<number>(undefined)).toEqual([]);
    expect(safeArray<number>([1, 2, 3])).toEqual([1, 2, 3]);
  });

  test('forEach iterates correctly with value and index, and skips empty/null/undefined', () => {
    const values: number[] = [];
    const indices: number[] = [];

    forEach<number>([10, 20, 30], (x, idx) => {
      values.push(x);
      indices.push(idx);
    });
    expect(values).toEqual([10, 20, 30]);
    expect(indices).toEqual([0, 1, 2]);

    // empty array
    const emptyVals: number[] = [];
    forEach<number>([], x => emptyVals.push(x));
    expect(emptyVals).toEqual([]);

    // null / undefined
    forEach<number>(null, x => emptyVals.push(x));
    forEach<number>(undefined, x => emptyVals.push(x));
    expect(emptyVals).toEqual([]);
  });

  test('map returns transformed array or default for null/undefined', () => {
    expect(map<number, number>([1, 2, 3], x => x + 1)).toEqual([2, 3, 4]);
    expect(map<number, number>(null, x => x)).toEqual([]);
    expect(map<number, number>(undefined, x => x)).toEqual([]);
  });

  test('filter selects correctly or returns [] for null/undefined', () => {
    expect(filter<number>([1, 2, 3], x => x > 1)).toEqual([2, 3]);
    expect(filter<number>(undefined, x => true)).toEqual([]);
    expect(filter<number>(null, x => true)).toEqual([]);
  });

  test('reduce combines correctly or returns initial value for null/undefined', () => {
    expect(reduce<number, number>([1, 2, 3], (acc, x) => acc + x, 0)).toBe(6);
    expect(reduce<number, number>(null, (acc, x) => acc + x, 10)).toBe(10);
    expect(reduce<number, number>(undefined, (acc, x) => acc + x, 5)).toBe(5);
  });

  test('map works with complex objects', () => {
    type User = { id: number; name: string };
    const users: User[] = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];
    const names = map<User, string>(users, u => u.name);
    expect(names).toEqual(['Alice', 'Bob']);
  });
});

