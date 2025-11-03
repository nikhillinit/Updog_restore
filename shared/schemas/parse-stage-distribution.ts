/**
 * Stage Distribution Parser and Validator
 *
 * Parses and validates arrays of {stage, weight} objects with sum-to-1 validation.
 * Used for portfolio construction, allocation modeling, and Monte Carlo inputs.
 *
 * Key Features:
 * - Epsilon tolerance (1e-4) for floating-point sum validation
 * - Unknown stage detection with normalization attempts
 * - Zod schema for type-safe validation
 * - Comprehensive error reporting
 *
 * @module shared/schemas/parse-stage-distribution
 * @version 3.4.0
 */

import { z } from 'zod';
import {
  normalizeInvestmentStage,
  type InvestmentStage,
  InvestmentStageSchema,
} from './investment-stages';

/**
 * Epsilon tolerance for floating-point sum validation
 * Allows sum to be within [1 - ε, 1 + ε] to account for rounding errors
 */
const EPSILON = 1e-4;

/**
 * Stage distribution entry (raw input)
 */
export interface StageDistributionEntry {
  stage: string;
  weight: number;
}

/**
 * Stage distribution entry (normalized output)
 */
export interface NormalizedStageDistribution {
  stage: InvestmentStage;
  weight: number;
}

/**
 * Parse result type (discriminated union)
 */
export type ParseResult =
  | { ok: true; distribution: NormalizedStageDistribution[]; warnings?: string[] }
  | { ok: false; errors: ParseError[] };

/**
 * Parse error detail
 */
export interface ParseError {
  kind: 'UnknownStage' | 'InvalidWeight' | 'InvalidSum' | 'EmptyDistribution';
  message: string;
  stage?: string;
  weight?: number;
  sum?: number;
}

/**
 * Zod schema for raw stage distribution entry
 */
export const StageDistributionEntrySchema = z.object({
  stage: z.string().min(1, 'Stage cannot be empty'),
  weight: z.number().min(0, 'Weight must be non-negative').max(1, 'Weight cannot exceed 1.0'),
});

/**
 * Zod schema for normalized stage distribution entry
 */
export const NormalizedStageDistributionSchema = z.object({
  stage: InvestmentStageSchema,
  weight: z.number().min(0).max(1),
});

/**
 * Zod schema for array of stage distributions
 */
export const StageDistributionArraySchema = z
  .array(StageDistributionEntrySchema)
  .min(1, 'Distribution must contain at least one stage')
  .refine(
    (entries) => {
      // Validate sum approximately equals 1.0
      const sum = entries.reduce((acc, entry) => acc + entry.weight, 0);
      return Math.abs(sum - 1.0) <= EPSILON;
    },
    (entries) => {
      const sum = entries.reduce((acc, entry) => acc + entry.weight, 0);
      return {
        message: `Distribution weights must sum to 1.0 (±${EPSILON}), got ${sum.toFixed(6)}`,
      };
    }
  );

/**
 * Parse and validate a stage distribution array
 *
 * Process:
 * 1. Validate input array is non-empty
 * 2. Normalize each stage name (with error collection)
 * 3. Validate weights are in [0, 1]
 * 4. Validate sum approximately equals 1.0 (within epsilon)
 * 5. Return normalized distribution or errors
 *
 * @param entries Array of {stage, weight} objects
 * @returns ParseResult discriminated union (ok | error)
 *
 * @example
 * // Success
 * parseStageDistribution([
 *   { stage: 'seed', weight: 0.4 },
 *   { stage: 'series-a', weight: 0.6 }
 * ])
 * // { ok: true, distribution: [...] }
 *
 * @example
 * // Unknown stage
 * parseStageDistribution([
 *   { stage: 'late-stage', weight: 1.0 }
 * ])
 * // { ok: false, errors: [{ kind: 'UnknownStage', ... }] }
 *
 * @example
 * // Invalid sum
 * parseStageDistribution([
 *   { stage: 'seed', weight: 0.3 },
 *   { stage: 'series-a', weight: 0.3 }
 * ])
 * // { ok: false, errors: [{ kind: 'InvalidSum', sum: 0.6 }] }
 */
export function parseStageDistribution(
  entries: StageDistributionEntry[]
): ParseResult {
  // Validate non-empty
  if (!entries || entries.length === 0) {
    return {
      ok: false as const,
      errors: [
        {
          kind: 'EmptyDistribution',
          message: 'Distribution must contain at least one stage',
        },
      ],
    };
  }

  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const normalized: NormalizedStageDistribution[] = [];

  // Validate each entry
  for (const entry of entries) {
    // Validate weight
    if (typeof entry.weight !== 'number' || entry.weight < 0 || entry.weight > 1) {
      errors.push({
        kind: 'InvalidWeight',
        message: `Weight must be in [0, 1], got ${entry.weight}`,
        stage: entry.stage,
        weight: entry.weight,
      });
      continue;
    }

    // Normalize stage
    const result = normalizeInvestmentStage(entry.stage);

    if (!result.ok) {
      // Type narrowing: result.ok === false means error exists
      const errorResult = result as Extract<typeof result, { ok: false }>;
      const canonical = errorResult.error.canonical || 'valid stages';
      errors.push({
        kind: 'UnknownStage',
        message: `Unknown stage "${entry.stage}". Expected one of: ${canonical}`,
        stage: entry.stage,
      });
      continue;
    }

    // Type narrowing: result.ok === true means value exists
    const successResult = result as Extract<typeof result, { ok: true }>;

    // Check for duplicate stages
    if (normalized.some((n) => n.stage === successResult.value)) {
      warnings.push(`Duplicate stage "${successResult.value}" - weights will be combined`);
      // Find existing entry and add weights
      const existing = normalized.find((n) => n.stage === successResult.value);
      if (existing) {
        existing.weight += entry.weight;
      }
    } else {
      normalized.push({
        stage: successResult.value,
        weight: entry.weight,
      });
    }
  }

  // Return early if stage/weight errors found
  if (errors.length > 0) {
    return { ok: false as const, errors };
  }

  // Validate sum approximately equals 1.0
  const sum = normalized.reduce((acc, entry) => acc + entry.weight, 0);
  const deviation = Math.abs(sum - 1.0);

  if (deviation > EPSILON) {
    return {
      ok: false as const,
      errors: [
        {
          kind: 'InvalidSum',
          message: `Distribution weights must sum to 1.0 (±${EPSILON}), got ${sum.toFixed(6)}`,
          sum,
        },
      ],
    };
  }

  // Success - normalize sum to exactly 1.0 if within epsilon
  if (deviation > 0 && deviation <= EPSILON) {
    warnings.push(
      `Sum adjusted from ${sum.toFixed(6)} to 1.0 (within epsilon tolerance ${EPSILON})`
    );

    // Proportional adjustment to make sum exactly 1.0
    const scale = 1.0 / sum;
    for (const entry of normalized) {
      entry.weight *= scale;
    }
  }

  return {
    ok: true as const,
    distribution: normalized,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate stage distribution (throws on error)
 * Convenience wrapper for parseStageDistribution that throws on failure
 *
 * @param entries Array of {stage, weight} objects
 * @returns Normalized distribution
 * @throws Error with detailed message if validation fails
 *
 * @example
 * const dist = validateStageDistribution([
 *   { stage: 'seed', weight: 0.4 },
 *   { stage: 'series-a', weight: 0.6 }
 * ]);
 */
export function validateStageDistribution(
  entries: StageDistributionEntry[]
): NormalizedStageDistribution[] {
  const result = parseStageDistribution(entries);

  if (result.ok) {
    return result.distribution;
  }

  // Type narrowing: result.ok === false means errors exist
  const errorResult = result as Extract<typeof result, { ok: false }>;
  const errorMessages = errorResult.errors.map((e) => e.message).join('; ');
  throw new Error(`Invalid stage distribution: ${errorMessages}`);
}

/**
 * Create a uniform stage distribution (equal weights)
 *
 * @param stages Array of stage names
 * @returns Normalized distribution with equal weights
 *
 * @example
 * createUniformDistribution(['seed', 'series-a'])
 * // [{ stage: 'seed', weight: 0.5 }, { stage: 'series-a', weight: 0.5 }]
 */
export function createUniformDistribution(
  stages: string[]
): NormalizedStageDistribution[] {
  if (!stages || stages.length === 0) {
    throw new Error('Stages array cannot be empty');
  }

  const weight = 1.0 / stages.length;
  const entries = stages.map((stage) => ({ stage, weight }));

  return validateStageDistribution(entries);
}

/**
 * Check if a distribution is valid without throwing
 *
 * @param entries Array of {stage, weight} objects
 * @returns true if distribution is valid
 */
export function isValidDistribution(entries: StageDistributionEntry[]): boolean {
  const result = parseStageDistribution(entries);
  return result.ok;
}

/**
 * Get epsilon tolerance value (for testing/documentation)
 */
export function getEpsilon(): number {
  return EPSILON;
}
