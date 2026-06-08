import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ScenarioComparisonTable,
  SCENARIO_COMPARISON_METRIC_KEYS,
} from '../../../../client/src/components/fund-results/ScenarioComparisonTable';
import type { FundScenarioComparisonV1 } from '../../../../shared/contracts/fund-scenario-comparison-v1.contract';

describe('ScenarioComparisonTable', () => {
  it('renders the ADR-022 scenario comparison metric contract', () => {
    render(<ScenarioComparisonTable comparison={comparableComparison()} />);

    const table = screen.getByTestId('scenario-comparison-table');
    expect(within(table).getByText('Authoritative baseline')).toBeInTheDocument();
    expect(within(table).getByText('Lower fee')).toBeInTheDocument();
    expect(within(table).getAllByText('Net LP IRR').length).toBe(1);
    expect(within(table).getAllByText('Net GP IRR').length).toBe(1);
    expect(within(table).getAllByText('Management Fees').length).toBe(1);
    expect(within(table).getAllByText('GP Carry').length).toBe(1);
    expect(within(table).getAllByText('GP Fee Income').length).toBe(1);
    expect(within(table).getAllByText('DPI').length).toBe(1);
    expect(within(table).getAllByText('TVPI').length).toBe(1);
    expect(within(table).getAllByText('Clawback Due').length).toBe(1);
    expect(within(table).getByText('15.0%')).toBeInTheDocument();
    expect(within(table).getByText('17.0%')).toBeInTheDocument();
    expect(within(table).getAllByText('$2.0M').length).toBeGreaterThanOrEqual(1);
    expect(within(table).getByText('2.10x')).toBeInTheDocument();
    expect(within(table).getByText(/Higher by \+0\.30x/)).toBeInTheDocument();
    expect(within(table).getByText(/16\.7%/)).toBeInTheDocument();
    expect(within(table).getAllByText('N/A').length).toBeGreaterThanOrEqual(1);
    expect(table).not.toHaveTextContent('MOIC');
    expect(table).not.toHaveTextContent('Reserve Util.');
    expect(table).not.toHaveTextContent('Risk Level');
  });

  it('keeps the frontend metric list fixed to the backend comparison contract', () => {
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

  it('renders backend status fallbacks without fabricating comparison rows', () => {
    render(<ScenarioComparisonTable comparison={baselineUnavailableComparison()} />);

    const table = screen.getByTestId('scenario-comparison-table');
    expect(
      within(table).getByText(/Authoritative economics baseline is unavailable/i)
    ).toBeInTheDocument();
    expect(table).not.toHaveTextContent('Lower fee');
    expect(table).not.toHaveTextContent('Net LP IRR');
  });

  it('renders typed baseline economics unavailable copy', () => {
    render(
      <ScenarioComparisonTable
        comparison={{
          ...baselineUnavailableComparison(),
          unavailableReason: 'BASELINE_ECONOMICS_SNAPSHOT_MISSING',
        }}
      />
    );

    expect(
      screen.getByText(
        'Scenario calculated; comparison unavailable because baseline economics is missing.'
      )
    ).toBeInTheDocument();
  });

  it('renders unsupported override fallbacks without pretending reserve scenarios are comparable', () => {
    render(<ScenarioComparisonTable comparison={unsupportedReserveComparison()} />);

    const table = screen.getByTestId('scenario-comparison-table');
    expect(
      within(table).getByText(/not supported for reserve-allocation scenario sets/i)
    ).toBeInTheDocument();
    expect(table).not.toHaveTextContent('FEE PROFILE');
  });

  it('renders one column per variant with per-variant values and drift fallbacks', () => {
    render(<ScenarioComparisonTable comparison={twoVariantComparison()} />);

    const table = screen.getByTestId('scenario-comparison-table');

    // both variant columns render alongside the baseline column
    expect(within(table).getByText('Authoritative baseline')).toBeInTheDocument();
    expect(within(table).getByText('Lower fee')).toBeInTheDocument();
    expect(within(table).getByText('Higher fee')).toBeInTheDocument();

    // metric label is a single row header regardless of variant count (matrix, not cards)
    expect(within(table).getAllByText('Net LP IRR').length).toBe(1);

    // each column shows its own distinct value
    expect(within(table).getByText('15.0%')).toBeInTheDocument(); // baseline
    expect(within(table).getByText('17.0%')).toBeInTheDocument(); // variant 1
    expect(within(table).getByText('19.0%')).toBeInTheDocument(); // variant 2

    // variant 1's drift-capable delta renders in-cell with direction-aware copy
    expect(within(table).getByText(/Higher by \+0\.30x/)).toBeInTheDocument();

    // variant 2's non-drift-capable delta renders the shared terse drift copy
    expect(
      within(table).getByText('Baseline is zero; percentage delta unavailable')
    ).toBeInTheDocument();
  });

  it('renders a favorable lower-better decrease with direction copy, not red color', () => {
    render(<ScenarioComparisonTable comparison={lowerBetterDecreaseComparison()} />);

    const table = screen.getByTestId('scenario-comparison-table');

    // A management-fee DECREASE is favorable. It must read as a direction-aware
    // "Lower by" movement and must never be painted red by sign-based color
    // (the original honesty bug this guards against).
    const delta = within(table).getByText(/Lower by -\$500K/);
    expect(delta).toBeInTheDocument();
    expect(delta).not.toHaveClass('text-red-700');
    expect(within(table).getByText(/25\.0%/)).toBeInTheDocument();
  });

  it('renders a comparison evidence band with trust state and baseline identity', () => {
    render(<ScenarioComparisonTable comparison={comparableComparison()} />);

    const band = screen.getByTestId('scenario-comparison-evidence');
    expect(within(band).getByText('CURRENT')).toBeInTheDocument();
    expect(within(band).getByText('BASELINE authoritative economics v4')).toBeInTheDocument();
  });

  it('renders METHODOLOGY badge for methodology variants', () => {
    const comparison: FundScenarioComparisonV1 = {
      ...comparableComparison(),
      variants: [
        {
          ...comparableComparison().variants[0]!,
          overrideType: 'methodology',
          name: 'Hybrid waterfall',
        },
      ],
    };
    render(<ScenarioComparisonTable comparison={comparison} />);
    expect(screen.getByText('METHODOLOGY')).toBeInTheDocument();
  });

  it('renders ALLOCATION badge for allocation variants', () => {
    const comparison: FundScenarioComparisonV1 = {
      ...comparableComparison(),
      variants: [
        {
          ...comparableComparison().variants[0]!,
          overrideType: 'allocation',
          name: 'Seed heavy',
        },
      ],
    };
    render(<ScenarioComparisonTable comparison={comparison} />);
    expect(screen.getByText('ALLOCATION')).toBeInTheDocument();
  });

  it('renders SECTOR PROFILE badge for sector_profile variants', () => {
    const comparison: FundScenarioComparisonV1 = {
      ...comparableComparison(),
      variants: [
        {
          ...comparableComparison().variants[0]!,
          overrideType: 'sector_profile',
          name: 'AI infrastructure',
        },
      ],
    };
    render(<ScenarioComparisonTable comparison={comparison} />);
    expect(screen.getByText('SECTOR PROFILE')).toBeInTheDocument();
  });

  it('reads UNAVAILABLE and claims no baseline when the comparison is not comparable', () => {
    render(<ScenarioComparisonTable comparison={baselineUnavailableComparison()} />);

    const band = screen.getByTestId('scenario-comparison-evidence');
    expect(within(band).getByText('UNAVAILABLE')).toBeInTheDocument();
    expect(within(band).queryByText(/^BASELINE /)).toBeNull();
  });
});

function comparableComparison(): FundScenarioComparisonV1 {
  return {
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
      metrics: {
        lpNetIrr: 0.15,
        gpNetIrr: null,
        totalManagementFees: 2_000_000,
        totalGpCarryDistributed: 500_000,
        totalGpFeeIncome: 2_000_000,
        finalDpi: 0.6,
        finalTvpi: 1.8,
        finalClawbackDue: 0,
      },
    },
    variants: [
      {
        variantId: '00000000-0000-0000-0000-000000000112',
        name: 'Lower fee',
        overrideType: 'fee_profile',
        metrics: {
          lpNetIrr: 0.17,
          gpNetIrr: null,
          totalManagementFees: 1_500_000,
          totalGpCarryDistributed: 500_000,
          totalGpFeeIncome: 1_500_000,
          finalDpi: 0.7,
          finalTvpi: 2.1,
          finalClawbackDue: 0,
        },
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
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
  };
}

function baselineUnavailableComparison(): FundScenarioComparisonV1 {
  return {
    fundId: 123,
    comparisonStatus: 'baseline_unavailable',
    scenarioSet: {
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
    },
    baseline: null,
    variants: [],
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
  };
}

function unsupportedReserveComparison(): FundScenarioComparisonV1 {
  return {
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
  };
}

function twoVariantComparison(): FundScenarioComparisonV1 {
  return {
    fundId: 123,
    comparisonStatus: 'comparable',
    scenarioSet: {
      scenarioSetId: '00000000-0000-0000-0000-000000000211',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
    },
    baseline: {
      label: 'Authoritative baseline',
      metrics: {
        lpNetIrr: 0.15,
        gpNetIrr: 0.1,
        totalManagementFees: 2_000_000,
        totalGpCarryDistributed: 500_000,
        totalGpFeeIncome: 2_000_000,
        finalDpi: 0.6,
        finalTvpi: 1.8,
        finalClawbackDue: 0,
      },
    },
    variants: [
      {
        variantId: '00000000-0000-0000-0000-000000000212',
        name: 'Lower fee',
        overrideType: 'fee_profile',
        metrics: {
          lpNetIrr: 0.17,
          gpNetIrr: 0.11,
          totalManagementFees: 1_500_000,
          totalGpCarryDistributed: 500_000,
          totalGpFeeIncome: 1_500_000,
          finalDpi: 0.7,
          finalTvpi: 2.1,
          finalClawbackDue: 0,
        },
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
      {
        variantId: '00000000-0000-0000-0000-000000000213',
        name: 'Higher fee',
        overrideType: 'fee_profile',
        metrics: {
          lpNetIrr: 0.19,
          gpNetIrr: 0.12,
          totalManagementFees: 2_500_000,
          totalGpCarryDistributed: 500_000,
          totalGpFeeIncome: 2_500_000,
          finalDpi: 0.5,
          finalTvpi: 1.6,
          finalClawbackDue: 0,
        },
        metricDeltas: [
          {
            metric: 'lpNetIrr',
            displayName: 'Net LP IRR',
            baselineValue: 0,
            scenarioValue: 0.19,
            absoluteDelta: null,
            percentageDelta: null,
            driftCapable: false,
            driftReason: 'zero_baseline',
          },
        ],
      },
    ],
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
  };
}

function lowerBetterDecreaseComparison(): FundScenarioComparisonV1 {
  return {
    fundId: 123,
    comparisonStatus: 'comparable',
    scenarioSet: {
      scenarioSetId: '00000000-0000-0000-0000-000000000311',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
    },
    baseline: {
      label: 'Authoritative baseline',
      metrics: {
        lpNetIrr: 0.15,
        gpNetIrr: 0.1,
        totalManagementFees: 2_000_000,
        totalGpCarryDistributed: 500_000,
        totalGpFeeIncome: 2_000_000,
        finalDpi: 0.6,
        finalTvpi: 1.8,
        finalClawbackDue: 0,
      },
    },
    variants: [
      {
        variantId: '00000000-0000-0000-0000-000000000312',
        name: 'Lower fee',
        overrideType: 'fee_profile',
        metrics: {
          lpNetIrr: 0.17,
          gpNetIrr: 0.11,
          totalManagementFees: 1_500_000,
          totalGpCarryDistributed: 500_000,
          totalGpFeeIncome: 1_500_000,
          finalDpi: 0.7,
          finalTvpi: 2.1,
          finalClawbackDue: 0,
        },
        metricDeltas: [
          {
            metric: 'totalManagementFees',
            displayName: 'Management Fees',
            baselineValue: 2_000_000,
            scenarioValue: 1_500_000,
            absoluteDelta: -500_000,
            percentageDelta: -25,
            driftCapable: true,
            driftReason: 'stable',
          },
        ],
      },
    ],
    staleness: 'CURRENT',
    calculatedAt: '2026-05-26T12:30:00.000Z',
  };
}
