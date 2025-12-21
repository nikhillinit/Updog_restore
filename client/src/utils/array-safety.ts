 
 
 
 
 
// src/utils/array-safety.ts
// --------------------------------------------------
// Canonical “safe” array utilities to prevent undefined errors
// Usage: import { safeArray, forEach, map, filter, reduce } from '@/utils/array-safety'

/**
 * Returns the array if it’s non-null/undefined, else [].
 */
export const safeArray = <T>(arr?: T[] | null): T[] =>
  Array.isArray(arr) ? arr : [];

/**
 * Wrapper around Array.forEach that skips if arr is null/undefined.
 */
export const forEach = <T>(
  arr: T[] | undefined | null,
  callback: (_item: T, _index: number) => void
): void => {
  safeArray(arr).forEach(callback);
};

/**
 * Safe map: returns mapped array or [].
 */
export const map = <T, U>(
  arr: T[] | undefined | null,
  callback: (_item: T, _index: number) => U
): U[] => safeArray(arr).map(callback);

/**
 * Safe filter: returns filtered array or [].
 */
export const filter = <T>(
  arr: T[] | undefined | null,
  predicate: (_item: T, _index: number) => boolean
): T[] => safeArray(arr).filter(predicate);

/**
 * Safe reduce: returns reduced value or initialValue.
 */
export const reduce = <T, U>(
  arr: T[] | undefined | null,
  reducer: (_acc: U, _item: T, _index: number) => U,
  initialValue: U
): U => safeArray(arr).reduce(reducer, initialValue);

