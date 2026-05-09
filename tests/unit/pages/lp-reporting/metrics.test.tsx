/**
 * LP Reporting -- Metrics page integration test.
 *
 * Asserts:
 *   - Page renders header + form + empty state by default.
 *   - On a successful dry-run the metric cards, XIRR diagnostic panel,
 *     and mark-confidence mix populate.
 *   - Successful dry-run exposes a commit action and successful commit
 *     renders the saved draft envelope.
 *   - The page calls `LpMetricRunResultsSchema.parse` defensively at the
 *     trust boundary (asserted via the source file containing the call).
 *   - On 401 the typed error envelope renders above the form.
 *   - When fundId is null, the "select a fund" notice is shown and submit
 *     is disabled.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const fundContextMock = vi.hoisted(() => ({
  fundId: 7 as number | null,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    fundId: fundContextMock.fundId,
    currentFund: null,
    setCurrentFund: () => {},
    isLoading: false,
    needsSetup: false,
    fundLoadError: false,
    fundLoadErrorMessage: null,
    isDemoMode: false,
  }),
  FundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import LpReportingMetricsPage from '@/pages/lp-reporting/metrics';
import type {
  LpMetricRunResults,
  MetricRunCommitResponse,
  MetricRunDryRunResponse,
} from '@shared/contracts/lp-reporting';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LpReportingMetricsPage />
    </QueryClientProvider>
  );
}

function makeCanonicalResults(): LpMetricRunResults {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.450000',
    rvpi: '1.250000',
    tvpi: '1.700000',
    moic: '1.700000',
    netIrr: '0.150000',
    grossIrr: '0.180000',
    xirrDiagnostic: {
      net: {
        convergence: 'converged',
        iterations: 5,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
      gross: {
        convergence: 'bounded_high',
        iterations: 100,
        method: 'bisection',
        boundHit: 'max',
        failureReason: null,
      },
    },
    contributionsTotal: '50000000',
    distributionsTotal: '22500000',
    currentNav: '62500000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

function makeDryRunResponse(): MetricRunDryRunResponse {
  return {
    results: makeCanonicalResults(),
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [],
      warnings: [],
    },
    inputsHash: 'a'.repeat(64),
    runType: 'internal_review',
    previewHash: 'b'.repeat(64),
  };
}

function makeCommitResponse(): MetricRunCommitResponse {
  return {
    metricRunId: 17,
    status: 'draft',
    inputsHash: 'a'.repeat(64),
    previewHash: 'b'.repeat(64),
    inserted: true,
  };
}

describe('LpReportingMetricsPage', () => {
  beforeEach(() => {
    fundContextMock.fundId = 7;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header, form, and empty-state card by default', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /^metrics$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^as-of date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^run type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^perspective/i)).toBeInTheDocument();
    expect(screen.getByTestId('metrics-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('metrics-results')).toBeNull();
    expect(screen.queryByTestId('metrics-commit-button')).toBeNull();
    expect(screen.queryByTestId('metrics-error-envelope')).toBeNull();
  });

  it('populates cards + diagnostic panel + confidence mix after a successful dry-run', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-results')).toBeInTheDocument();
    });

    // Cards
    expect(screen.getByTestId('metric-card-dpi-value').textContent).toBe('0.45x');
    expect(screen.getByTestId('metric-card-tvpi-value').textContent).toBe('1.70x');
    expect(screen.getByTestId('metric-card-net-irr-value').textContent).toBe('15.00%');
    expect(screen.getByTestId('metric-card-gross-irr-value').textContent).toBe('18.00%');

    // XIRR panel: gross has bounded_high + boundHit=max
    expect(screen.getByTestId('xirr-net-convergence-badge').textContent).toBe('Converged');
    expect(screen.getByTestId('xirr-gross-convergence-badge').textContent).toBe('Bounded high');
    expect(screen.getByTestId('xirr-gross-bound-hit')).toBeInTheDocument();

    // Confidence mix
    expect(screen.getByTestId('confidence-mix-high-count').textContent).toBe('8');
    expect(screen.getByTestId('confidence-mix-medium-count').textContent).toBe('3');
    expect(screen.getByTestId('confidence-mix-low-count').textContent).toBe('1');

    // Empty state is gone after results land
    expect(screen.queryByTestId('metrics-empty-state')).toBeNull();
    expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    expect(screen.queryByTestId('metrics-error-envelope')).toBeNull();
  });

  it('commits the successful preview and renders the saved draft result', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-result')).toBeInTheDocument();
    });

    const [, commitInit] = fetchSpy.mock.calls[1]!;
    expect(JSON.parse(commitInit?.body as string)).toMatchObject({
      asOfDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      runType: 'internal_review',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
      previewHash: 'b'.repeat(64),
    });
    expect(screen.getByTestId('metrics-commit-result').textContent).toMatch(/metric run #17/i);
  });

  it('renders the commit error envelope on preview mismatch', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'PREVIEW_HASH_MISMATCH',
            message: 'Metric-run preview hash no longer matches.',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-error-envelope')).toBeInTheDocument();
    });
    expect(screen.getByTestId('metrics-commit-error-envelope')).toHaveAttribute(
      'data-error-status',
      '409'
    );
    expect(screen.getByTestId('metrics-commit-error-envelope').textContent).toMatch(
      /preview changed/i
    );
  });

  it('renders the 401 error envelope when the dry-run is unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-error-envelope')).toBeInTheDocument();
    });
    const envelope = screen.getByTestId('metrics-error-envelope');
    expect(envelope).toHaveAttribute('data-error-status', '401');
    expect(envelope.textContent).toMatch(/sign-in required/i);
  });

  it('renders the CONTRACT_PARSE_ERROR envelope on contract drift', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ asOfDate: 'not-a-date' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-error-envelope')).toBeInTheDocument();
    });
    expect(screen.getByTestId('metrics-error-envelope').textContent).toMatch(
      /unexpected response/i
    );
  });

  it('shows a "select a fund" notice and disables submit when fundId is null', () => {
    fundContextMock.fundId = null;

    renderPage();

    expect(screen.getByText(/select a fund/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run metrics/i })).toBeDisabled();
  });

  it('source-discipline: page calls LpMetricRunResultsSchema.parse defensively', () => {
    const file = path.resolve(__dirname, '../../../../client/src/pages/lp-reporting/metrics.tsx');
    const text = readFileSync(file, 'utf-8');

    expect(text).toMatch(/LpMetricRunResultsSchema\.parse\s*\(/);
  });

  it('source-discipline: page never imports the XIRR solver', () => {
    const file = path.resolve(__dirname, '../../../../client/src/pages/lp-reporting/metrics.tsx');
    const text = readFileSync(file, 'utf-8');

    expect(text).not.toMatch(/from ['"][^'"]*\/finance\/xirr['"]/);
  });
});
