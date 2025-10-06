/**
 * Waterfall update utilities
 * Pure functions for type-safe, validated updates to Waterfall discriminated unions
 */

import { WaterfallSchema, type Waterfall } from '@shared/types';

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
 * @param field - Field name to update (use changeWaterfallType() for 'type' field)
 * @param value - New value for the field
 * @returns Updated waterfall (or unchanged if update is invalid)
 */

// Overload: Type-safe carryVesting updates
export function applyWaterfallChange(
  w: Waterfall,
  field: 'carryVesting',
  value: Waterfall['carryVesting']
): Waterfall;

// Overload: Type-safe hurdle/catchUp updates
export function applyWaterfallChange(
  w: Waterfall,
  field: 'hurdle' | 'catchUp',
  value: number
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
  // Guard: Prevent EUROPEAN-only fields on AMERICAN waterfall
  if (isAmerican(w) && (field === 'hurdle' || field === 'catchUp')) {
    console.warn(`Field "${field}" is only valid for EUROPEAN waterfall`);
    return w; // Return unchanged
  }

  // Handle type change: route to schema-backed switcher
  if (field === 'type') {
    return changeWaterfallType(w, value as Waterfall['type']);
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

/**
 * Schema-backed waterfall type switching
 *
 * Enforces Zod schema validation when changing waterfall types.
 * - AMERICAN → EUROPEAN: Adds default hurdle (8%) and catchUp (8%)
 * - EUROPEAN → AMERICAN: Strips hurdle/catchUp fields
 * - No-op if already target type (returns same reference)
 *
 * @param w - Current waterfall state
 * @param nextType - Target waterfall type
 * @returns Updated waterfall with schema-validated structure
 *
 * @example
 * const american = { type: 'AMERICAN', carryVesting: { cliffYears: 0, vestingYears: 4 } };
 * const european = changeWaterfallType(american, 'EUROPEAN');
 * // Result: { type: 'EUROPEAN', carryVesting: {...}, hurdle: 0.08, catchUp: 0.08 }
 */
export function changeWaterfallType(
  w: Waterfall,
  nextType: Waterfall['type']
): Waterfall {
  // No-op: already target type
  if (nextType === w.type) return w;

  const base = { carryVesting: { ...w.carryVesting } };

  // Switching to AMERICAN: strip EUROPEAN-only fields
  if (nextType === 'AMERICAN') {
    return WaterfallSchema.parse({
      type: 'AMERICAN',
      ...base
    });
  }

  // Switching to EUROPEAN: preserve or add hurdle/catchUp
  const hurdle = w.type === 'EUROPEAN' ? clamp01(w.hurdle) : 0.08;
  const catchUp = w.type === 'EUROPEAN' ? clamp01(w.catchUp) : 0.08;

  return WaterfallSchema.parse({
    type: 'EUROPEAN',
    ...base,
    hurdle,
    catchUp
  });
}
