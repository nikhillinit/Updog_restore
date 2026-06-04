import { describe, expect, it } from 'vitest';
import type {
  FundScenarioComparisonV1,
  ScenarioComparisonStalenessV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import {
  comparisonBaselineLabel,
  comparisonEvidenceState,
  comparisonPublishedConfigVersion,
  comparisonStalenessState,
  comparisonStatusCopy,
} from '../../../../client/src/components/fund-results/scenario-comparison-evidence';

function metricMap() {
  return {
    lpNetIrr: 0.15,
    gpNetIrr: 0.1,
    totalManagementFees: 2_000_000,
    totalGpCarryDistributed: 500_000,
    totalGpFeeIncome: 2_000_000,
    finalDpi: 0.6,
    finalTvpi: 2.1,
    finalClawbackDue: 0,
  };
}

function comparison(overrides: Partial<FundScenarioComparisonV1> = {}): FundScenarioComparisonV1 {
  return {
    fundId: 1,
    comparisonStatus: 'comparable',
    unavailableReason: null,
    scenarioSet: {
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
    },
    baseline: { label: 'Authoritative baseline', metrics: metricMap() },
    variants: [],
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
    ...overrides,
  };
}

describe('scenario-comparison-evidence', () => {
  it('resolves the staleness state from string and object forms', () => {
    expect(comparisonStalenessState('CURRENT')).toBe('CURRENT');
    const objectForm: ScenarioComparisonStalenessV1 = {
      state: 'STALE_PUBLISH',
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 6,
    };
    expect(comparisonStalenessState(objectForm)).toBe('STALE_PUBLISH');
    expect(comparisonStalenessState(null)).toBeNull();
  });

  it('uses the scenario staleness state for a comparable comparison', () => {
    expect(comparisonEvidenceState(comparison({ staleness: 'CURRENT' }))).toBe('CURRENT');
    expect(
      comparisonEvidenceState(
        comparison({
          staleness: {
            state: 'STALE_PUBLISH',
            sourceConfigVersion: 4,
            currentPublishedConfigVersion: 6,
          },
        })
      )
    ).toBe('STALE_PUBLISH');
  });

  it('reads UNAVAILABLE when the comparison is not comparable, regardless of staleness', () => {
    expect(
      comparisonEvidenceState(
        comparison({ comparisonStatus: 'baseline_unavailable', staleness: 'CURRENT' })
      )
    ).toBe('UNAVAILABLE');
    expect(
      comparisonEvidenceState(
        comparison({ comparisonStatus: 'no_scenario_results', staleness: null })
      )
    ).toBe('UNAVAILABLE');
  });

  it('exposes the latest published config version only from the staleness object form', () => {
    expect(
      comparisonPublishedConfigVersion(
        comparison({
          staleness: {
            state: 'STALE_PUBLISH',
            sourceConfigVersion: 4,
            currentPublishedConfigVersion: 6,
          },
        })
      )
    ).toBe(6);
    expect(comparisonPublishedConfigVersion(comparison({ staleness: 'CURRENT' }))).toBeNull();
    expect(comparisonPublishedConfigVersion(comparison({ staleness: null }))).toBeNull();
  });

  it('renders comparison-specific status copy for each unusable state', () => {
    expect(
      comparisonStatusCopy(
        comparison({
          comparisonStatus: 'baseline_unavailable',
          unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
        })
      )
    ).toMatch(/baseline economics is missing/i);
    expect(comparisonStatusCopy(comparison({ comparisonStatus: 'no_scenario_results' }))).toMatch(
      /calculate this scenario set/i
    );
    expect(comparisonStatusCopy(comparison({ comparisonStatus: 'baseline_unavailable' }))).toMatch(
      /source config v4/i
    );
    expect(
      comparisonStatusCopy(comparison({ comparisonStatus: 'unsupported_override_type' }))
    ).toMatch(/not supported for reserve-allocation/i);
  });

  it('states the baseline as authoritative-economics identity pinned to source config', () => {
    expect(comparisonBaselineLabel(comparison())).toBe('BASELINE authoritative economics v4');
  });
});
