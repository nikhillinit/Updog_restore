/**
 * Two-Way Sensitivity Engine -- Phase 2
 *
 * Deterministically sweeps two FundModelInputs scalars across grids of values
 * and records the corresponding FundModelOutputs metric at each (X, Y) cell.
 * Mirrors the structure of OneWaySensitivityEngine and reuses ConfigLoader,
 * FundStateConfigLoader, and SensitivityEngineError from the one-way engine.
 *
 * Worst-case work is stepsX * stepsY + 1 fund-model invocations (the +1 is
 * the unmodified baseline). With both axes capped at 50 by the contract,
 * that gives a 2501-call ceiling per request -- still pure compute, no DB,
 * no IO.
 *
 * @module server/services/two-way-sensitivity-engine
 */

import { type FundModelInputs } from '@shared/schemas/fund-model';
import {
  getVariableDefinition,
  getMetricDefinition,
  type SensitivityMetricDefinition,
} from '@shared/contracts/sensitivity-variables-v1';
import type {
  TwoWayAnalysisRequestV1,
  TwoWayAnalysisResultV1,
} from '@shared/contracts/sensitivity-run-v1.contract';
import {
  FundStateConfigLoader,
  SensitivityEngineError,
  type ConfigLoader,
} from './one-way-sensitivity-engine';
import { computeSensitivityMetric } from './sensitivity-helpers';

// Re-export so the route's dynamic import resolves SensitivityEngineError from
// either engine module without forcing a separate import line.
export { SensitivityEngineError } from './one-way-sensitivity-engine';
export type { ConfigLoader } from './one-way-sensitivity-engine';

export class TwoWaySensitivityEngine {
  constructor(private readonly configLoader: ConfigLoader) {}

  /**
   * Run a two-way sensitivity sweep for the given fund. Returns a complete
   * TwoWayAnalysisResultV1 ready for persistence and HTTP response. Throws
   * SensitivityEngineError with a stable code on missing config or
   * unsupported variable paths.
   *
   * Iteration order: outer loop on X, inner loop on Y. Datapoints are emitted
   * in row-major order so consumers can reshape into a stepsX-by-stepsY grid
   * by index without additional sorting.
   */
  async runTwoWaySensitivity(
    fundId: number,
    params: TwoWayAnalysisRequestV1
  ): Promise<TwoWayAnalysisResultV1> {
    const baseConfig = await this.configLoader.loadPublishedConfig(fundId);
    if (!baseConfig) {
      throw new SensitivityEngineError(
        'NO_PUBLISHED_CONFIG',
        `Fund ${fundId} has no published configuration`
      );
    }

    const variableXDef = getVariableDefinition(params.variableXId);
    const variableYDef = getVariableDefinition(params.variableYId);
    const metricDef = getMetricDefinition(params.metricId);

    // Baseline metric on the unmodified config.
    const baselineValue = this.computeMetric(baseConfig, metricDef);

    // Linspace grid across [minX..maxX] x [minY..maxY] inclusive.
    const datapoints: { variableXValue: number; variableYValue: number; metricValue: number }[] =
      [];
    const stepSizeX = (params.rangeX.max - params.rangeX.min) / (params.stepsX - 1);
    const stepSizeY = (params.rangeY.max - params.rangeY.min) / (params.stepsY - 1);

    for (let i = 0; i < params.stepsX; i++) {
      const variableXValue = params.rangeX.min + i * stepSizeX;
      const overriddenX = this.applyOverride(
        baseConfig,
        variableXDef.fundConfigPath,
        variableXValue
      );
      for (let j = 0; j < params.stepsY; j++) {
        const variableYValue = params.rangeY.min + j * stepSizeY;
        const overriddenXY = this.applyOverride(
          overriddenX,
          variableYDef.fundConfigPath,
          variableYValue
        );
        const metricValue = this.computeMetric(overriddenXY, metricDef);
        datapoints.push({ variableXValue, variableYValue, metricValue });
      }
    }

    const metricValues = datapoints.map((d) => d.metricValue);
    const minMetric = Math.min(...metricValues);
    const maxMetric = Math.max(...metricValues);

    return {
      variableXId: params.variableXId,
      variableYId: params.variableYId,
      metricId: params.metricId,
      baselineValue,
      datapoints,
      summary: { minMetric, maxMetric, range: maxMetric - minMetric },
      computedAt: new Date().toISOString(),
    };
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
    // Phase 2: same restriction as Phase 1A -- all supported variables map
    // to top-level scalar fields. Nested-path overrides remain deferred and
    // error explicitly rather than silently no-op.
    if (segments.length === 1) {
      const key = segments[0] as string;
      (cloned as unknown as Record<string, unknown>)[key] = value;
      return cloned;
    }
    throw new SensitivityEngineError(
      'UNSUPPORTED_VARIABLE_PATH',
      `Nested override paths not supported in Phase 2 two-way: ${path}`
    );
  }
}

export const twoWaySensitivityEngine = new TwoWaySensitivityEngine(new FundStateConfigLoader());
