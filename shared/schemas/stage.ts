/**
 * CANONICAL STAGE SCHEMA (Single Source of Truth)
 *
 * This file defines the authoritative stage enumeration for the entire codebase.
 * All other stage definitions should either:
 * 1. Import from this file directly, OR
 * 2. Use the normalization utilities to convert to/from legacy formats
 *
 * Canonical format: snake_case (e.g., 'pre_seed', 'series_a')
 *
 * Migration Notes:
 * - Some schemas are FROZEN (fund-model.ts, reserve-engine.contract.ts)
 *   and cannot be modified without version bumps
 * - Use normalizeStage() to convert legacy formats to canonical
 * - Use toHyphenatedStage() for reserve-engine.contract.ts compatibility
 * - Use toCamelCaseStage() for wizard-types.ts compatibility
 */

import { z } from 'zod';

// ============================================================================
// CANONICAL STAGE ENUM (Comprehensive)
// ============================================================================

/**
 * All possible investment stages in canonical snake_case format.
 * This is the superset of all stages used across the codebase.
 */
export const CanonicalStageSchema = z.enum([
  'pre_seed',
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'series_d',
  'growth',
  'late_stage',
]);

export type CanonicalStage = z.infer<typeof CanonicalStageSchema>;

/**
 * All canonical stage values as a readonly array
 */
export const CANONICAL_STAGES: readonly CanonicalStage[] = CanonicalStageSchema.options;

// ============================================================================
// STAGE LABELS (Human-readable)
// ============================================================================

export const STAGE_LABELS: Record<CanonicalStage, string> = {
  pre_seed: 'Pre-Seed',
  seed: 'Seed',
  series_a: 'Series A',
  series_b: 'Series B',
  series_c: 'Series C',
  series_d: 'Series D+',
  growth: 'Growth',
  late_stage: 'Late Stage',
};

// ============================================================================
// LEGACY FORMAT TYPES
// ============================================================================

/** Legacy format: no separator (preseed) - used in shared/schemas.ts */
type NoSeparatorStage = 'preseed' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'series_dplus';

/** Legacy format: hyphenated (pre-seed) - used in reserve-engine.contract.ts */
type HyphenatedStage = 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'series-d-plus' | 'late-stage';

/** Legacy format: camelCase (preSeed) - used in wizard-types.ts */
type CamelCaseStage = 'preSeed' | 'seed' | 'seriesA' | 'seriesB' | 'seriesC' | 'seriesD';

/** Union of all legacy stage formats */
type LegacyStage = NoSeparatorStage | HyphenatedStage | CamelCaseStage | CanonicalStage;

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

/**
 * Mapping from all legacy formats to canonical format
 */
const STAGE_NORMALIZATION_MAP: Record<string, CanonicalStage> = {
  // Canonical (already normalized)
  pre_seed: 'pre_seed',
  seed: 'seed',
  series_a: 'series_a',
  series_b: 'series_b',
  series_c: 'series_c',
  series_d: 'series_d',
  growth: 'growth',
  late_stage: 'late_stage',

  // No-separator format (shared/schemas.ts)
  preseed: 'pre_seed',
  series_dplus: 'series_d',

  // Hyphenated format (reserve-engine.contract.ts)
  'pre-seed': 'pre_seed',
  'series-a': 'series_a',
  'series-b': 'series_b',
  'series-c': 'series_c',
  'series-d-plus': 'series_d',
  'late-stage': 'late_stage',

  // CamelCase format (wizard-types.ts)
  preSeed: 'pre_seed',
  seriesA: 'series_a',
  seriesB: 'series_b',
  seriesC: 'series_c',
  seriesD: 'series_d',
};

/**
 * Normalize any stage format to canonical snake_case format.
 *
 * @param stage - Stage in any format (legacy or canonical)
 * @returns Canonical stage in snake_case format
 * @throws Error if stage is not recognized
 *
 * @example
 * normalizeStage('preseed')     // => 'pre_seed'
 * normalizeStage('pre-seed')    // => 'pre_seed'
 * normalizeStage('preSeed')     // => 'pre_seed'
 * normalizeStage('series_dplus') // => 'series_d'
 */
export function normalizeStage(stage: string): CanonicalStage {
  const normalized = STAGE_NORMALIZATION_MAP[stage];
  if (!normalized) {
    throw new Error(`Unknown stage format: "${stage}". Valid stages: ${Object.keys(STAGE_NORMALIZATION_MAP).join(', ')}`);
  }
  return normalized;
}

/**
 * Safely normalize a stage, returning undefined for invalid stages.
 *
 * @param stage - Stage in any format
 * @returns Canonical stage or undefined if not recognized
 */
export function normalizeStageOrUndefined(stage: string): CanonicalStage | undefined {
  return STAGE_NORMALIZATION_MAP[stage];
}

/**
 * Check if a string is a valid stage in any format.
 */
export function isValidStage(stage: string): boolean {
  return stage in STAGE_NORMALIZATION_MAP;
}

// ============================================================================
// FORMAT CONVERSION UTILITIES
// ============================================================================

/**
 * Mapping from canonical to hyphenated format (for reserve-engine.contract.ts)
 */
const CANONICAL_TO_HYPHENATED: Record<CanonicalStage, HyphenatedStage> = {
  pre_seed: 'pre-seed',
  seed: 'seed',
  series_a: 'series-a',
  series_b: 'series-b',
  series_c: 'series-c',
  series_d: 'series-d-plus',
  growth: 'late-stage', // growth maps to late-stage in hyphenated format
  late_stage: 'late-stage',
};

/**
 * Mapping from canonical to camelCase format (for wizard-types.ts)
 */
const CANONICAL_TO_CAMELCASE: Record<CanonicalStage, CamelCaseStage> = {
  pre_seed: 'preSeed',
  seed: 'seed',
  series_a: 'seriesA',
  series_b: 'seriesB',
  series_c: 'seriesC',
  series_d: 'seriesD',
  growth: 'seriesD', // growth maps to seriesD in camelCase format
  late_stage: 'seriesD', // late_stage maps to seriesD in camelCase format
};

/**
 * Mapping from canonical to no-separator format (for shared/schemas.ts)
 */
const CANONICAL_TO_NO_SEPARATOR: Record<CanonicalStage, NoSeparatorStage> = {
  pre_seed: 'preseed',
  seed: 'seed',
  series_a: 'series_a',
  series_b: 'series_b',
  series_c: 'series_c',
  series_d: 'series_dplus',
  growth: 'series_dplus', // growth maps to series_dplus in no-separator format
  late_stage: 'series_dplus', // late_stage maps to series_dplus in no-separator format
};

/**
 * Convert canonical stage to hyphenated format (reserve-engine.contract.ts compatibility)
 */
export function toHyphenatedStage(stage: CanonicalStage): HyphenatedStage {
  return CANONICAL_TO_HYPHENATED[stage];
}

/**
 * Convert canonical stage to camelCase format (wizard-types.ts compatibility)
 */
export function toCamelCaseStage(stage: CanonicalStage): CamelCaseStage {
  return CANONICAL_TO_CAMELCASE[stage];
}

/**
 * Convert canonical stage to no-separator format (shared/schemas.ts compatibility)
 */
export function toNoSeparatorStage(stage: CanonicalStage): NoSeparatorStage {
  return CANONICAL_TO_NO_SEPARATOR[stage];
}

// ============================================================================
// ZOD SCHEMA WITH NORMALIZATION
// ============================================================================

/**
 * Zod schema that accepts any stage format and normalizes to canonical.
 * Use this for input validation where you want to accept legacy formats.
 *
 * @example
 * const input = { stage: 'preSeed' };
 * const parsed = NormalizedStageSchema.parse(input.stage); // => 'pre_seed'
 */
export const NormalizedStageSchema = z.string().transform((val, ctx) => {
  const normalized = normalizeStageOrUndefined(val);
  if (!normalized) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid stage: "${val}". Expected one of: ${CANONICAL_STAGES.join(', ')}`,
    });
    return z.NEVER;
  }
  return normalized;
});

// ============================================================================
// SUBSET SCHEMAS (for domain-specific contexts)
// ============================================================================

/**
 * Core investment stages (no growth/late_stage)
 * Used by fund-model.ts and similar contexts
 */
export const CoreStageSchema = z.enum([
  'seed',
  'series_a',
  'series_b',
  'series_c',
]);

export type CoreStage = z.infer<typeof CoreStageSchema>;

/**
 * Extended stages including pre-seed and series D
 * Used by most reserve calculations
 */
export const ExtendedStageSchema = z.enum([
  'pre_seed',
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'series_d',
]);

export type ExtendedStage = z.infer<typeof ExtendedStageSchema>;

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Default export is the canonical schema
export { CanonicalStageSchema as StageSchema };
export type { CanonicalStage as Stage };
