/**
 * NOMINAL BRANDED TYPES
 *
 * TypeScript-level type safety to prevent unit confusion in financial calculations.
 * These branded types use nominal typing to ensure Money and Rate values cannot be
 * accidentally mixed at compile time.
 *
 * Design principle: Apply at API boundaries only (inputs/outputs), not internal calculations.
 *
 * Example:
 *   const fee: Money = 100000 as Money;
 *   const rate: Rate = 0.02 as Rate;
 *   const result: Money = fee * rate; // ❌ Type error: cannot multiply Money by Rate
 *
 * References:
 * - TypeScript branded types: https://egghead.io/blog/using-branded-types-in-typescript
 * - Domain-Driven Design value objects
 */

// ============================================================================
// BRAND SYMBOL (Internal Implementation Detail)
// ============================================================================

declare const __brand: unique symbol;

/**
 * Brand helper type
 * Adds a nominal brand to a base type without runtime overhead
 */
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

// ============================================================================
// FINANCIAL UNITS
// ============================================================================

/**
 * Money - USD currency values
 * Represents dollar amounts in calculations
 *
 * IMPORTANT: Store as integers (cents) in database, convert to Money (dollars) at API boundary
 *
 * @example
 *   const fundSize: Money = 100_000_000 as Money; // $100M
 *   const fee: Money = 2_000_000 as Money; // $2M
 */
export type Money = Brand<number, 'Money'>;

/**
 * Rate - Decimal rate values (e.g., 0.02 for 2%)
 * Used for calculations where rates are expressed as decimals
 *
 * @example
 *   const managementFeeRate: Rate = 0.02 as Rate; // 2% annual fee
 *   const carryRate: Rate = 0.20 as Rate; // 20% GP carry
 */
export type Rate = Brand<number, 'Rate'>;

/**
 * Percentage - Percentage values (e.g., 2.0 for 2%)
 * Used for display and user input where percentages are expressed as whole numbers
 *
 * @example
 *   const ownershipPct: Percentage = 15.5 as Percentage; // 15.5% ownership
 *   const dilutionPct: Percentage = 50.0 as Percentage; // 50% max dilution
 */
export type Percentage = Brand<number, 'Percentage'>;

/**
 * Multiple - Multiplier values (e.g., 2.5x TVPI)
 * Represents return multiples in VC calculations
 *
 * @example
 *   const tvpi: Multiple = 2.5 as Multiple; // 2.5x total value to paid-in
 *   const dpi: Multiple = 1.8 as Multiple; // 1.8x distributions to paid-in
 */
export type Multiple = Brand<number, 'Multiple'>;

/**
 * Months - Time duration in months
 * Used for fund lifecycle calculations
 *
 * @example
 *   const fundTerm: Months = 120 as Months; // 10-year fund
 *   const deploymentPeriod: Months = 36 as Months; // 3-year deployment
 */
export type Months = Brand<number, 'Months'>;

/**
 * Years - Time duration in years
 * Used for high-level fund strategy
 *
 * @example
 *   const fundLife: Years = 10 as Years; // 10-year fund
 */
export type Years = Brand<number, 'Years'>;

/**
 * Probability - Probability values [0.0, 1.0]
 * Used in Monte Carlo simulations and graduation matrices
 *
 * @example
 *   const graduationRate: Probability = 0.30 as Probability; // 30% graduation rate
 */
export type Probability = Brand<number, 'Probability'>;

// ============================================================================
// BRANDED TYPE CONSTRUCTORS (Runtime-Safe)
// ============================================================================

/**
 * Validate and construct Money from number
 * Ensures non-negative dollar amounts
 */
export function money(value: number): Money {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Money value: ${value} (must be non-negative finite number)`);
  }
  return value as Money;
}

/**
 * Validate and construct Rate from number
 * Ensures rate is in valid range [0.0, 1.0] for typical financial rates
 */
export function rate(value: number): Rate {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid Rate value: ${value} (must be in range [0.0, 1.0])`);
  }
  return value as Rate;
}

/**
 * Validate and construct Percentage from number
 * Ensures percentage is in valid range [0.0, 100.0]
 */
export function percentage(value: number): Percentage {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Invalid Percentage value: ${value} (must be in range [0.0, 100.0])`);
  }
  return value as Percentage;
}

/**
 * Validate and construct Multiple from number
 * Ensures non-negative multiplier
 */
export function multiple(value: number): Multiple {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Multiple value: ${value} (must be non-negative finite number)`);
  }
  return value as Multiple;
}

/**
 * Validate and construct Months from number
 * Ensures positive integer months
 */
export function months(value: number): Months {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid Months value: ${value} (must be non-negative integer)`);
  }
  return value as Months;
}

/**
 * Validate and construct Years from number
 * Ensures positive years
 */
export function years(value: number): Years {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid Years value: ${value} (must be non-negative finite number)`);
  }
  return value as Years;
}

/**
 * Validate and construct Probability from number
 * Ensures probability in valid range [0.0, 1.0]
 */
export function probability(value: number): Probability {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid Probability value: ${value} (must be in range [0.0, 1.0])`);
  }
  return value as Probability;
}

// ============================================================================
// UNIT CONVERSION UTILITIES
// ============================================================================

/**
 * Convert Rate to Percentage
 * @example rateToPercentage(0.02 as Rate) → 2.0 as Percentage
 */
export function rateToPercentage(r: Rate): Percentage {
  return percentage((r as number) * 100);
}

/**
 * Convert Percentage to Rate
 * @example percentageToRate(2.0 as Percentage) → 0.02 as Rate
 */
export function percentageToRate(p: Percentage): Rate {
  return rate((p as number) / 100);
}

/**
 * Convert Years to Months
 * @example yearsToMonths(10 as Years) → 120 as Months
 */
export function yearsToMonths(y: Years): Months {
  return months(Math.round((y as number) * 12));
}

/**
 * Convert Months to Years
 * @example monthsToYears(120 as Months) → 10 as Years
 */
export function monthsToYears(m: Months): Years {
  return years((m as number) / 12);
}

/**
 * Convert Money to cents (for database storage)
 * @example moneyToCents(100.50 as Money) → 10050
 */
export function moneyToCents(m: Money): number {
  return Math.round((m as number) * 100);
}

/**
 * Convert cents to Money (from database)
 * @example centsToMoney(10050) → 100.50 as Money
 */
export function centsToMoney(cents: number): Money {
  return money(cents / 100);
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Runtime type guard for Money
 * Useful for validation at API boundaries
 */
export function isMoney(value: unknown): value is Money {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Runtime type guard for Rate
 */
export function isRate(value: unknown): value is Rate {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Runtime type guard for Percentage
 */
export function isPercentage(value: unknown): value is Percentage {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Runtime type guard for Multiple
 */
export function isMultiple(value: unknown): value is Multiple {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Runtime type guard for Probability
 */
export function isProbability(value: unknown): value is Probability {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

// ============================================================================
// ARITHMETIC OPERATIONS (Type-Safe)
// ============================================================================

/**
 * Multiply Money by Rate (returns Money)
 * @example multiplyMoneyByRate(100_000_000 as Money, 0.02 as Rate) → 2_000_000 as Money
 */
export function multiplyMoneyByRate(m: Money, r: Rate): Money {
  return money((m as number) * (r as number));
}

/**
 * Divide Money by Money (returns Multiple)
 * @example divideMoney(250_000_000 as Money, 100_000_000 as Money) → 2.5 as Multiple
 */
export function divideMoney(numerator: Money, denominator: Money): Multiple {
  if ((denominator as number) === 0) {
    throw new Error('Division by zero: denominator must be non-zero');
  }
  return multiple((numerator as number) / (denominator as number));
}

/**
 * Add Money values (returns Money)
 */
export function addMoney(a: Money, b: Money): Money {
  return money((a as number) + (b as number));
}

/**
 * Subtract Money values (returns Money)
 */
export function subtractMoney(a: Money, b: Money): Money {
  const result = (a as number) - (b as number);
  if (result < 0) {
    throw new Error(`Subtraction would result in negative Money: ${a} - ${b} = ${result}`);
  }
  return money(result);
}

/**
 * Sum array of Money values
 */
export function sumMoney(amounts: Money[]): Money {
  const total = amounts.reduce((sum, amount) => sum + (amount as number), 0);
  return money(total);
}

// ============================================================================
// UNSAFE CAST (Escape Hatch for Internal Calculations)
// ============================================================================

/**
 * Unsafe cast - use sparingly, only for internal calculations
 * Documents intent when you need to break out of branded types
 *
 * @example
 *   const feeAmount: Money = 2_000_000 as Money;
 *   const rawNumber = unsafeCast(feeAmount); // number
 */
export function unsafeCast<T extends Brand<number, string>>(branded: T): number {
  return branded as number;
}

/**
 * Re-brand a number after calculations
 * Use after performing arithmetic on unbranded numbers
 *
 * @example
 *   const a = unsafeCast(money1);
 *   const b = unsafeCast(money2);
 *   const result = rebrand<Money>(a + b, money);
 */
export function rebrand<T extends Brand<number, string>>(
  value: number,
  constructor: (n: number) => T
): T {
  return constructor(value);
}
