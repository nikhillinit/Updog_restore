/**
 * CENTRALIZED PRECISION POLICY
 *
 * Single source of truth for numerical precision in financial calculations.
 * Uses decimal.js for arbitrary-precision arithmetic to avoid floating-point errors.
 *
 * Design Principle: All monetary calculations MUST use this module to ensure:
 * 1. Consistent precision across the application
 * 2. Elimination of floating-point rounding errors
 * 3. Auditable calculation results
 *
 * WARNING: Never use JavaScript's native arithmetic for financial calculations!
 *   ❌ const fee = fundSize * 0.02;           // Floating-point error
 *   ✅ const fee = multiply(fundSize, 0.02);  // Decimal.js precision
 *
 * References:
 * - IEEE 754 floating-point standard limitations
 * - decimal.js: https://mikemcl.github.io/decimal.js/
 * - Martin Fowler's "Money" pattern
 */

import Decimal from 'decimal.js';

// ============================================================================
// PRECISION CONFIGURATION
// ============================================================================

/**
 * Global precision policy
 * Defines significant figures and rounding modes for all financial calculations
 */
export const PRECISION_CONFIG = {
  /** Significant figures for internal calculations */
  CALCULATION_PRECISION: 20,

  /** Decimal places for monetary values ($) */
  MONEY_DECIMALS: 2,

  /** Decimal places for rates (e.g., 0.025000 = 2.5%) */
  RATE_DECIMALS: 6,

  /** Decimal places for percentages (e.g., 2.500000%) */
  PERCENTAGE_DECIMALS: 6,

  /** Decimal places for multiples (e.g., 2.500000x TVPI) */
  MULTIPLE_DECIMALS: 6,

  /** Decimal places for probabilities */
  PROBABILITY_DECIMALS: 6,

  /** Rounding mode for all calculations */
  ROUNDING_MODE: Decimal.ROUND_HALF_UP, // Standard banker's rounding

  /** Tolerance for equality comparisons */
  EQUALITY_EPSILON: 1e-6, // 0.000001
} as const;

// ============================================================================
// DECIMAL.JS CONFIGURATION
// ============================================================================

/**
 * Configure Decimal.js globally
 * This ensures all Decimal operations use consistent precision
 */
Decimal.set({
  precision: PRECISION_CONFIG.CALCULATION_PRECISION,
  rounding: PRECISION_CONFIG.ROUNDING_MODE,
  toExpNeg: -9e15,
  toExpPos: 9e15,
  maxE: 9e15,
  minE: -9e15,
});

// ============================================================================
// CORE ARITHMETIC OPERATIONS
// ============================================================================

/**
 * Add two numbers with precision
 * @example add(0.1, 0.2) → 0.3 (not 0.30000000000000004)
 */
export function add(a: number, b: number): number {
  return new Decimal(a).plus(b).toNumber();
}

/**
 * Subtract two numbers with precision
 */
export function subtract(a: number, b: number): number {
  return new Decimal(a).minus(b).toNumber();
}

/**
 * Multiply two numbers with precision
 */
export function multiply(a: number, b: number): number {
  return new Decimal(a).times(b).toNumber();
}

/**
 * Divide two numbers with precision
 * @throws Error if denominator is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return new Decimal(a).dividedBy(b).toNumber();
}

/**
 * Sum an array of numbers with precision
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => add(acc, n), 0);
}

/**
 * Calculate percentage of a value
 * @example percentageOf(100_000_000, 2.5) → 2_500_000 (2.5% of $100M)
 */
export function percentageOf(value: number, percentage: number): number {
  return multiply(value, divide(percentage, 100));
}

// ============================================================================
// ROUNDING FUNCTIONS
// ============================================================================

/**
 * Round to money precision (2 decimal places)
 * @example roundMoney(123.456789) → 123.46
 */
export function roundMoney(value: number): number {
  return new Decimal(value).toDecimalPlaces(PRECISION_CONFIG.MONEY_DECIMALS).toNumber();
}

/**
 * Round to rate precision (6 decimal places)
 * @example roundRate(0.123456789) → 0.123457
 */
export function roundRate(value: number): number {
  return new Decimal(value).toDecimalPlaces(PRECISION_CONFIG.RATE_DECIMALS).toNumber();
}

/**
 * Round to percentage precision (6 decimal places)
 * @example roundPercentage(12.3456789) → 12.345679
 */
export function roundPercentage(value: number): number {
  return new Decimal(value).toDecimalPlaces(PRECISION_CONFIG.PERCENTAGE_DECIMALS).toNumber();
}

/**
 * Round to multiple precision (6 decimal places)
 * @example roundMultiple(2.3456789) → 2.345679
 */
export function roundMultiple(value: number): number {
  return new Decimal(value).toDecimalPlaces(PRECISION_CONFIG.MULTIPLE_DECIMALS).toNumber();
}

/**
 * Round to arbitrary decimal places
 */
export function round(value: number, decimalPlaces: number): number {
  return new Decimal(value).toDecimalPlaces(decimalPlaces).toNumber();
}

// ============================================================================
// COMPARISON OPERATIONS
// ============================================================================

/**
 * Compare two numbers for equality within tolerance
 * Handles floating-point precision issues
 *
 * @example
 *   isEqual(0.1 + 0.2, 0.3) → true (despite floating-point error)
 */
export function isEqual(a: number, b: number, epsilon = PRECISION_CONFIG.EQUALITY_EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Check if value is effectively zero (within epsilon)
 */
export function isZero(value: number, epsilon = PRECISION_CONFIG.EQUALITY_EPSILON): boolean {
  return Math.abs(value) < epsilon;
}

/**
 * Check if a > b (accounting for precision)
 */
export function isGreaterThan(a: number, b: number, epsilon = PRECISION_CONFIG.EQUALITY_EPSILON): boolean {
  return a - b > epsilon;
}

/**
 * Check if a >= b (accounting for precision)
 */
export function isGreaterThanOrEqual(a: number, b: number, epsilon = PRECISION_CONFIG.EQUALITY_EPSILON): boolean {
  return a - b >= -epsilon;
}

/**
 * Check if a < b (accounting for precision)
 */
export function isLessThan(a: number, b: number, epsilon = PRECISION_CONFIG.EQUALITY_EPSILON): boolean {
  return b - a > epsilon;
}

/**
 * Check if a <= b (accounting for precision)
 */
export function isLessThanOrEqual(a: number, b: number, epsilon = PRECISION_CONFIG.EQUALITY_EPSILON): boolean {
  return b - a >= -epsilon;
}

// ============================================================================
// ADVANCED FINANCIAL CALCULATIONS
// ============================================================================

/**
 * Calculate compound interest
 * @param principal Initial investment
 * @param rate Annual interest rate (as decimal, e.g., 0.08 for 8%)
 * @param periods Number of compounding periods
 * @example compound(1000, 0.08, 5) → 1469.33 (5 years at 8% annually)
 */
export function compound(principal: number, rate: number, periods: number): number {
  return new Decimal(principal).times(new Decimal(1).plus(rate).pow(periods)).toNumber();
}

/**
 * Calculate present value
 * @param futureValue Future value
 * @param rate Discount rate (as decimal)
 * @param periods Number of periods
 */
export function presentValue(futureValue: number, rate: number, periods: number): number {
  return new Decimal(futureValue).dividedBy(new Decimal(1).plus(rate).pow(periods)).toNumber();
}

/**
 * Calculate net present value (NPV)
 * @param cashFlows Array of cash flows (negative for outflows, positive for inflows)
 * @param discountRate Discount rate (as decimal)
 * @returns NPV as number
 */
export function npv(cashFlows: number[], discountRate: number): number {
  let total = new Decimal(0);

  for (let i = 0; i < cashFlows.length; i++) {
    const cashFlow = cashFlows[i];
    if (cashFlow === undefined) continue;

    const pv = new Decimal(cashFlow).dividedBy(new Decimal(1).plus(discountRate).pow(i));
    total = total.plus(pv);
  }

  return total.toNumber();
}

/**
 * Calculate internal rate of return (IRR) using Newton-Raphson method
 * @param cashFlows Array of cash flows (first must be negative)
 * @param guess Initial guess for IRR (default 0.1)
 * @param maxIterations Maximum iterations (default 100)
 * @param tolerance Convergence tolerance (default 1e-6)
 * @returns IRR as decimal (e.g., 0.15 for 15%)
 */
export function irr(
  cashFlows: number[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 1e-6
): number {
  if (cashFlows.length === 0) {
    throw new Error('IRR requires at least one cash flow');
  }

  let rate = guess;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let npvValue = new Decimal(0);
    let derivative = new Decimal(0);

    for (let i = 0; i < cashFlows.length; i++) {
      const cashFlow = cashFlows[i];
      if (cashFlow === undefined) continue;

      const denominator = new Decimal(1).plus(rate).pow(i);
      npvValue = npvValue.plus(new Decimal(cashFlow).dividedBy(denominator));

      if (i > 0) {
        derivative = derivative.minus(
          new Decimal(cashFlow)
            .times(i)
            .dividedBy(new Decimal(1).plus(rate).pow(i + 1))
        );
      }
    }

    const npvNum = npvValue.toNumber();
    const derivativeNum = derivative.toNumber();

    if (Math.abs(npvNum) < tolerance) {
      return roundRate(rate);
    }

    if (Math.abs(derivativeNum) < 1e-10) {
      throw new Error('IRR calculation diverged (derivative too small)');
    }

    rate = rate - npvNum / derivativeNum;

    if (rate < -0.999) {
      rate = -0.999; // Prevent invalid rates
    }
  }

  throw new Error(`IRR did not converge after ${maxIterations} iterations`);
}

/**
 * Calculate XIRR (irregular interval IRR)
 * Used for fund cash flows with non-uniform timing
 *
 * @param cashFlows Array of cash flow amounts
 * @param dates Array of dates (as Date objects or timestamps)
 * @returns XIRR as decimal rate
 */
export function xirr(
  cashFlows: number[],
  dates: Date[],
  guess = 0.1,
  maxIterations = 100,
  tolerance = 1e-6
): number {
  if (cashFlows.length !== dates.length) {
    throw new Error('Cash flows and dates arrays must have same length');
  }

  if (cashFlows.length < 2) {
    throw new Error('XIRR requires at least 2 cash flows');
  }

  // Convert dates to day differences from first date
  const firstDate = dates[0]?.getTime();
  if (firstDate === undefined) {
    throw new Error('XIRR requires valid dates array');
  }
  const daysDiff = dates.map(d => (d.getTime() - firstDate) / (1000 * 60 * 60 * 24));

  let rate = guess;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let npvValue = new Decimal(0);
    let derivative = new Decimal(0);

    for (let i = 0; i < cashFlows.length; i++) {
      const cashFlow = cashFlows[i];
      const dayDiff = daysDiff[i];
      if (cashFlow === undefined || dayDiff === undefined) continue;

      const exponent = dayDiff / 365;
      const denominator = new Decimal(1).plus(rate).pow(exponent);

      npvValue = npvValue.plus(new Decimal(cashFlow).dividedBy(denominator));

      derivative = derivative.minus(
        new Decimal(cashFlow)
          .times(exponent)
          .dividedBy(new Decimal(1).plus(rate).pow(exponent + 1))
      );
    }

    const npvNum = npvValue.toNumber();
    const derivativeNum = derivative.toNumber();

    if (Math.abs(npvNum) < tolerance) {
      return roundRate(rate);
    }

    if (Math.abs(derivativeNum) < 1e-10) {
      throw new Error('XIRR calculation diverged (derivative too small)');
    }

    rate = rate - npvNum / derivativeNum;

    if (rate < -0.999) {
      rate = -0.999;
    }
  }

  throw new Error(`XIRR did not converge after ${maxIterations} iterations`);
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format money value for display
 * @example formatMoney(1234567.89) → "$1,234,567.89"
 */
export function formatMoney(value: number, currency = 'USD'): string {
  const rounded = roundMoney(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Format percentage for display
 * @example formatPercentage(0.0234) → "2.34%"
 */
export function formatPercentage(value: number, decimals = 2): string {
  const percentage = multiply(value, 100);
  return `${round(percentage, decimals).toFixed(decimals)}%`;
}

/**
 * Format multiple for display
 * @example formatMultiple(2.345678) → "2.35x"
 */
export function formatMultiple(value: number, decimals = 2): string {
  return `${round(value, decimals).toFixed(decimals)}x`;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate that a number is a valid monetary amount
 */
export function isValidMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Validate that a number is a valid rate [0, 1]
 */
export function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Validate that a number is a valid percentage [0, 100]
 */
export function isValidPercentage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Ensure value is within bounds, otherwise clamp
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
