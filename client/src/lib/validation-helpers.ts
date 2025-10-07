/**
 * Validation Helpers
 *
 * This module provides validation utilities for ensuring data integrity
 * and preventing runtime errors due to invalid data types.
 *
 * @fileoverview Data validation and transformation utilities
 */

import { isDefined, isValidNumber, isNonEmptyString } from './type-guards';

/**
 * Validates and ensures a value is a safe number for financial calculations
 * @param value The value to validate
 * @param fallback Default value if invalid (default: 0)
 * @returns A valid number safe for calculations
 */
export function ensureFinancialNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && isValidNumber(value)) {
    return value;
  }

  if (typeof value === 'string' && isNonEmptyString(value)) {
    const parsed = parseFloat(value.replace(/[,$%]/g, ''));
    return isValidNumber(parsed) ? parsed : fallback;
  }

  return fallback;
}

/**
 * Validates and ensures a value is a safe percentage (0-100)
 * @param value The value to validate
 * @param fallback Default value if invalid (default: 0)
 * @returns A valid percentage between 0 and 100
 */
export function ensurePercentage(value: unknown, fallback: number = 0): number {
  const num = ensureFinancialNumber(value, fallback);
  return Math.max(0, Math.min(100, num));
}

/**
 * Validates and ensures a value is a safe ratio (0-1)
 * @param value The value to validate
 * @param fallback Default value if invalid (default: 0)
 * @returns A valid ratio between 0 and 1
 */
export function ensureRatio(value: unknown, fallback: number = 0): number {
  const num = ensureFinancialNumber(value, fallback);
  return Math.max(0, Math.min(1, num));
}

/**
 * Validates and ensures a string is safe for display
 * @param value The value to validate
 * @param fallback Default value if invalid (default: empty string)
 * @returns A safe string for display
 */
export function ensureDisplayString(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && isValidNumber(value)) {
    return value.toString();
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

/**
 * Validates and ensures a date string is valid
 * @param value The value to validate
 * @param fallback Default value if invalid (default: current date ISO string)
 * @returns A valid ISO date string
 */
export function ensureDateString(value: unknown, fallback?: string): string {
  const defaultFallback = fallback ?? new Date().toISOString().split('T')[0];

  if (typeof value === 'string' && isNonEmptyString(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return value;
    }
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  return defaultFallback;
}

/**
 * Validates an array and ensures all elements are defined
 * @template T The expected element type
 * @param value The value to validate
 * @param validator Optional validator for each element
 * @returns A validated array with defined elements
 */
export function ensureValidArray<T>(
  value: unknown,
  validator?: (item: unknown) => item is T
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  if (validator) {
    return value.filter(validator);
  }

  return value.filter(isDefined) as T[];
}

/**
 * Validates an object and ensures required properties exist
 * @template T The expected object type
 * @param value The value to validate
 * @param requiredProps Array of required property names
 * @returns The validated object or null if invalid
 */
export function ensureValidObject<T extends object>(
  value: unknown,
  requiredProps: (keyof T)[]
): T | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const obj = value as T;

  for (const prop of requiredProps) {
    if (!(prop in obj) || !isDefined(obj[prop])) {
      return null;
    }
  }

  return obj;
}

/**
 * Creates a type-safe property extractor with validation
 * @template T The source object type
 * @template K The property key type
 * @template V The expected property value type
 * @param obj The source object
 * @param key The property key
 * @param validator Type guard for the property value
 * @param fallback Default value if property is invalid
 * @returns The validated property value or fallback
 */
export function extractValidProperty<T extends object, K extends keyof T, V>(
  obj: T | null | undefined,
  key: K,
  validator: (value: unknown) => value is V,
  fallback: V
): V {
  if (!isDefined(obj) || !(key in obj)) {
    return fallback;
  }

  const value = obj[key];
  return validator(value) ? value : fallback;
}

/**
 * Sanitizes user input for safe processing
 * @param input The user input to sanitize
 * @param maxLength Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export function sanitizeUserInput(input: unknown, maxLength: number = 1000): string {
  const str = ensureDisplayString(input);

  // Remove potentially dangerous characters and limit length
  let sanitized = str
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/[{}]/g, '') // Remove object notation
    .slice(0, maxLength)
    .trim();

  // Validate and remove dangerous URL schemes
  if (sanitized.includes('://')) {
    try {
      const url = new URL(sanitized);
      if (!['http:', 'https:', 'ftp:', 'mailto:'].includes(url.protocol)) {
        sanitized = sanitized.replace(url.protocol, '');
      }
    } catch {
      // If not a valid URL, remove protocol-like patterns
      sanitized = sanitized.replace(/\w+:/gi, '');
    }
  } else {
    // Remove protocol patterns like javascript:, vbscript:, etc.
    sanitized = sanitized.replace(/javascript:/gi, '').replace(/vbscript:/gi, '');
  }

  return sanitized;
}

/**
 * Validates numerical ranges for sliders and inputs
 * @param value The value to validate
 * @param min Minimum allowed value
 * @param max Maximum allowed value
 * @param step Step increment (for rounding)
 * @returns A value within the specified range
 */
export function ensureRange(
  value: unknown,
  min: number,
  max: number,
  step?: number
): number {
  let num = ensureFinancialNumber(value, min);

  // Clamp to range
  num = Math.max(min, Math.min(max, num));

  // Round to step if provided
  if (step && step > 0) {
    num = Math.round(num / step) * step;
  }

  return num;
}

/**
 * Type guard for checking if a value is a valid array index
 * @param value The value to check
 * @param arrayLength The length of the array
 * @returns True if the value is a valid array index
 */
export function isValidArrayIndex(value: unknown, arrayLength: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < arrayLength
  );
}

/**
 * Safely accesses an array element with validation
 * @template T The array element type
 * @param array The array to access
 * @param index The index to access
 * @param fallback Fallback value if access fails
 * @returns The array element or fallback
 */
export function safeArrayAccess<T>(
  array: T[] | null | undefined,
  index: unknown,
  fallback: T
): T {
  if (!Array.isArray(array) || !isValidArrayIndex(index, array.length)) {
    return fallback;
  }

  return array[index] ?? fallback;
}

/**
 * Creates a validated formatter for currency values
 * @param value The value to format
 * @param currency Currency code (default: 'USD')
 * @param locale Locale for formatting (default: 'en-US')
 * @returns Formatted currency string
 */
export function formatCurrencySafe(
  value: unknown,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  const num = ensureFinancialNumber(value, 0);

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  } catch {
    // Fallback to simple formatting if Intl fails
    return `$${num.toLocaleString()}`;
  }
}

/**
 * Creates a validated formatter for percentage values
 * @param value The value to format (as decimal, e.g., 0.15 for 15%)
 * @param decimals Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatPercentageSafe(
  value: unknown,
  decimals: number = 1
): string {
  const num = ensureFinancialNumber(value, 0);
  return `${(num * 100).toFixed(decimals)}%`;
}