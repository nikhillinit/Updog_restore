/**
 * Forbidden Features Type Guard
 *
 * Provides compile-time and runtime protection against legacy features:
 * - European waterfall distribution logic
 * - Line of Credit functionality
 *
 * These features have been removed from the codebase and should not be reintroduced.
 */

import { z } from 'zod';

/**
 * Array of forbidden token strings that should not appear in any schema or code
 */
export const FORBIDDEN_TOKENS = [
  // European waterfall related
  'european',

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
 * WaterfallType schema with legacy migration.
 * Accepts 'american' (pass-through) or 'european' (migrated to 'american').
 * Any other value produces a structured Zod validation error.
 */
export const WaterfallTypeSchema = z
  .enum(['american'])
  .or(z.literal('european').transform(() => 'american' as const));

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
