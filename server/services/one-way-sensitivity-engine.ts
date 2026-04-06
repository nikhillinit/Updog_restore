/**
 * One-Way Sensitivity Engine -- Phase 1A
 *
 * Deterministically sweeps a single FundModelInputs scalar across a range
 * and records the corresponding FundModelOutputs metric at each step. The
 * deterministic engine `runFundModel` is invoked once per sweep step plus
 * once for the baseline (no override). Pure compute -- no DB, no IO.
 *
 * The `ConfigLoader` interface decouples the sweep from how a fund's
 * published config is fetched, so unit tests can substitute a fake loader
 * while the production wiring uses `FundStateConfigLoader` (which reads
 * `fundConfigs` directly because `FundStateReadService.getState()` returns
 * derived metadata, NOT the raw config payload).
 *
 * @module server/services/one-way-sensitivity-engine
 */

import { runFundModel } from '@shared/lib/fund-calc';
import { FundModelInputsSchema, type FundModelInputs } from '@shared/schemas/fund-model';
import {
  getVariableDefinition,
  getMetricDefinition,
  type SensitivityMetricDefinition,
} from '@shared/contracts/sensitivity-variables-v1';
import type {
  OneWayAnalysisRequestV1,
  OneWayAnalysisResultV1,
} from '@shared/contracts/sensitivity-run-v1.contract';
import { db } from '../db';
import { fundConfigs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

/** Typed engine error so route handlers can map error codes to HTTP statuses. */
export class SensitivityEngineError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SensitivityEngineError';
    this.code = code;
  }
}

export interface ConfigLoader {
  loadPublishedConfig(fundId: number): Promise<FundModelInputs | null>;
}

export class OneWaySensitivityEngine {
  constructor(private readonly configLoader: ConfigLoader) {}

  /**
   * Run a one-way sensitivity sweep for the given fund. Returns a complete
   * OneWayAnalysisResultV1 ready for persistence and HTTP response. Throws
   * SensitivityEngineError with a stable code on missing config or unsupported
   * variable paths.
   */
  async runOneWaySensitivity(
    fundId: number,
    params: OneWayAnalysisRequestV1
  ): Promise<OneWayAnalysisResultV1> {
    const baseConfig = await this.configLoader.loadPublishedConfig(fundId);
    if (!baseConfig) {
      throw new SensitivityEngineError(
        'NO_PUBLISHED_CONFIG',
        `Fund ${fundId} has no published configuration`
      );
    }

    const variableDef = getVariableDefinition(params.variableId);
    const metricDef = getMetricDefinition(params.metricId);

    // Baseline metric on the unmodified config.
    const baselineValue = this.computeMetric(baseConfig, metricDef);

    // Linspace sweep across [min, max] inclusive in N steps.
    const datapoints: { variableValue: number; metricValue: number }[] = [];
    const stepSize = (params.range.max - params.range.min) / (params.steps - 1);
    for (let i = 0; i < params.steps; i++) {
      const variableValue = params.range.min + i * stepSize;
      const overriddenConfig = this.applyOverride(
        baseConfig,
        variableDef.fundConfigPath,
        variableValue
      );
      const metricValue = this.computeMetric(overriddenConfig, metricDef);
      datapoints.push({ variableValue, metricValue });
    }

    const metricValues = datapoints.map((d) => d.metricValue);
    const minMetric = Math.min(...metricValues);
    const maxMetric = Math.max(...metricValues);

    return {
      variableId: params.variableId,
      metricId: params.metricId,
      baselineValue,
      datapoints,
      summary: { minMetric, maxMetric, range: maxMetric - minMetric },
      computedAt: new Date().toISOString(),
    };
  }

  private computeMetric(config: FundModelInputs, metricDef: SensitivityMetricDefinition): number {
    const outputs = runFundModel(config);
    return this.extractByPath(
      outputs as unknown as Record<string, unknown>,
      metricDef.fundMetricPath
    );
  }

  private applyOverride(config: FundModelInputs, path: string, value: number): FundModelInputs {
    const cloned = structuredClone(config);
    const segments = path.split('.');
    // Phase 1A: all 3 supported variables map to top-level scalar fields
    // (reservePoolPct, managementFeeRate, managementFeeYears). Nested-path
    // overrides (e.g., per-stage rates) are deferred -- error explicitly
    // rather than silently no-op.
    if (segments.length === 1) {
      const key = segments[0] as string;
      (cloned as unknown as Record<string, unknown>)[key] = value;
      return cloned;
    }
    throw new SensitivityEngineError(
      'UNSUPPORTED_VARIABLE_PATH',
      `Nested override paths not supported in Phase 1A: ${path}`
    );
  }

  private extractByPath(obj: Record<string, unknown>, path: string): number {
    const segments = path.split('.');
    let current: unknown = obj;
    for (const segment of segments) {
      if (
        current &&
        typeof current === 'object' &&
        segment in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        throw new SensitivityEngineError(
          'METRIC_PATH_NOT_FOUND',
          `Could not extract metric at path ${path}`
        );
      }
    }
    if (typeof current !== 'number') {
      throw new SensitivityEngineError(
        'METRIC_NOT_NUMBER',
        `Metric at path ${path} is not a number: ${typeof current}`
      );
    }
    return current;
  }
}

/**
 * Production adapter: loads the published config payload directly from
 * `fundConfigs.config` (a JSONB blob) and parses it through
 * `FundModelInputsSchema`. We deliberately do NOT use
 * `FundStateReadService.getState()` here because that service returns derived
 * lifecycle metadata, not the raw config inputs the engine consumes.
 */
export class FundStateConfigLoader implements ConfigLoader {
  async loadPublishedConfig(fundId: number): Promise<FundModelInputs | null> {
    const row = await db.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, fundId), eq(fundConfigs.isPublished, true)),
    });

    if (!row) return null;

    const parsed = FundModelInputsSchema.safeParse(row.config);
    if (!parsed.success) {
      throw new SensitivityEngineError(
        'INVALID_PUBLISHED_CONFIG',
        `Published config for fund ${fundId} does not match FundModelInputsSchema: ${parsed.error.message}`
      );
    }
    return parsed.data;
  }
}

export const oneWaySensitivityEngine = new OneWaySensitivityEngine(new FundStateConfigLoader());
