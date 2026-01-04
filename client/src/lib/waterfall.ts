/**
 * Waterfall update utilities
 * Pure functions for type-safe, validated updates to Waterfall configuration
 */

import { WaterfallSchema, type Waterfall } from '@shared/types';

/**
 * Clamp an integer to [min, max] range
 */
const clampInt = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(n)));

/**
 * Type guard: Validate carryVesting shape
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
  return typeof v['cliffYears'] === 'number' && typeof v['vestingYears'] === 'number';
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
export function applyWaterfallChange(
  w: Waterfall,
  field: 'carryVesting' | string,
  value: Waterfall['carryVesting'] | unknown
): Waterfall {
  switch (field) {
    case 'carryVesting':
      return updateCarryVesting(w, value);
    default:
      // Ignore updates to unknown fields
      return w;
  }
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

/**
 * Validate a waterfall object against the schema
 *
 * @param w - Waterfall object to validate
 * @returns True if valid, false otherwise
 */
export function isValidWaterfall(w: unknown): w is Waterfall {
  return WaterfallSchema.safeParse(w).success;
}
