/**
 * Zod schema utilities for Decimal.js
 * Provides validation and transformation for high-precision financial calculations
 */

import { z } from 'zod';
import Decimal from 'decimal.js';

// Configure global precision for all Decimal instances
Decimal.set({ precision: 30 });

/**
 * Custom Zod schema for Decimal.js instances
 * Accepts: Decimal, string, or number
 * Returns: Decimal instance
 */
export const ZodDecimal = z.custom<Decimal>(
  (val): val is Decimal => val instanceof Decimal,
  { message: 'Expected a Decimal.js object' }
).or(
  z.union([z.string(), z.number()])
    .transform((val) => new Decimal(val))
).pipe(
  z.custom<Decimal>((val): val is Decimal => val instanceof Decimal)
);

/**
 * Zod schema for percentage values (0-1 as Decimal)
 */
export const ZodPercentage = ZodDecimal.refine(
  (d) => d.gte(0) && d.lte(1),
  { message: 'Percentage must be between 0 and 1 (0% to 100%)' }
);

/**
 * Zod schema for positive Decimal values
 */
export const ZodPositiveDecimal = ZodDecimal.refine(
  (d) => d.gt(0),
  { message: 'Value must be positive' }
);

/**
 * Zod schema for non-negative Decimal values
 */
export const ZodNonNegativeDecimal = ZodDecimal.refine(
  (d) => d.gte(0),
  { message: 'Value must be non-negative' }
);

/**
 * Helper to validate sum of percentages equals 100%
 */
export const validatePercentageSum = <T extends { percentage: Decimal }>(
  items: T[],
  maxSum = new Decimal(1)
) => {
  const sum = items.reduce((acc, item) => acc.plus(item.percentage), new Decimal(0));
  return sum.equals(maxSum);
};

/**
 * Helper to create a Decimal with validation
 */
export const createDecimal = (value: string | number | Decimal): Decimal => {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
};
