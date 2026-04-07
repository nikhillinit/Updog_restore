import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installRadixSelectShim } from '../../../helpers/radix-select-shim';

beforeAll(installRadixSelectShim);

// Mock the data hooks BEFORE importing the component under test, parallel to
// how TwoWayPanel.test.tsx mocks useTwoWayRun. We use vi.mock so the component
// sees deterministic mutation/history shapes without touching the QueryClient
// cache or fetch.
const mockMutate = vi.fn();
const mockUseStressRun = vi.fn();
const mockUseSensitivityHistory = vi.fn();

vi.mock('@/hooks/useSensitivityRuns', () => ({
  useStressRun: (fundId: number | null) => mockUseStressRun(fundId),
  useSensitivityHistory: (fundId: number | null, kind?: string, limit?: number) =>
    mockUseSensitivityHistory(fundId, kind, limit),
}));

import { StressPanel } from '@/components/sensitivity/StressPanel';
import { SUPPORTED_STRESS_SCENARIOS } from '@shared/contracts/sensitivity-variables-v1';
import type { StressAnalysisResultV1 } from '@shared/contracts/sensitivity-run-v1.contract';

function makeFixtureResult(): StressAnalysisResultV1 {
  return {
    scenarioIds: ['mild_downside', 'best_case', 'worst_case'],
    metricId: 'tvpi',
    baselineValue: 2.0,
    datapoints: [
      {
        scenarioId: 'mild_downside',
        scenarioLabel: 'Mild Downside',
        metricValue: 1.7,
        baselineDelta: -0.3,
      },
      {
        scenarioId: 'worst_case',
        scenarioLabel: 'Worst Case',
        metricValue: 1.5,
        baselineDelta: -0.5,
      },
      {
        scenarioId: 'best_case',
        scenarioLabel: 'Best Case',
        metricValue: 2.8,
        baselineDelta: 0.8,
      },
    ],
    summary: {
      worstCase: 1.5,
      bestCase: 2.8,
      range: 1.3,
      worstScenarioId: 'worst_case',
      bestScenarioId: 'best_case',
    },
    computedAt: '2026-04-07T00:00:01.000Z',
  };
}

interface MutationStateOverrides {
  isPending?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  data?: { result: StressAnalysisResultV1 } | null;
  error?: { code?: string; message: string; status?: number } | null;
}

function installMutationState(overrides: MutationStateOverrides = {}) {
  mockUseStressRun.mockReturnValue({
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
      <StressPanel fundId={fundId} />
    </QueryClientProvider>
  );
}

describe('StressPanel', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockUseStressRun.mockReset();
    mockUseSensitivityHistory.mockReset();
    installMutationState();
    installHistoryState();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the scenario picker with all 6 scenarios checked by default in the idle state', () => {
    renderPanel(7);

    expect(screen.getByTestId('stress-panel')).toBeInTheDocument();
    const picker = screen.getByTestId('stress-scenario-picker');
    const checkboxes = within(picker).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(SUPPORTED_STRESS_SCENARIOS.length);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeChecked();
    }
    expect(screen.getByLabelText('Metric')).toBeInTheDocument();
    expect(screen.getByTestId('stress-run-button')).not.toBeDisabled();
    expect(screen.getByTestId('stress-idle')).toBeInTheDocument();
  });

  it('disables the run button when fundId is null', () => {
    renderPanel(null);
    expect(screen.getByTestId('stress-run-button')).toBeDisabled();
  });

  it('disables the run button when zero scenarios are selected', async () => {
    const user = userEvent.setup();
    renderPanel(7);

    // Uncheck all 6 scenarios.
    for (const scenario of SUPPORTED_STRESS_SCENARIOS) {
      const checkbox = screen.getByTestId(`stress-scenario-checkbox-${scenario.id}`);
      await user.click(checkbox);
    }

    expect(screen.getByTestId('stress-run-button')).toBeDisabled();
    expect(screen.getByTestId('stress-validation-errors')).toBeInTheDocument();
  });

  it('calls useStressRun.mutate with the selected scenarioIds and metric when run is clicked', async () => {
    const user = userEvent.setup();
    renderPanel(7);

    await user.click(screen.getByTestId('stress-run-button'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0]![0];
    expect(payload.metricId).toBe('tvpi');
    expect(payload.scenarioIds).toHaveLength(SUPPORTED_STRESS_SCENARIOS.length);
    // All 6 canonical ids should be present.
    for (const scenario of SUPPORTED_STRESS_SCENARIOS) {
      expect(payload.scenarioIds).toContain(scenario.id);
    }
  });

  it('shows the elapsed-seconds clock while the mutation is pending', () => {
    installMutationState({ isPending: true });
    renderPanel(7);

    expect(screen.getByText(/Running stress test/i)).toBeInTheDocument();
    expect(screen.getByText(/^\d+s$/)).toBeInTheDocument();
  });

  it('renders the error code, message, and retry button when the mutation fails', () => {
    installMutationState({
      isError: true,
      error: {
        code: 'NO_PUBLISHED_CONFIG',
        message: 'Publish a fund config first',
        status: 409,
      },
    });
    renderPanel(7);

    expect(screen.getByTestId('stress-error')).toBeInTheDocument();
    expect(screen.getByTestId('stress-error-code')).toHaveTextContent('NO_PUBLISHED_CONFIG');
    expect(screen.getByTestId('stress-error-message')).toHaveTextContent(
      'Publish a fund config first'
    );
    expect(screen.getByTestId('stress-retry-button')).toBeInTheDocument();
  });

  it('renders one row per datapoint when results are available', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    const results = screen.getByTestId('stress-results');
    expect(results).toBeInTheDocument();

    // 3 datapoints = 3 rows.
    expect(within(results).getByTestId('stress-row-mild_downside')).toBeInTheDocument();
    expect(within(results).getByTestId('stress-row-worst_case')).toBeInTheDocument();
    expect(within(results).getByTestId('stress-row-best_case')).toBeInTheDocument();
  });

  it('renders rows in SUPPORTED_STRESS_SCENARIOS canonical order regardless of datapoint order', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    // Canonical order is mild_downside (idx 0), worst_case (idx 4), best_case (idx 5).
    // Even though the fixture datapoints are in [mild_downside, worst_case, best_case]
    // request order, the rendered order should match canonical.
    const results = screen.getByTestId('stress-results');
    const rows = within(results).getAllByTestId(/^stress-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'stress-row-mild_downside',
      'stress-row-worst_case',
      'stress-row-best_case',
    ]);
  });

  it('renders Baseline, Worst, Best, and Range summary cards in the results state', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    const results = screen.getByTestId('stress-results');
    expect(within(results).getByText('Baseline')).toBeInTheDocument();
    expect(within(results).getByText('Worst')).toBeInTheDocument();
    expect(within(results).getByText('Best')).toBeInTheDocument();
    expect(within(results).getByText('Range')).toBeInTheDocument();
  });

  it('applies a red delta bar background to negative-delta rows and emerald to positive', () => {
    installMutationState({
      isSuccess: true,
      data: { result: makeFixtureResult() },
    });
    renderPanel(7);

    const negBar = screen.getByTestId('stress-delta-bar-mild_downside') as HTMLElement;
    const posBar = screen.getByTestId('stress-delta-bar-best_case') as HTMLElement;
    // Red = rgb(239, 68, 68) for negative baselineDelta.
    expect(negBar.style.backgroundColor).toBe('rgb(239, 68, 68)');
    // Emerald = rgb(16, 185, 129) for positive baselineDelta.
    expect(posBar.style.backgroundColor).toBe('rgb(16, 185, 129)');
  });
});
