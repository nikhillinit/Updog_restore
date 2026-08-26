/**
 * TwoWaySensitivityEngine -- service-level unit tests.
 *
 * We exercise the engine end-to-end with the REAL deterministic
 * `runFundModel` (it is pure, fast, and side-effect free) by feeding it a
 * minimal valid FundModelInputs fixture. The ConfigLoader is faked so the
 * test never touches the database.
 *
 * Mirrors tests/unit/services/one-way-sensitivity-engine.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TwoWaySensitivityEngine,
  SensitivityEngineError,
  type ConfigLoader,
} from '../../../server/services/two-way-sensitivity-engine';
import type { FundModelInputs } from '../../../shared/schemas/fund-model';
import type { TwoWayAnalysisRequestV1 } from '../../../shared/contracts/sensitivity-run-v1.contract';

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

const baseRequest: TwoWayAnalysisRequestV1 = {
  variableXId: 'reserve_pool_pct',
  rangeX: { min: 0.1, max: 0.3 },
  stepsX: 3,
  variableYId: 'management_fee_rate',
  rangeY: { min: 0.01, max: 0.03 },
  stepsY: 3,
  metricId: 'tvpi',
};

describe('TwoWaySensitivityEngine', () => {
  let engine: TwoWaySensitivityEngine;

  beforeEach(() => {
    engine = new TwoWaySensitivityEngine(new FakeLoader(makeBaseConfig()));
  });

  it('throws SensitivityEngineError NO_PUBLISHED_CONFIG when loader returns null', async () => {
    const noConfigEngine = new TwoWaySensitivityEngine(new FakeLoader(null));
    try {
      await noConfigEngine.runTwoWaySensitivity(1, baseRequest);
      throw new Error('expected runTwoWaySensitivity to throw');
    } catch (err) {
      // instanceof check proves SensitivityEngineError export wiring from
      // one-way engine resolves correctly through the two-way module.
      expect(err).toBeInstanceOf(SensitivityEngineError);
      expect((err as SensitivityEngineError).code).toBe('NO_PUBLISHED_CONFIG');
    }
  });

  it('returns datapoints array of length === stepsX * stepsY for a 3x3 grid', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    expect(result.datapoints).toHaveLength(9);
  });

  it('returns 4 datapoints for a 2x2 grid', async () => {
    const result = await engine.runTwoWaySensitivity(1, {
      ...baseRequest,
      stepsX: 2,
      stepsY: 2,
    });
    expect(result.datapoints).toHaveLength(4);
  });

  it('returns 15 datapoints for a 5x3 grid', async () => {
    const result = await engine.runTwoWaySensitivity(1, {
      ...baseRequest,
      stepsX: 5,
      stepsY: 3,
    });
    expect(result.datapoints).toHaveLength(15);
  });

  it('baseline equals the metric of the unmodified base config', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    // Since runFundModel is pure, computing it here on the same fixture must
    // yield an identical TVPI to the engine's baselineValue.
    const { runFundModel } = await import('../../../shared/lib/fund-calc');
    const expected = runFundModel(makeBaseConfig()).kpis.tvpi;
    expect(result.baselineValue).toBeCloseTo(expected, 10);
  });

  it('emits row-major datapoints with correct corner (X, Y) coordinates', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    // Outer i loop on X, inner j loop on Y -> i=0,j=0 is index 0;
    // i=stepsX-1,j=stepsY-1 is the last index (stepsX * stepsY - 1).
    const first = result.datapoints[0]!;
    expect(first.variableXValue).toBeCloseTo(baseRequest.rangeX.min, 10);
    expect(first.variableYValue).toBeCloseTo(baseRequest.rangeY.min, 10);

    const last = result.datapoints[result.datapoints.length - 1]!;
    expect(last.variableXValue).toBeCloseTo(baseRequest.rangeX.max, 10);
    expect(last.variableYValue).toBeCloseTo(baseRequest.rangeY.max, 10);
  });

  it('row-major iteration: index 1 advances Y, index stepsY advances X', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    // First X row: same X, sweeping Y from min to max in stepsY ticks.
    const row0 = result.datapoints.slice(0, baseRequest.stepsY);
    for (const point of row0) {
      expect(point.variableXValue).toBeCloseTo(baseRequest.rangeX.min, 10);
    }
    // After stepsY ticks, the X coordinate advances by one stepSizeX.
    const stepSizeX = (baseRequest.rangeX.max - baseRequest.rangeX.min) / (baseRequest.stepsX - 1);
    const firstOfNextRow = result.datapoints[baseRequest.stepsY]!;
    expect(firstOfNextRow.variableXValue).toBeCloseTo(baseRequest.rangeX.min + stepSizeX, 10);
    expect(firstOfNextRow.variableYValue).toBeCloseTo(baseRequest.rangeY.min, 10);
  });

  it('summary.minMetric and maxMetric match the datapoint extremes', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    const values = result.datapoints.map((d) => d.metricValue);
    expect(result.summary.minMetric).toBeCloseTo(Math.min(...values), 10);
    expect(result.summary.maxMetric).toBeCloseTo(Math.max(...values), 10);
  });

  it('summary.range equals maxMetric - minMetric', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    expect(result.summary.range).toBeCloseTo(
      result.summary.maxMetric - result.summary.minMetric,
      10
    );
  });

  it('records the variableXId, variableYId, and metricId from the request', async () => {
    const result = await engine.runTwoWaySensitivity(1, {
      ...baseRequest,
      variableXId: 'management_fee_rate',
      rangeX: { min: 0, max: 0.04 },
      stepsX: 3,
      variableYId: 'reserve_pool_pct',
      rangeY: { min: 0.1, max: 0.3 },
      stepsY: 2,
      metricId: 'dpi',
    });
    expect(result.variableXId).toBe('management_fee_rate');
    expect(result.variableYId).toBe('reserve_pool_pct');
    expect(result.metricId).toBe('dpi');
  });

  it('computedAt is a valid ISO 8601 datetime string', async () => {
    const result = await engine.runTwoWaySensitivity(1, baseRequest);
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(result.computedAt).toString()).not.toBe('Invalid Date');
  });
});
