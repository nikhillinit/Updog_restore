/**
 * Flexible numeric validation helpers for Drizzle-Zod schemas
 *
 * These helpers provide reusable, semantic validation patterns for common
 * numeric constraints in schema definitions. They return Zod schemas directly
 * for compatibility with drizzle-zod@0.5.1.
 */

import { z } from 'zod';

/**
 * Options for the flexible numeric helper
 */
export interface NumOpts {
  /** Minimum value (inclusive) */
  min?: number;
  /** Maximum value (inclusive) */
  max?: number;
  /** Require integer values */
  int?: boolean;
  /** Enable coercion from strings (default: true) */
  coerce?: boolean;
  /** Custom error message for minimum validation */
  messageMin?: string;
  /** Custom error message for maximum validation */
  messageMax?: string;
}

/**
 * Flexible numeric validation with customizable options
 *
 * @param opts Configuration options for validation
 * @returns Zod schema with specified numeric constraints
 */
export const num = (opts: NumOpts = {}) => {
  const { min, max, int, coerce = true, messageMin, messageMax } = opts;

  let schema = coerce ? z.coerce.number() : z.number();

  if (int) {
    schema = schema.int();
  }

  if (min !== undefined) {
    schema = schema.min(min, messageMin);
  }

  if (max !== undefined) {
    schema = schema.max(max, messageMax);
  }

  return schema;
};

/**
 * Non-negative numbers (>= 0)
 * Common for amounts, quantities, counts
 */
export const nonNegative = () => num({ min: 0 });

/**
 * Numbers between 0 and 1 (inclusive)
 * Common for decimal percentages, ratios, probabilities
 */
export const bounded01 = () => num({ min: 0, max: 1 });

/**
 * Numbers between 0 and 100 (inclusive)
 * Common for whole number percentages
 */
export const percent100 = () => num({ min: 0, max: 100 });

/**
 * Positive integers (>= 1)
 * Common for IDs, counts, years
 */
export const positiveInt = () => num({ min: 1, int: true });

/**
 * Year range validation
 *
 * @param minYear Minimum year (inclusive)
 * @param maxYear Maximum year (inclusive)
 * @returns Zod schema for year validation
 */
export const yearRange = (minYear: number, maxYear: number) =>
  num({
    min: minYear,
    max: maxYear,
    int: true,
    messageMin: `Year must be at least ${minYear}`,
    messageMax: `Year must be at most ${maxYear}`
  });