import { z } from './types/zod';

type NumOpts = {
  min?: number;
  max?: number;
  int?: boolean;
  coerce?: boolean;       // default true (safe for text-backed columns)
  messageMin?: string;
  messageMax?: string;
};

/**
 * Flexible numeric schema override for drizzle-zod createInsertSchema().
 * Use as: field: num({ min: 0, max: 1 })  // 0-1 bounded
 *         field: num({ min: 0 })          // non-negative
 *         field: num({ min: 0, int: true }) // positive integer
 */
export const num = (opts: NumOpts = {}) => {
  const { min, max, int, coerce = true, messageMin, messageMax } = opts;

  let schema = coerce ? z.coerce.number() : z.number();
  if (int) schema = schema.int();
  if (min !== undefined) schema = schema.min(min, messageMin);
  if (max !== undefined) schema = schema.max(max, messageMax);
  return schema;
};

/** Named presets (opt-in; don't enforce 0–1 unless you choose) */
export const bounded01 = () => num({ min: 0, max: 1, messageMin: 'Value must be between 0 and 1', messageMax: 'Value must be between 0 and 1' });
export const nonNegative = () => num({ min: 0, messageMin: 'Value must be non-negative' });
export const positiveInt = () => num({ min: 1, int: true, messageMin: 'Must be a positive integer' });

/** If you use 0–100% in some places, this preset makes it explicit */
export const percent100 = () => num({ min: 0, max: 100, messageMin: 'Percentage must be between 0 and 100', messageMax: 'Percentage must be between 0 and 100' });

/** Additional common presets */
export const positive = () => num({ min: 0.000001, messageMin: 'Value must be positive' }); // Greater than zero
export const yearRange = (minYear = 1900, maxYear = 2100) => num({
  min: minYear,
  max: maxYear,
  int: true,
  messageMin: `Year must be ${minYear} or later`,
  messageMax: `Year must be ${maxYear} or earlier`
});