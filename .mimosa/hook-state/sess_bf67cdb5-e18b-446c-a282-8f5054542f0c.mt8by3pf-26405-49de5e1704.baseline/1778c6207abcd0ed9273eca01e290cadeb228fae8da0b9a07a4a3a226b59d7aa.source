/**
 * Comprehensive type guard utilities for TypeScript strict mode compliance
 * Synthesized from best practices for type safety and null checking
 */

// Basic type guards
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

export function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function hasElements<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

// Array element access guards
export function getArrayElement<T>(array: T[], index: number): T | undefined {
  return index >= 0 && index < array.length ? array[index] : undefined;
}

export function getFirstElement<T>(array: T[]): T | undefined {
  return getArrayElement(array, 0);
}

export function getLastElement<T>(array: T[]): T | undefined {
  return getArrayElement(array, array.length - 1);
}

// Object property access guards
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T | null | undefined,
  key: K
): obj is T & Record<K, unknown> {
  return obj != null && key in obj;
}

export function getProperty<T extends object, K extends keyof T>(obj: T, key: K): T[K] | undefined {
  return obj[key];
}

export function safePropertyAccess<T extends object, K extends string>(
  obj: T | undefined | null,
  key: K
): T extends Record<K, infer V> ? V | undefined : unknown {
  if (!isDefined(obj) || !hasProperty(obj, key)) {
    return undefined as T extends Record<K, infer V> ? V | undefined : unknown;
  }
  return (obj as Record<K, unknown>)[key] as T extends Record<K, infer V> ? V | undefined : unknown;
}

// Number utilities with type safety
export function safeParseFloat(value: string | number | undefined): number | undefined {
  if (!isDefined(value)) return undefined;
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return isNumber(parsed) ? parsed : undefined;
}

export function safeParseInt(value: string | number | undefined): number | undefined {
  if (!isDefined(value)) return undefined;
  const parsed = typeof value === 'string' ? parseInt(value, 10) : value;
  return isNumber(parsed) ? parsed : undefined;
}

export function ensureNumber(value: number | undefined, defaultValue: number): number {
  return isDefined(value) && isNumber(value) ? value : defaultValue;
}

// String utilities with type safety
export function ensureString(value: string | undefined, defaultValue: string): string {
  return isDefined(value) && isString(value) ? value : defaultValue;
}

export function safeGet<T>(value: T | null | undefined, fallback: T): T {
  return isDefined(value) ? value : fallback;
}

export function safeString(value: string | null | undefined, fallback: string = ''): string {
  return isNonEmptyString(value) ? value : fallback;
}

export function safeNumber(value: number | null | undefined, fallback: number = 0): number {
  return isValidNumber(value) ? value : fallback;
}

export function safeStringTrim(value: string | undefined): string | undefined {
  return isDefined(value) && isString(value) ? value.trim() : undefined;
}

export function safeArray<T>(value: T[] | null | undefined, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}

export function safeAccess<T, R>(
  obj: T | null | undefined,
  accessor: (obj: T) => R
): R | undefined {
  try {
    return isDefined(obj) ? accessor(obj) : undefined;
  } catch {
    return undefined;
  }
}

export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isDefined);
}

export function mapDefined<T, U>(
  array: T[],
  mapper: (item: T) => U | null | undefined
): U[] {
  return filterDefined(array.map(mapper));
}

// Date utilities with type safety
export function safeDate(value: string | Date | undefined): Date | undefined {
  if (!isDefined(value)) return undefined;

  const date = value instanceof Date ? value : new Date(value);
  return date instanceof Date && !isNaN(date.getTime()) ? date : undefined;
}

export function ensureDate(value: string | Date | undefined, defaultValue: Date): Date {
  const date = safeDate(value);
  return isDefined(date) ? date : defaultValue;
}

// Function parameter validation
export function validateRequired<T>(value: T | undefined | null, paramName: string): T {
  if (!isDefined(value)) {
    throw new Error(`Required parameter '${paramName}' is missing or undefined`);
  }
  return value;
}

export function validateArrayNotEmpty<T>(array: T[] | undefined | null, paramName: string): T[] {
  const validArray = validateRequired(array, paramName);
  if (!isArray(validArray) || validArray.length === 0) {
    throw new Error(`Parameter '${paramName}' must be a non-empty array`);
  }
  return validArray;
}

// Index signature safe access utilities
export function safeIndexAccess<T>(
  obj: Record<string, T> | undefined | null,
  key: string
): T | undefined {
  if (!isDefined(obj) || !isObject(obj)) return undefined;
  return obj[key];
}

export function safeObjectAccess<T extends object, K extends keyof T>(
  obj: T | null | undefined,
  key: K
): T[K] | undefined {
  return isDefined(obj) && hasProperty(obj, key) ? obj[key] : undefined;
}

export function getValidProperty<T extends object, K extends keyof T, V>(
  obj: T | null | undefined,
  key: K,
  validator: (value: unknown) => value is V
): V | undefined {
  const value = safeObjectAccess(obj, key);
  return validator(value) ? value : undefined;
}

type MethodKey<T extends object> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? K : never;
}[keyof T];

type MethodArgs<T extends object, K extends MethodKey<T>> = T[K] extends (
  ...args: infer A
) => unknown
  ? A
  : never;

type MethodReturn<T extends object, K extends MethodKey<T>> = T[K] extends (
  ...args: unknown[]
) => infer R
  ? R
  : never;

export function safeMethodCall<T extends object, K extends MethodKey<T>>(
  obj: T | undefined | null,
  method: K,
  ...args: MethodArgs<T, K>
): MethodReturn<T, K> | undefined {
  if (!isDefined(obj) || typeof obj[method] !== 'function') {
    return undefined;
  }

  const callable = obj[method] as (...callArgs: MethodArgs<T, K>) => MethodReturn<T, K>;
  return callable(...args);
}

// Environment variable safe access
export function getEnvVar(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  return isDefined(value) ? value : defaultValue;
}

export function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!isDefined(value)) {
    throw new Error(`Required environment variable '${key}' is not set`);
  }
  return value;
}

// Promise utilities with type safety
export function safeAwait<T>(
  promise: Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
  return promise
    .then((data: T) => ({ success: true as const, data }))
    .catch((error: unknown) => ({
      success: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
    }));
}

// Assertion utilities for type narrowing
export function assertDefined<T>(value: T | undefined | null, message?: string): T {
  if (!isDefined(value)) {
    throw new Error(message || 'Expected value to be defined');
  }
  return value;
}

export function assertArray<T>(value: unknown, message?: string): asserts value is T[] {
  if (!isArray(value)) {
    throw new Error(message || 'Value is not an array');
  }
}

export function assertString(value: unknown, message?: string): asserts value is string {
  if (!isString(value)) {
    throw new Error(message || 'Value is not a string');
  }
}

export function assertNumber(value: unknown, message?: string): asserts value is number {
  if (!isNumber(value)) {
    throw new Error(message || 'Value is not a number');
  }
}
