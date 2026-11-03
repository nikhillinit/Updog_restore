import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvestmentComparisonPanel } from '@/components/forecasting/investment-comparison';
import type { InvestmentComparison } from '@shared/contracts/dual-forecast/investment-comparison.contract';

const fetchCapitalScenarioList = vi.fn();
const fetchCapitalScenarioResults = vi.fn();

vi.mock('@/lib/fund-scenario-workspace-api', () => ({
  fetchCapitalScenarioList: (...args: unknown[]) => fetchCapitalScenarioList(...args),
  fetchCapitalScenarioResults: (...args: unknown[]) => fetchCapitalScenarioResults(...args),
}));

const comparison: InvestmentComparison = {
  status: 'available',
  asOfDate: '2026-11-03',
  basis: {
    snapshotId: 31,
    snapshotInputHash: 'a'.repeat(64),
    snapshotAsOfDate: '2026-11-03',
    knowledgeCutoff: '2026-11-03T12:00:00.000Z',
  },
  actual: {
    deployedCapital: '3075360',
    initialCapital: '2837330',
    followOnCapital: '238030',
    transactionCount: 9,
    companyCount: 8,
  },
  periods: [
    {
      period: '2024-Q3',
      deployedCapital: '977330',
      initialCapital: '977330',
      followOnCapital: '0',
      transactionCount: 3,
      companyCount: 3,
      newCompanies: 3,
      cumulativeCapital: '977330',
      cumulativeCompanies: 3,
    },
    {
      period: '2025-Q2',
      deployedCapital: '738030',
      initialCapital: '500000',
      followOnCapital: '238030',
      transactionCount: 2,
      companyCount: 1,
      newCompanies: 1,
      cumulativeCapital: '2315360',
      cumulativeCompanies: 6,
    },
  ],
  baseline: {
    snapshotId: 88,
    scenarioName: 'Original construction plan',
    configVersion: 1,
    inputHash: 'b'.repeat(64),
    startMonth: '2024-03',
    committedCapital: '20000000',
    totals: {
      deployedCapital: '2500000',
      initialCapital: '1500000',
      followOnCapital: '1000000',
      companyCount: '7.5',
    },
    periods: [
      {
        period: '2024-Q3',
        initialCapital: '500000',
        followOnCapital: '0',
        deployedCapital: '500000',
        newCompanies: '2.5',
        cumulativeCapital: '500000',
        cumulativeCompanies: '2.5',
      },
      {
        period: '2025-Q1',
        initialCapital: '500000',
        followOnCapital: '250000',
        deployedCapital: '750000',
        newCompanies: '2.5',
        cumulativeCapital: '1250000',
        cumulativeCompanies: '5',
      },
    ],
  },
  reason: null,
  baselineReason: null,
  disclosures: ['Missing periods are not certified zero activity.'],
};

function renderPanel(props: Partial<React.ComponentProps<typeof InvestmentComparisonPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onRequestChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <InvestmentComparisonPanel
        fundId={42}
        comparison={comparison}
        request={{}}
        onRequestChange={onRequestChange}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onRequestChange };
}

describe('InvestmentComparisonPanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders published deployment, follow-ons, distinct companies, and missing-period language', async () => {
    fetchCapitalScenarioList.mockResolvedValue({ scenarioSets: [] });
    renderPanel();

    expect(await screen.findByText('$3,075,360')).toBeInTheDocument();
    expect(screen.getByText('$2,837,330')).toBeInTheDocument();
    expect(screen.getAllByText('$238,030').length).toBeGreaterThan(0);
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getAllByText('No published records').length).toBeGreaterThan(0);
    expect(screen.getByText(/do not certify zero activity/i)).toBeInTheDocument();
    expect(screen.getByText('7.5')).toBeInTheDocument();
  });

  it('resolves the selected saved calculation and applies its exact snapshot identity', async () => {
    const user = userEvent.setup();
    fetchCapitalScenarioList.mockResolvedValue({
      scenarioSets: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Original construction plan',
          representation: 'capital-plan-v2',
        },
      ],
    });
    fetchCapitalScenarioResults.mockResolvedValue({ savedResult: { snapshotId: 88 } });
    const { onRequestChange } = renderPanel({ comparison: { ...comparison, baseline: null } });

    await screen.findByRole('option', { name: 'Original construction plan' });
    await user.selectOptions(
      screen.getByLabelText('Saved investment plan'),
      '11111111-1111-4111-8111-111111111111'
    );
    fireEvent.change(screen.getByLabelText('Baseline starts'), { target: { value: '2024-03' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply comparison' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply comparison' }));

    await waitFor(() =>
      expect(onRequestChange).toHaveBeenCalledWith({
        asOfDate: '2026-11-03',
        baselineSnapshotId: 88,
        baselineStartMonth: '2024-03',
      })
    );
  });

  it('shows an unavailable state without inventing zero actuals', async () => {
    fetchCapitalScenarioList.mockResolvedValue({ scenarioSets: [] });
    renderPanel({
      comparison: {
        ...comparison,
        status: 'unavailable',
        actual: null,
        periods: [],
        baseline: null,
        reason: 'Published facts snapshot not found.',
      },
    });

    expect(await screen.findByText('Published investment actuals unavailable')).toBeInTheDocument();
    expect(screen.getByText('Published facts snapshot not found.')).toBeInTheDocument();
    expect(screen.queryByText('$0')).toBeNull();
  });

  it('keeps active baseline provenance tied to server response while selector draft changes', async () => {
    const user = userEvent.setup();
    fetchCapitalScenarioList.mockResolvedValue({
      scenarioSets: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Alternative plan',
          representation: 'capital-plan-v2',
        },
      ],
    });
    renderPanel();

    await screen.findByRole('option', { name: 'Alternative plan' });
    await user.selectOptions(
      screen.getByLabelText('Saved investment plan'),
      '22222222-2222-4222-8222-222222222222'
    );

    expect(screen.getByText('Original construction plan')).toBeInTheDocument();
    expect(
      screen.getByText(/saved snapshot 88 · config version 1 · starts 2024-03/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Frozen committed capital: $20,000,000')).toBeInTheDocument();
    expect(screen.getByText('Cumulative $500,000 · 2.5 expected companies')).toBeInTheDocument();
  });

  it('preserves the exact applied baseline when only the cutoff changes after remount', async () => {
    const user = userEvent.setup();
    fetchCapitalScenarioList.mockResolvedValue({ scenarioSets: [] });
    const { onRequestChange } = renderPanel({
      request: {
        asOfDate: '2026-11-03',
        baselineSnapshotId: 88,
        baselineStartMonth: '2024-03',
      },
    });

    fireEvent.change(screen.getByLabelText('Actuals through'), {
      target: { value: '2025-03-31' },
    });
    await user.click(screen.getByRole('button', { name: 'Apply comparison' }));

    expect(fetchCapitalScenarioResults).not.toHaveBeenCalled();
    expect(onRequestChange).toHaveBeenCalledWith({
      asOfDate: '2025-03-31',
      baselineSnapshotId: 88,
      baselineStartMonth: '2024-03',
    });
  });

  it('ignores a saved-result response after the baseline selection changes', async () => {
    const user = userEvent.setup();
    let resolveResult: ((value: { savedResult: { snapshotId: number } }) => void) | undefined;
    fetchCapitalScenarioList.mockResolvedValue({
      scenarioSets: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Plan A',
          representation: 'capital-plan-v2',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Plan B',
          representation: 'capital-plan-v2',
        },
      ],
    });
    fetchCapitalScenarioResults
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveResult = resolve;
        })
      )
      .mockResolvedValueOnce({ savedResult: { snapshotId: 99 } });
    const { onRequestChange } = renderPanel({ comparison: { ...comparison, baseline: null } });

    await screen.findByRole('option', { name: 'Plan A' });
    await user.selectOptions(
      screen.getByLabelText('Saved investment plan'),
      '11111111-1111-4111-8111-111111111111'
    );
    fireEvent.change(screen.getByLabelText('Baseline starts'), { target: { value: '2024-03' } });
    await user.click(screen.getByRole('button', { name: 'Apply comparison' }));
    await user.selectOptions(
      screen.getByLabelText('Saved investment plan'),
      '22222222-2222-4222-8222-222222222222'
    );
    resolveResult?.({ savedResult: { snapshotId: 88 } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply comparison' })).toBeEnabled()
    );
    expect(onRequestChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply comparison' }));
    await waitFor(() => expect(fetchCapitalScenarioResults).toHaveBeenCalledTimes(2));
    expect(onRequestChange).toHaveBeenCalledWith({
      asOfDate: '2026-11-03',
      baselineSnapshotId: 99,
      baselineStartMonth: '2024-03',
    });
  });

  it('does not restore a pending baseline after Clear baseline', async () => {
    const user = userEvent.setup();
    let resolveResult: ((value: { savedResult: { snapshotId: number } }) => void) | undefined;
    fetchCapitalScenarioList.mockResolvedValue({
      scenarioSets: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Plan A',
          representation: 'capital-plan-v2',
        },
      ],
    });
    fetchCapitalScenarioResults.mockReturnValue(
      new Promise((resolve) => {
        resolveResult = resolve;
      })
    );
    const { onRequestChange } = renderPanel({
      request: {
        asOfDate: '2026-11-03',
        baselineSnapshotId: 77,
        baselineStartMonth: '2024-03',
      },
    });

    await screen.findByRole('option', { name: 'Plan A' });
    await user.selectOptions(
      screen.getByLabelText('Saved investment plan'),
      '11111111-1111-4111-8111-111111111111'
    );
    fireEvent.change(screen.getByLabelText('Baseline starts'), { target: { value: '2024-03' } });
    await user.click(screen.getByRole('button', { name: 'Apply comparison' }));
    await user.click(screen.getByRole('button', { name: 'Clear baseline' }));
    resolveResult?.({ savedResult: { snapshotId: 88 } });

    await waitFor(() => expect(fetchCapitalScenarioResults).toHaveBeenCalledTimes(1));
    expect(onRequestChange).toHaveBeenCalledTimes(1);
    expect(onRequestChange).toHaveBeenCalledWith({ asOfDate: '2026-11-03' });
  });
});
