/**
 * Truth Case Helper Functions
 *
 * Reusable assertion helpers for validating truth case scenarios.
 * Supports numeric precision, null/undefined semantics, and range assertions.
 */

import { expect } from 'vitest';
import Decimal from 'decimal.js';

/**
 * Assert numeric field matches expected value within specified decimal precision.
 *
 * Uses Vitest toBeCloseTo for floating-point comparison with tolerance.
 * Handles both Decimal.js and native number types.
 *
 * @param actual - Actual value (Decimal or number)
 * @param expected - Expected value (number)
 * @param decimals - Decimal places for precision (default: 6)
 * @throws AssertionError if values differ beyond tolerance
 */
export function assertNumericField(
  actual: number | Decimal,
  expected: number,
  decimals: number = 6
): void {
  const actualNumber = actual instanceof Decimal ? actual.toNumber() : actual;
  expect(actualNumber).toBeCloseTo(expected, decimals);
}

/**
 * Strip 'notes' field from object (immutable).
 *
 * Truth case JSON files include 'notes' for documentation.
 * These must be removed before comparing expectations to actual results.
 *
 * @param obj - Object with potential 'notes' field
 * @returns New object without 'notes' field
 */
export function stripNotes<T extends Record<string, unknown>>(obj: T): Omit<T, 'notes'> {
  const { notes: _notes, ...rest } = obj;
  return rest as Omit<T, 'notes'>;
}

/**
 * Handle null vs undefined semantics.
 *
 * Truth case JSON convention: `fieldName: null` means "expect undefined in code".
 * This handles the JSON serialization limitation (undefined doesn't exist in JSON).
 *
 * @param expected - Expected object (from JSON)
 * @param actual - Actual object (from production code)
 * @param field - Field name to check
 * @throws AssertionError if semantics violated
 *
 * @example
 * // JSON: { gpClawback: null }
 * // Code: { gpClawback: undefined }
 * handleNullUndefined({ gpClawback: null }, { gpClawback: undefined }, 'gpClawback');
 * // ✓ Passes
 */
export function handleNullUndefined(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  field: string
): void {
  const expectedValue = expected[field];
  const actualValue = actual[field];

  if (expectedValue === null) {
    // JSON null → expect undefined in code
    expect(actualValue).toBeUndefined();
  } else {
    // Otherwise values must match
    expect(actualValue).toBe(expectedValue);
  }
}

/**
 * Assert value is within [min, max] range.
 *
 * Used for range-based truth cases (e.g., recycled_min/recycled_max).
 * Skips checks if min/max are undefined.
 *
 * @param actual - Actual value to validate
 * @param min - Minimum allowed value (undefined = no min check)
 * @param max - Maximum allowed value (undefined = no max check)
 * @throws AssertionError if value outside range
 */
export function assertRange(
  actual: number,
  min: number | undefined,
  max: number | undefined
): void {
  if (min !== undefined) {
    expect(actual).toBeGreaterThanOrEqual(min);
  }
  if (max !== undefined) {
    expect(actual).toBeLessThanOrEqual(max);
  }
}
