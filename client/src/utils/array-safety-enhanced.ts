/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
// client/src/utils/array-safety-enhanced.ts
// --------------------------------------------------
// Comprehensive array safety utilities for null/undefined handling
// Enhanced version with additional features for server-side use

/**
 * Type guards for array validation
 */
export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function isSafeArray<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value !== null;
}

/**
 * Safe forEach implementation with comprehensive null/undefined handling
 */
export function forEach<T>(
  array: T[] | null | undefined,
  callback: (_item: T, _index: number, _array: T[]) => void,
  thisArg?: any
): void {
  if (!isSafeArray(array)) {
    if (process.env['NODE_ENV'] === 'development') {
      console.debug('forEach called on null/undefined array');
    }
    return;
  }
  
  array.forEach(callback, thisArg);
}

/**
 * Safe map implementation
 */
export function map<T, R>(
  array: T[] | null | undefined,
  callback: (_item: T, _index: number, _array: T[]) => R,
  thisArg?: any
): R[] {
  if (!isSafeArray(array)) return [];
  return array.map(callback, thisArg);
}

/**
 * Safe filter implementation
 */
export function filter<T>(
  array: T[] | null | undefined,
  predicate: (_item: T, _index: number, _array: T[]) => boolean,
  thisArg?: any
): T[] {
  if (!isSafeArray(array)) return [];
  return array.filter(predicate, thisArg);
}

/**
 * Safe reduce implementation
 */
export function reduce<T, R>(
  array: T[] | null | undefined,
  callback: (_acc: R, _item: T, _index: number, _array: T[]) => R,
  initialValue: R
): R {
  if (!isSafeArray(array)) return initialValue;
  return array.reduce(callback, initialValue);
}

/**
 * Safe find implementation
 */
export function find<T>(
  array: T[] | null | undefined,
  predicate: (_item: T, _index: number, _array: T[]) => boolean,
  thisArg?: any
): T | undefined {
  if (!isSafeArray(array)) return undefined;
  return array.find(predicate, thisArg);
}

/**
 * Safe some implementation
 */
export function some<T>(
  array: T[] | null | undefined,
  predicate: (_item: T, _index: number, _array: T[]) => boolean,
  thisArg?: any
): boolean {
  if (!isSafeArray(array)) return false;
  return array.some(predicate, thisArg);
}

/**
 * Safe every implementation
 */
export function every<T>(
  array: T[] | null | undefined,
  predicate: (_item: T, _index: number, _array: T[]) => boolean,
  thisArg?: any
): boolean {
  if (!isSafeArray(array)) return true; // Empty array behavior
  return array.every(predicate, thisArg);
}

/**
 * Safe array access with default fallback
 */
export function safeArray<T>(
  array: T[] | null | undefined,
  defaultValue: T[] = []
): T[] {
  return isSafeArray(array) ? array : defaultValue;
}

/**
 * Get array length safely
 */
export function length(array: any[] | null | undefined): number {
  return isSafeArray(array) ? array.length : 0;
}

/**
 * Get item at index safely
 */
export function at<T>(
  array: T[] | null | undefined,
  index: number
): T | undefined {
  if (!isSafeArray(array)) return undefined;
  return array.at(index);
}

/**
 * Chainable SafeArray class for fluent operations
 */
export class SafeArray<T> {
  constructor(private array: T[] | null | undefined) {}
  
  forEach(callback: (_item: T, _index: number) => void): SafeArray<T> {
    forEach(this.array, callback);
    return this;
  }
  
  map<R>(callback: (_item: T, _index: number) => R): SafeArray<R> {
    return new SafeArray(map(this.array, callback));
  }
  
  filter(predicate: (_item: T, _index: number) => boolean): SafeArray<T> {
    return new SafeArray(filter(this.array, predicate));
  }
  
  reduce<R>(callback: (_acc: R, _item: T) => R, initial: R): R {
    return reduce(this.array, callback, initial);
  }
  
  find(predicate: (_item: T, _index: number) => boolean): T | undefined {
    return find(this.array, predicate);
  }
  
  some(predicate: (_item: T, _index: number) => boolean): boolean {
    return some(this.array, predicate);
  }
  
  every(predicate: (_item: T, _index: number) => boolean): boolean {
    return every(this.array, predicate);
  }
  
  toArray(): T[] {
    return safeArray(this.array);
  }
  
  get length(): number {
    return length(this.array);
  }
  
  isEmpty(): boolean {
    return this.length === 0;
  }
  
  isNotEmpty(): boolean {
    return this.length > 0;
  }
}

/**
 * Factory function for chainable operations
 */
export function safe<T>(array: T[] | null | undefined): SafeArray<T> {
  return new SafeArray(array);
}

/**
 * Helper for nested array operations
 */
export function forEachNested<T, U>(
  array: T[] | null | undefined,
  nestedGetter: (_item: T) => U[] | null | undefined,
  callback: (_parent: T, _child: U, _parentIndex: number, _childIndex: number) => void
): void {
  forEach(array, (parent: any, parentIndex: any) => {
    forEach(nestedGetter(parent), (child: any, childIndex: any) => {
      callback(parent, child, parentIndex, childIndex);
    });
  });
}

/**
 * Performance monitoring wrapper for debugging
 */
export function forEachWithMetrics<T>(
  array: T[] | null | undefined,
  callback: (_item: T, _index: number) => void,
  metricName?: string
): void {
  const start = performance.now();
  forEach(array, callback);
  
  if (metricName && process.env['NODE_ENV'] === 'development') {
    const duration = performance.now() - start;
    console.debug(`forEach[${metricName}]: ${duration.toFixed(2)}ms for ${length(array)} items`);
  }
}

/**
 * Async-safe forEach for promise-based operations
 */
export async function forEachAsync<T>(
  array: T[] | null | undefined,
  callback: (_item: T, _index: number) => Promise<void>
): Promise<void> {
  if (!isSafeArray(array)) return;
  
  for (let i = 0; i < array.length; i++) {
    const item = array[i];
    if (item !== undefined) {
      await callback(item, i);
    }
  }
}

/**
 * Parallel processing for async operations
 */
export async function forEachParallel<T>(
  array: T[] | null | undefined,
  callback: (_item: T, _index: number) => Promise<void>,
  concurrency: number = 10
): Promise<void> {
  if (!isSafeArray(array)) return;
  
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += concurrency) {
    chunks.push(array.slice(i, i + concurrency));
  }
  
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map((item: any, localIndex: any) => {
        const globalIndex = chunks.indexOf(chunk) * concurrency + localIndex;
        return callback(item, globalIndex);
      })
    );
  }
}

/**
 * Legacy compatibility - matches the existing utility pattern
 */
export const safeForEach = forEach;
export const safeMap = map;
export const safeFilter = filter;
export const safeReduce = reduce;

