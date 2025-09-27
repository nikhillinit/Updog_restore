/**
 * Type Guards and Safety Utilities
 *
 * This module provides reusable type guards, null-safety utilities, and type
 * assertion helpers to prevent common TypeScript errors and improve code maintainability.
 *
 * @fileoverview Comprehensive type safety utilities for null/undefined checking
 */

/**
 * Type guard to check if a value is defined (not null or undefined)
 * @template T The type of the value to check
 * @param value The value to check
 * @returns True if the value is defined, false otherwise
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard to check if a value is not null
 * @template T The type of the value to check
 * @param value The value to check
 * @returns True if the value is not null, false otherwise
 */
export function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

/**
 * Type guard to check if a value is not undefined
 * @template T The type of the value to check
 * @param value The value to check
 * @returns True if the value is not undefined, false otherwise
 */
export function isNotUndefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Type guard to check if a string is not empty or whitespace
 * @param value The string to check
 * @returns True if the string has content, false otherwise
 */
export function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard to check if a number is valid (not NaN, null, or undefined)
 * @param value The number to check
 * @returns True if the number is valid, false otherwise
 */
export function isValidNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard to check if an array has elements
 * @template T The type of array elements
 * @param value The array to check
 * @returns True if the array has elements, false otherwise
 */
export function hasElements<T>(value: T[] | null | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Type guard to check if an object has a specific property
 * @template T The object type
 * @template K The property key type
 * @param obj The object to check
 * @param prop The property name to check
 * @returns True if the object has the property, false otherwise
 */
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T | null | undefined,
  prop: K
): obj is T & Record<K, unknown> {
  return obj !== null && obj !== undefined && prop in obj;
}

/**
 * Asserts that a value is defined, throwing an error if not
 * @template T The type of the value
 * @param value The value to assert
 * @param message Optional error message
 * @returns The value if defined
 * @throws Error if value is null or undefined
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): T {
  if (!isDefined(value)) {
    throw new Error(message || 'Expected value to be defined');
  }
  return value;
}

/**
 * Safely gets a value with a fallback
 * @template T The type of the value
 * @param value The potentially undefined value
 * @param fallback The fallback value
 * @returns The value if defined, otherwise the fallback
 */
export function safeGet<T>(value: T | null | undefined, fallback: T): T {
  return isDefined(value) ? value : fallback;
}

/**
 * Safely gets a string value with a fallback
 * @param value The potentially undefined string
 * @param fallback The fallback string (default: empty string)
 * @returns The string if defined and non-empty, otherwise the fallback
 */
export function safeString(value: string | null | undefined, fallback: string = ''): string {
  return isNonEmptyString(value) ? value : fallback;
}

/**
 * Safely gets a number value with a fallback
 * @param value The potentially undefined number
 * @param fallback The fallback number (default: 0)
 * @returns The number if valid, otherwise the fallback
 */
export function safeNumber(value: number | null | undefined, fallback: number = 0): number {
  return isValidNumber(value) ? value : fallback;
}

/**
 * Safely gets an array with a fallback
 * @template T The type of array elements
 * @param value The potentially undefined array
 * @param fallback The fallback array (default: empty array)
 * @returns The array if defined, otherwise the fallback
 */
export function safeArray<T>(value: T[] | null | undefined, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}

/**
 * Creates a type-safe optional chain helper
 * @template T The root object type
 * @template R The result type
 * @param obj The root object
 * @param accessor Function to access nested properties
 * @returns The accessed value or undefined if any step fails
 */
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

/**
 * Filters an array to only include defined elements
 * @template T The type of array elements
 * @param array The array to filter
 * @returns Array with only defined elements
 */
export function filterDefined<T>(array: (T | null | undefined)[]): T[] {
  return array.filter(isDefined);
}

/**
 * Maps an array, filtering out undefined results
 * @template T The input type
 * @template U The output type
 * @param array The array to map
 * @param mapper The mapping function
 * @returns Array with only defined mapped results
 */
export function mapDefined<T, U>(
  array: T[],
  mapper: (item: T) => U | null | undefined
): U[] {
  return filterDefined(array.map(mapper));
}

/**
 * Type-safe object key access
 * @template T The object type
 * @template K The key type
 * @param obj The object to access
 * @param key The key to access
 * @returns The value at the key or undefined
 */
export function safeObjectAccess<T extends object, K extends keyof T>(
  obj: T | null | undefined,
  key: K
): T[K] | undefined {
  return isDefined(obj) && hasProperty(obj, key) ? obj[key] : undefined;
}

/**
 * Validates and returns a typed object property
 * @template T The object type
 * @template K The property key
 * @param obj The object to check
 * @param key The property key
 * @param validator Type guard function for the property
 * @returns The property value if valid, undefined otherwise
 */
export function getValidProperty<T extends object, K extends keyof T, V>(
  obj: T | null | undefined,
  key: K,
  validator: (value: unknown) => value is V
): V | undefined {
  const value = safeObjectAccess(obj, key);
  return validator(value) ? value : undefined;
}