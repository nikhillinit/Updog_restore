/**
 * Scenario Calculations for Wizard Step 7
 *
 * Provides functions for:
 * - Applying scenario adjustments to model outputs
 * - Generating default scenario templates
 * - Comparing scenarios side-by-side
 *
 * This is distinct from deal-level scenario analysis (shared/utils/scenario-math.ts)
 * - This module: Fund-level "what-if" adjustments to model assumptions
 * - scenario-math.ts: Deal-level weighted case analysis
 */

import { type ScenarioAdjustment } from '@/schemas/modeling-wizard.schemas';

// Re-export type for convenience
export type { ScenarioAdjustment } from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Simplified model output for scenario analysis
 * Represents key metrics from the wizard steps
 */
export interface ModelOutput {
  /** Gross multiple on invested capital */
  grossMOIC: number;

  /** Net multiple on invested capital (after fees) */
  netMOIC: number;

  /** Gross IRR (%) */
  grossIRR: number;

  /** Net IRR (% after fees) */
  netIRR: number;

  /** Portfolio loss rate (%) */
  lossRate: number;

  /** Average exit timing (years) */
  avgExitYears: number;

  /** Follow-on participation rate (%) */
  participationRate: number;
}

/**
 * Scenario result with name and adjusted metrics
 */
export interface ScenarioResult {
  /** Scenario name */
  name: string;

  /** Optional description */
  description?: string;

  /** Adjusted model output */
  metrics: ModelOutput;

  /** Applied adjustment configuration */
  adjustment: ScenarioAdjustment;
}

/**
 * Side-by-side comparison of scenarios
 */
export interface ScenarioComparison {
  /** Metric names */
  metrics: string[];

  /** Scenario results indexed by scenario name */
  results: Record<string, ModelOutput>;

  /** Min/max/avg for each metric */
  summary: {
    grossMOIC: { min: number; max: number; avg: number };
    netMOIC: { min: number; max: number; avg: number };
    grossIRR: { min: number; max: number; avg: number };
    netIRR: { min: number; max: number; avg: number };
    lossRate: { min: number; max: number; avg: number };
    avgExitYears: { min: number; max: number; avg: number };
  };
}

// ============================================================================
// DEFAULT SCENARIOS
// ============================================================================

/**
 * Generate default scenario templates
 * Returns 3 scenarios: Base Case, Optimistic, Pessimistic
 */
export function generateDefaultScenarios(): ScenarioAdjustment[] {
  return [
    {
      id: 'base-case',
      name: 'Base Case',
      description: 'Expected performance based on plan assumptions',
      moicMultiplier: 1.0,
      exitTimingDelta: 0,
      lossRateDelta: 0,
      participationRateDelta: 0
    },
    {
      id: 'optimistic',
      name: 'Optimistic',
      description: 'Best case scenario with stronger exits and faster timing',
      moicMultiplier: 1.5,  // 50% higher returns
      exitTimingDelta: -6,   // Exit 6 months earlier
      lossRateDelta: -10,    // 10% fewer losses
      participationRateDelta: 10 // 10% more follow-ons
    },
    {
      id: 'pessimistic',
      name: 'Pessimistic',
      description: 'Worst case scenario with lower returns and slower exits',
      moicMultiplier: 0.7,   // 30% lower returns
      exitTimingDelta: 12,   // Exit 12 months later
      lossRateDelta: 15,     // 15% more losses
      participationRateDelta: -15 // 15% fewer follow-ons
    }
  ];
}

/**
 * Generate a blank custom scenario template
 */
export function generateCustomScenario(name: string): ScenarioAdjustment {
  return {
    id: `custom-${Date.now()}`,
    name,
    description: 'Custom scenario',
    moicMultiplier: 1.0,
    exitTimingDelta: 0,
    lossRateDelta: 0,
    participationRateDelta: 0
  };
}

// ============================================================================
// ADJUSTMENT APPLICATION
// ============================================================================

/**
 * Apply scenario adjustments to base model output
 *
 * Adjustments:
 * - MOIC multiplier: Direct multiplication (1.5x = 50% increase)
 * - Exit timing: Affects IRR calculation (earlier exits = higher IRR)
 * - Loss rate: Percentage point adjustment (-10 = reduce by 10pp)
 * - Participation rate: Percentage point adjustment (+10 = increase by 10pp)
 *
 * @param baseModel - Base case model output (unadjusted)
 * @param adjustment - Scenario adjustment configuration
 * @returns Adjusted model output
 */
export function applyScenarioAdjustments(
  baseModel: ModelOutput,
  adjustment: ScenarioAdjustment
): ModelOutput {
  // Apply MOIC multiplier
  const adjustedGrossMOIC = baseModel.grossMOIC * adjustment.moicMultiplier;
  const adjustedNetMOIC = baseModel.netMOIC * adjustment.moicMultiplier;

  // Apply loss rate delta (clamped to [0, 100])
  const adjustedLossRate = Math.max(
    0,
    Math.min(100, baseModel.lossRate + adjustment.lossRateDelta)
  );

  // Apply exit timing delta (convert months to years)
  const timingDeltaYears = adjustment.exitTimingDelta / 12;
  const adjustedExitYears = Math.max(0.5, baseModel.avgExitYears + timingDeltaYears);

  // Apply participation rate delta (clamped to [0, 100])
  const adjustedParticipationRate = Math.max(
    0,
    Math.min(100, baseModel.participationRate + adjustment.participationRateDelta)
  );

  // Recalculate IRR based on adjusted MOIC and exit timing
  // Simplified IRR formula: IRR ≈ (MOIC^(1/years) - 1) * 100
  const adjustedGrossIRR = calculateIRR(adjustedGrossMOIC, adjustedExitYears);
  const adjustedNetIRR = calculateIRR(adjustedNetMOIC, adjustedExitYears);

  return {
    grossMOIC: adjustedGrossMOIC,
    netMOIC: adjustedNetMOIC,
    grossIRR: adjustedGrossIRR,
    netIRR: adjustedNetIRR,
    lossRate: adjustedLossRate,
    avgExitYears: adjustedExitYears,
    participationRate: adjustedParticipationRate
  };
}

/**
 * Calculate IRR from MOIC and time period
 * Simplified formula: IRR = (MOIC^(1/years) - 1) * 100
 *
 * @param moic - Multiple on invested capital
 * @param years - Time period in years
 * @returns IRR as percentage
 */
export function calculateIRR(moic: number, years: number): number {
  if (years <= 0) return 0;
  if (moic <= 0) return -100; // Total loss

  // IRR = (MOIC^(1/years) - 1) * 100
  const irr = (Math.pow(moic, 1 / years) - 1) * 100;

  // Clamp to reasonable range [-100%, 300%]
  return Math.max(-100, Math.min(300, irr));
}

// ============================================================================
// SCENARIO COMPARISON
// ============================================================================

/**
 * Compare multiple scenarios side-by-side
 * Returns comparison table with min/max/avg summary
 *
 * @param scenarios - Array of scenario results
 * @returns Comparison data structure
 */
export function compareScenarios(scenarios: ScenarioResult[]): ScenarioComparison {
  const results: Record<string, ModelOutput> = {};

  // Index results by scenario name
  for (const scenario of scenarios) {
    results[scenario.name] = scenario.metrics;
  }

  // Calculate summary statistics
  const grossMOICs = scenarios.map(s => s.metrics.grossMOIC);
  const netMOICs = scenarios.map(s => s.metrics.netMOIC);
  const grossIRRs = scenarios.map(s => s.metrics.grossIRR);
  const netIRRs = scenarios.map(s => s.metrics.netIRR);
  const lossRates = scenarios.map(s => s.metrics.lossRate);
  const exitYears = scenarios.map(s => s.metrics.avgExitYears);

  return {
    metrics: [
      'Gross MOIC',
      'Net MOIC',
      'Gross IRR',
      'Net IRR',
      'Loss Rate',
      'Avg Exit (years)'
    ],
    results,
    summary: {
      grossMOIC: calculateStats(grossMOICs),
      netMOIC: calculateStats(netMOICs),
      grossIRR: calculateStats(grossIRRs),
      netIRR: calculateStats(netIRRs),
      lossRate: calculateStats(lossRates),
      avgExitYears: calculateStats(exitYears)
    }
  };
}

/**
 * Calculate min/max/avg statistics for an array of numbers
 */
function calculateStats(values: number[]): { min: number; max: number; avg: number } {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;

  return { min, max, avg };
}

// ============================================================================
// SCENARIO GENERATION HELPERS
// ============================================================================

/**
 * Generate scenario results from adjustments and base model
 *
 * @param baseModel - Base case model output
 * @param adjustments - Array of scenario adjustments
 * @returns Array of scenario results
 */
export function generateScenarioResults(
  baseModel: ModelOutput,
  adjustments: ScenarioAdjustment[]
): ScenarioResult[] {
  return adjustments.map(adjustment => ({
    name: adjustment.name,
    description: adjustment.description,
    metrics: applyScenarioAdjustments(baseModel, adjustment),
    adjustment
  }));
}

/**
 * Check if scenario is a base case (no adjustments)
 */
export function isBaseCase(adjustment: ScenarioAdjustment): boolean {
  return (
    adjustment.moicMultiplier === 1.0 &&
    adjustment.exitTimingDelta === 0 &&
    adjustment.lossRateDelta === 0 &&
    adjustment.participationRateDelta === 0
  );
}

/**
 * Validate scenario adjustments are within reasonable bounds
 * Returns array of warnings (empty if valid)
 */
export function validateScenarioAdjustments(
  adjustment: ScenarioAdjustment
): string[] {
  const warnings: string[] = [];

  // Check for extreme MOIC multipliers
  if (adjustment.moicMultiplier < 0.3) {
    warnings.push(`MOIC multiplier ${adjustment.moicMultiplier}x is extremely pessimistic`);
  }
  if (adjustment.moicMultiplier > 3.0) {
    warnings.push(`MOIC multiplier ${adjustment.moicMultiplier}x is extremely optimistic`);
  }

  // Check for extreme timing shifts
  if (Math.abs(adjustment.exitTimingDelta) > 36) {
    warnings.push(`Exit timing shift of ${adjustment.exitTimingDelta} months is very large`);
  }

  // Check for extreme loss rate changes
  if (Math.abs(adjustment.lossRateDelta) > 30) {
    warnings.push(`Loss rate delta of ${adjustment.lossRateDelta}% is very large`);
  }

  return warnings;
}
