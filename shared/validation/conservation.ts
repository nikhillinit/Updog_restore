/**
 * Conservation of Capital Validation
 *
 * Ensures that total capital input equals total capital output within tolerance.
 * This is a critical financial constraint that must be maintained across all
 * reserve allocation and calculation engines.
 *
 * @module conservation
 */

/**
 * Default tolerance for conservation checks (0.01 = 1%)
 * Allows for minor rounding errors in financial calculations
 */
export const DEFAULT_CONSERVATION_TOLERANCE = 0.01;

/**
 * Result of a conservation check
 */
export interface ConservationCheckResult {
  isValid: boolean;
  totalInput: number;
  totalOutput: number;
  difference: number;
  percentageError: number;
  tolerance: number;
  message: string;
}

/**
 * Validate conservation of capital: total input = total output (within tolerance)
 *
 * @param inputs - Array of input capital amounts
 * @param outputs - Array of output capital amounts
 * @param tolerance - Acceptable percentage difference (default 0.01 = 1%)
 * @returns ConservationCheckResult with validation details
 *
 * @example
 * ```ts
 * const result = validateConservation([1000000], [900000, 100000]);
 * if (!result.isValid) {
 *   throw new Error(result.message);
 * }
 * ```
 */
export function validateConservation(
  inputs: number[],
  outputs: number[],
  tolerance: number = DEFAULT_CONSERVATION_TOLERANCE
): ConservationCheckResult {
  // Calculate totals
  const totalInput = inputs.reduce((sum, val) => sum + val, 0);
  const totalOutput = outputs.reduce((sum, val) => sum + val, 0);

  // Handle edge case: both zero
  if (totalInput === 0 && totalOutput === 0) {
    return {
      isValid: true,
      totalInput: 0,
      totalOutput: 0,
      difference: 0,
      percentageError: 0,
      tolerance,
      message: 'Conservation check passed (both totals are zero)',
    };
  }

  // Calculate difference and percentage error
  const difference = Math.abs(totalInput - totalOutput);
  const percentageError = totalInput !== 0 ? difference / totalInput : Infinity;

  // Check if within tolerance
  const isValid = percentageError <= tolerance;

  const message = isValid
    ? `Conservation check passed: input=${totalInput.toFixed(2)}, output=${totalOutput.toFixed(2)}, error=${(percentageError * 100).toFixed(4)}%`
    : `Conservation check FAILED: input=${totalInput.toFixed(2)}, output=${totalOutput.toFixed(2)}, error=${(percentageError * 100).toFixed(4)}% (tolerance=${(tolerance * 100).toFixed(2)}%)`;

  return {
    isValid,
    totalInput,
    totalOutput,
    difference,
    percentageError,
    tolerance,
    message,
  };
}

/**
 * Assert conservation of capital (throws on failure)
 *
 * @param inputs - Array of input capital amounts
 * @param outputs - Array of output capital amounts
 * @param tolerance - Acceptable percentage difference (default 0.01 = 1%)
 * @param context - Optional context string for error messages
 * @throws {ConservationError} if conservation check fails
 *
 * @example
 * ```ts
 * assertConservation(
 *   [fundSize],
 *   [deployedCapital, reserves],
 *   0.001,
 *   'Fund allocation'
 * );
 * ```
 */
export function assertConservation(
  inputs: number[],
  outputs: number[],
  tolerance: number = DEFAULT_CONSERVATION_TOLERANCE,
  context?: string
): void {
  const result = validateConservation(inputs, outputs, tolerance);

  if (!result.isValid) {
    const contextStr = context ? ` [${context}]` : '';
    throw new ConservationError(
      `${result.message}${contextStr}`,
      result
    );
  }
}

/**
 * Custom error for conservation validation failures
 */
export class ConservationError extends Error {
  constructor(
    message: string,
    public readonly details: ConservationCheckResult
  ) {
    super(message);
    this.name = 'ConservationError';
    Object.setPrototypeOf(this, ConservationError.prototype);
  }
}

/**
 * Validate reserve allocation conserves total capital
 *
 * @param availableReserves - Total available reserves
 * @param allocations - Array of individual allocations
 * @param unallocated - Remaining unallocated reserves
 * @param tolerance - Acceptable percentage difference
 * @returns ConservationCheckResult
 */
export function validateReserveAllocationConservation(
  availableReserves: number,
  allocations: number[],
  unallocated: number,
  tolerance: number = DEFAULT_CONSERVATION_TOLERANCE
): ConservationCheckResult {
  const totalAllocated = allocations.reduce((sum, val) => sum + val, 0);
  return validateConservation(
    [availableReserves],
    [totalAllocated, unallocated],
    tolerance
  );
}

/**
 * Validate portfolio investment conserves fund size
 *
 * @param fundSize - Total fund size
 * @param deployed - Deployed capital
 * @param reserves - Reserve capital
 * @param expenses - Operating expenses
 * @param tolerance - Acceptable percentage difference
 * @returns ConservationCheckResult
 */
export function validatePortfolioConservation(
  fundSize: number,
  deployed: number,
  reserves: number,
  expenses: number = 0,
  tolerance: number = DEFAULT_CONSERVATION_TOLERANCE
): ConservationCheckResult {
  return validateConservation(
    [fundSize],
    [deployed, reserves, expenses],
    tolerance
  );
}

/**
 * Create a conservation validator with custom tolerance
 *
 * @param tolerance - Custom tolerance for all checks
 * @returns Validation functions bound to custom tolerance
 */
export function createConservationValidator(tolerance: number) {
  return {
    validate: (inputs: number[], outputs: number[]) =>
      validateConservation(inputs, outputs, tolerance),
    assert: (inputs: number[], outputs: number[], context?: string) =>
      assertConservation(inputs, outputs, tolerance, context),
    validateReserveAllocation: (
      availableReserves: number,
      allocations: number[],
      unallocated: number
    ) =>
      validateReserveAllocationConservation(
        availableReserves,
        allocations,
        unallocated,
        tolerance
      ),
    validatePortfolio: (
      fundSize: number,
      deployed: number,
      reserves: number,
      expenses?: number
    ) =>
      validatePortfolioConservation(
        fundSize,
        deployed,
        reserves,
        expenses,
        tolerance
      ),
  };
}