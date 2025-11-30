/**
 * Waterfall update utilities
 * Pure functions for type-safe, validated updates to Waterfall configuration
 */

import { WaterfallSchema, type Waterfall } from '@shared/types';

/**
 * Type guard: Check if waterfall is AMERICAN variant
 * Note: Always returns true since AMERICAN is now the only waterfall type
 */
export const isAmerican = (w: Waterfall): w is Extract<Waterfall, { type: 'AMERICAN' }> =>
  w.type === 'AMERICAN';

/**
 * Clamp an integer to [min, max] range
 */
const clampInt = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(n)));

/**
 * Apply a validated update to a Waterfall object
 *
 * Features:
 * - Validates carryVesting bounds (cliffYears: 0-10, vestingYears: 1-10)
 * - Returns immutable updates
 * - Performance: No-op returns same reference
 *
 * @param w - Current waterfall state
 * @param field - Field name to update
 * @param value - New value for the field
 * @returns Updated waterfall (or unchanged if update is invalid)
 */

// Overload: Type-safe carryVesting updates
export function applyWaterfallChange(
  w: Waterfall,
  field: 'carryVesting',
  value: Waterfall['carryVesting']
): Waterfall;

// Fallback: Dynamic field updates
// eslint-disable-next-line no-redeclare
export function applyWaterfallChange(w: Waterfall, field: string, value: unknown): Waterfall;

// Implementation
// eslint-disable-next-line no-redeclare
export function applyWaterfallChange(w: Waterfall, field: string, value: unknown): Waterfall {
  // Handle carryVesting with bounds validation
  if (field === 'carryVesting') {
    // Runtime validation: Ensure value has correct shape before type assertion
    if (
      !value ||
      typeof value !== 'object' ||
      !('cliffYears' in value) ||
      !('vestingYears' in value) ||
      typeof (value as Record<string, unknown>)['cliffYears'] !== 'number' ||
      typeof (value as Record<string, unknown>)['vestingYears'] !== 'number'
    ) {
      // Invalid value provided, return original state unchanged
      return w;
    }

    const cv = value as Waterfall['carryVesting'];
    const cliffYears = clampInt(cv.cliffYears, 0, 10);
    const vestingYears = clampInt(cv.vestingYears, 1, 10);

    // No-op optimization: return same reference if values unchanged
    if (w.carryVesting.cliffYears === cliffYears && w.carryVesting.vestingYears === vestingYears) {
      return w;
    }

    return {
      ...w,
      carryVesting: { cliffYears, vestingYears },
    };
  }

  // Guard: Reject all other field updates (AMERICAN waterfall only has 'type' and 'carryVesting')
  // 'type' field is immutable (always 'AMERICAN')
  // This prevents type-unsafe field additions that violate WaterfallSchema.strict()
  return w; // Return unchanged for unknown/invalid fields
}

/**
 * Create a default American waterfall configuration
 *
 * @param overrides - Optional overrides for default values
 * @returns Validated American waterfall configuration
 */
export function createDefaultWaterfall(overrides?: Partial<Waterfall>): Waterfall {
  return WaterfallSchema.parse({
    type: 'AMERICAN',
    carryVesting: {
      cliffYears: 0,
      vestingYears: 4,
    },
    ...overrides,
  });
}
