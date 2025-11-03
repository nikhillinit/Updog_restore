/**
 * Investment Stage Schema and Normalization
 *
 * Provides canonical stage definitions, Zod schemas, and normalization utilities.
 * Consolidates stage logic from server/utils/stage-utils.ts into shared schema layer.
 *
 * Key Features:
 * - Canonical stage list: ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+']
 * - Zod schemas for type-safe validation
 * - Normalization with comprehensive alias mapping
 * - Stage progression utilities (ordering, comparison, nearest match)
 *
 * @module shared/schemas/investment-stages
 * @version 3.4.0
 */

import { z } from 'zod';

/**
 * Canonical investment stage type
 * Hyphenated format for consistency with API contracts
 */
export type InvestmentStage =
  | 'pre-seed'
  | 'seed'
  | 'series-a'
  | 'series-b'
  | 'series-c'
  | 'series-c+';

/**
 * Canonical stage keys constant (authoritative source)
 */
export const STAGE_KEYS: readonly InvestmentStage[] = [
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-c+',
] as const;

/**
 * Stage progression ordering for analytics and validation
 */
export const STAGE_ORDERING: Record<InvestmentStage, number> = {
  'pre-seed': 0,
  seed: 1,
  'series-a': 2,
  'series-b': 3,
  'series-c': 4,
  'series-c+': 5,
};

/**
 * Zod schema for investment stage validation
 */
export const InvestmentStageSchema = z.enum([
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-c+',
]);

/**
 * Comprehensive alias mapping for normalization
 * Handles common input variants, punctuation, whitespace, and Cyrillic lookalikes
 */
const STAGE_ALIASES: Record<string, InvestmentStage> = {
  // Pre-seed variants
  'pre-seed': 'pre-seed',
  preseed: 'pre-seed',
  pre_seed: 'pre-seed',
  'pre seed': 'pre-seed',

  // Seed variants
  seed: 'seed',

  // Series A variants
  'series-a': 'series-a',
  'series a': 'series-a',
  seriesa: 'series-a',
  series_a: 'series-a',
  seriesа: 'series-a', // Cyrillic 'а' → ASCII 'a'

  // Series B variants
  'series-b': 'series-b',
  'series b': 'series-b',
  seriesb: 'series-b',
  series_b: 'series-b',
  seriesь: 'series-b', // Cyrillic 'ь' → ASCII 'b'

  // Series C variants
  'series-c': 'series-c',
  'series c': 'series-c',
  seriesс: 'series-c', // Cyrillic 'с' → ASCII 'c'
  series_c: 'series-c',

  // Series C+ variants (with plus)
  'series-c+': 'series-c+',
  'series c+': 'series-c+',
  'seriesc+': 'series-c+',
  'series_c+': 'series-c+',
  'seriesс+': 'series-c+', // Cyrillic 'с' with plus
};

/**
 * Result type for stage normalization (discriminated union)
 */
export type NormalizeResult =
  | { ok: true; value: InvestmentStage }
  | { ok: false; error: { kind: 'UnknownStage'; original: string; canonical?: string } };

/**
 * Normalize an investment stage string to canonical form
 *
 * Process:
 * 1. Unicode normalization (NFKD) to handle smart quotes, dashes, lookalikes
 * 2. Lowercase conversion
 * 3. Whitespace compression (multiple spaces → single space)
 * 4. Explicit alias lookup
 * 5. Return error if unknown (fail-closed pattern)
 *
 * @param input Raw stage string from API, UI, or data source
 * @returns NormalizeResult discriminated union (ok | error)
 *
 * @example
 * normalizeInvestmentStage('Series A') // { ok: true, value: 'series-a' }
 * normalizeInvestmentStage('seriesA') // { ok: true, value: 'series-a' }
 * normalizeInvestmentStage('series-c+') // { ok: true, value: 'series-c+' }
 * normalizeInvestmentStage('late stage') // { ok: false, error: {...} }
 */
export function normalizeInvestmentStage(input: string): NormalizeResult {
  if (!input || typeof input !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'UnknownStage',
        original: String(input),
      },
    };
  }

  // Unicode normalization (NFKD) handles:
  // - Smart quotes ('' → '')
  // - Em-dashes (— → -)
  // - Superscript/subscript numbers
  // - Cyrillic lookalikes
  const normalized = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\s+/g, ' ') // Compress multiple spaces
    .trim();

  // Try exact match first (fastest path)
  if (Object.prototype.hasOwnProperty.call(STAGE_ALIASES, normalized)) {
    return {
      ok: true,
      value: STAGE_ALIASES[normalized]!,
    };
  }

  // Alias lookup failed - return error without silent default
  return {
    ok: false,
    error: {
      kind: 'UnknownStage',
      original: input,
      canonical: STAGE_KEYS.join(', '),
    },
  };
}

/**
 * List all canonical stage names in progression order
 *
 * @returns Array of stages from earliest to latest
 *
 * @example
 * listAllStages() // ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'series-c+']
 */
export function listAllStages(): InvestmentStage[] {
  return Object.entries(STAGE_ORDERING)
    .sort(([, orderA], [, orderB]) => orderA - orderB)
    .map(([stage]) => stage as InvestmentStage);
}

/**
 * Find nearest canonical stage for fuzzy matching
 * Uses Levenshtein distance for similarity scoring
 *
 * @param input Stage string to match
 * @returns Nearest canonical stage or null if no good match
 *
 * @example
 * nearestStage('seriesa') // 'series-a'
 * nearestStage('xyz') // null
 */
export function nearestStage(input: string): InvestmentStage | null {
  if (!input || typeof input !== 'string') return null;

  const normalized = input.normalize('NFKD').toLowerCase().trim();

  // First try normalization
  const result = normalizeInvestmentStage(normalized);
  if (result.ok) return result.value;

  // Calculate Levenshtein distance for each canonical stage
  let minDistance = Infinity;
  let nearestMatch: InvestmentStage | null = null;

  for (const stage of STAGE_KEYS) {
    const distance = levenshteinDistance(normalized, stage);

    // Only consider reasonable matches (distance <= 3 or 30% of length)
    const maxDistance = Math.max(3, Math.floor(stage.length * 0.3));

    if (distance < minDistance && distance <= maxDistance) {
      minDistance = distance;
      nearestMatch = stage;
    }
  }

  return nearestMatch;
}

/**
 * Compare two stages by progression order
 *
 * @returns negative if a < b, 0 if a === b, positive if a > b
 *
 * @example
 * compareStages('seed', 'series-a') // -1
 * compareStages('series-c+', 'seed') // 4
 */
export function compareStages(a: InvestmentStage, b: InvestmentStage): number {
  return STAGE_ORDERING[a] - STAGE_ORDERING[b];
}

/**
 * Check if a stage is later than another in progression
 *
 * @example
 * isLaterStage('series-a', 'seed') // true
 * isLaterStage('seed', 'series-a') // false
 */
export function isLaterStage(candidate: InvestmentStage, baseline: InvestmentStage): boolean {
  return compareStages(candidate, baseline) > 0;
}

/**
 * Type guard: check if a value is a valid InvestmentStage
 *
 * @example
 * isValidInvestmentStage('seed') // true
 * isValidInvestmentStage('late-stage') // false
 */
export function isValidInvestmentStage(value: unknown): value is InvestmentStage {
  return typeof value === 'string' && STAGE_KEYS.includes(value as InvestmentStage);
}

/**
 * Helper: Levenshtein distance calculation for fuzzy matching
 * @internal
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}
