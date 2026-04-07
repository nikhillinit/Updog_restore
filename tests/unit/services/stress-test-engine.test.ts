/**
 * StressTestEngine -- service-level unit tests.
 *
 * We exercise the engine end-to-end with the REAL deterministic
 * `runFundModel` (it is pure, fast, and side-effect free) by feeding it a
 * minimal valid FundModelInputs fixture. The ConfigLoader is faked so the
 * test never touches the database.
 *
 * Mirrors tests/unit/services/two-way-sensitivity-engine.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  StressTestEngine,
  SensitivityEngineError,
  type ConfigLoader,
} from '../../../server/services/stress-test-engine';
import type { FundModelInputs } from '../../../shared/schemas/fund-model';
import type { StressAnalysisRequestV1 } from '../../../shared/contracts/sensitivity-run-v1.contract';
import {
  SUPPORTED_STRESS_SCENARIOS,
  type SensitivityStressScenarioId,
} from '../../../shared/contracts/sensitivity-variables-v1';

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

const allScenarioIds: SensitivityStressScenarioId[] = [
  'mild_downside',
  'severe_downside',
  'mild_upside',
  'severe_upside',
  'worst_case',
  'best_case',
];

const baseRequest: StressAnalysisRequestV1 = {
  scenarioIds: allScenarioIds,
  metricId: 'tvpi',
};

describe('StressTestEngine', () => {
  let engine: StressTestEngine;

  beforeEach(() => {
    engine = new StressTestEngine(new FakeLoader(makeBaseConfig()));
  });

  it('throws SensitivityEngineError NO_PUBLISHED_CONFIG when loader returns null', async () => {
    const noConfigEngine = new StressTestEngine(new FakeLoader(null));
    try {
      await noConfigEngine.runStressTest(1, baseRequest);
      throw new Error('expected runStressTest to throw');
    } catch (err) {
      // instanceof check proves SensitivityEngineError export wiring from
      // one-way engine resolves correctly through the stress module.
      expect(err).toBeInstanceOf(SensitivityEngineError);
      expect((err as SensitivityEngineError).code).toBe('NO_PUBLISHED_CONFIG');
    }
  });

  it('SUPPORTED_STRESS_SCENARIOS contains exactly 6 predefined scenarios', () => {
    expect(SUPPORTED_STRESS_SCENARIOS).toHaveLength(6);
  });

  it('returns one datapoint per requested scenario when all 6 are requested', async () => {
    const result = await engine.runStressTest(1, baseRequest);
    expect(result.datapoints).toHaveLength(6);
  });

  it('returns one datapoint per requested scenario when 3 are requested', async () => {
    const result = await engine.runStressTest(1, {
      scenarioIds: ['mild_downside', 'best_case', 'worst_case'],
      metricId: 'tvpi',
    });
    expect(result.datapoints).toHaveLength(3);
  });

  it('emits datapoints in SUPPORTED_STRESS_SCENARIOS canonical order regardless of request order', async () => {
    const result = await engine.runStressTest(1, {
      scenarioIds: ['best_case', 'worst_case', 'mild_downside'],
      metricId: 'tvpi',
    });
    // Canonical order is mild_downside (idx 0), worst_case (idx 4), best_case (idx 5).
    expect(result.datapoints.map((d) => d.scenarioId)).toEqual([
      'mild_downside',
      'worst_case',
      'best_case',
    ]);
  });

  it('each datapoint carries the correct scenarioId and scenarioLabel', async () => {
    const result = await engine.runStressTest(1, baseRequest);
    for (const dp of result.datapoints) {
      const scenario = SUPPORTED_STRESS_SCENARIOS.find((s) => s.id === dp.scenarioId);
      expect(scenario).toBeDefined();
      expect(dp.scenarioLabel).toBe(scenario?.label);
    }
  });

  it('baseline equals the metric of the unmodified base config', async () => {
    const result = await engine.runStressTest(1, baseRequest);
    // Since runFundModel is pure, computing it here on the same fixture must
    // yield an identical TVPI to the engine's baselineValue.
    const { runFundModel } = await import('../../../shared/lib/fund-calc');
    const expected = runFundModel(makeBaseConfig()).kpis.tvpi;
    expect(result.baselineValue).toBeCloseTo(expected, 10);
  });

  it('baselineDelta equals metricValue minus baselineValue for every datapoint', async () => {
    const result = await engine.runStressTest(1, baseRequest);
    for (const dp of result.datapoints) {
      expect(dp.baselineDelta).toBeCloseTo(dp.metricValue - result.baselineValue, 10);
    }
  });

  it('multi-override scenarios apply ALL their overrides (not just the first)', async () => {
    // worst_case bundles 3 overrides: reserve_pool_pct=0.05, management_fee_rate=0.04,
    // management_fee_years=15. Verify by manually constructing the same config and
    // computing the metric -- it must match the worst_case datapoint.
    const result = await engine.runStressTest(1, {
      scenarioIds: ['worst_case'],
      metricId: 'tvpi',
    });
    const { runFundModel } = await import('../../../shared/lib/fund-calc');
    const manuallyOverridden = makeBaseConfig({
      reservePoolPct: 0.05,
      managementFeeRate: 0.04,
      managementFeeYears: 15,
    });
    const expected = runFundModel(manuallyOverridden).kpis.tvpi;
    expect(result.datapoints[0]!.metricValue).toBeCloseTo(expected, 10);
  });

  it('summary worstCase / bestCase / range / scenario ids match the datapoint extremes', async () => {
    const result = await engine.runStressTest(1, baseRequest);
    const values = result.datapoints.map((d) => d.metricValue);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    expect(result.summary.worstCase).toBeCloseTo(minValue, 10);
    expect(result.summary.bestCase).toBeCloseTo(maxValue, 10);
    expect(result.summary.range).toBeCloseTo(maxValue - minValue, 10);

    const worstDatapoint = result.datapoints.find((d) => d.metricValue === minValue);
    const bestDatapoint = result.datapoints.find((d) => d.metricValue === maxValue);
    expect(result.summary.worstScenarioId).toBe(worstDatapoint?.scenarioId);
    expect(result.summary.bestScenarioId).toBe(bestDatapoint?.scenarioId);
  });

  it('records the scenarioIds and metricId from the request', async () => {
    const result = await engine.runStressTest(1, {
      scenarioIds: ['mild_downside', 'mild_upside'],
      metricId: 'dpi',
    });
    expect(result.scenarioIds).toEqual(['mild_downside', 'mild_upside']);
    expect(result.metricId).toBe('dpi');
  });

  it('computedAt is a valid ISO 8601 datetime string', async () => {
    const result = await engine.runStressTest(1, baseRequest);
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(result.computedAt).toString()).not.toBe('Invalid Date');
  });
});
