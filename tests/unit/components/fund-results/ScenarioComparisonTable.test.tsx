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
    expect(within(table).getAllByText('Net LP IRR').length).toBe(2);
    expect(within(table).getAllByText('Net GP IRR').length).toBe(2);
    expect(within(table).getAllByText('Management Fees').length).toBe(2);
    expect(within(table).getAllByText('GP Carry').length).toBe(2);
    expect(within(table).getAllByText('GP Fee Income').length).toBe(2);
    expect(within(table).getAllByText('DPI').length).toBe(2);
    expect(within(table).getAllByText('TVPI').length).toBe(2);
    expect(within(table).getAllByText('Clawback Due').length).toBe(2);
    expect(within(table).getByText('15.0%')).toBeInTheDocument();
    expect(within(table).getAllByText('$2.0M').length).toBeGreaterThanOrEqual(1);
    expect(within(table).getByText('2.10x')).toBeInTheDocument();
    expect(within(table).getByText('+0.30x')).toBeInTheDocument();
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
