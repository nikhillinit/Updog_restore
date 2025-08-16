/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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
  callback: (item: T, index: number) => void
): void => {
  safeArray(arr).forEach(callback);
};

/**
 * Safe map: returns mapped array or [].
 */
export const map = <T, U>(
  arr: T[] | undefined | null,
  callback: (item: T, index: number) => U
): U[] => safeArray(arr).map(callback);

/**
 * Safe filter: returns filtered array or [].
 */
export const filter = <T>(
  arr: T[] | undefined | null,
  predicate: (item: T, index: number) => boolean
): T[] => safeArray(arr).filter(predicate);

/**
 * Safe reduce: returns reduced value or initialValue.
 */
export const reduce = <T, U>(
  arr: T[] | undefined | null,
  reducer: (acc: U, item: T, index: number) => U,
  initialValue: U
): U => safeArray(arr).reduce(reducer, initialValue);

