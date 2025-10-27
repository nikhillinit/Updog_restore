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
export function applyWaterfallChange(
  w: Waterfall,
  field: string,
  value: unknown
): Waterfall;

// Implementation
export function applyWaterfallChange(
  w: Waterfall,
  field: string,
  value: unknown
): Waterfall {
  // Handle carryVesting with bounds validation
  if (field === 'carryVesting') {
    const cv = value as Waterfall['carryVesting'];
    const cliffYears = clampInt(cv.cliffYears, 0, 10);
    const vestingYears = clampInt(cv.vestingYears, 1, 10);

    // No-op optimization: return same reference if values unchanged
    if (w.carryVesting.cliffYears === cliffYears && w.carryVesting.vestingYears === vestingYears) {
      return w;
    }

    return {
      ...w,
      carryVesting: { cliffYears, vestingYears }
    };
  }

  // Default: pass-through update with type assertion
  return { ...w, [field]: value } as Waterfall;
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
      vestingYears: 4
    },
    ...overrides
  });
}
