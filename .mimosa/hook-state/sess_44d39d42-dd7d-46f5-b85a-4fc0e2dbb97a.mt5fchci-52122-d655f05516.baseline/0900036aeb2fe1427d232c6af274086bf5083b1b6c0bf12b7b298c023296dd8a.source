import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installRadixSelectShim } from '../../../helpers/radix-select-shim';

beforeAll(installRadixSelectShim);

// Mock the data hooks BEFORE importing the component under test, parallel to
// how OneWayPanel.test.tsx mocks useOneWayRun via the network layer. We use
// vi.mock so the component sees deterministic mutation/history shapes without
// touching the QueryClient cache or fetch.
const mockMutate = vi.fn();
const mockUseTwoWayRun = vi.fn();
const mockUseSensitivityHistory = vi.fn();

vi.mock('@/hooks/useSensitivityRuns', () => ({
  useTwoWayRun: (fundId: number | null) => mockUseTwoWayRun(fundId),
  useSensitivityHistory: (fundId: number | null, kind?: string, limit?: number) =>
    mockUseSensitivityHistory(fundId, kind, limit),
}));

import { TwoWayPanel } from '@/components/sensitivity/TwoWayPanel';
import { SUPPORTED_VARIABLES } from '@shared/contracts/sensitivity-variables-v1';
import type { TwoWayAnalysisResultV1 } from '@shared/contracts/sensitivity-run-v1.contract';

function makeFixtureResult(): TwoWayAnalysisResultV1 {
  return {
    variableXId: 'reserve_pool_pct',
    variableYId: 'management_fee_rate',
    metricId: 'tvpi',
    baselineValue: 2.0,
    datapoints: [
      { variableXValue: 0.0, variableYValue: 0.0, metricValue: 1.5 },
      { variableXValue: 0.0, variableYValue: 0.025, metricValue: 1.7 },
      { variableXValue: 0.0, variableYValue: 0.05, metricValue: 1.9 },
      { variableXValue: 0.25, variableYValue: 0.0, metricValue: 2.1 },
      { variableXValue: 0.25, variableYValue: 0.025, metricValue: 2.3 },
      { variableXValue: 0.25, variableYValue: 0.05, metricValue: 2.5 },
      { variableXValue: 0.5, variableYValue: 0.0, metricValue: 2.7 },
      { variableXValue: 0.5, variableYValue: 0.025, metricValue: 2.9 },
      { variableXValue: 0.5, variableYValue: 0.05, metricValue: 3.1 },
    ],
    summary: { minMetric: 1.5, maxMetric: 3.1, range: 1.6 },
    computedAt: '2026-04-06T00:00:00.000Z',
  };
}

interface MutationStateOverrides {
  isPending?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  data?: { result: TwoWayAnalysisResultV1 } | null;
  error?: { code?: string; message: string; status?: number } | null;
}

function installMutationState(overrides: MutationStateOverrides = {}) {
  mockUseTwoWayRun.mockReturnValue({
    mutate: mockMutate,
    isPending: overrides.isPending ?? false,
    isError: overrides.isError ?? false,
    isSuccess: overrides.isSuccess ?? false,
    data: overrides.data ?? null,
    error: overrides.error ?? null,
    reset: vi.fn(),
  });
}

function installHistoryState(runs: unknown[] = []) {
  mockUseSensitivityHistory.mockReturnValue({
    data: { runs },
    isLoading: false,
    isError: false,
    error: null,
  });
}

function renderPanel(fundId: number | null = 7) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TwoWayPanel fundId={fundId} />
    </QueryClientProvider>
  );
}

describe('TwoWayPanel', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockUseTwoWayRun.mockReset();
    mockUseSensitivityHistory.mockReset();
    installMutationState();
    installHistoryState();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the configuration form with default selections in the idle state', () => {
    renderPanel(7);

    expect(screen.getByTestId('two-way-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Variable X')).toBeInTheDocument();
    expect(screen.getByLabelText('Variable Y')).toBeInTheDocument();
    expect(screen.getByLabelText('Metric')).toBeInTheDocument();
    expect(screen.getByTestId('two-way-run-button')).not.toBeDisabled();
    expect(screen.getByTestId('two-way-idle')).toBeInTheDocument();
  });

  it('disables the run button when fundId is null', () => {
    renderPanel(null);
    expect(screen.getByTestId('two-way-run-button')).toBeDisabled();
  });

  it('omits the currently-selected X variable from the Y selector options', async () => {
    const user = userEvent.setup();
    renderPanel(7);

    // Default X is reserve_pool_pct. Open Y selector and verify the X option is absent.
    await user.click(screen.getByLabelText('Variable Y'));
    const options = await screen.findAllByRole('option');

    const labels = options.map((o) => o.textContent ?? '');
    expect(labels).not.toContain('Reserve Pool %');
    expect(labels.length).toBe(SUPPORTED_VARIABLES.length - 1);
  });

  it('calls useTwoWayRun.mutate with the parsed form values when the run button is clicked', async () => {
    const user = userEvent.setup();
    renderPanel(7);

    await user.click(screen.getByTestId('two-way-run-button'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0]![0];
    expect(payload).toMatchObject({
      variableXId: 'reserve_pool_pct',
      variableYId: 'management_fee_rate',
      metricId: 'tvpi',
      stepsX: 7,
      stepsY: 7,
    });
    expect(payload.rangeX).toEqual({ min: 0, max: 0.5 });
    expect(payload.rangeY).toEqual({ min: 0, max: 0.05 });
  });

  it('shows the elapsed-seconds clock while the mutation is pending', () => {
    installMutationState({ isPending: true });
    renderPanel(7);

    // The "Running sweep..." card and an "Ns" elapsed counter render together.
    expect(screen.getByText(/Running sweep/i)).toBeInTheDocument();
    expect(screen.getByText(/^\d+s$/)).toBeInTheDocument();
  });

  it('maps NO_PUBLISHED_CONFIG to a prerequisite CTA without raw error codes', () => {
    installMutationState({
      isError: true,
      error: {
        code: 'NO_PUBLISHED_CONFIG',
        message: 'Publish a fund config first',
        status: 409,
      },
    });
    renderPanel(7);

    const error = screen.getByTestId('two-way-error');
    expect(error).not.toHaveTextContent('NO_PUBLISHED_CONFIG');
    expect(error).not.toHaveTextContent('Publish a fund config first');
    expect(error).not.toHaveTextContent('Retry');
    expect(
      screen.getByText('Publish the active fund configuration before running sensitivity analysis.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /publish fund configuration/i })).toHaveAttribute(
      'href',
      '/fund-setup?step=7'
    );
  });

  it('renders a 3x3 results grid with formatted cells when results are available', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    const results = screen.getByTestId('two-way-results');
    expect(results).toBeInTheDocument();

    const grid = within(results).getByTestId('two-way-grid');
    // 3 X columns + 1 corner header => 4 thead cells; 3 Y rows; 9 data cells
    const headerCells = within(grid).getAllByRole('columnheader');
    expect(headerCells).toHaveLength(4);
    const dataCells = within(grid).getAllByTestId(/^two-way-cell-/);
    expect(dataCells).toHaveLength(9);

    // Specific cell content: at (x=0.25, y=0.025) the metric value is 2.30
    const targetCell = within(grid).getByTestId('two-way-cell-0.25-0.025');
    expect(targetCell).toHaveTextContent('2.30');
  });

  it('applies a non-empty inline backgroundColor to at least one results cell', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    const cells = screen.getAllByTestId(/^two-way-cell-/);
    const withBackground = cells.filter((c) => (c as HTMLElement).style.backgroundColor !== '');
    expect(withBackground.length).toBeGreaterThan(0);
  });

  it('renders Baseline, Min, Max, and Range summary cards in the results state', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    const results = screen.getByTestId('two-way-results');
    expect(within(results).getByText('Baseline')).toBeInTheDocument();
    expect(within(results).getByText('Min')).toBeInTheDocument();
    expect(within(results).getByText('Max')).toBeInTheDocument();
    expect(within(results).getByText('Range')).toBeInTheDocument();
  });
});
