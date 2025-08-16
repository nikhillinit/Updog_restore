import { z } from 'zod';

/**
 * Custom error class for number parsing failures
 */
export class NumberParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NumberParseError';
  }
}

/**
 * Accepts strings like "42" from query/body and coerces to a finite number.
 * Use at request boundaries. Prefer this over raw Number() calls.
 */
export const zNumberish = z.coerce.number().refine(Number.isFinite, 'Must be a finite number');

export interface NumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

export const toNumber = (v: unknown, label = 'value', options?: NumberOptions): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new NumberParseError(`${label} must be a finite number`);
  }
  
  if (options) {
    if (options.integer && !Number.isInteger(n)) {
      throw new NumberParseError(`${label} must be an integer`);
    }
    if (options.min !== undefined && n < options.min) {
      throw new NumberParseError(`${label} must be at least ${options.min}`);
    }
    if (options.max !== undefined && n > options.max) {
      throw new NumberParseError(`${label} must be at most ${options.max}`);
    }
  }
  
  return n;
};