/**
 * OneWaySensitivityEngine -- service-level unit tests.
 *
 * We exercise the engine end-to-end with the REAL deterministic
 * `runFundModel` (it is pure, fast, and side-effect free) by feeding it a
 * minimal valid FundModelInputs fixture. The ConfigLoader is faked so the
 * test never touches the database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OneWaySensitivityEngine,
  SensitivityEngineError,
  type ConfigLoader,
} from '../../../server/services/one-way-sensitivity-engine';
import type { FundModelInputs } from '../../../shared/schemas/fund-model';
import type { OneWayAnalysisRequestV1 } from '../../../shared/contracts/sensitivity-run-v1.contract';

/**
 * Minimal valid FundModelInputs fixture. Constructed to satisfy ALL of the
 * superRefine feasibility constraints in FundModelInputsSchema:
 *   - stage allocations sum to 100%
 *   - check size <= stage allocation post-reserves
 *   - >= 1 company per stage
 *   - total initial investments <= deployable capital
 *   - graduation time < exit time
 */
function makeBaseConfig(overrides: Partial<FundModelInputs> = {}): FundModelInputs {
  return {
    fundSize: 100_000_000,
    periodLengthMonths: 3,
    capitalCallMode: 'upfront',
    managementFeeRate: 0.02,
    managementFeeYears: 10,
    stageAllocations: [{ stage: 'seed', allocationPct: 1.0 }],
    reservePoolPct: 0.2,
    averageCheckSizes: { seed: 1_000_000 },
    graduationRates: { seed: 0.5 },
    exitRates: { seed: 0.3 },
    monthsToGraduate: { seed: 18 },
    monthsToExit: { seed: 60 },
    ...overrides,
  };
}

class FakeLoader implements ConfigLoader {
  constructor(private readonly config: FundModelInputs | null) {}
  async loadPublishedConfig(): Promise<FundModelInputs | null> {
    return this.config;
  }
}

const baseRequest: OneWayAnalysisRequestV1 = {
  variableId: 'reserve_pool_pct',
  range: { min: 0.1, max: 0.4 },
  steps: 4,
  metricId: 'tvpi',
};

describe('OneWaySensitivityEngine', () => {
  let engine: OneWaySensitivityEngine;

  beforeEach(() => {
    engine = new OneWaySensitivityEngine(new FakeLoader(makeBaseConfig()));
  });

  it('throws SensitivityEngineError NO_PUBLISHED_CONFIG when loader returns null', async () => {
    const noConfigEngine = new OneWaySensitivityEngine(new FakeLoader(null));
    try {
      await noConfigEngine.runOneWaySensitivity(1, baseRequest);
      throw new Error('expected runOneWaySensitivity to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SensitivityEngineError);
      expect((err as SensitivityEngineError).code).toBe('NO_PUBLISHED_CONFIG');
    }
  });

  it('returns datapoints array of length === requested steps', async () => {
    const result = await engine.runOneWaySensitivity(1, baseRequest);
    expect(result.datapoints).toHaveLength(4);
  });

  it('baseline equals the metric of the unmodified base config', async () => {
    const result = await engine.runOneWaySensitivity(1, baseRequest);
    // Run a parallel engine on a fresh fake loader to verify the baseline.
    // Since runFundModel is pure, computing it here on the same fixture must
    // yield an identical TVPI to the engine's baselineValue.
    const { runFundModel } = await import('../../../shared/lib/fund-calc');
    const expected = runFundModel(makeBaseConfig()).kpis.tvpi;
    expect(result.baselineValue).toBeCloseTo(expected, 10);
  });

  it('summary.minMetric and maxMetric match the datapoint extremes', async () => {
    const result = await engine.runOneWaySensitivity(1, baseRequest);
    const values = result.datapoints.map((d) => d.metricValue);
    expect(result.summary.minMetric).toBeCloseTo(Math.min(...values), 10);
    expect(result.summary.maxMetric).toBeCloseTo(Math.max(...values), 10);
  });

  it('summary.range equals maxMetric - minMetric', async () => {
    const result = await engine.runOneWaySensitivity(1, baseRequest);
    expect(result.summary.range).toBeCloseTo(
      result.summary.maxMetric - result.summary.minMetric,
      10
    );
  });

  it('sweeps reserve_pool_pct from 0.1 to 0.4 with 4 steps at exactly [0.1, 0.2, 0.3, 0.4]', async () => {
    const result = await engine.runOneWaySensitivity(1, baseRequest);
    const variableValues = result.datapoints.map((d) => d.variableValue);
    expect(variableValues[0]).toBeCloseTo(0.1, 10);
    expect(variableValues[1]).toBeCloseTo(0.2, 10);
    expect(variableValues[2]).toBeCloseTo(0.3, 10);
    expect(variableValues[3]).toBeCloseTo(0.4, 10);
  });

  it('computedAt is a valid ISO 8601 datetime string', async () => {
    const result = await engine.runOneWaySensitivity(1, baseRequest);
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(result.computedAt).toString()).not.toBe('Invalid Date');
  });

  it('records the variableId and metricId from the request', async () => {
    const result = await engine.runOneWaySensitivity(1, {
      ...baseRequest,
      variableId: 'management_fee_rate',
      range: { min: 0, max: 0.04 },
      steps: 3,
      metricId: 'dpi',
    });
    expect(result.variableId).toBe('management_fee_rate');
    expect(result.metricId).toBe('dpi');
  });
});
