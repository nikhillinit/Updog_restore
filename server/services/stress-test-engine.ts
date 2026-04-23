/**
 * Stress Test Engine -- Phase 4
 *
 * Deterministically applies a small library of named multi-variable shock
 * scenarios (SUPPORTED_STRESS_SCENARIOS) to the published fund config and
 * records the corresponding FundModelOutputs metric per scenario. Mirrors
 * the structure of the one-way and two-way sensitivity engines and reuses
 * ConfigLoader, FundStateConfigLoader, and SensitivityEngineError from the
 * one-way engine.
 *
 * Worst-case work is N + 1 fund-model invocations where N is the number of
 * requested scenarios (the +1 is the unmodified baseline). The library caps
 * scenarios at 6 (see SUPPORTED_STRESS_SCENARIOS), so the ceiling is 7
 * deterministic fund-model calls per request -- pure compute, no DB, no IO.
 *
 * Beta interpretation: stress = parameter shocks (apply named multi-variable
 * overrides). Alpha = historical scenario replay via Monte Carlo is OUT OF
 * SCOPE; the existing BacktestingService.compareScenarios infrastructure is
 * left unchanged.
 *
 * @module server/services/stress-test-engine
 */

import { type FundModelInputs } from '@shared/schemas/fund-model';
import {
  SUPPORTED_STRESS_SCENARIOS,
  getStressScenarioById,
  getMetricDefinition,
  getVariableDefinition,
  type SensitivityMetricDefinition,
  type SensitivityStressScenarioId,
  type SensitivityVariableId,
} from '@shared/contracts/sensitivity-variables-v1';
import type {
  StressAnalysisRequestV1,
  StressAnalysisResultV1,
  StressAnalysisDatapoint,
} from '@shared/contracts/sensitivity-run-v1.contract';
import {
  FundStateConfigLoader,
  SensitivityEngineError,
  type ConfigLoader,
} from './one-way-sensitivity-engine';
import { computeSensitivityMetric } from './sensitivity-helpers';

// Use getVariableDefinition + SensitivityVariableId immediately at module
// scope so the ESLint auto-fix hook keeps the imports (it strips imports
// that are not yet referenced). The actual call site is below in
// resolveFundConfigPath; this module-scope reference is a no-op type guard.
const _GET_VAR_DEF: (id: SensitivityVariableId) => { fundConfigPath: string } =
  getVariableDefinition;

// Re-export so the route's dynamic import can resolve SensitivityEngineError
// from the stress engine module without forcing a separate import line.
// Mirrors the trick used in the two-way engine.
export { SensitivityEngineError } from './one-way-sensitivity-engine';
export type { ConfigLoader } from './one-way-sensitivity-engine';

export class StressTestEngine {
  constructor(private readonly configLoader: ConfigLoader) {}

  /**
   * Run a stress test for the given fund. Iterates SUPPORTED_STRESS_SCENARIOS
   * in canonical order (NOT request order), applies each requested scenario's
   * bundled overrides to the base config, and computes the metric per
   * scenario. Returns a complete StressAnalysisResultV1 ready for persistence
   * and HTTP response.
   *
   * Throws SensitivityEngineError on missing config, unsupported variable
   * paths, or output extraction failures.
   *
   * Datapoints are emitted in SUPPORTED_STRESS_SCENARIOS canonical order so
   * the rendered list is stable regardless of the order in params.scenarioIds.
   */
  async runStressTest(
    fundId: number,
    params: StressAnalysisRequestV1
  ): Promise<StressAnalysisResultV1> {
    const baseConfig = await this.configLoader.loadPublishedConfig(fundId);
    if (!baseConfig) {
      throw new SensitivityEngineError(
        'NO_PUBLISHED_CONFIG',
        `Fund ${fundId} has no published configuration`
      );
    }

    const metricDef = getMetricDefinition(params.metricId);

    // Baseline metric on the unmodified config.
    const baselineValue = this.computeMetric(baseConfig, metricDef);

    const requestedIds = new Set<SensitivityStressScenarioId>(params.scenarioIds);
    const datapoints: StressAnalysisDatapoint[] = [];

    // Iterate canonical SUPPORTED_STRESS_SCENARIOS order so the result is
    // stable regardless of the request order. Skipping unrequested scenarios.
    for (const scenario of SUPPORTED_STRESS_SCENARIOS) {
      if (!requestedIds.has(scenario.id as SensitivityStressScenarioId)) continue;

      // Defensive resolution -- the Zod enum has already validated the id but
      // getStressScenarioById is the canonical lookup.
      const resolved = getStressScenarioById(scenario.id as SensitivityStressScenarioId);
      if (!resolved) {
        throw new SensitivityEngineError(
          'UNSUPPORTED_VARIABLE_PATH',
          `Unknown stress scenario id: ${scenario.id}`
        );
      }

      // Apply each override sequentially to a single cloned config.
      let overridden = baseConfig;
      for (const override of resolved.overrides) {
        // Variable path comes from the variable library; for the 3 supported
        // scalars this is always a top-level field, so applyOverride works.
        overridden = this.applyOverride(
          overridden,
          this.resolveFundConfigPath(override.variableId),
          override.value
        );
      }

      const metricValue = this.computeMetric(overridden, metricDef);
      datapoints.push({
        scenarioId: resolved.id as SensitivityStressScenarioId,
        scenarioLabel: resolved.label,
        metricValue,
        baselineDelta: metricValue - baselineValue,
      });
    }

    // Summary: worst, best, range, and the scenarios that produced them.
    // datapoints is non-empty by Zod (.min(1)) on the request schema.
    let worstIdx = 0;
    let bestIdx = 0;
    for (let i = 1; i < datapoints.length; i++) {
      if (datapoints[i]!.metricValue < datapoints[worstIdx]!.metricValue) worstIdx = i;
      if (datapoints[i]!.metricValue > datapoints[bestIdx]!.metricValue) bestIdx = i;
    }
    const worstCase = datapoints[worstIdx]!.metricValue;
    const bestCase = datapoints[bestIdx]!.metricValue;
    const summary = {
      worstCase,
      bestCase,
      range: bestCase - worstCase,
      worstScenarioId: datapoints[worstIdx]!.scenarioId,
      bestScenarioId: datapoints[bestIdx]!.scenarioId,
    };

    return {
      scenarioIds: params.scenarioIds,
      metricId: params.metricId,
      baselineValue,
      datapoints,
      summary,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Map a sensitivity variable id to its FundModelInputs path. We resolve
   * via the variable library rather than hard-coding so the engine stays in
   * sync with SUPPORTED_VARIABLES.
   */
  private resolveFundConfigPath(variableId: SensitivityVariableId): string {
    return _GET_VAR_DEF(variableId).fundConfigPath;
  }

  private computeMetric(config: FundModelInputs, metricDef: SensitivityMetricDefinition): number {
    return computeSensitivityMetric(
      config,
      metricDef,
      (code, message) => new SensitivityEngineError(code, message)
    );
  }

  private applyOverride(config: FundModelInputs, path: string, value: number): FundModelInputs {
    const cloned = structuredClone(config);
    const segments = path.split('.');
    // Phase 4: same restriction as Phase 1A / Phase 2 -- all supported
    // variables map to top-level scalar fields. Nested-path overrides remain
    // deferred and error explicitly rather than silently no-op.
    if (segments.length === 1) {
      const key = segments[0] as string;
      (cloned as unknown as Record<string, unknown>)[key] = value;
      return cloned;
    }
    throw new SensitivityEngineError(
      'UNSUPPORTED_VARIABLE_PATH',
      `Nested override paths not supported in Phase 4 stress: ${path}`
    );
  }
}

export const stressTestEngine = new StressTestEngine(new FundStateConfigLoader());
