/**
 * Hook: useScenarioCalculations
 *
 * Provides real-time scenario calculations for the wizard
 * Memoizes expensive computations to prevent unnecessary recalculations
 */

import { useMemo } from 'react';
import {
  generateScenarioResults,
  compareScenarios,
  type ModelOutput,
  type ScenarioAdjustment,
  type ScenarioResult,
  type ScenarioComparison
} from '@/lib/scenario-calculations';

export interface UseScenarioCalculationsOptions {
  /** Base model output from previous wizard steps */
  baseModel: ModelOutput;

  /** Scenario adjustments to apply */
  scenarios: ScenarioAdjustment[];

  /** Enable calculations (false = return null) */
  enabled?: boolean;
}

export interface UseScenarioCalculationsResult {
  /** Array of scenario results with adjusted metrics */
  results: ScenarioResult[];

  /** Side-by-side comparison with summary stats */
  comparison: ScenarioComparison;

  /** Flag indicating if calculations are enabled */
  enabled: boolean;
}

/**
 * Calculate scenario results and comparisons
 *
 * Memoized to prevent unnecessary recalculations when:
 * - Base model hasn't changed
 * - Scenario adjustments haven't changed
 * - Enabled state hasn't changed
 *
 * @param options - Base model and scenario configurations
 * @returns Scenario results and comparison data
 *
 * @example
 * const { results, comparison } = useScenarioCalculations({
 *   baseModel: {
 *     grossMOIC: 2.5,
 *     netMOIC: 2.1,
 *     grossIRR: 25,
 *     netIRR: 20,
 *     lossRate: 30,
 *     avgExitYears: 7.0,
 *     participationRate: 75
 *   },
 *   scenarios: generateDefaultScenarios()
 * });
 */
export function useScenarioCalculations({
  baseModel,
  scenarios,
  enabled = true
}: UseScenarioCalculationsOptions): UseScenarioCalculationsResult {
  // Generate scenario results (memoized)
  const results = useMemo(() => {
    if (!enabled || scenarios.length === 0) {
      return [];
    }

    return generateScenarioResults(baseModel, scenarios);
  }, [baseModel, scenarios, enabled]);

  // Generate comparison (memoized)
  const comparison = useMemo(() => {
    if (!enabled || results.length === 0) {
      return {
        metrics: [],
        results: {},
        summary: {
          grossMOIC: { min: 0, max: 0, avg: 0 },
          netMOIC: { min: 0, max: 0, avg: 0 },
          grossIRR: { min: 0, max: 0, avg: 0 },
          netIRR: { min: 0, max: 0, avg: 0 },
          lossRate: { min: 0, max: 0, avg: 0 },
          avgExitYears: { min: 0, max: 0, avg: 0 }
        }
      };
    }

    return compareScenarios(results);
  }, [results, enabled]);

  return {
    results,
    comparison,
    enabled
  };
}
