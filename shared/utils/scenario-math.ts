/**
 * Scenario Analysis Math Utilities
 *
 * All financial calculations use decimal.js for precision
 * Per AI review: safeDiv(0,0) returns null, not 0
 */

import Decimal from 'decimal.js';
import type { ScenarioCase, WeightedSummary, ProbabilityValidation } from '../types/scenario';

// Configure decimal.js for financial precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// Safe Math Operations
// ============================================================================

/**
 * Safe division that handles zero divisor
 * Returns null (not 0!) when divisor is zero
 *
 * @example
 * safeDiv(10, 2) // 5
 * safeDiv(10, 0) // null (not 0!)
 * safeDiv(0, 0)  // null (not 0!)
 */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return new Decimal(numerator).div(denominator).toNumber();
}

/**
 * Calculate deltas (absolute and percentage) for comparison views
 *
 * @example
 * deltas(100, 120) // { delta: 20, pct: 0.20 }
 * deltas(100, 0)   // { delta: -100, pct: null } // construction = 0
 */
export function deltas(construction: number, actual: number): {
  delta: number;
  pct: number | null;
} {
  const delta = actual - construction;
  const pct = safeDiv(delta, construction);
  return { delta, pct };
}

// ============================================================================
// Weighted Aggregation
// ============================================================================

/**
 * Calculate weighted average across scenario cases
 * Uses Σ(value × probability) formula
 *
 * @example
 * weighted([
 *   { probability: 0.5, moic: 3.0, exit: 100000 },
 *   { probability: 0.5, moic: 2.0, exit: 50000 }
 * ])
 * // Returns: { moic: 2.5, exit: 75000 }
 */
export function weighted<T extends { probability: number }>(
  rows: Array<T & Record<string, number>>
): Record<string, number> {
  const totals: Record<string, Decimal> = {};

  for (const row of rows) {
    const p = new Decimal(row.probability || 0);

    for (const [key, value] of Object.entries(row)) {
      // Skip probability field and non-numeric values
      if (key === 'probability' || typeof value !== 'number') continue;

      // Initialize or accumulate
      if (!totals[key]) {
        totals[key] = new Decimal(0);
      }

      totals[key] = totals[key].plus(p.times(value));
    }
  }

  // Convert Decimal objects back to numbers
  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, value.toNumber()])
  );
}

/**
 * Calculate weighted summary for scenario cases table
 * Includes MOIC calculation
 */
export function calculateWeightedSummary(cases: ScenarioCase[]): WeightedSummary {
  const weightedValues = weighted(cases as any);

  // Calculate weighted MOIC
  const moic = safeDiv(weightedValues['exit_proceeds'] || 0, weightedValues['investment'] || 0);

  return {
    moic,
    investment: weightedValues['investment'] || 0,
    follow_ons: weightedValues['follow_ons'] || 0,
    exit_proceeds: weightedValues['exit_proceeds'] || 0,
    exit_valuation: weightedValues['exit_valuation'] || 0,
    ...(weightedValues['months_to_exit'] !== undefined ? { months_to_exit: weightedValues['months_to_exit'] } : {}),
  };
}

// ============================================================================
// Probability Validation
// ============================================================================

/**
 * Validate that probabilities sum to 1.0 (with epsilon tolerance)
 * Per AI review: Use epsilon-based validation for precision
 *
 * @param epsilon - Tolerance for rounding errors (default: 0.0001 = 0.01%)
 */
export function validateProbabilities(
  cases: ScenarioCase[],
  epsilon = 0.0001
): ProbabilityValidation {
  const sum = cases.reduce((acc, c) => acc + c.probability, 0);
  const diff = Math.abs(1 - sum);

  if (diff < epsilon) {
    return {
      is_valid: true,
      sum,
      message: `Probabilities sum to ${(sum * 100).toFixed(2)}%`,
      severity: 'info',
    };
  }

  if (diff < 0.05) {
    // Within 5%
    return {
      is_valid: false,
      sum,
      message: `Probabilities sum to ${(sum * 100).toFixed(2)}%. Should be 100%. Consider normalizing.`,
      severity: 'warning',
    };
  }

  // More than 5% off
  return {
    is_valid: false,
    sum,
    message: `Probabilities sum to ${(sum * 100).toFixed(2)}%. Must be 100%. Please adjust or normalize.`,
    severity: 'error',
  };
}

/**
 * Normalize probabilities to sum = 1.0
 * Scales all probabilities proportionally
 *
 * @example
 * normalizeProbabilities([
 *   { probability: 0.5, ... },
 *   { probability: 0.4, ... }
 * ])
 * // Returns probabilities scaled to [0.556, 0.444] (sum = 1.0)
 */
export function normalizeProbabilities<T extends { probability: number }>(
  cases: T[]
): T[] {
  const sum = cases.reduce((acc, c) => acc + c.probability, 0);

  if (sum === 0) {
    // Equal distribution if all probabilities are 0
    const equalProb = 1 / cases.length;
    return cases.map(c => ({ ...c, probability: equalProb }));
  }

  // Scale proportionally
  return cases.map(c => ({
    ...c,
    probability: new Decimal(c.probability).div(sum).toNumber(),
  }));
}

// ============================================================================
// MOIC Calculations
// ============================================================================

/**
 * Calculate MOIC (Multiple on Invested Capital)
 * MOIC = Exit Proceeds / Investment
 *
 * Returns null if investment is 0 (avoid misleading infinity)
 */
export function calculateMOIC(exitProceeds: number, investment: number): number | null {
  return safeDiv(exitProceeds, investment);
}

/**
 * Add MOIC to each scenario case
 */
export function addMOICToCase(scenarioCase: ScenarioCase): ScenarioCase {
  const moicValue = calculateMOIC(scenarioCase.exit_proceeds, scenarioCase.investment);
  return {
    ...scenarioCase,
    ...(moicValue !== null ? { moic: moicValue } : {}),
  };
}

/**
 * Add MOIC to all cases
 */
export function addMOICToCases(cases: ScenarioCase[]): ScenarioCase[] {
  return cases.map(addMOICToCase);
}

// ============================================================================
// Number Formatting (for CSV export)
// ============================================================================

/**
 * Format number for CSV export (consistent decimal places)
 * Per AI review: Prevent precision loss in CSV exports
 */
export function formatForCSV(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return 'N/A';
  return new Decimal(value).toFixed(decimals);
}

/**
 * Format currency for CSV export
 */
export function formatCurrencyForCSV(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return new Decimal(value).toFixed(2);
}

/**
 * Format percentage for CSV export
 */
export function formatPercentageForCSV(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return new Decimal(value).times(100).toFixed(2) + '%';
}

// ============================================================================
// Precision Serialization (for API responses)
// ============================================================================

/**
 * Serialize decimal as string to prevent precision loss in JSON
 * Per Gemini review: Use "123.456789" format in API payloads
 */
export function serializeDecimal(value: Decimal | number, maxDecimals = 10): string {
  return new Decimal(value).toFixed(maxDecimals);
}

/**
 * Parse decimal string from API
 */
export function parseDecimal(value: string): number {
  return new Decimal(value).toNumber();
}
