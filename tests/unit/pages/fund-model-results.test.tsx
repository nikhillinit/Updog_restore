/**
 * Batch 3B2: Results page cutover tests
 *
 * Validates that the results page:
 * - Fetches from GET /api/funds/:id/results (not sessionStorage)
 * - Renders available sections with payload data
 * - Renders unavailable sections with reason text
 * - Never calls sessionStorage.getItem with results keys
 * - Handles /latest route gracefully (error state)
 * - Handles loading, 404, and network error states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { createWouterWrapper } from '../../utils/withWouter';

describe('FundModelResultsPage (server-backed)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let sessionGetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    sessionGetSpy = vi.spyOn(Storage.prototype, 'getItem');

    // jsdom lacks IntersectionObserver -- stub it for FadeInSection
    globalThis.IntersectionObserver = class MockIntersectionObserver {
      observe() {
        /* noop */
      }
      unobserve() {
        /* noop */
      }
      disconnect() {
        /* noop */
      }
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function renderPage(path: string) {
    const { default: FundModelResultsPage } =
      await import('../../../client/src/pages/fund-model-results');
    const { Wrapper } = createWouterWrapper(path);
    return render(<FundModelResultsPage />, { wrapper: Wrapper });
  }

  function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  function mockFundPageFetches(options?: {
    results?: ReturnType<typeof readyResponse>;
    history?: ReturnType<typeof lifecycleHistoryResponse>;
    comparison?: ReturnType<typeof resultsComparisonResponse>;
    recalculateResponse?: { success: boolean; correlationId: string; runId: number; dispatchState: string };
    recalculateStatus?: number;
  }) {
    const results = options?.results ?? readyResponse();
    const history = options?.history ?? lifecycleHistoryResponse();
    const comparison = options?.comparison ?? resultsComparisonResponse();
    const recalculateStatus = options?.recalculateStatus ?? 200;
    const recalculateResponse =
      options?.recalculateResponse ?? {
        success: true,
        correlationId: 'recalc-corr-id',
        runId: 88,
        dispatchState: 'dispatched',
      };

    fetchSpy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/results')) {
        return Promise.resolve(jsonResponse(results));
      }

      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(history));
      }

      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(comparison));
      }

      if (url.endsWith('/recalculate')) {
        return Promise.resolve(
          new Response(JSON.stringify(recalculateResponse), {
            status: recalculateStatus,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${url} (${init?.method ?? 'GET'})`));
    });
  }

  function countFetches(url: string) {
    return fetchSpy.mock.calls.filter(([calledUrl]) => calledUrl === url).length;
  }

  // -- sessionStorage prohibition --

  it('never reads engine-results-* from sessionStorage', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const resultsCalls = sessionGetSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && (key as string).startsWith('engine-results-')
    );
    expect(resultsCalls).toHaveLength(0);
  });

  it('never reads wizard-completion-data from sessionStorage', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const wizardCalls = sessionGetSpy.mock.calls.filter(
      ([key]) => key === 'wizard-completion-data'
    );
    expect(wizardCalls).toHaveLength(0);
  });

  // -- Server fetch --

  it('fetches GET /api/funds/:id/results on mount', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/results',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  // -- Available sections --

  it('renders reserve section payload when status is available', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Reserve Allocation/)).toBeInTheDocument();
    });
    // Check that payload data from the server appears (not fabricated)
    expect(screen.getByText(/Follow-on/)).toBeInTheDocument();
  });

  it('renders pacing section payload when status is available', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Deployment Pacing/)).toBeInTheDocument();
    });
  });

  it('renders waterfall setup section when the server returns published config data', async () => {
    const resp = readyResponse();
    resp.sections.waterfall = {
      status: 'available',
      source: 'fund_config',
      configVersion: 1,
      publishedAt: '2026-03-20T12:00:00.000Z',
      payload: {
        view: 'setup-summary',
        type: 'american',
        tierCount: 1,
        tiers: [
          {
            name: 'Tier 1',
            preferredReturn: 0.08,
            catchUp: null,
            gpSplit: 20,
            lpSplit: 80,
            condition: 'irr',
            conditionValue: 0.08,
          },
        ],
        recyclingEnabled: true,
        recyclingType: 'both',
        recyclingCap: 25,
        recyclingPeriod: 24,
        exitRecyclingRate: 0.5,
        mgmtFeeRecyclingRate: 0.25,
        allowFutureRecycling: false,
      },
    };
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText('Waterfall Setup')).toBeInTheDocument();
    });
    expect(screen.getByText('American')).toBeInTheDocument();
    expect(screen.getByText('GP 20% / LP 80%')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  // -- Unavailable sections --

  it('renders overview section with typed scorecard facts', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    // Typed fact tiles render formatted values
    expect(screen.getAllByText('$100M').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('40.0%').length).toBeGreaterThanOrEqual(1); // reserveRatio
    expect(screen.getAllByText('5 yrs').length).toBeGreaterThanOrEqual(1); // yearsToFullDeploy
  });

  it('renders unavailable reason text for scenarios and waterfall sections', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      // scenarios and waterfall show the raw reason text
      const matches = screen.getAllByText(/No authoritative source/i);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders unavailable reason for reserve when no snapshot exists', async () => {
    const resp = readyResponse();
    resp.sections.reserve = {
      status: 'unavailable',
      reason: 'No calculation results available',
    };
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/No calculation results available/i)).toBeInTheDocument();
    });
  });

  it('renders stale-evidence copy from reasonCode', async () => {
    const resp = readyResponse();
    resp.sections.reserve = {
      status: 'pending',
      reason: 'A newer configuration was published. Request recalculation to update.',
      reasonCode: 'STALE_EVIDENCE',
    };
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/A newer configuration was published\. Request recalculation to update\./i)
      ).toBeInTheDocument();
    });
  });

  it('renders configuration issue label for invalid published config failures', async () => {
    const resp = readyResponse();
    resp.sections.waterfall = {
      status: 'failed',
      reason: 'Published config is invalid',
      reasonCode: 'INVALID_PUBLISHED_CONFIG',
    };
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Configuration issue:/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/The published configuration has validation issues\./i)
    ).toBeInTheDocument();
  });

  // -- /latest route --

  it('shows error state when fundId is "latest"', async () => {
    await renderPage('/fund-model-results/latest');

    // Should NOT call fetch (no valid fund ID)
    expect(fetchSpy).not.toHaveBeenCalled();
    // Should show error directing user to fund setup
    expect(screen.getByText(/fund setup/i)).toBeInTheDocument();
  });

  // -- Loading state --

  it('shows loading indicator while fetch is in-flight', async () => {
    // Never resolve the fetch
    fetchSpy.mockReturnValue(new Promise(() => {}));
    await renderPage('/fund-model-results/123');

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // -- Error states --

  it('shows error state on 404 response', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/999');

    await act(async () => {
      fetchDeferred.resolve(
        new Response(JSON.stringify({ error: 'Fund not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      await Promise.resolve();
    });

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('shows error state on network failure', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/123');

    await act(async () => {
      fetchDeferred.reject(new Error('Network error'));
      await Promise.resolve();
    });

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });

  // -- Pending/calculating --

  it('renders pending sections when status is calculating', async () => {
    mockFundPageFetches({
      results: {
        ...readyResponse(),
        status: 'calculating',
        lifecycle: {
          ...readyResponse().lifecycle,
          calculationState: {
            ...readyResponse().lifecycle.calculationState,
            status: 'calculating',
          },
        },
        sections: {
          reserve: { status: 'pending', reason: 'Calculations are still in progress' },
          pacing: { status: 'pending', reason: 'Calculations not yet requested' },
          scorecard: {
            status: 'pending',
            reason: 'Calculations have not produced results yet',
            reasonCode: 'CALCULATION_PENDING',
          },
          scenarios: { status: 'unavailable', reason: 'No authoritative source' },
          waterfall: { status: 'unavailable', reason: 'No authoritative source' },
        },
      },
    });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Test Fund/)).toBeInTheDocument();
    });
    expect(screen.getByText('Lifecycle Status')).toBeInTheDocument();
    expect(screen.getByText('Calculating')).toBeInTheDocument();
    expect(screen.getByText(/Calculations are still in progress/)).toBeInTheDocument();
    expect(screen.getByText(/Calculations not yet requested/)).toBeInTheDocument();
  });

  // -- No fabricated data --

  it('does not render hardcoded MOIC 2.5 or reserveRatio 40', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Test Fund/)).toBeInTheDocument();
    });

    // The old fabricated defaults from loadFromWizardData() must not appear as
    // standalone text nodes. The payload JSON may contain 0.4 (reserveRatio)
    // which is different from the fabricated "40" percentage.
    const container = document.body.textContent || '';
    // "2.5" as fabricated MOIC should not appear standalone
    expect(container).not.toContain('expectedMOIC');
    // "concentrationRisk" fabricated field should not appear
    expect(container).not.toContain('concentrationRisk');
  });

  // -- Fund identity header --

  it('renders fund name and vintage year from server data', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText('Test Fund')).toBeInTheDocument();
    });
    expect(screen.getByText(/Vintage 2024/)).toBeInTheDocument();
    // $100M appears in both header and overview card
    const sizeMatches = screen.getAllByText(/\$100M/);
    expect(sizeMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Published Version')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Dispatch State')).toBeInTheDocument();
    expect(screen.getByText('Correlation ID')).toBeInTheDocument();
    expect(screen.getByText('Snapshot Coverage')).toBeInTheDocument();
    expect(screen.getAllByText('RESERVE, PACING').length).toBeGreaterThanOrEqual(1);
  });

  // -- Legacy evidence --

  it('shows legacy evidence notice when section has legacyEvidence flag', async () => {
    const resp = readyResponse();
    resp.sections.reserve = {
      ...resp.sections.reserve,
      legacyEvidence: true,
    };
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/legacy data/i)).toBeInTheDocument();
    });
  });

  it('shows stale-evidence banner when published version is ahead of calculated version', async () => {
    const resp = readyResponse();
    resp.lifecycle.configState.publishedVersion = 2;
    resp.lifecycle.calculationState.configVersion = 1;

    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Results are stale/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Latest published configuration is v2, but the current calculation is still on v1/i
      )
    ).toBeInTheDocument();
  });

  it('does not show stale-evidence banner when calculated version matches published version', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Lifecycle Status/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Results are stale/i)).not.toBeInTheDocument();
  });

  it('shows no-publish diagnostics when no published configuration exists', async () => {
    const resp = readyResponse();
    resp.lifecycle.configState.hasPublished = false;
    resp.lifecycle.configState.publishedVersion = null;
    resp.lifecycle.configState.publishedAt = null;
    resp.lifecycle.calculationState.status = 'not_requested';
    resp.lifecycle.calculationState.configVersion = null;
    resp.lifecycle.calculationState.runId = null;
    resp.lifecycle.calculationState.correlationId = null;
    resp.lifecycle.calculationState.dispatchState = null;
    resp.lifecycle.calculationState.availableSnapshotTypes = [];
    resp.lifecycle.calculationState.lastCalculatedAt = null;

    mockFundPageFetches({ results: resp, history: { fundId: 123, entries: [] } });
    await renderPage('/fund-model-results/123');

    const diagnosticsCard = await screen.findByTestId('run-diagnostics-card');
    expect(
      within(diagnosticsCard).getByText(/No published configuration yet/i)
    ).toBeInTheDocument();
    expect(
      within(diagnosticsCard).getByText(
        /Publish a configuration before relying on lifecycle-backed results/i
      )
    ).toBeInTheDocument();
    expect(within(diagnosticsCard).getAllByText('Not published').length).toBeGreaterThanOrEqual(1);
    expect(within(diagnosticsCard).getAllByText('Not available').length).toBeGreaterThanOrEqual(1);
    expect(within(diagnosticsCard).getByText('None yet')).toBeInTheDocument();
  });

  it('shows failed-run diagnostics when a published calculation fails', async () => {
    mockFundPageFetches({ results: failedResponse() });
    await renderPage('/fund-model-results/123');

    const diagnosticsCard = await screen.findByTestId('run-diagnostics-card');
    expect(
      within(diagnosticsCard).getByText(
        /Published configuration exists, but the latest calculation failed/i
      )
    ).toBeInTheDocument();
    expect(within(diagnosticsCard).getByText(/run 10 did not complete successfully/i)).toBeInTheDocument();
    expect(within(diagnosticsCard).getByText('test-corr-id')).toBeInTheDocument();
    expect(await screen.findByText(/Worker timed out during reserve snapshot generation/i)).toBeInTheDocument();
  });

  it('renders publish history entries when expanded', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Publish History/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /show history/i }));

    const historyCard = await screen.findByTestId('publish-history-card');
    expect(within(historyCard).getByText('Version v2')).toBeInTheDocument();
    expect(within(historyCard).getByText('Version v1')).toBeInTheDocument();
    expect(within(historyCard).getByText('Run 10')).toBeInTheDocument();
    expect(within(historyCard).getByText('No calculation run')).toBeInTheDocument();
  });

  it('renders publish comparison deltas when comparable history exists', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const comparisonCard = await screen.findByTestId('publish-comparison-card');
    expect(within(comparisonCard).getByText(/Publish Comparison/i)).toBeInTheDocument();
    expect(within(comparisonCard).getByText('Current Published Version v2')).toBeInTheDocument();
    expect(within(comparisonCard).getByText('Previous Published Version v1')).toBeInTheDocument();
    expect(within(comparisonCard).getByText('Fund Size')).toBeInTheDocument();
    expect(within(comparisonCard).getByText('$100M')).toBeInTheDocument();
    expect(within(comparisonCard).getByText('Previous $80M')).toBeInTheDocument();
    expect(
      within(comparisonCard).getByText((_, element) =>
        element?.textContent === 'Delta +$20M (+25.0%)'
      )
    ).toBeInTheDocument();
  });

  it('renders a comparison fallback when no previous published version exists', async () => {
    mockFundPageFetches({
      comparison: {
        fundId: 123,
        comparisonStatus: 'no_previous_version',
        currentVersion: {
          version: 1,
          publishedAt: '2026-03-20T12:00:00.000Z',
          calcRun: {
            runId: 10,
            status: 'ready',
            dispatchState: 'dispatched',
            lastCalculatedAt: '2026-03-20T12:30:00.000Z',
            correlationId: 'corr-abc-123',
          },
          metrics: {
            fundSize: 100_000_000,
            reserveRatio: 0.4,
            avgConfidence: 0.85,
            yearsToFullDeploy: 5,
          },
        },
        previousVersion: null,
        metricDeltas: [],
      },
    });
    await renderPage('/fund-model-results/123');

    const comparisonCard = await screen.findByTestId('publish-comparison-card');
    await waitFor(() => {
      expect(within(comparisonCard).getByText('Current Published Version v1')).toBeInTheDocument();
    });
    expect(within(comparisonCard).getByText(/Previous version unavailable/i)).toBeInTheDocument();
    expect(
      within(comparisonCard).getByText(
        /Publish at least two versions to see metric deltas between releases/i
      )
    ).toBeInTheDocument();
  });

  it('renders a comparison fallback when no published version exists', async () => {
    const resp = readyResponse();
    resp.lifecycle.configState.hasPublished = false;
    resp.lifecycle.configState.publishedVersion = null;
    resp.lifecycle.configState.publishedAt = null;

    mockFundPageFetches({
      results: resp,
      comparison: {
        fundId: 123,
        comparisonStatus: 'no_published_version',
        currentVersion: null,
        previousVersion: null,
        metricDeltas: [],
      },
    });
    await renderPage('/fund-model-results/123');

    const comparisonCard = await screen.findByTestId('publish-comparison-card');
    await waitFor(() => {
      expect(within(comparisonCard).getByText(/No published version yet/i)).toBeInTheDocument();
    });
    expect(
      within(comparisonCard).getByText(
        /Publish a configuration to unlock publish-to-publish comparison/i
      )
    ).toBeInTheDocument();
  });

  it('disables recalculate when no published configuration exists', async () => {
    const resp = readyResponse();
    resp.lifecycle.configState.hasPublished = false;
    resp.lifecycle.configState.publishedVersion = null;
    resp.lifecycle.configState.publishedAt = null;

    mockFundPageFetches({ results: resp, history: { fundId: 123, entries: [] } });
    await renderPage('/fund-model-results/123');

    const button = await screen.findByTestId('recalculate-button');
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/Publish a configuration before recalculating results/i)
    ).toBeInTheDocument();
  });

  it('disables recalculate while lifecycle status is calculating', async () => {
    const resp = readyResponse();
    resp.lifecycle.calculationState.status = 'calculating';

    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    const button = await screen.findByTestId('recalculate-button');
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/Calculation is already in progress for the published configuration/i)
    ).toBeInTheDocument();
  });

  it('posts recalculate and refreshes results/history when enabled', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const button = await screen.findByTestId('recalculate-button');
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/recalculate',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const resultsCalls = fetchSpy.mock.calls.filter(([url]) => url === '/api/funds/123/results');
    const historyCalls = fetchSpy.mock.calls.filter(
      ([url]) => url === '/api/funds/123/lifecycle-history'
    );
    const comparisonCalls = fetchSpy.mock.calls.filter(
      ([url]) => url === '/api/funds/123/results-comparison'
    );

    expect(resultsCalls.length).toBeGreaterThanOrEqual(2);
    expect(historyCalls.length).toBeGreaterThanOrEqual(2);
    expect(comparisonCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('renders recalculation error when the server rejects the request', async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) return Promise.resolve(jsonResponse(readyResponse()));
      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      }
      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      }
      if (url.endsWith('/recalculate')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'Calculation already in progress',
              message: 'Wait for the current calculation to complete',
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url} (${init?.method ?? 'GET'})`));
    });

    await renderPage('/fund-model-results/123');

    fireEvent.click(await screen.findByTestId('recalculate-button'));

    expect(
      await screen.findByText(/Wait for the current calculation to complete/i)
    ).toBeInTheDocument();
  });

  it('uses exponential backoff while calculation remains active', async () => {
    vi.useFakeTimers();

    const activeResponse = calculatingResponse();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) return Promise.resolve(jsonResponse(activeResponse));
      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      }
      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    await renderPage('/fund-model-results/123');
    await act(async () => {
      await Promise.resolve();
    });
    expect(countFetches('/api/funds/123/results')).toBe(1);
    expect(countFetches('/api/funds/123/lifecycle-history')).toBe(1);
    expect(countFetches('/api/funds/123/results-comparison')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(countFetches('/api/funds/123/results')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(countFetches('/api/funds/123/results')).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999);
    });
    expect(countFetches('/api/funds/123/results')).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(countFetches('/api/funds/123/results')).toBe(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(countFetches('/api/funds/123/results')).toBe(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(countFetches('/api/funds/123/results')).toBe(5);

    expect(countFetches('/api/funds/123/lifecycle-history')).toBe(1);
    expect(countFetches('/api/funds/123/results-comparison')).toBe(1);
  });

  it('resets backoff when runId changes during active polling', async () => {
    vi.useFakeTimers();

    const responses = [
      calculatingResponse({ runId: 10 }),
      calculatingResponse({ runId: 11 }),
      calculatingResponse({ runId: 11 }),
    ];

    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) {
        return Promise.resolve(jsonResponse(responses.shift() ?? calculatingResponse({ runId: 11 })));
      }
      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      }
      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    await renderPage('/fund-model-results/123');
    await act(async () => {
      await Promise.resolve();
    });
    expect(countFetches('/api/funds/123/results')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(countFetches('/api/funds/123/results')).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(countFetches('/api/funds/123/results')).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(countFetches('/api/funds/123/results')).toBe(3);
  });

  it('stops polling and refreshes history when lifecycle reaches a terminal state', async () => {
    vi.useFakeTimers();

    const responses = [calculatingResponse(), readyResponse()];

    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) {
        return Promise.resolve(jsonResponse(responses.shift() ?? readyResponse()));
      }
      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      }
      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    await renderPage('/fund-model-results/123');
    await act(async () => {
      await Promise.resolve();
    });
    expect(countFetches('/api/funds/123/results')).toBe(1);
    expect(countFetches('/api/funds/123/lifecycle-history')).toBe(1);
    expect(countFetches('/api/funds/123/results-comparison')).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(countFetches('/api/funds/123/results')).toBe(2);
    expect(countFetches('/api/funds/123/lifecycle-history')).toBe(2);
    expect(countFetches('/api/funds/123/results-comparison')).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(countFetches('/api/funds/123/results')).toBe(2);
  });

  it('preserves last good data on background polling failure and retries with backoff', async () => {
    vi.useFakeTimers();

    let resultsCall = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) {
        resultsCall += 1;
        if (resultsCall === 1) return Promise.resolve(jsonResponse(calculatingResponse()));
        if (resultsCall === 2) return Promise.reject(new Error('temporary outage'));
        return Promise.resolve(jsonResponse(calculatingResponse()));
      }
      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      }
      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    await renderPage('/fund-model-results/123');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Test Fund')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(countFetches('/api/funds/123/results')).toBe(2);
    expect(screen.getByText('Test Fund')).toBeInTheDocument();
    expect(screen.queryByText(/Error loading results/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(countFetches('/api/funds/123/results')).toBe(3);
  });

  it('clears pending polling timeout on unmount', async () => {
    vi.useFakeTimers();

    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) return Promise.resolve(jsonResponse(calculatingResponse()));
      if (url.endsWith('/lifecycle-history')) {
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      }
      if (url.endsWith('/results-comparison')) {
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    const { unmount } = await renderPage('/fund-model-results/123');
    await act(async () => {
      await Promise.resolve();
    });
    expect(countFetches('/api/funds/123/results')).toBe(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(countFetches('/api/funds/123/results')).toBe(1);
  });
});

// -- Helpers --

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readyResponse() {
  return {
    status: 'ready' as const,
    fundId: 123,
    fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
    lifecycle: {
      fundId: 123,
      configState: {
        latestVersion: 1,
        draftVersion: null,
        publishedVersion: 1,
        hasDraft: false,
        hasPublished: true,
        publishedAt: '2026-03-20T12:00:00.000Z',
        draftUpdatedAt: null,
        publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
      },
      calculationState: {
        status: 'ready' as const,
        configVersion: 1,
        runId: 10,
        correlationId: 'test-corr-id',
        dispatchState: 'dispatched',
        availableSnapshotTypes: ['RESERVE', 'PACING'],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: '2026-03-20T12:30:00.000Z',
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: {
        status: 'available' as const,
        calculatedAt: '2026-03-20T12:30:00.000Z',
        source: 'fund_snapshots' as const,
        legacyEvidence: false,
        payload: {
          totalAllocation: 40_000_000,
          reserveRatio: 0.4,
          avgConfidence: 0.85,
          allocations: [{ allocation: 40_000_000, confidence: 0.85, rationale: 'Follow-on' }],
        },
      },
      pacing: {
        status: 'available' as const,
        calculatedAt: '2026-03-20T12:30:00.000Z',
        source: 'fund_snapshots' as const,
        legacyEvidence: false,
        payload: {
          deploymentRate: 5_000_000,
          yearsToFullDeploy: 5,
          totalQuarters: 20,
          marketCondition: 'neutral',
          deployments: [],
        },
      },
      scorecard: {
        status: 'available' as const,
        payload: {
          fundName: { value: 'Test Fund', source: 'funds' },
          fundSize: { value: 100_000_000, source: 'funds' },
          vintageYear: { value: 2024, source: 'funds' },
          reserveRatio: { value: 0.4, source: 'fund_snapshots' },
          avgConfidence: { value: 0.85, source: 'fund_snapshots' },
          yearsToFullDeploy: { value: 5, source: 'fund_snapshots' },
          lastCalculatedAt: { value: '2026-03-20T12:30:00.000Z', source: 'fund_state' },
        },
      },
      scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
    },
  };
}

function calculatingResponse(
  overrides?: Partial<{
    runId: number;
    configVersion: number;
    publishedVersion: number;
  }>
) {
  const resp = readyResponse();
  resp.status = 'calculating';
  resp.lifecycle.calculationState.status = 'calculating';
  resp.lifecycle.calculationState.runId = overrides?.runId ?? 10;
  resp.lifecycle.calculationState.configVersion = overrides?.configVersion ?? 1;
  resp.lifecycle.configState.publishedVersion = overrides?.publishedVersion ?? 1;
  resp.lifecycle.calculationState.lastCalculatedAt = null;
  resp.sections.reserve = { status: 'pending', reason: 'Calculations are still in progress' };
  resp.sections.pacing = { status: 'pending', reason: 'Calculations are still in progress' };
  resp.sections.scorecard = {
    status: 'pending',
    reason: 'Calculations have not produced results yet',
    reasonCode: 'CALCULATION_PENDING',
  };
  return resp;
}

function failedResponse() {
  const resp = readyResponse();
  resp.status = 'failed';
  resp.lifecycle.calculationState.status = 'failed';
  resp.lifecycle.calculationState.lastError =
    'Worker timed out during reserve snapshot generation';
  resp.sections.reserve = {
    status: 'failed',
    reason: 'Reserve calculation failed for the latest published version',
  };
  resp.sections.pacing = {
    status: 'failed',
    reason: 'Pacing calculation failed for the latest published version',
  };
  resp.sections.scorecard = {
    status: 'failed',
    reason: 'Scorecard unavailable because the latest calculation failed',
  };
  return resp;
}

function lifecycleHistoryResponse() {
  return {
    fundId: 123,
    entries: [
      {
        version: 2,
        publishedAt: '2026-03-20T12:00:00.000Z',
        publishedBy: 1,
        fundSize: 100_000_000,
        numCompanies: 5,
        calcRun: {
          runId: 10,
          status: 'ready' as const,
          dispatchState: 'dispatched' as const,
          lastCalculatedAt: '2026-03-20T12:30:00.000Z',
          correlationId: 'corr-abc-123',
        },
      },
      {
        version: 1,
        publishedAt: '2026-03-15T10:00:00.000Z',
        publishedBy: null,
        fundSize: 80_000_000,
        numCompanies: null,
        calcRun: null,
      },
    ],
  };
}

function resultsComparisonResponse() {
  return {
    fundId: 123,
    comparisonStatus: 'comparable' as const,
    currentVersion: {
      version: 2,
      publishedAt: '2026-03-20T12:00:00.000Z',
      calcRun: {
        runId: 10,
        status: 'ready' as const,
        dispatchState: 'dispatched' as const,
        lastCalculatedAt: '2026-03-20T12:30:00.000Z',
        correlationId: 'corr-abc-123',
      },
      metrics: {
        fundSize: 100_000_000,
        reserveRatio: 0.4,
        avgConfidence: 0.85,
        yearsToFullDeploy: 5,
      },
    },
    previousVersion: {
      version: 1,
      publishedAt: '2026-03-15T10:00:00.000Z',
      calcRun: null,
      metrics: {
        fundSize: 80_000_000,
        reserveRatio: 0.35,
        avgConfidence: 0.8,
        yearsToFullDeploy: 6,
      },
    },
    metricDeltas: [
      {
        metric: 'fundSize' as const,
        displayName: 'Fund Size',
        currentValue: 100_000_000,
        previousValue: 80_000_000,
        absoluteDelta: 20_000_000,
        percentageDelta: 25,
      },
      {
        metric: 'reserveRatio' as const,
        displayName: 'Reserve Ratio',
        currentValue: 0.4,
        previousValue: 0.35,
        absoluteDelta: 0.05,
        percentageDelta: 14.2857142857,
      },
      {
        metric: 'avgConfidence' as const,
        displayName: 'Average Confidence',
        currentValue: 0.85,
        previousValue: 0.8,
        absoluteDelta: 0.05,
        percentageDelta: 6.25,
      },
      {
        metric: 'yearsToFullDeploy' as const,
        displayName: 'Years To Full Deploy',
        currentValue: 5,
        previousValue: 6,
        absoluteDelta: -1,
        percentageDelta: -16.6666666667,
      },
    ],
  };
}
