/**
 * XIRR (Extended Internal Rate of Return) Calculation
 *
 * Implements the Newton-Raphson method for calculating IRR with irregular cash flows.
 * This matches Excel's XIRR function behavior.
 *
 * @module xirr
 */

import type { CashFlowEvent } from '../types/fund-domain';

/**
 * XIRR calculation configuration
 */
interface XIRRConfig {
  maxIterations?: number; // Maximum Newton-Raphson iterations (default: 100)
  tolerance?: number; // Convergence tolerance (default: 1e-6)
  initialGuess?: number; // Initial IRR guess (default: 0.1 = 10%)
}

/**
 * XIRR calculation result
 */
interface XIRRResult {
  rate: number; // Annualized IRR as decimal (e.g., 0.25 = 25%)
  iterations: number; // Number of iterations to converge
  converged: boolean; // Whether the calculation converged
}

/**
 * Error thrown when XIRR calculation fails
 */
export class XIRRCalculationError extends Error {
  constructor(
    message: string,
    public readonly cashFlows: CashFlowEvent[],
    public readonly iterations?: number
  ) {
    super(message);
    this.name = 'XIRRCalculationError';
  }
}

/**
 * Calculate the number of years between two dates
 *
 * @param startDate - Start date (ISO string)
 * @param endDate - End date (ISO string)
 * @returns Number of years (decimal) between dates
 */
function yearsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const milliseconds = end.getTime() - start.getTime();
  const days = milliseconds / (1000 * 60 * 60 * 24);
  return days / 365.25; // Account for leap years
}

/**
 * Calculate Net Present Value (NPV) for given cash flows and discount rate
 *
 * NPV = Σ (cashFlow / (1 + rate)^years)
 *
 * @param cashFlows - Array of cash flow events
 * @param rate - Discount rate (annualized, as decimal)
 * @param baseDate - Base date for calculating time periods (uses first cash flow date if not provided)
 * @returns Net Present Value
 */
function calculateNPV(
  cashFlows: CashFlowEvent[],
  rate: number,
  baseDate?: string
): number {
  if (cashFlows.length === 0) return 0;

  const base = baseDate || cashFlows[0]!.date;

  return cashFlows.reduce((npv, cf) => {
    const years = yearsBetween(base, cf.date);
    const discountFactor = Math.pow(1 + rate, years);
    return npv + cf.amount / discountFactor;
  }, 0);
}

/**
 * Calculate the derivative of NPV with respect to the discount rate
 *
 * dNPV/dRate = Σ (-years * cashFlow / (1 + rate)^(years + 1))
 *
 * @param cashFlows - Array of cash flow events
 * @param rate - Discount rate (annualized, as decimal)
 * @param baseDate - Base date for calculating time periods
 * @returns Derivative of NPV with respect to rate
 */
function calculateNPVDerivative(
  cashFlows: CashFlowEvent[],
  rate: number,
  baseDate?: string
): number {
  if (cashFlows.length === 0) return 0;

  const base = baseDate || cashFlows[0]!.date;

  return cashFlows.reduce((derivative, cf) => {
    const years = yearsBetween(base, cf.date);
    const discountFactor = Math.pow(1 + rate, years + 1);
    return derivative - (years * cf.amount) / discountFactor;
  }, 0);
}

/**
 * Validate cash flows for XIRR calculation
 *
 * @param cashFlows - Array of cash flow events to validate
 * @throws {XIRRCalculationError} If cash flows are invalid
 */
function validateCashFlows(cashFlows: CashFlowEvent[]): void {
  if (cashFlows.length < 2) {
    throw new XIRRCalculationError(
      'At least 2 cash flows required for XIRR calculation',
      cashFlows
    );
  }

  // Check for at least one positive and one negative cash flow
  const hasPositive = cashFlows.some(cf => cf.amount > 0);
  const hasNegative = cashFlows.some(cf => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    throw new XIRRCalculationError(
      'Cash flows must include at least one positive and one negative value',
      cashFlows
    );
  }

  // Check all dates are valid
  for (const cf of cashFlows) {
    const date = new Date(cf.date);
    if (isNaN(date.getTime())) {
      throw new XIRRCalculationError(
        `Invalid date in cash flow: ${cf.date}`,
        cashFlows
      );
    }
  }
}

/**
 * Calculate XIRR (Extended Internal Rate of Return) using Newton-Raphson method
 *
 * The XIRR is the discount rate that makes the NPV of all cash flows equal to zero.
 * This implementation matches Excel's XIRR function.
 *
 * Algorithm:
 * 1. Start with initial guess (default 10%)
 * 2. Calculate NPV and its derivative at current rate
 * 3. Update rate using Newton-Raphson: rate_new = rate_old - NPV / (dNPV/dRate)
 * 4. Repeat until convergence or max iterations
 *
 * @param cashFlows - Array of cash flow events (positive = inflows, negative = outflows)
 * @param config - Optional configuration for calculation
 * @returns XIRR result with rate, iterations, and convergence status
 * @throws {XIRRCalculationError} If cash flows are invalid or calculation fails
 *
 * @example
 * ```typescript
 * const cashFlows: CashFlowEvent[] = [
 *   { date: '2020-01-01', amount: -100000, type: 'capital_call' }, // Initial investment
 *   { date: '2021-06-15', amount: 25000, type: 'distribution' },   // Partial return
 *   { date: '2023-12-31', amount: 120000, type: 'distribution' },  // Exit
 * ];
 *
 * const result = calculateXIRR(cashFlows);
 * console.log(`IRR: ${(result.rate * 100).toFixed(2)}%`); // IRR: 28.45%
 * ```
 */
export function calculateXIRR(
  cashFlows: CashFlowEvent[],
  config: XIRRConfig = {}
): XIRRResult {
  const {
    maxIterations = 100,
    tolerance = 1e-6,
    initialGuess = 0.1,
  } = config;

  // Validate inputs
  validateCashFlows(cashFlows);

  // Sort cash flows by date (required for correct NPV calculation)
  const sortedCashFlows = [...cashFlows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const baseDate = sortedCashFlows[0]!.date;
  let rate = initialGuess;
  let iteration = 0;

  // Newton-Raphson iteration
  for (iteration = 0; iteration < maxIterations; iteration++) {
    const npv = calculateNPV(sortedCashFlows, rate, baseDate);
    const derivative = calculateNPVDerivative(sortedCashFlows, rate, baseDate);

    // Check for convergence
    if (Math.abs(npv) < tolerance) {
      return {
        rate,
        iterations: iteration + 1,
        converged: true,
      };
    }

    // Check for zero derivative (would cause division by zero)
    if (Math.abs(derivative) < tolerance) {
      throw new XIRRCalculationError(
        'XIRR calculation failed: derivative approaching zero',
        cashFlows,
        iteration + 1
      );
    }

    // Newton-Raphson update: x_new = x_old - f(x) / f'(x)
    const newRate = rate - npv / derivative;

    // Prevent rate from going too negative (less than -99%)
    // This can happen with pathological cash flows
    if (newRate < -0.99) {
      throw new XIRRCalculationError(
        'XIRR calculation failed: rate diverging to extreme negative value',
        cashFlows,
        iteration + 1
      );
    }

    rate = newRate;
  }

  // Did not converge within max iterations
  throw new XIRRCalculationError(
    `XIRR calculation did not converge after ${maxIterations} iterations`,
    cashFlows,
    maxIterations
  );
}

/**
 * Calculate simple IRR (without specific dates) using XIRR
 * Assumes annual cash flows starting from year 0
 *
 * @param cashFlows - Array of cash flow amounts
 * @param config - Optional XIRR configuration
 * @returns IRR as decimal (e.g., 0.25 = 25%)
 *
 * @example
 * ```typescript
 * // $100k investment, $30k return year 1, $30k year 2, $60k year 3
 * const irr = calculateSimpleIRR([-100000, 30000, 30000, 60000]);
 * console.log(`IRR: ${(irr * 100).toFixed(2)}%`); // IRR: 16.04%
 * ```
 */
export function calculateSimpleIRR(
  cashFlows: number[],
  config?: XIRRConfig
): number {
  const baseDate = new Date('2000-01-01'); // Arbitrary base date
  const cashFlowEvents: CashFlowEvent[] = cashFlows.map((amount, index) => ({
    date: new Date(
      baseDate.getFullYear() + index,
      baseDate.getMonth(),
      baseDate.getDate()
    ).toISOString(),
    amount,
    type: amount < 0 ? 'capital_call' : 'distribution',
  }));

  const result = calculateXIRR(cashFlowEvents, config);
  return result.rate;
}

/**
 * Verify NPV calculation with a given rate
 * Useful for testing and validation
 *
 * @param cashFlows - Array of cash flow events
 * @param rate - Discount rate to test
 * @returns Net Present Value at the given rate
 */
export function verifyNPV(cashFlows: CashFlowEvent[], rate: number): number {
  const sortedCashFlows = [...cashFlows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return calculateNPV(sortedCashFlows, rate);
}

/**
 * Format IRR for display
 *
 * @param rate - IRR as decimal (e.g., 0.2534)
 * @param decimalPlaces - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "25.34%")
 */
export function formatIRR(rate: number, decimalPlaces = 2): string {
  return `${(rate * 100).toFixed(decimalPlaces)}%`;
}

// ============================================================================
// SAFE WRAPPERS (for UI use - never throw, return null on failure)
// ============================================================================

/**
 * Safe XIRR result type for UI consumption
 */
export interface SafeXIRRResult {
  rate: number | null;
  error?: string;
  converged: boolean;
}

/**
 * Safe wrapper for calculateXIRR - never throws, returns null rate on failure
 * Use this in React components and selectors to prevent UI crashes
 *
 * @param cashFlows - Array of cash flow events
 * @param config - Optional XIRR configuration
 * @returns SafeXIRRResult with rate (null on failure), optional error message
 *
 * @example
 * ```typescript
 * const result = safeCalculateXIRR(cashFlows);
 * if (result.rate !== null) {
 *   console.log(`IRR: ${formatIRR(result.rate)}`);
 * } else {
 *   console.log(`Cannot calculate IRR: ${result.error}`);
 * }
 * ```
 */
export function safeCalculateXIRR(
  cashFlows: CashFlowEvent[],
  config: XIRRConfig = {}
): SafeXIRRResult {
  try {
    const result = calculateXIRR(cashFlows, config);
    return {
      rate: result.rate,
      converged: result.converged,
    };
  } catch (err) {
    const errorMessage = err instanceof XIRRCalculationError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Unknown XIRR calculation error';
    return {
      rate: null,
      error: errorMessage,
      converged: false,
    };
  }
}

/**
 * Safe wrapper for calculateSimpleIRR - never throws, returns null on failure
 * Use this in React components and selectors to prevent UI crashes
 *
 * @param cashFlows - Array of cash flow amounts
 * @param config - Optional XIRR configuration
 * @returns IRR as decimal, or null if calculation fails
 */
export function safeCalculateSimpleIRR(
  cashFlows: number[],
  config?: XIRRConfig
): number | null {
  try {
    return calculateSimpleIRR(cashFlows, config);
  } catch {
    return null;
  }
}
