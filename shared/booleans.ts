import { z } from 'zod';

/**
 * Custom error class for boolean parsing failures
 */
export class BooleanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BooleanParseError';
  }
}

/**
 * zBooleanish accepts common boolean representations from HTTP/query/form inputs
 * and normalizes to a strict boolean. Use ONLY at the DTO/request boundary.
 */
export const zBooleanish = z.preprocess((v: unknown) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  }
  return v;
}, z.boolean());

/** Truthy string values that convert to true */
const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
/** Falsy string values that convert to false */
const FALSY_VALUES = new Set(['false', '0', 'no', 'n', 'off', '']);

/**
 * Runtime boolean coercion helper - use at request boundaries.
 * Converts common boolean representations to strict boolean.
 * Symmetric with toNumber() in shared/number.ts.
 *
 * @param v - Value to coerce (string, number, boolean, null, undefined)
 * @param label - Optional label for error messages (default: 'value')
 * @returns Strict boolean
 * @throws BooleanParseError if value cannot be coerced to boolean
 */
export const toBoolean = (v: unknown, label = 'value'): boolean => {
  // Already a boolean
  if (typeof v === 'boolean') return v;

  // Null/undefined coerce to false
  if (v === null || v === undefined) return false;

  // Numbers: 0 is false, non-zero is true
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new BooleanParseError(`${label} must be a finite number for boolean coercion`);
    }
    return v !== 0;
  }

  // Strings: check known truthy/falsy values
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
    throw new BooleanParseError(
      `${label} must be a boolean-like string (true/false, yes/no, 1/0, on/off)`
    );
  }

  // Other types are not coercible
  throw new BooleanParseError(`${label} cannot be coerced to boolean (got ${typeof v})`);
};

// Example DTO/domain split you can adopt in shared/schema.ts:
// export const UpdateFlagsDTO = z.object({ enabled: zBooleanish });
// export type UpdateFlagsDTO = z.infer<typeof UpdateFlagsDTO>;
// export const UpdateFlags = z.object({ enabled: z.boolean() });
// export type UpdateFlags = z.infer<typeof UpdateFlags>;
// export const toDomainFlags = (dto: UpdateFlagsDTO): UpdateFlags => UpdateFlags.parse(dto);