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
 * Type guard: Validate carryVesting shape
 *
 * Extracts complex boolean checks to reduce cyclomatic complexity
 * in the main applyWaterfallChange function.
 *
 * @param value - Unknown value to validate
 * @returns True if value is a valid CarryVesting object
 * @internal
 */
function isValidCarryVesting(value: unknown): value is Waterfall['carryVesting'] {
  // Early exit for non-objects
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Cast to record to safely check properties
  const v = value as Record<string, unknown>;

  // Verify required numeric properties exist
  return typeof v.cliffYears === 'number' && typeof v.vestingYears === 'number';
}

/**
 * Helper: Handle carryVesting updates with validation and clamping
 *
 * @param w - Current waterfall state
 * @param value - New carryVesting value to apply
 * @returns Updated waterfall (or unchanged if validation fails)
 * @internal
 */
function updateCarryVesting(w: Waterfall, value: unknown): Waterfall {
  // Runtime validation
  if (!isValidCarryVesting(value)) {
    return w;
  }

  const cliffYears = clampInt(value.cliffYears, 0, 10);
  const vestingYears = clampInt(value.vestingYears, 1, 10);

  // No-op optimization: return same reference if values unchanged
  if (w.carryVesting.cliffYears === cliffYears && w.carryVesting.vestingYears === vestingYears) {
    return w;
  }

  return {
    ...w,
    carryVesting: { cliffYears, vestingYears },
  };
}

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
  if (field === 'carryVesting') {
    return updateCarryVesting(w, value);
  }

  // Guard: Reject all other field updates (AMERICAN waterfall only has 'type' and 'carryVesting')
  // 'type' field is immutable (always 'AMERICAN')
  // This prevents type-unsafe field additions that violate WaterfallSchema.strict()
  return w;
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
