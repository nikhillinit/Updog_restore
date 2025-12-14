/**
 * Unit Inference and Mismatch Detection
 *
 * HYBRID APPROACH:
 * 1. Honor explicit `units: 'millions' | 'raw'` configuration (PREFERRED)
 * 2. Clear inference for extreme values (< 1K = millions, >= 10M = raw)
 * 3. FAIL-FAST for ambiguous zone (1K-10M) - require explicit config
 * 4. Ratio-based mismatch detector (>100,000x difference = error)
 * 5. Sanity cap at $1 Trillion (catches catastrophic scaling errors)
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 3.4
 */

import { dollarsToCents } from './rounding';

/**
 * Million scale multiplier for small commitment values.
 */
export const MILLION = 1_000_000;

/**
 * Threshold for clear $M inference (< 1K → definitely millions).
 * Below this, values are unambiguously in millions.
 */
export const SCALE_MILLIONS_THRESHOLD = 1_000;

/**
 * Threshold for clear raw inference (>= 10M → definitely raw).
 * Above this, values are unambiguously raw dollars.
 */
export const SCALE_RAW_THRESHOLD = 10_000_000;

/**
 * Legacy threshold for backwards compatibility.
 * @deprecated Use SCALE_MILLIONS_THRESHOLD and SCALE_RAW_THRESHOLD instead
 */
export const SCALE_INFERENCE_THRESHOLD = 10_000;

/**
 * Maximum ratio difference before triggering mismatch error.
 * If two values differ by more than this factor, they're likely in different units.
 */
export const MISMATCH_RATIO_THRESHOLD = 100_000;

/**
 * Sanity cap in cents ($1 Trillion).
 * Prevents catastrophic scaling errors from producing impossible values.
 */
export const SANITY_CAP_CENTS = 100_000_000_000_000;

/**
 * Unit scale types.
 */
export type UnitScale = 'millions' | 'dollars';

/**
 * Explicit unit scale type for fund inputs.
 */
export type ExplicitUnits = 'millions' | 'raw';

/**
 * Detect and validate unit scale with hybrid approach.
 *
 * Priority:
 * 1. Explicit `units` config (PREFERRED - eliminates guessing)
 * 2. Clear inference: < 1K → millions, >= 10M → raw
 * 3. FAIL-FAST: Ambiguous zone (1K-10M) throws error
 *
 * @param commitment - Fund commitment value
 * @param explicitUnits - Optional explicit unit configuration
 * @returns Scale multiplier (MILLION or 1)
 * @throws Error if value is in ambiguous zone without explicit config
 */
export function inferUnitScale(
  commitment: number,
  explicitUnits?: ExplicitUnits
): number {
  // Validate positive commitment
  if (commitment <= 0) {
    throw new Error(`Invalid commitment amount: ${commitment}. Must be positive.`);
  }

  // 1. Honor explicit configuration (PREFERRED)
  if (explicitUnits === 'millions') return MILLION;
  if (explicitUnits === 'raw') return 1;

  // 2. Clear cases (no ambiguity)
  if (commitment < SCALE_MILLIONS_THRESHOLD) {
    // < 1K → definitely millions (e.g., 100 = $100M)
    return MILLION;
  }

  if (commitment >= SCALE_RAW_THRESHOLD) {
    // >= 10M → definitely raw dollars
    return 1;
  }

  // 3. Ambiguous zone (1K - 10M): FAIL-FAST
  // Example: commitment = 50,000 could be $50K raw or $50B in millions
  throw new Error(
    `Commitment ${commitment.toLocaleString()} falls in ambiguous range (1K - 10M). ` +
    `Unable to determine if this is raw dollars or millions. ` +
    `Provide explicit 'units: "millions" | "raw"' in fund configuration to disambiguate.`
  );
}

/**
 * Get the unit scale type as a string.
 *
 * @param commitment - Fund commitment value
 * @returns 'millions' or 'dollars'
 */
export function inferUnitScaleType(commitment: number): UnitScale {
  return commitment < SCALE_INFERENCE_THRESHOLD ? 'millions' : 'dollars';
}

/**
 * Convert a value to cents based on unit scale.
 * Uses banker's rounding per CA-SEMANTIC-LOCK.md Section 4.1.
 *
 * @param value - Input value (in $M or $ depending on scale)
 * @param unitScale - Scale multiplier (MILLION or 1)
 * @returns Value in cents (integer)
 */
export function toCentsWithInference(value: number, unitScale: number): number {
  // Convert to dollars first (apply scale), then to cents with banker's rounding
  const dollars = value * unitScale;
  return dollarsToCents(dollars);
}

/**
 * Validate that the calculated cents don't exceed sanity cap.
 *
 * @param cents - Calculated cents value
 * @param fieldName - Name of the field for error message
 * @param inputValue - Original input value for error context
 * @param scale - Applied scale for error context
 * @throws Error if value exceeds $1 Trillion
 */
export function validateSanityCap(
  cents: number,
  fieldName: string,
  inputValue: number,
  scale: number
): void {
  if (cents > SANITY_CAP_CENTS) {
    throw new Error(
      `${fieldName} exceeds $1 Trillion sanity cap. ` +
      `Input: ${inputValue}, Scale: ${scale}x, Result: $${(cents / 100).toLocaleString()}. ` +
      `Check input units - you may have applied millions scale to a raw dollar value.`
    );
  }
}

/**
 * Convert cents back to original units.
 *
 * @param cents - Value in cents
 * @param unitScale - Scale multiplier (MILLION or 1) - should be passed from context, NOT re-inferred
 * @returns Value in original units ($M or $)
 */
export function fromCentsWithScale(cents: number, unitScale: number): number {
  return cents / (unitScale * 100);
}

/**
 * Convert cents back to original units (legacy wrapper).
 *
 * @deprecated Use fromCentsWithScale with explicit unitScale to avoid re-inference bugs
 * @param cents - Value in cents
 * @param commitmentForScale - Commitment value to infer scale from
 * @returns Value in original units ($M or $)
 */
export function fromCentsWithInference(cents: number, commitmentForScale: number): number {
  const scale = inferUnitScale(commitmentForScale);
  return cents / (scale * 100);
}

/**
 * Check if two values appear to be in mismatched units.
 * Uses ratio-based detection (not absolute difference).
 *
 * @param value1 - First value
 * @param value2 - Second value
 * @returns true if values appear to be in different units
 */
export function detectUnitMismatch(value1: number, value2: number): boolean {
  // Handle zero/near-zero cases
  if (value1 === 0 || value2 === 0) {
    return false; // Can't detect mismatch with zero
  }

  const ratio = Math.max(value1, value2) / Math.min(value1, value2);
  return ratio > MISMATCH_RATIO_THRESHOLD;
}

/**
 * Validate that all monetary fields use consistent units.
 * Throws if a mismatch is detected.
 *
 * Per semantic lock: "fail if commitment/buffer scale mismatch >100,000x"
 *
 * @param fields - Object with field names and values to check
 * @param referenceField - Field name to use as reference (usually 'commitment')
 * @throws Error if mismatch detected
 */
export function validateUnitConsistency(
  fields: Record<string, number | undefined | null>,
  referenceField: string = 'commitment'
): void {
  const referenceValue = fields[referenceField];

  if (referenceValue == null || referenceValue === 0) {
    return; // No reference to validate against
  }

  for (const [fieldName, value] of Object.entries(fields)) {
    if (fieldName === referenceField) continue;
    if (value == null || value === 0) continue;

    if (detectUnitMismatch(referenceValue, value)) {
      throw new Error(
        `Unit mismatch detected: ${referenceField}=${referenceValue} vs ${fieldName}=${value}. ` +
          `Ratio exceeds ${MISMATCH_RATIO_THRESHOLD}x. Ensure all values use the same unit scale.`
      );
    }
  }
}

/**
 * Normalize all monetary fields to cents using inferred scale.
 *
 * @param fields - Object with field names and values
 * @param commitmentForScale - Commitment value to infer scale from
 * @returns Object with same keys but values in cents
 */
export function normalizeFieldsToCents<T extends Record<string, number | undefined | null>>(
  fields: T,
  commitmentForScale: number
): Record<keyof T, number> {
  const result = {} as Record<keyof T, number>;

  for (const [key, value] of Object.entries(fields)) {
    result[key as keyof T] = value != null ? toCentsWithInference(value, commitmentForScale) : 0;
  }

  return result;
}

/**
 * Input validation for CA engine.
 * Validates units and returns normalized values in cents.
 */
export interface CAInputValidation {
  commitmentCents: number;
  minCashBufferCents: number;
  targetReserveCents: number;
  unitScale: UnitScale;
  unitScaleMultiplier: number;
}

/**
 * Validate and normalize CA input values.
 *
 * @param commitment - Fund commitment
 * @param minCashBuffer - Minimum cash buffer constraint
 * @param targetReservePct - Target reserve percentage (0-1)
 * @returns Validated and normalized values
 * @throws Error if unit mismatch detected
 */
export function validateAndNormalizeCAInput(
  commitment: number,
  minCashBuffer: number | undefined | null,
  targetReservePct: number | undefined | null
): CAInputValidation {
  const unitScale = inferUnitScaleType(commitment);
  const unitScaleMultiplier = inferUnitScale(commitment);

  // Validate unit consistency
  if (minCashBuffer != null && minCashBuffer !== 0) {
    validateUnitConsistency(
      {
        commitment,
        minCashBuffer,
      },
      'commitment'
    );
  }

  // Calculate target reserve in same units
  const targetReserve = commitment * (targetReservePct ?? 0);

  // Convert to cents
  const commitmentCents = Math.round(commitment * unitScaleMultiplier * 100);
  const minCashBufferCents = Math.round((minCashBuffer ?? 0) * unitScaleMultiplier * 100);
  const targetReserveCents = Math.round(targetReserve * unitScaleMultiplier * 100);

  return {
    commitmentCents,
    minCashBufferCents,
    targetReserveCents,
    unitScale,
    unitScaleMultiplier,
  };
}
