import { z } from 'zod';
/**
 * Accepts strings like "42" from query/body and coerces to a finite number.
 * Use at request boundaries. Prefer this over raw Number() calls.
 */
export const zNumberish = z.coerce.number().refine(Number.isFinite, 'Must be a finite number');

export const toNumber = (v: unknown, label = 'value'): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`${label} must be a finite number`);
  return n;
};