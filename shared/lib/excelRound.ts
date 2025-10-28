/**
 * Excel-compatible ROUND function with ties-away-from-zero semantics.
 *
 * Excel's ROUND function differs from JavaScript's Math.round() in how it handles
 * ties (values ending in exactly 0.5). Excel rounds ties away from zero, while
 * JavaScript uses "round half up" which can produce inconsistent results.
 *
 * This utility ensures calculation parity with Excel spreadsheets, critical for
 * financial modeling where users expect Excel-compatible rounding behavior.
 *
 * @example
 * ```typescript
 * excelRound(0.005, 2)   // 0.01  (tie rounds away from zero)
 * excelRound(-0.005, 2)  // -0.01 (tie rounds away from zero)
 * excelRound(2.345, 2)   // 2.35  (regular rounding)
 * excelRound(123.45, -1) // 120   (negative digits round to tens)
 * ```
 *
 * @param value - The number to round
 * @param numDigits - Number of decimal places (negative values round to tens/hundreds)
 * @returns Rounded value using Excel ROUND semantics
 * @throws {Error} If value is not finite or numDigits is not an integer
 *
 * @see ADR-004: Waterfall Rounding Contract
 */
export function excelRound(value: number, numDigits = 0): number {
  // Input validation
  if (!Number.isFinite(value)) {
    throw new Error(`excelRound: value must be finite, got ${value}`);
  }

  if (!Number.isInteger(numDigits)) {
    throw new Error(`excelRound: numDigits must be an integer, got ${numDigits}`);
  }

  // Special case: value is already zero
  if (value === 0) {
    return 0;
  }

  // Calculate scaling factor
  const factor = 10 ** numDigits;

  // Scale the value to move decimal point
  const scaled = value * factor;

  // Extract sign for tie-breaking
  const sign = Math.sign(scaled);
  const abs = Math.abs(scaled);

  // Small epsilon for floating-point comparison
  const EPS = 1e-12;

  // Check if we have a tie case (exactly X.5)
  const intPart = Math.floor(abs + EPS);
  const fracPart = abs - intPart;

  // Determine rounded absolute value
  let roundedAbs: number;

  if (Math.abs(fracPart - 0.5) < EPS) {
    // Exact tie case: round away from zero
    roundedAbs = intPart + 1;
  } else {
    // Regular rounding (JavaScript's Math.round is fine here)
    roundedAbs = Math.round(abs);
  }

  // Apply original sign and scale back
  const result = (sign >= 0 ? roundedAbs : -roundedAbs) / factor;

  return result;
}

/**
 * Type guard to check if a value requires rounding.
 * Useful for optimization - avoid unnecessary rounding operations.
 *
 * @param value - Number to check
 * @param numDigits - Decimal places to check against
 * @returns true if value would be unchanged by rounding
 *
 * @example
 * ```typescript
 * isAlreadyRounded(1.23, 2)    // true
 * isAlreadyRounded(1.234, 2)   // false
 * isAlreadyRounded(100, -1)    // true (already rounded to tens)
 * ```
 */
export function isAlreadyRounded(value: number, numDigits = 0): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  const factor = 10 ** numDigits;
  const scaled = value * factor;

  // Check if scaled value is effectively an integer
  const EPS = 1e-12;
  return Math.abs(scaled - Math.round(scaled)) < EPS;
}
