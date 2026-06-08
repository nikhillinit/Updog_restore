import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CrossSetScenarioComparisonTable,
  CROSS_SET_METRIC_DEFINITIONS,
} from '../../../../client/src/components/fund-results/CrossSetScenarioComparisonTable';
import { SCENARIO_COMPARISON_METRIC_KEYS } from '../../../../shared/contracts/fund-scenario-comparison-v1.contract';
import type {
  FundScenarioComparisonV1,
  ScenarioComparisonMetricDeltaV1,
  ScenarioComparisonMetricKey,
  ScenarioComparisonMetricMap,
} from '../../../../shared/contracts/fund-scenario-comparison-v1.contract';

function uuid(n: number): string {
  return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

const BASE_METRICS: ScenarioComparisonMetricMap = {
  lpNetIrr: 0.15,
  gpNetIrr: 0.1,
  totalManagementFees: 2_000_000,
  totalGpCarryDistributed: 500_000,
  totalGpFeeIncome: 2_000_000,
  finalDpi: 0.6,
  finalTvpi: 1.8,
  finalClawbackDue: 0,
};

function metrics(
  overrides: Partial<ScenarioComparisonMetricMap> = {}
): ScenarioComparisonMetricMap {
  return { ...BASE_METRICS, ...overrides };
}

function delta(
  over: Partial<ScenarioComparisonMetricDeltaV1> & { metric: ScenarioComparisonMetricKey }
): ScenarioComparisonMetricDeltaV1 {
  return {
    metric: over.metric,
    displayName: over.displayName ?? over.metric,
    baselineValue: over.baselineValue ?? null,
    scenarioValue: over.scenarioValue ?? null,
    absoluteDelta: over.absoluteDelta ?? null,
    percentageDelta: over.percentageDelta ?? null,
    driftCapable: over.driftCapable ?? true,
    driftReason: over.driftReason ?? 'stable',
  };
}

function mkComparison(args: {
  setId: string;
  name: string;
  sourceConfigVersion: number;
  sourceConfigId?: number;
  overrideType?: FundScenarioComparisonV1['variants'][number]['overrideType'];
  variants: Array<{
    variantId: string;
    name: string;
    metrics: ScenarioComparisonMetricMap;
    metricDeltas?: ScenarioComparisonMetricDeltaV1[];
  }>;
}): FundScenarioComparisonV1 {
  return {
    fundId: 123,
    comparisonStatus: 'comparable',
    scenarioSet: {
      scenarioSetId: args.setId,
      name: args.name,
      sourceConfigId: args.sourceConfigId ?? 12,
      sourceConfigVersion: args.sourceConfigVersion,
    },
    baseline: { label: 'Authoritative baseline', metrics: BASE_METRICS },
    variants: args.variants.map((variant) => ({
      variantId: variant.variantId,
      name: variant.name,
      overrideType: args.overrideType ?? 'fee_profile',
      metrics: variant.metrics,
      metricDeltas: variant.metricDeltas ?? [],
    })),
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
  };
}

const SET_A = uuid(1);
const SET_B = uuid(2);

describe('CrossSetScenarioComparisonTable', () => {
  it('renders multiple scenario sets side-by-side in one table', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(101), name: 'Lower fee', metrics: metrics() }],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(102), name: 'Higher carry', metrics: metrics() }],
          }),
        ]}
      />
    );

    expect(screen.getAllByTestId('cross-set-scenario-comparison-table')).toHaveLength(1);
    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(within(table).getByText('Fee sensitivity')).toBeInTheDocument();
    expect(within(table).getByText('Carry sensitivity')).toBeInTheDocument();
  });

  it('renders every fee-profile variant column without omission', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [
              { variantId: uuid(101), name: 'Lower fee', metrics: metrics() },
              { variantId: uuid(102), name: 'Higher fee', metrics: metrics() },
            ],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 4,
            variants: [
              { variantId: uuid(103), name: 'Lower carry', metrics: metrics() },
              { variantId: uuid(104), name: 'Higher carry', metrics: metrics() },
            ],
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    for (const name of ['Lower fee', 'Higher fee', 'Lower carry', 'Higher carry']) {
      expect(within(table).getByText(name)).toBeInTheDocument();
    }
    expect(
      within(table).getByText('Showing 4 comparable variants across 2 scenario sets.')
    ).toBeInTheDocument();
  });

  it('labels each scenario set with its source config version', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(101), name: 'Lower fee', metrics: metrics() }],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 5,
            variants: [{ variantId: uuid(102), name: 'Higher carry', metrics: metrics() }],
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(within(table).getByText('Source config v4')).toBeInTheDocument();
    expect(within(table).getByText('Source config v5')).toBeInTheDocument();
  });

  it('labels each scenario set group with its comparison trust state and calculated time', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(101), name: 'Lower fee', metrics: metrics() }],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(102), name: 'Higher carry', metrics: metrics() }],
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    // one Tier-1 trust-state badge per scenario set group
    expect(within(table).getAllByText('CURRENT')).toHaveLength(2);
    // calculated timestamp echoed per group as muted Tier-3 detail
    expect(within(table).getAllByText(/^CALCULATED /).length).toBeGreaterThanOrEqual(2);
  });

  it('warns when scenario sets use different source configs', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(101), name: 'Lower fee', metrics: metrics() }],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 5,
            variants: [{ variantId: uuid(102), name: 'Higher carry', metrics: metrics() }],
          }),
        ]}
      />
    );

    expect(screen.getByTestId('cross-set-source-config-warning')).toBeInTheDocument();
    expect(screen.getByText(/different source configs/i)).toBeInTheDocument();
  });

  it('does not warn when all scenario sets share a source config', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(101), name: 'Lower fee', metrics: metrics() }],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(102), name: 'Higher carry', metrics: metrics() }],
          }),
        ]}
      />
    );

    expect(screen.queryByTestId('cross-set-source-config-warning')).not.toBeInTheDocument();
  });

  it('keeps each delta scoped to its own set baseline and never computes a cross-set delta', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [
              {
                variantId: uuid(101),
                name: 'Lower fee',
                metrics: metrics({ finalTvpi: 2.1 }),
                metricDeltas: [
                  delta({
                    metric: 'finalTvpi',
                    baselineValue: 1.8,
                    scenarioValue: 2.1,
                    absoluteDelta: 0.3,
                    driftCapable: true,
                  }),
                ],
              },
            ],
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 4,
            variants: [
              {
                variantId: uuid(102),
                name: 'Higher carry',
                metrics: metrics({ finalTvpi: 1.5 }),
                metricDeltas: [
                  delta({
                    metric: 'finalTvpi',
                    baselineValue: 1.2,
                    scenarioValue: 1.5,
                    absoluteDelta: 0.3,
                    driftCapable: true,
                  }),
                ],
              },
            ],
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(within(table).getAllByText('Higher by +0.30x')).toHaveLength(2);
    expect(within(table).getByText('2.10x')).toBeInTheDocument();
    expect(within(table).getByText('1.50x')).toBeInTheDocument();
    // A cross-set delta (2.10x vs 1.50x) would render as "Higher by +0.60x"; it must never
    // appear, because deltas come only from each set's own pinned baseline.
    expect(within(table).queryByText(/Higher by \+0\.60x/)).not.toBeInTheDocument();
  });

  it('renders lower-better metric movement with direction copy, not color alone', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [
              {
                variantId: uuid(101),
                name: 'Lower fee',
                metrics: metrics({ totalManagementFees: 1_500_000 }),
                metricDeltas: [
                  delta({
                    metric: 'totalManagementFees',
                    baselineValue: 2_000_000,
                    scenarioValue: 1_500_000,
                    absoluteDelta: -500_000,
                    driftCapable: true,
                  }),
                ],
              },
            ],
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(within(table).getByText('Lower by -$500K')).toBeInTheDocument();
  });

  it('explains non-drift-capable cells instead of fabricating a delta', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [
              {
                variantId: uuid(101),
                name: 'Lower fee',
                metrics: metrics({ lpNetIrr: 0.19 }),
                metricDeltas: [
                  delta({
                    metric: 'lpNetIrr',
                    baselineValue: 0,
                    scenarioValue: 0.19,
                    absoluteDelta: null,
                    percentageDelta: null,
                    driftCapable: false,
                    driftReason: 'zero_baseline',
                  }),
                ],
              },
            ],
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(
      within(table).getByText('Baseline is zero; percentage delta unavailable')
    ).toBeInTheDocument();
  });

  it('switches to a scrollable layout when variant columns exceed the soft limit', () => {
    const variantsA = Array.from({ length: 5 }, (_, i) => ({
      variantId: uuid(110 + i),
      name: `A variant ${i}`,
      metrics: metrics(),
    }));
    const variantsB = Array.from({ length: 5 }, (_, i) => ({
      variantId: uuid(120 + i),
      name: `B variant ${i}`,
      metrics: metrics(),
    }));

    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: variantsA,
          }),
          mkComparison({
            setId: SET_B,
            name: 'Carry sensitivity',
            sourceConfigVersion: 4,
            variants: variantsB,
          }),
        ]}
      />
    );

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(
      within(table).getByText('Showing 10 comparable variants across 2 scenario sets.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('cross-set-comparison-scroll')).toHaveClass('overflow-x-auto');
  });

  it('renders an honest empty state when there are no comparable variants', () => {
    render(<CrossSetScenarioComparisonTable comparisons={[]} />);

    const table = screen.getByTestId('cross-set-scenario-comparison-table');
    expect(
      within(table).getByText(/No comparable scenario variants/i)
    ).toBeInTheDocument();
  });

  it('shows the arithmetic-direction disclaimer', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Fee sensitivity',
            sourceConfigVersion: 4,
            variants: [{ variantId: uuid(101), name: 'Lower fee', metrics: metrics() }],
          }),
        ]}
      />
    );

    expect(screen.getByText(/do not imply a universal good\/bad judgment/i)).toBeInTheDocument();
  });

  it('keeps metric definitions exhaustive against the contract keys', () => {
    expect(Object.keys(CROSS_SET_METRIC_DEFINITIONS)).toEqual([...SCENARIO_COMPARISON_METRIC_KEYS]);
  });

  it('renders ALLOCATION badge for allocation variants', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Allocation mix',
            sourceConfigVersion: 4,
            overrideType: 'allocation',
            variants: [{ variantId: uuid(101), name: 'Seed heavy', metrics: metrics() }],
          }),
        ]}
      />
    );
    expect(screen.getByText('ALLOCATION')).toBeInTheDocument();
  });

  it('renders METHODOLOGY badge for methodology variants', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Waterfall comparison',
            sourceConfigVersion: 4,
            overrideType: 'methodology',
            variants: [{ variantId: uuid(101), name: 'Hybrid waterfall', metrics: metrics() }],
          }),
        ]}
      />
    );
    expect(screen.getByText('METHODOLOGY')).toBeInTheDocument();
  });

  it('renders SECTOR PROFILE badge for sector_profile variants', () => {
    render(
      <CrossSetScenarioComparisonTable
        comparisons={[
          mkComparison({
            setId: SET_A,
            name: 'Sector mix',
            sourceConfigVersion: 4,
            overrideType: 'sector_profile',
            variants: [{ variantId: uuid(101), name: 'AI infrastructure', metrics: metrics() }],
          }),
        ]}
      />
    );
    expect(screen.getByText('SECTOR PROFILE')).toBeInTheDocument();
  });
});
