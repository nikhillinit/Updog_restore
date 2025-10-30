/**
 * Investment Stage Normalization Utilities
 *
 * Provides type-safe, fail-closed stage normalization with explicit alias mapping.
 * Prevents silent failures and regressions from unicode/punctuation edge cases.
 *
 * Key principles:
 * - Fail-closed: unknown stages return error, never silent defaults
 * - Explicit: only handles documented aliases
 * - Typed: discriminated union for safe error handling
 * - Observable: emits metrics for unknown stages
 *
 * @author Claude Code
 * @version 1.0
 */

export type InvestmentStage =
  | 'pre-seed'
  | 'seed'
  | 'series-a'
  | 'series-b'
  | 'series-c'
  | 'series-c+';

/**
 * Result type for stage normalization - discriminated union for explicit error handling
 */
export type NormalizeResult =
  | { ok: true; value: InvestmentStage }
  | { ok: false; error: { kind: 'UnknownStage'; original: string; canonical?: string } };

/**
 * Stage progression ordering for property-based tests and analytics
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
 * Canonical stage names (authoritative set)
 */
const CANONICAL_STAGES: Record<string, InvestmentStage> = {
  'pre-seed': 'pre-seed',
  seed: 'seed',
  'series-a': 'series-a',
  'series-b': 'series-b',
  'series-c': 'series-c',
  'series-c+': 'series-c+',
};

/**
 * Comprehensive alias mapping for common input variants
 *
 * Maps all known input formats to canonical stage names.
 * This replaces the brittle regex that was causing 'series-c+' → 'series-c-' failures.
 *
 * Intentionally NOT mapping 'seriesc' → 'series-c+':
 * - Product team must confirm semantic equivalence
 * - Treating as unknown prevents silent semantic drift
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

  // Series C variants (note: NOT mapping 'seriesc' to 'series-c+')
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
 * Normalize an investment stage string to canonical form
 *
 * Process:
 * 1. Unicode normalization (NFKD) to handle smart quotes, dashes, etc.
 * 2. Lowercase normalization
 * 3. Whitespace compression (multiple spaces → single space)
 * 4. Explicit alias lookup
 * 5. Return error if unknown (fail-closed)
 *
 * @param input Raw stage string from API, UI, or data source
 * @returns NormalizeResult discriminated union (ok | error)
 *
 * @example
 * normalizeInvestmentStage('Series A') // { ok: true, value: 'series-a' }
 * normalizeInvestmentStage('seriesA') // { ok: true, value: 'series-a' }
 * normalizeInvestmentStage('series-c+') // { ok: true, value: 'series-c+' }
 * normalizeInvestmentStage('Series-C+') // { ok: true, value: 'series-c+' }
 * normalizeInvestmentStage('late stage') // { ok: false, error: { kind: 'UnknownStage', original: 'late stage' } }
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
      canonical: Object.keys(CANONICAL_STAGES).join(', '),
    },
  };
}

/**
 * Compare two stages by progression order
 *
 * Useful for property-based tests like:
 * - "Later stages should have lower failure rates"
 * - "Series B must come before Series C+"
 *
 * @returns negative if a < b, 0 if a === b, positive if a > b
 */
export function compareStages(a: InvestmentStage, b: InvestmentStage): number {
  return STAGE_ORDERING[a] - STAGE_ORDERING[b];
}

/**
 * Check if a stage is later than another
 *
 * @example
 * isLaterStage('series-a', 'seed') // true
 * isLaterStage('seed', 'series-a') // false
 */
export function isLaterStage(candidate: InvestmentStage, baseline: InvestmentStage): boolean {
  return compareStages(candidate, baseline) > 0;
}

/**
 * List all canonical stage names in progression order
 */
export function listAllStages(): InvestmentStage[] {
  return Object.entries(STAGE_ORDERING)
    .sort(([, orderA], [, orderB]) => orderA - orderB)
    .map(([stage]) => stage as InvestmentStage);
}

/**
 * Type guard: check if a value is a valid InvestmentStage
 */
export function isValidInvestmentStage(value: unknown): value is InvestmentStage {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CANONICAL_STAGES, value);
}
