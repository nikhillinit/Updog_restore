/**
 * Type Safety Utilities
 * Implements AI consensus approach for arithmetic operations and type validation
 *
 * Based on multi-AI analysis recommendations:
 * - Performance: Safe arithmetic with numerical stability
 * - Maintainability: Comprehensive error handling with context
 * - Innovation: Modern TypeScript patterns with branded types
 */

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

export type PositiveNumber = number & { readonly __brand: unique symbol };
export type PercentageValue = number & { readonly __brand: unique symbol };
export type CurrencyAmount = number & { readonly __brand: unique symbol };
export type RatioValue = number & { readonly __brand: unique symbol };

// =============================================================================
// TYPE GUARDS AND VALIDATORS
// =============================================================================

/**
 * Check if value is a safe number (finite, not NaN)
 */
export const isSafeNumber = (value: unknown): value is number => {
  return typeof value === 'number' &&
         !isNaN(value) &&
         isFinite(value);
};

/**
 * Convert unknown value to safe number with fallback
 */
export const toSafeNumber = (value: unknown, fallback: number = 0): number => {
  if (isSafeNumber(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (isSafeNumber(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

/**
 * Create branded positive number with validation
 */
export const createPositiveNumber = (value: number): PositiveNumber => {
  if (!isSafeNumber(value) || value < 0) {
    throw new Error(`Expected positive number, got ${value}`);
  }
  return value as PositiveNumber;
};

/**
 * Create branded percentage value (0-100)
 */
export const createPercentageValue = (value: number): PercentageValue => {
  if (!isSafeNumber(value) || value < 0 || value > 100) {
    throw new Error(`Expected percentage (0-100), got ${value}`);
  }
  return value as PercentageValue;
};

/**
 * Create branded ratio value (0-1)
 */
export const createRatioValue = (value: number): RatioValue => {
  if (!isSafeNumber(value) || value < 0 || value > 1) {
    throw new Error(`Expected ratio (0-1), got ${value}`);
  }
  return value as RatioValue;
};

/**
 * Create branded currency amount
 */
export const createCurrencyAmount = (value: number): CurrencyAmount => {
  if (!isSafeNumber(value)) {
    throw new Error(`Expected valid currency amount, got ${value}`);
  }
  return value as CurrencyAmount;
};

// =============================================================================
// SAFE ARITHMETIC OPERATIONS
// =============================================================================

export type ArithmeticOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power';

/**
 * Safe arithmetic operations with proper error handling
 */
export class SafeArithmetic {
  /**
   * Perform safe arithmetic operation between two values
   */
  static operation(
    a: unknown,
    b: unknown,
    operation: ArithmeticOperation,
    options: {
      fallbackA?: number;
      fallbackB?: number;
      divideSafetyCheck?: boolean;
    } = {}
  ): number {
    const numA = toSafeNumber(a, options.fallbackA ?? 0);
    const numB = toSafeNumber(b, options.fallbackB ?? 0);

    switch (operation) {
      case 'add':
        return numA + numB;

      case 'subtract':
        return numA - numB;

      case 'multiply':
        return numA * numB;

      case 'divide':
        if (options.divideSafetyCheck !== false && Math.abs(numB) < Number.EPSILON) {
          throw new Error(`Division by zero or near-zero value: ${numB}`);
        }
        return numB !== 0 ? numA / numB : 0;

      case 'power':
        const result = Math.pow(numA, numB);
        if (!isSafeNumber(result)) {
          throw new Error(`Power operation resulted in invalid number: ${numA}^${numB}`);
        }
        return result;

      default:
        throw new Error(`Unknown arithmetic operation: ${operation}`);
    }
  }

  /**
   * Safe addition with overflow protection
   */
  static add(a: unknown, b: unknown): number {
    return this.operation(a, b, 'add');
  }

  /**
   * Safe subtraction
   */
  static subtract(a: unknown, b: unknown): number {
    return this.operation(a, b, 'subtract');
  }

  /**
   * Safe multiplication with overflow protection
   */
  static multiply(a: unknown, b: unknown): number {
    const result = this.operation(a, b, 'multiply');
    if (Math.abs(result) > Number.MAX_SAFE_INTEGER) {
      throw new Error(`Multiplication overflow: ${a} * ${b} = ${result}`);
    }
    return result;
  }

  /**
   * Safe division with zero checking
   */
  static divide(a: unknown, b: unknown, options?: { allowZero?: boolean }): number {
    return this.operation(a, b, 'divide', {
      divideSafetyCheck: !options?.allowZero
    });
  }

  /**
   * Safe percentage calculation
   */
  static percentage(part: unknown, whole: unknown): number {
    const safePart = toSafeNumber(part);
    const safeWhole = toSafeNumber(whole);

    if (safeWhole === 0) {
      return 0;
    }

    return this.multiply(this.divide(safePart, safeWhole), 100);
  }

  /**
   * Safe ratio calculation
   */
  static ratio(part: unknown, whole: unknown): number {
    const safePart = toSafeNumber(part);
    const safeWhole = toSafeNumber(whole);

    if (safeWhole === 0) {
      return 0;
    }

    return this.divide(safePart, safeWhole);
  }
}

// =============================================================================
// NUMERICAL VALIDATION FOR FINANCIAL CALCULATIONS
// =============================================================================

export class FinancialValidation {
  /**
   * Validate currency amount with business rules
   */
  static validateCurrencyAmount(
    value: unknown,
    fieldName: string,
    options: {
      allowNegative?: boolean;
      maxValue?: number;
      minValue?: number;
    } = {}
  ): CurrencyAmount {
    const num = toSafeNumber(value);

    if (!options.allowNegative && num < 0) {
      throw new Error(`${fieldName} cannot be negative: ${num}`);
    }

    if (options.minValue !== undefined && num < options.minValue) {
      throw new Error(`${fieldName} must be at least ${options.minValue}: ${num}`);
    }

    if (options.maxValue !== undefined && num > options.maxValue) {
      throw new Error(`${fieldName} cannot exceed ${options.maxValue}: ${num}`);
    }

    return createCurrencyAmount(num);
  }

  /**
   * Validate percentage with bounds checking
   */
  static validatePercentage(value: unknown, fieldName: string): PercentageValue {
    const num = toSafeNumber(value);

    if (num < 0 || num > 100) {
      throw new Error(`${fieldName} must be between 0 and 100: ${num}`);
    }

    return createPercentageValue(num);
  }

  /**
   * Validate IRR/return rate
   */
  static validateReturnRate(value: unknown, fieldName: string): number {
    const num = toSafeNumber(value);

    // Allow negative returns but catch extreme values
    if (num < -1 || num > 50) {
      throw new Error(`${fieldName} seems unrealistic: ${num * 100}%`);
    }

    return num;
  }

  /**
   * Validate fund size with business constraints
   */
  static validateFundSize(value: unknown): CurrencyAmount {
    return this.validateCurrencyAmount(value, 'Fund size', {
      allowNegative: false,
      minValue: 1000000, // $1M minimum
      maxValue: 10000000000 // $10B maximum
    });
  }

  /**
   * Validate allocation percentages sum to 100%
   */
  static validateAllocationSum(
    allocations: Record<string, unknown>,
    tolerance: number = 0.01
  ): Record<string, number> {
    const validated: Record<string, number> = {};
    let sum = 0;

    for (const [key, value] of Object.entries(allocations)) {
      const percentage = this.validatePercentage(value, `Allocation for ${key}`);
      validated[key] = percentage / 100; // Convert to ratio
      sum += percentage / 100;
    }

    if (Math.abs(sum - 1.0) > tolerance) {
      throw new Error(`Allocation percentages must sum to 100%, got ${sum * 100}%`);
    }

    return validated;
  }
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class TypeSafetyError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TypeSafetyError';
  }
}

export class ArithmeticError extends Error {
  constructor(
    message: string,
    public operation: string,
    public operands: unknown[],
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ArithmeticError';
  }
}