import { describe, expect, it } from 'vitest';

import {
  FundScenarioComparisonV1Schema,
  SCENARIO_COMPARISON_METRIC_KEYS,
} from '../../../shared/contracts/fund-scenario-comparison-v1.contract';

const metricMap = {
  lpNetIrr: 0.15,
  gpNetIrr: null,
  totalManagementFees: 2_000_000,
  totalGpCarryDistributed: 500_000,
  totalGpFeeIncome: 2_000_000,
  finalDpi: 0.6,
  finalTvpi: 1.8,
  finalClawbackDue: 0,
};

describe('FundScenarioComparisonV1 contract', () => {
  it('accepts the strict scenario comparison payload used by the UI', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 123,
      comparisonStatus: 'comparable',
      scenarioSet: {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Fee sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: {
        label: 'Authoritative baseline',
        metrics: metricMap,
      },
      variants: [
        {
          variantId: '00000000-0000-0000-0000-000000000112',
          name: 'Lower fee',
          overrideType: 'fee_profile',
          metrics: metricMap,
          metricDeltas: [
            {
              metric: 'finalTvpi',
              displayName: 'TVPI',
              baselineValue: 1.8,
              scenarioValue: 2.1,
              absoluteDelta: 0.3,
              percentageDelta: 16.6666667,
              driftCapable: true,
              driftReason: 'stable',
            },
          ],
        },
      ],
      staleness: {
        state: 'CURRENT',
        sourceConfigVersion: 4,
        currentPublishedConfigVersion: 4,
      },
      calculatedAt: '2026-05-26T12:30:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects extra fields so the local UI mirror cannot drift silently', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 123,
      comparisonStatus: 'no_scenario_results',
      scenarioSet: {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Fee sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: null,
      variants: [],
      staleness: null,
      calculatedAt: null,
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it('keeps the comparison metric list fixed', () => {
    expect(SCENARIO_COMPARISON_METRIC_KEYS).toEqual([
      'lpNetIrr',
      'gpNetIrr',
      'totalManagementFees',
      'totalGpCarryDistributed',
      'totalGpFeeIncome',
      'finalDpi',
      'finalTvpi',
      'finalClawbackDue',
    ]);
  });

  it('supports an explicit unsupported override status for reserve scenarios', () => {
    const result = FundScenarioComparisonV1Schema.safeParse({
      fundId: 123,
      comparisonStatus: 'unsupported_override_type',
      scenarioSet: {
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        name: 'Reserve sensitivity',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
      },
      baseline: null,
      variants: [],
      staleness: null,
      calculatedAt: null,
    });

    expect(result.success).toBe(true);
  });

  it('accepts typed unavailable reasons for fail-closed comparison states', () => {
    expect(
      FundScenarioComparisonV1Schema.parse({
        fundId: 1,
        comparisonStatus: 'baseline_unavailable',
        unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
        scenarioSet: {
          scenarioSetId: '11111111-1111-4111-8111-111111111111',
          name: 'Fee profile scenario',
          sourceConfigId: 10,
          sourceConfigVersion: 3,
        },
        baseline: null,
        variants: [],
        staleness: null,
        calculatedAt: null,
      }).unavailableReason
    ).toBe('BASELINE_ECONOMICS_SNAPSHOT_MISSING');
  });
});
