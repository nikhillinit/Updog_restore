/**
 * Waterfall update utilities
 * Pure functions for type-safe, validated updates to Waterfall discriminated unions
 */

import type { Waterfall } from '@shared/types';

/**
 * Type guard: Check if waterfall is AMERICAN variant
 */
export const isAmerican = (w: Waterfall): w is Extract<Waterfall, { type: 'AMERICAN' }> =>
  w.type === 'AMERICAN';

/**
 * Type guard: Check if waterfall is EUROPEAN variant
 */
export const isEuropean = (w: Waterfall): w is Extract<Waterfall, { type: 'EUROPEAN' }> =>
  w.type === 'EUROPEAN';

/**
 * Clamp a number to [0, 1] range
 */
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Clamp an integer to [min, max] range
 */
const clampInt = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(n)));

/**
 * Apply a discriminant-aware, validated update to a Waterfall object
 *
 * Features:
 * - Prevents setting EUROPEAN-only fields (hurdle, catchUp) on AMERICAN waterfall
 * - Clamps hurdle/catchUp to [0, 1] range
 * - Validates carryVesting bounds (cliffYears: 0-10, vestingYears: 1-10)
 * - Returns immutable updates
 *
 * @param w - Current waterfall state
 * @param field - Field name to update
 * @param value - New value for the field
 * @returns Updated waterfall (or unchanged if update is invalid)
 */
export function applyWaterfallChange(
  w: Waterfall,
  field: string,
  value: unknown
): Waterfall {
  // Guard: Prevent EUROPEAN-only fields on AMERICAN waterfall
  if (isAmerican(w) && (field === 'hurdle' || field === 'catchUp')) {
    console.warn(`Field "${field}" is only valid for EUROPEAN waterfall`);
    return w; // Return unchanged
  }

  // Handle type change
  if (field === 'type') {
    const newType = value as Waterfall['type'];
    if (newType === 'AMERICAN') {
      // Switching to AMERICAN: strip EUROPEAN-only fields
      return {
        type: 'AMERICAN',
        carryVesting: w.carryVesting
      };
    } else if (newType === 'EUROPEAN') {
      // Switching to EUROPEAN: add default hurdle/catchUp
      return {
        type: 'EUROPEAN',
        carryVesting: w.carryVesting,
        hurdle: 0.08,
        catchUp: 0.08
      };
    }
  }

  // Handle hurdle/catchUp with clamping (EUROPEAN only)
  if (isEuropean(w) && (field === 'hurdle' || field === 'catchUp')) {
    const numValue = typeof value === 'number' ? clamp01(value) : 0;
    return { ...w, [field]: numValue };
  }

  // Handle carryVesting with bounds validation
  if (field === 'carryVesting') {
    const cv = value as Waterfall['carryVesting'];
    const cliffYears = clampInt(cv.cliffYears, 0, 10);
    const vestingYears = clampInt(cv.vestingYears, 1, 10);
    return {
      ...w,
      carryVesting: { cliffYears, vestingYears }
    };
  }

  // Default: pass-through update with type assertion
  return { ...w, [field]: value } as Waterfall;
}
