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
    `Commitment ${commitment} falls in ambiguous range (${SCALE_MILLIONS_THRESHOLD} - ${SCALE_RAW_THRESHOLD}). ` +
    `Unable to determine if this is raw dollars or millions. ` +
    `Provide explicit 'units: "millions" | "raw"' in fund configuration to disambiguate.`
  );
}

/**
 * Get the unit scale type as a human-readable string.
 *
 * Uses the same thresholds as inferUnitScale:
 * - < SCALE_MILLIONS_THRESHOLD (1K): 'millions'
 * - >= SCALE_RAW_THRESHOLD (10M): 'dollars'
 * - Ambiguous zone: throws error
 *
 * @param commitment - Fund commitment value
 * @param explicitUnits - Optional explicit unit configuration
 * @returns 'millions' or 'dollars'
 * @throws Error if value is in ambiguous zone without explicit config
 */
export function inferUnitScaleType(
  commitment: number,
  explicitUnits?: ExplicitUnits
): UnitScale {
  // Honor explicit config first
  if (explicitUnits === 'millions') return 'millions';
  if (explicitUnits === 'raw') return 'dollars';

  // Check for invalid values
  if (commitment <= 0) {
    throw new Error(`Invalid commitment amount: ${commitment}. Must be positive.`);
  }

  // Clear cases
  if (commitment < SCALE_MILLIONS_THRESHOLD) return 'millions';
  if (commitment >= SCALE_RAW_THRESHOLD) return 'dollars';

  // Ambiguous zone - fail fast
  throw new Error(
    `Commitment ${commitment} falls in ambiguous range ` +
    `(${SCALE_MILLIONS_THRESHOLD} - ${SCALE_RAW_THRESHOLD}). ` +
    `Please specify explicit units: 'millions' or 'raw'.`
  );
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
  if (cents >= SANITY_CAP_CENTS) {
    const dollars = cents / 100;
    throw new Error(
      `${fieldName} exceeds $1 Trillion sanity cap. ` +
      `Input: ${inputValue}, Scale: ${scale}x, Result: $${dollars}. ` +
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
 * Convert cents back to original units using commitment-based inference.
 *
 * WARNING: This function RE-INFERS the scale from commitment, which can cause
 * bugs if the caller passes a unitScale instead of a commitment value.
 *
 * @deprecated Use fromCentsWithScale with explicit unitScale to avoid re-inference bugs.
 *             This function is kept only for backwards compatibility.
 * @param cents - Value in cents
 * @param commitmentForScale - Commitment value (NOT unitScale!) to infer scale from
 * @returns Value in original units ($M or $)
 */
export function fromCentsWithCommitmentInference(
  cents: number,
  commitmentForScale: number,
  explicitUnits?: ExplicitUnits
): number {
  const scale = inferUnitScale(commitmentForScale, explicitUnits);
  return fromCentsWithScale(cents, scale);
}

/**
 * @deprecated Alias for fromCentsWithCommitmentInference. Use fromCentsWithScale instead.
 */
export const fromCentsWithInference = fromCentsWithCommitmentInference;

/**
 * Check if two values appear to be in mismatched units.
 * Uses ratio-based detection (not absolute difference).
 *
 * Handles negative values correctly (e.g., recall flows) by using absolute values.
 *
 * @param value1 - First value (can be negative)
 * @param value2 - Second value (can be negative)
 * @returns true if values appear to be in different units
 */
export function detectUnitMismatch(value1: number, value2: number): boolean {
  // Use absolute values to handle negative flows (recalls, etc.)
  const a = Math.abs(value1);
  const b = Math.abs(value2);

  // Handle zero/near-zero cases
  if (a === 0 || b === 0) {
    return false; // Can't detect mismatch with zero
  }

  const ratio = Math.max(a, b) / Math.min(a, b);
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
  // CRITICAL: Infer the unitScale FIRST, then use it for all conversions
  // Do NOT pass commitmentForScale directly to toCentsWithInference
  const unitScale = inferUnitScale(commitmentForScale);
  const result = {} as Record<keyof T, number>;

  for (const [key, value] of Object.entries(fields)) {
    result[key as keyof T] = value != null ? toCentsWithInference(value, unitScale) : 0;
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
 * @param explicitUnits - Optional explicit unit configuration for ambiguous values
 * @returns Validated and normalized values
 * @throws Error if unit mismatch detected or ambiguous zone without explicit config
 */
export function validateAndNormalizeCAInput(
  commitment: number,
  minCashBuffer: number | undefined | null,
  targetReservePct: number | undefined | null,
  explicitUnits?: ExplicitUnits
): CAInputValidation {
  const unitScale = inferUnitScaleType(commitment, explicitUnits);
  const unitScaleMultiplier = inferUnitScale(commitment, explicitUnits);

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

  // Convert to cents using banker's rounding per semantic lock Section 4.1
  const commitmentCents = dollarsToCents(commitment * unitScaleMultiplier);
  validateSanityCap(commitmentCents, 'commitment', commitment, unitScaleMultiplier);

  const minCashBufferCents = dollarsToCents((minCashBuffer ?? 0) * unitScaleMultiplier);
  if (minCashBuffer != null && minCashBuffer !== 0) {
    validateSanityCap(minCashBufferCents, 'minCashBuffer', minCashBuffer, unitScaleMultiplier);
  }

  const targetReserveCents = roundPercentDerivedToCents(targetReserve * unitScaleMultiplier);
  // Target reserve derives from commitment, so if commitment passed sanity check,
  // target reserve (a percentage of it) will also pass - no need to double-check

  return {
    commitmentCents,
    minCashBufferCents,
    targetReserveCents,
    unitScale,
    unitScaleMultiplier,
  };
}
