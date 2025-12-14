/**
 * Unit Inference and Mismatch Detection
 *
 * Per CA-SEMANTIC-LOCK.md Section 3.4:
 * - commitment < 10,000 → assume $M scale (multiply by 1M)
 * - commitment >= 10,000 → assume raw dollars
 * - Ratio-based mismatch detector (>100,000x difference = error)
 *
 * @see docs/CA-SEMANTIC-LOCK.md Section 3.4
 */

/**
 * Million scale multiplier for small commitment values.
 */
export const MILLION = 1_000_000;

/**
 * Threshold for inferring $M scale vs raw dollars.
 * Values below this are assumed to be in $M.
 */
export const SCALE_INFERENCE_THRESHOLD = 10_000;

/**
 * Maximum ratio difference before triggering mismatch error.
 * If two values differ by more than this factor, they're likely in different units.
 */
export const MISMATCH_RATIO_THRESHOLD = 100_000;

/**
 * Unit scale types.
 */
export type UnitScale = 'millions' | 'dollars';

/**
 * Infer unit scale from commitment value.
 *
 * Per semantic lock:
 * - commitment < 10,000 → $M scale (returns MILLION)
 * - commitment >= 10,000 → raw dollars (returns 1)
 *
 * @param commitment - Fund commitment value
 * @returns Scale multiplier (MILLION or 1)
 */
export function inferUnitScale(commitment: number): number {
  if (commitment < SCALE_INFERENCE_THRESHOLD) {
    return MILLION;
  }
  return 1;
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
 * Convert a value to cents based on inferred scale.
 *
 * @param value - Input value (in $M or $ depending on commitment)
 * @param commitmentForScale - Commitment value to infer scale from
 * @returns Value in cents
 */
export function toCentsWithInference(value: number, commitmentForScale: number): number {
  const scale = inferUnitScale(commitmentForScale);
  return Math.round(value * scale * 100);
}

/**
 * Convert cents back to original units.
 *
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
