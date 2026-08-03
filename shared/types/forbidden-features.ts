/**
 * Forbidden Features Type Guard
 *
 * Provides compile-time and runtime protection against Line of Credit
 * functionality. That feature was removed from the codebase and must not be
 * reintroduced.
 *
 * This module also holds the public waterfall vocabulary. Per ADR-068, the
 * whole-fund term is public product vocabulary again and is NOT forbidden;
 * only the eight Line-of-Credit tokens remain banned.
 */

import { z } from 'zod';

/**
 * Array of forbidden token strings that should not appear in any schema or code.
 *
 * All eight entries are Line-of-Credit bans. Do not add waterfall vocabulary
 * here: ADR-068 restored it, and
 * tests/integration/forbidden-tokens.test.ts pins that restoration.
 */
export const FORBIDDEN_TOKENS = [
  // Line of Credit related
  'lineOfCredit',
  'locRate',
  'locCap',
  'locDraw',
  'locRepay',
  'locDrawRules',
  'locRepayRules',
  'useLineOfCredit',
] as const;

/**
 * Public waterfall vocabulary (ADR-004 canonical naming, ADR-068 restoration).
 *
 * Two user-selectable values, both preserved exactly as supplied:
 * - `american` — deal-by-deal carry. The default, and the only
 *   activation-certified template (ADR-066 / GR2-3).
 * - `european` — whole-fund carry. Selectable, not activation-certified.
 *
 * This is an honest two-value enum, not a coercion. The previous schema
 * silently rewrote `european` to `american`, which discarded caller intent and
 * made a user's whole-fund selection indistinguishable from a deal-by-deal one.
 * Any value outside the two produces a structured Zod validation error.
 */
export const WaterfallTypeSchema = z.enum(['american', 'european']);

/**
 * Inferred public waterfall type
 */
export type WaterfallType = z.infer<typeof WaterfallTypeSchema>;

/**
 * Default waterfall type for new funds (ADR-066 / GR2-3: deal-by-deal American
 * is the provisional v1 carry convention and the only activation-certified
 * template).
 */
export const DEFAULT_WATERFALL_TYPE: WaterfallType = 'american';

/**
 * Type representing all forbidden keys
 */
export type ForbiddenKeys = (typeof FORBIDDEN_TOKENS)[number];

/**
 * Compile-time type guard to prevent usage of forbidden keys
 * This will cause a TypeScript error if any forbidden key is used as a type
 *
 * @ts-expect-error - This is intentionally an error to prevent forbidden key usage
 */
export type _forbiddenKeysGuard = Record<ForbiddenKeys, never>;

/**
 * Runtime validation to detect forbidden keys in objects
 *
 * @param obj - Object to validate
 * @param context - Context string for error messages (e.g., schema name)
 * @returns Validation result with details
 */
export function validateNoForbiddenKeys(
  obj: unknown,
  context = 'object'
): { isValid: boolean; foundKeys: string[]; message?: string } {
  const foundKeys: string[] = [];

  function scanObject(o: unknown, path = ''): void {
    if (o === null || o === undefined) return;

    if (typeof o === 'object') {
      for (const key in o) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check if this key is forbidden (case-insensitive)
        const lowerKey = key.toLowerCase();
        const forbidden = FORBIDDEN_TOKENS.find((token) => token.toLowerCase() === lowerKey);

        if (forbidden) {
          foundKeys.push(`${currentPath} (matches: ${forbidden})`);
        }

        // Recursively scan nested objects
        scanObject((o as Record<string, unknown>)[key], currentPath);
      }
    }
  }

  scanObject(obj);

  if (foundKeys.length > 0) {
    return {
      isValid: false,
      foundKeys,
      message: `Found ${foundKeys.length} forbidden key(s) in ${context}: ${foundKeys.join(', ')}`,
    };
  }

  return {
    isValid: true,
    foundKeys: [],
  };
}
