import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Radix Select uses Pointer Events APIs that jsdom does not implement.
// Stub the missing methods on Element so the listbox can open under userEvent.
beforeAll(() => {
  if (typeof Element !== 'undefined') {
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => undefined;
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => undefined;
    }
    // jsdom does not implement scrollIntoView; Radix calls it on focused options.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => undefined;
    }
  }
});

import { OneWayPanel } from '@/components/sensitivity/OneWayPanel';
import { SUPPORTED_VARIABLES, SUPPORTED_METRICS } from '@shared/contracts/sensitivity-variables-v1';
import type {
  OneWayAnalysisResultV1,
  SensitivityRunV1,
} from '@shared/contracts/sensitivity-run-v1.contract';

function makeResult(overrides: Partial<OneWayAnalysisResultV1> = {}): OneWayAnalysisResultV1 {
  return {
    variableId: 'reserve_pool_pct',
    metricId: 'tvpi',
    baselineValue: 2.4,
    datapoints: [
      { variableValue: 0, metricValue: 2.0 },
      { variableValue: 0.25, metricValue: 2.4 },
      { variableValue: 0.5, metricValue: 2.8 },
    ],
    summary: { minMetric: 2.0, maxMetric: 2.8, range: 0.8 },
    computedAt: '2026-04-06T00:00:01.000Z',
    ...overrides,
  };
}

function makeRun(overrides: Partial<SensitivityRunV1> = {}): SensitivityRunV1 {
  return {
    id: 99,
    fundId: 7,
    kind: 'one_way',
    status: 'completed',
    params: {
      variableId: 'reserve_pool_pct',
      range: { min: 0, max: 0.5 },
      steps: 11,
      metricId: 'tvpi',
    },
    results: makeResult(),
    createdBy: 1,
    createdAt: '2026-04-05T12:00:00.000Z',
    completedAt: '2026-04-05T12:00:01.000Z',
    durationMs: 1000,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
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
      <OneWayPanel fundId={fundId} />
    </QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetchRouter(routes: {
  history?: unknown;
  oneWay?: { body: unknown; status?: number };
}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/sensitivity/runs')) {
      return jsonResponse(routes.history ?? { runs: [] });
    }
    if (url.includes('/sensitivity/one-way')) {
      const oneWay = routes.oneWay;
      if (!oneWay) {
        return jsonResponse({ code: 'NOT_CONFIGURED', message: 'no mock' }, 500);
      }
      return jsonResponse(oneWay.body, oneWay.status ?? 200);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('OneWayPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders all supported variable and metric options in the pickers', async () => {
    makeFetchRouter({});
    const user = userEvent.setup();
    renderPanel(7);

    await user.click(screen.getByLabelText('Variable'));
    const variableOptions = await screen.findAllByRole('option');
    expect(variableOptions).toHaveLength(SUPPORTED_VARIABLES.length);
    for (const v of SUPPORTED_VARIABLES) {
      expect(screen.getByRole('option', { name: v.label })).toBeInTheDocument();
    }
    // Close the variable popover before opening the metric popover.
    await user.keyboard('{Escape}');

    await user.click(screen.getByLabelText('Metric'));
    const metricOptions = await screen.findAllByRole('option');
    expect(metricOptions).toHaveLength(SUPPORTED_METRICS.length);
    for (const m of SUPPORTED_METRICS) {
      expect(screen.getByRole('option', { name: m.label })).toBeInTheDocument();
    }
  });

  it('disables the run button when fundId is null', () => {
    makeFetchRouter({});
    renderPanel(null);
    expect(screen.getByTestId('one-way-run-button')).toBeDisabled();
  });

  it('disables the run button when min >= max', async () => {
    makeFetchRouter({});
    const user = userEvent.setup();
    renderPanel(7);

    const minInput = screen.getByLabelText('Min');
    const maxInput = screen.getByLabelText('Max');
    await user.clear(minInput);
    await user.type(minInput, '0.6');
    await user.clear(maxInput);
    await user.type(maxInput, '0.4');

    expect(screen.getByTestId('one-way-run-button')).toBeDisabled();
    expect(screen.getByTestId('one-way-validation-errors')).toHaveTextContent(
      /min must be strictly less than max/i
    );
  });

  it('disables the run button when steps are out of range', async () => {
    makeFetchRouter({});
    const user = userEvent.setup();
    renderPanel(7);

    const stepsInput = screen.getByLabelText('Steps');
    await user.clear(stepsInput);
    await user.type(stepsInput, '1');
    expect(screen.getByTestId('one-way-run-button')).toBeDisabled();

    await user.clear(stepsInput);
    await user.type(stepsInput, '51');
    expect(screen.getByTestId('one-way-run-button')).toBeDisabled();
  });

  it('shows summary cards and chart on a successful run', async () => {
    makeFetchRouter({
      oneWay: { body: { run: makeRun(), result: makeResult() } },
    });
    const user = userEvent.setup();
    renderPanel(7);

    await user.click(screen.getByTestId('one-way-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('one-way-results')).toBeInTheDocument();
    });

    const results = screen.getByTestId('one-way-results');
    expect(within(results).getByText('Reserve Pool %')).toBeInTheDocument();
    expect(within(results).getByText('TVPI')).toBeInTheDocument();
    expect(within(results).getByText('Variable')).toBeInTheDocument();
    expect(within(results).getByText('Metric')).toBeInTheDocument();
    expect(within(results).getByText('Baseline')).toBeInTheDocument();
    expect(within(results).getByText('Range')).toBeInTheDocument();
    expect(within(results).getByTestId('one-way-chart')).toBeInTheDocument();
  });

  it('renders the error code and message when the run fails with NO_PUBLISHED_CONFIG', async () => {
    makeFetchRouter({
      oneWay: {
        body: { code: 'NO_PUBLISHED_CONFIG', message: 'Publish a fund config first' },
        status: 409,
      },
    });
    const user = userEvent.setup();
    renderPanel(7);

    await user.click(screen.getByTestId('one-way-run-button'));

    await waitFor(() => {
      expect(screen.getByTestId('one-way-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('one-way-error-code')).toHaveTextContent('NO_PUBLISHED_CONFIG');
    expect(screen.getByTestId('one-way-error-message')).toHaveTextContent(
      'Publish a fund config first'
    );
    expect(screen.getByTestId('one-way-retry-button')).toBeInTheDocument();
  });

  it('loads a history entry into the main panel when clicked', async () => {
    makeFetchRouter({
      history: { runs: [makeRun({ id: 123, results: makeResult({ baselineValue: 3.1 }) })] },
    });
    const user = userEvent.setup();
    renderPanel(7);

    const historyButton = await screen.findByTestId('one-way-history-item-123');
    await user.click(historyButton);

    await waitFor(() => {
      expect(screen.getByTestId('one-way-results')).toBeInTheDocument();
    });
    expect(screen.getByTestId('one-way-chart')).toBeInTheDocument();
  });

  it('shows the empty state when history is empty', async () => {
    makeFetchRouter({ history: { runs: [] } });
    renderPanel(7);

    await waitFor(() => {
      expect(screen.getByTestId('one-way-history-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('one-way-history-empty')).toHaveTextContent(
      /no previous one-way analyses/i
    );
  });
});
