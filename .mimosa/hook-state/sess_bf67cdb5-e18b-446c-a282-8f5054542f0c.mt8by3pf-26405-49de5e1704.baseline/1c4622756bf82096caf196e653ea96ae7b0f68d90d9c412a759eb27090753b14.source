/**
 * Stage Distribution Parser
 *
 * Normalizes stage allocation inputs into a standardized format,
 * handles various naming conventions, validates percentages,
 * and provides suggestions for invalid inputs.
 */

import { z } from 'zod';

// Canonical stage names that map to the StageType enum
export const CANONICAL_STAGES = [
  'pre_seed',
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'growth',
  'late_stage',
] as const;

export type CanonicalStage = typeof CANONICAL_STAGES[number];

// Stage name aliases - maps various inputs to canonical names
const STAGE_ALIASES: Record<string, CanonicalStage> = {
  // Pre-seed variations
  'pre_seed': 'pre_seed',
  'preseed': 'pre_seed',
  'pre-seed': 'pre_seed',
  'angel': 'pre_seed',
  'pre': 'pre_seed',

  // Seed variations
  'seed': 'seed',
  'seed_stage': 'seed',
  'seed stage': 'seed',

  // Series A variations
  'series_a': 'series_a',
  'series a': 'series_a',
  'seriesa': 'series_a',
  'series-a': 'series_a',
  'a': 'series_a',
  'round_a': 'series_a',
  'round a': 'series_a',

  // Series B variations
  'series_b': 'series_b',
  'series b': 'series_b',
  'seriesb': 'series_b',
  'series-b': 'series_b',
  'b': 'series_b',
  'round_b': 'series_b',
  'round b': 'series_b',

  // Series C variations
  'series_c': 'series_c',
  'series c': 'series_c',
  'seriesc': 'series_c',
  'series-c': 'series_c',
  'c': 'series_c',
  'round_c': 'series_c',
  'round c': 'series_c',

  // Growth variations
  'growth': 'growth',
  'growth_stage': 'growth',
  'growth stage': 'growth',
  'expansion': 'growth',
  'scale': 'growth',

  // Late stage variations
  'late_stage': 'late_stage',
  'late stage': 'late_stage',
  'late-stage': 'late_stage',
  'latestage': 'late_stage',
  'late': 'late_stage',
  'pre_ipo': 'late_stage',
  'pre-ipo': 'late_stage',
  'preipo': 'late_stage',
};

// Zod schema for stage distribution input
export const StageDistributionInputSchema = z.record(
  z.string(),
  z.number().min(0).max(100)
);

export type StageDistributionInput = z.infer<typeof StageDistributionInputSchema>;

// Result of parsing stage distribution
export interface ParseStageDistributionResult {
  /** Normalized stage allocation (canonical names, 0-1 range) */
  normalized: Record<CanonicalStage, number>;
  /** List of invalid input stage names that couldn't be mapped */
  invalidInputs: string[];
  /** Suggestions for invalid inputs */
  suggestions: Record<string, string[]>;
  /** Sum of all allocations (should be ~1.0 for valid input) */
  sum: number;
  /** Whether the distribution is valid (sum close to 1.0, no invalid inputs) */
  isValid: boolean;
  /** Validation errors if any */
  errors: string[];
}

/**
 * Find the closest canonical stage name for a given input
 */
function findClosestStage(input: string): string[] {
  const normalized = input.toLowerCase().trim();
  const suggestions: string[] = [];

  // Simple prefix matching
  for (const canonical of CANONICAL_STAGES) {
    const firstPart = canonical.split('_')[0] ?? '';
    if (canonical.startsWith(normalized) || normalized.startsWith(firstPart)) {
      suggestions.push(canonical);
    }
  }

  // If no prefix matches, suggest all stages
  if (suggestions.length === 0) {
    return [...CANONICAL_STAGES];
  }

  return suggestions;
}

/**
 * Normalize a stage name to its canonical form
 */
export function normalizeStage(input: string): CanonicalStage | null {
  const normalized = input.toLowerCase().trim().replace(/\s+/g, '_');

  // Direct lookup
  if (STAGE_ALIASES[normalized]) {
    return STAGE_ALIASES[normalized];
  }

  // Try without underscores
  const withoutUnderscores = normalized.replace(/_/g, '');
  if (STAGE_ALIASES[withoutUnderscores]) {
    return STAGE_ALIASES[withoutUnderscores];
  }

  // Try with spaces instead of underscores
  const withSpaces = normalized.replace(/_/g, ' ');
  if (STAGE_ALIASES[withSpaces]) {
    return STAGE_ALIASES[withSpaces];
  }

  return null;
}

/**
 * Parse and normalize a stage distribution input
 *
 * @param input - Object mapping stage names to allocation percentages (0-100 or 0-1)
 * @param options - Parsing options
 * @returns Normalized stage distribution with validation info
 */
export function parseStageDistribution(
  input: Record<string, number>,
  options: {
    /** Whether input percentages are in 0-100 range (default) or 0-1 range */
    percentageScale?: '0-100' | '0-1';
    /** Tolerance for sum validation (default 0.01 = 1%) */
    sumTolerance?: number;
  } = {}
): ParseStageDistributionResult {
  const { percentageScale = '0-100', sumTolerance = 0.01 } = options;

  // Initialize result
  const normalized: Record<CanonicalStage, number> = {
    pre_seed: 0,
    seed: 0,
    series_a: 0,
    series_b: 0,
    series_c: 0,
    growth: 0,
    late_stage: 0,
  };
  const invalidInputs: string[] = [];
  const suggestions: Record<string, string[]> = {};
  const errors: string[] = [];
  let sum = 0;

  // Process each input stage
  for (const [stage, value] of Object.entries(input)) {
    const canonicalStage = normalizeStage(stage);

    if (canonicalStage) {
      // Convert to 0-1 range if input is in 0-100 range
      const normalizedValue = percentageScale === '0-100' ? value / 100 : value;

      // Validate range
      if (normalizedValue < 0 || normalizedValue > 1) {
        errors.push(`Invalid allocation value for ${stage}: ${value}. Must be between 0 and ${percentageScale === '0-100' ? '100' : '1'}.`);
        continue;
      }

      // Accumulate (in case of duplicate canonical stages from different aliases)
      normalized[canonicalStage] += normalizedValue;
      sum += normalizedValue;
    } else {
      invalidInputs.push(stage);
      suggestions[stage] = findClosestStage(stage);
    }
  }

  // Validate sum
  const sumDiff = Math.abs(sum - 1);
  if (sumDiff > sumTolerance && sum > 0) {
    errors.push(`Stage allocations sum to ${(sum * 100).toFixed(1)}%, expected close to 100%.`);
  }

  // Add errors for invalid inputs
  if (invalidInputs.length > 0) {
    errors.push(`Unknown stage names: ${invalidInputs.join(', ')}. Please use standard stage names.`);
  }

  const isValid = errors.length === 0 && invalidInputs.length === 0;

  return {
    normalized,
    invalidInputs,
    suggestions,
    sum,
    isValid,
    errors,
  };
}

/**
 * Validate stage distribution without normalizing
 * Returns true if the distribution is valid
 */
export function isValidStageDistribution(input: Record<string, number>): boolean {
  const result = parseStageDistribution(input);
  return result.isValid;
}

/**
 * Get a human-readable display name for a canonical stage
 */
export function getStageDisplayName(stage: CanonicalStage): string {
  const displayNames: Record<CanonicalStage, string> = {
    pre_seed: 'Pre-Seed',
    seed: 'Seed',
    series_a: 'Series A',
    series_b: 'Series B',
    series_c: 'Series C',
    growth: 'Growth',
    late_stage: 'Late Stage',
  };
  return displayNames[stage];
}
