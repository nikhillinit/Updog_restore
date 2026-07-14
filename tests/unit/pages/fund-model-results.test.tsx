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
import userEvent from '@testing-library/user-event';
import React from 'react';
import { createWouterWrapper } from '../../utils/withWouter';
import FundModelResultsPage from '../../../client/src/pages/fund-model-results';
import type { FundScenarioComparisonV1 } from '../../../shared/contracts/fund-scenario-comparison-v1.contract';

// Plan 9 Wave 9B2: the readiness rollup's data-source hooks are mocked at the
// module boundary (this file's fetch mock only covers the page's own reads).
// Errored queries exercise the fail-closed "Facts unavailable" rows; the
// Scenarios row still derives from the REAL /results fetch mock below. The
// scenario-set LIST mock (fix round F1) is mutable so the actionable-join
// test can present a matching inventory.
const rollupHookMocks = vi.hoisted(() => {
  const erroredScenarioSetList = () => ({
    isSuccess: false,
    isError: true,
    data: undefined as unknown,
    error: new Error('scenario set list unavailable') as Error | null,
  });
  return { erroredScenarioSetList, scenarioSetList: erroredScenarioSetList() };
});
vi.mock('@/hooks/use-scenario-set-list', () => ({
  useScenarioSetList: () => rollupHookMocks.scenarioSetList,
}));
vi.mock('@/hooks/useDualForecast', () => ({
  useDualForecast: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('dual forecast unavailable'),
  }),
}));
vi.mock('@/hooks/use-moic', () => ({
  useFundMoicRankingsV2: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('rankings unavailable'),
  }),
}));
vi.mock('@/components/portfolio/tabs/hooks/useLatestAllocations', () => ({
  useLatestAllocations: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('allocations unavailable'),
  }),
}));
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 123, isLoading: false }),
}));

describe('FundModelResultsPage (server-backed)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let sessionGetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    sessionGetSpy = vi.spyOn(Storage.prototype, 'getItem');
    rollupHookMocks.scenarioSetList = rollupHookMocks.erroredScenarioSetList();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function renderPage(path: string) {
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
    scenarioComparison?: FundScenarioComparisonV1;
    scenarioComparisonsById?: Record<string, FundScenarioComparisonV1>;
    recalculateResponse?: {
      success: boolean;
      correlationId: string;
      runId: number;
      dispatchState: string;
    };
    recalculateStatus?: number;
  }) {
    const results = options?.results ?? readyResponse();
    const history = options?.history ?? lifecycleHistoryResponse();
    const comparison = options?.comparison ?? resultsComparisonResponse();
    const scenarioComparison = options?.scenarioComparison ?? scenarioComparisonResponse();
    const recalculateStatus = options?.recalculateStatus ?? 200;
    const recalculateResponse = options?.recalculateResponse ?? {
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

      if (url.includes('/scenario-sets/') && url.endsWith('/comparison')) {
        const byId = options?.scenarioComparisonsById;
        const matchedId = url.match(/\/scenario-sets\/([^/]+)\/comparison$/)?.[1];
        if (byId && matchedId && byId[matchedId]) {
          return Promise.resolve(jsonResponse(byId[matchedId]));
        }
        return Promise.resolve(jsonResponse(scenarioComparison));
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

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled(), { timeout: 10000 });

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
      expect(screen.getByText(/Reserve allocation — awaiting current actuals/)).toBeInTheDocument();
    });
    // Check that payload data from the server appears (not fabricated)
    expect(screen.getByText(/Follow-on/)).toBeInTheDocument();
  });

  it('renders pacing section payload when status is available', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/Deployment pacing — modeled from construction assumptions/)
      ).toBeInTheDocument();
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
      expect(
        screen.getByText(/Waterfall setup — published distribution terms/)
      ).toBeInTheDocument();
    });
    const waterfallSection = screen
      .getByRole('heading', { name: /Waterfall setup — published distribution terms/ })
      .closest('div');
    expect(waterfallSection).not.toBeNull();
    expect(
      within(waterfallSection as HTMLElement).queryByText(/RUN #|RUN IN PROGRESS/i)
    ).toBeNull();
    expect(within(waterfallSection as HTMLElement).queryByText(/CALCULATING|CURRENT/i)).toBeNull();
    expect(screen.getByText('American')).toBeInTheDocument();
    expect(screen.getByText('GP 20% / LP 80%')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('renders economics KPIs and tables when economics results are available', async () => {
    const resp = readyResponse();
    resp.sections.economics = validEconomicsSection();
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/GP economics — projected carry and fees from the published model/)
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('economics-results-card')).toBeInTheDocument();
    expect(screen.getByText('Gross IRR')).toBeInTheDocument();
    expect(screen.getByText('Total GP Carry')).toBeInTheDocument();
    expect(screen.getByText('Economics Cashflows')).toBeInTheDocument();
    expect(screen.getByText('Waterfall and Carry')).toBeInTheDocument();
  });

  // -- PR B: section evidence provenance --

  it('renders pacing evidence as lifecycle-backed with config, run, and source', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-deployment-pacing');
    expect(within(header).getByText('CONFIG v1')).toBeInTheDocument();
    expect(within(header).getByText('RUN #10')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
  });

  it('renders GP economics evidence from the section, not the lifecycle run', async () => {
    const resp = readyResponse();
    const economics = validEconomicsSection();
    economics.configVersion = 2;
    economics.calculatedAt = '2026-04-01T08:00:00.000Z';
    resp.sections.economics = economics;
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-gp-economics');
    expect(within(header).getByText('CONFIG v2')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
    // section evidence wins: no lifecycle run id and no lifecycle config version
    expect(within(header).queryByText(/^RUN /)).toBeNull();
    expect(within(header).queryByText('CONFIG v1')).toBeNull();
  });

  it('renders waterfall evidence as config-backed setup with no calculation run', async () => {
    const resp = readyResponse();
    resp.sections.waterfall = {
      status: 'available',
      source: 'fund_config',
      configVersion: 7,
      publishedAt: '2026-05-01T10:00:00.000Z',
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

    const header = await screen.findByTestId('evidence-header-waterfall-setup');
    expect(within(header).getByText('CONFIG')).toBeInTheDocument();
    expect(within(header).getByText('CONFIG v7')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_config')).toBeInTheDocument();
    expect(within(header).getByText(/^PUBLISHED /)).toBeInTheDocument();
    // setup evidence never claims a calculation run or calc freshness
    expect(within(header).queryByText(/^RUN /)).toBeNull();
    expect(within(header).queryByText('CURRENT')).toBeNull();
  });

  it('renders overview evidence as mixed-source without claiming a single source', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-overview');
    expect(within(header).getByText('MIXED')).toBeInTheDocument();
    expect(
      within(header).getByText('SOURCES funds / fund_snapshots / fund_state')
    ).toBeInTheDocument();
    // does not collapse the scorecard to a single false source
    expect(within(header).queryByText('SOURCE fund_snapshots')).toBeNull();
    expect(within(header).queryByText(/^RUN /)).toBeNull();
  });

  it('keeps scenario analysis on scenario-specific evidence with no generic header', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/Scenario analysis — compare saved cases to the published baseline/)
      ).toBeInTheDocument();
    });
    // a generic lifecycle evidence header is present elsewhere on the page...
    expect(screen.getByTestId('evidence-header-reserve-allocation')).toBeInTheDocument();
    // ...but is not mounted on the scenario section heading group
    const scenarioHeading = screen.getByRole('heading', {
      name: /Scenario analysis — compare saved cases to the published baseline/,
    });
    expect(
      scenarioHeading.parentElement?.querySelector('[aria-label="Evidence header"]')
    ).toBeNull();
    // the scenario summary (with its own provenance) stays visible
    expect(screen.getByTestId('scenario-sets-summary')).toBeInTheDocument();
  });

  it('keeps unavailable sections visible without an evidence header hiding them', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/Waterfall setup — published distribution terms/)
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/GP economics — projected carry and fees from the published model/)
    ).toBeInTheDocument();
    // default fixture leaves waterfall + economics unavailable: no section
    // evidence header, but the explanatory panel must still render
    const waterfallHeading = screen.getByRole('heading', {
      name: /Waterfall setup — published distribution terms/,
    });
    expect(
      waterfallHeading.parentElement?.querySelector('[aria-label="Evidence header"]')
    ).toBeNull();
  });

  it('renders scenario set summaries when scenario results are available', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/Scenario analysis — compare saved cases to the published baseline/)
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('scenario-sets-summary')).toBeInTheDocument();
    expect(screen.getAllByText('Fee sensitivity').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2.10x').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /open scenario workspace/i })).toHaveAttribute(
      'href',
      '/fund-model-results/123/scenarios'
    );
  });

  it('fetches and renders scenario-set comparison for calculated scenario sets', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    mockFundPageFetches({ results: resp, scenarioComparison: scenarioComparisonResponse() });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/funds/123/scenario-sets/00000000-0000-0000-0000-000000000111/comparison',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    const comparison = await screen.findByTestId('scenario-comparison-table');
    expect(within(comparison).getByText('Authoritative baseline')).toBeInTheDocument();
    expect(within(comparison).getByText('Lower fee')).toBeInTheDocument();
    expect(within(comparison).getAllByText('Net LP IRR').length).toBe(1);
    expect(within(comparison).getByText(/Higher by \+0\.30x/)).toBeInTheDocument();
  });

  it('rejects scenario-set comparison payloads that drift from the shared contract', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    const malformedScenarioComparison = {
      ...scenarioComparisonResponse(),
      unexpected: true,
    } as unknown as FundScenarioComparisonV1;
    mockFundPageFetches({ results: resp, scenarioComparison: malformedScenarioComparison });
    await renderPage('/fund-model-results/123');

    expect(
      await screen.findByText('Scenario comparison could not be loaded for this scenario set.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Authoritative baseline')).not.toBeInTheDocument();
  });

  it('renders a cross-set comparison table when two or more sets are comparable', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = twoSetScenariosSection();
    mockFundPageFetches({
      results: resp,
      scenarioComparisonsById: {
        '00000000-0000-0000-0000-000000000111': scenarioComparisonResponse(),
        '00000000-0000-0000-0000-000000000222': secondScenarioComparison(),
      },
    });
    await renderPage('/fund-model-results/123');

    const table = await screen.findByTestId('cross-set-scenario-comparison-table');
    expect(table).toBeInTheDocument();
    expect(screen.queryByTestId('scenario-comparison-table')).not.toBeInTheDocument();
    expect(within(table).getByText('Fee sensitivity')).toBeInTheDocument();
    expect(within(table).getByText('Carry sensitivity')).toBeInTheDocument();
  });

  // -- Unavailable sections --

  it('renders overview section with typed scorecard facts', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Overview — current recorded fund metrics/)).toBeInTheDocument();
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
      expect(
        screen.getByText(/Create a scenario set to compare alternate fund economics/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/No authoritative source/i)).toBeInTheDocument();
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

    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    for (const key of ['summary', 'reserves', 'scenarios', 'reports']) {
      expect(screen.getByTestId(`workspace-nav-${key}-disabled`)).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    }
    expect(within(nav).queryByRole('link', { name: 'Summary' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Forecast' })).toHaveAttribute(
      'href',
      '/financial-modeling'
    );
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

    // 9B2 narrow re-scope: the readiness rollup honestly repeats the failure
    // cause in its Scenarios row, so the error-state assertion pins the alert
    // region semantically instead of a page-global text match.
    expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
  });

  it('shows error state on network failure', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/123');

    await act(async () => {
      fetchDeferred.reject(new Error('Network error'));
      await Promise.resolve();
    });

    // 9B2 narrow re-scope: see the 404 test above.
    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i);
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
          scenarios: {
            status: 'unavailable',
            reason: 'No scenario sets exist for this fund',
            reasonCode: 'SCENARIOS_NONE_EXIST',
          },
          waterfall: { status: 'unavailable', reason: 'No authoritative source' },
          economics: {
            status: 'pending',
            reason:
              'Economics snapshot has not been produced for the latest published configuration',
            reasonCode: 'ECONOMICS_SNAPSHOT_PENDING',
          },
        },
      },
    });
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getAllByText(/Test Fund/).length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getAllByText(/Test Fund/).length).toBeGreaterThanOrEqual(1);
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
      // Strict page-identity pin (review P2-5): the h1 itself must carry the
      // fund name; the workspace-row repetition is asserted separately.
      expect(screen.getByRole('heading', { level: 1, name: 'Test Fund' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('workspace-nav-fund')).toHaveTextContent('Test Fund');
    expect(screen.getByText(/Vintage 2024/)).toBeInTheDocument();
    // $100M appears in both header and overview card
    const sizeMatches = screen.getAllByText(/\$100M/);
    expect(sizeMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Published Version')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.queryByText('Dispatch State')).not.toBeInTheDocument();
    expect(screen.queryByText('Correlation ID')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('corr-123');
    expect(screen.getByText('Snapshot Coverage')).toBeInTheDocument();
    expect(screen.getAllByText('RESERVE, PACING').length).toBeGreaterThanOrEqual(1);
  });

  // -- Evidence headers --

  it('renders READY evidence header segments from lifecycle and section source', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-reserve-allocation');
    expect(within(header).getByText('READY')).toBeInTheDocument();
    expect(within(header).getByText('CONFIG v1')).toBeInTheDocument();
    expect(within(header).getByText('RUN #10')).toBeInTheDocument();
    expect(
      within(header).getByText(`CALCULATED ${formatEvidenceTimestamp('2026-03-20T12:30:00.000Z')}`)
    ).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
    expect(within(header).getByText('CURRENT')).toBeInTheDocument();
  });

  it('renders CALCULATING evidence with explanatory pending timestamp copy', async () => {
    mockFundPageFetches({ results: calculatingResponse({ runId: 10 }) });
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-reserve-allocation');
    expect(within(header).getByText('CALCULATING')).toBeInTheDocument();
    expect(within(header).getByText('CONFIG v1')).toBeInTheDocument();
    expect(within(header).getByText('RUN IN PROGRESS #10')).toBeInTheDocument();
    expect(within(header).getByText('CALCULATED PENDING')).toBeInTheDocument();
    expect(header).not.toHaveTextContent('RUN #10');
  });

  it('renders FAILED evidence when lifecycle calculation fails', async () => {
    mockFundPageFetches({ results: failedResponse() });
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-reserve-allocation');
    expect(within(header).getAllByText('FAILED').length).toBeGreaterThanOrEqual(1);
    expect(within(header).getByText('CONFIG v1')).toBeInTheDocument();
    expect(within(header).getByText('RUN #10')).toBeInTheDocument();
    expect(
      screen.getByText(/Worker timed out during reserve snapshot generation/i)
    ).toBeInTheDocument();
  });

  it('renders STALE evidence with truthful run and config version', async () => {
    const resp = readyResponse();
    resp.lifecycle.configState.publishedVersion = 2;
    resp.lifecycle.calculationState.configVersion = 1;

    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-reserve-allocation');
    expect(within(header).getAllByText('STALE').length).toBeGreaterThanOrEqual(1);
    expect(within(header).getByText('CONFIG v1')).toBeInTheDocument();
    expect(within(header).getByText('RUN #10')).toBeInTheDocument();
    expect(within(header).getByText('SOURCE fund_snapshots')).toBeInTheDocument();
  });

  it('renders UNAVAILABLE evidence without fabricated IDs when lifecycle fields are missing', async () => {
    const resp = readyResponse();
    resp.lifecycle.configState.hasPublished = false;
    resp.lifecycle.configState.publishedVersion = null;
    resp.lifecycle.configState.publishedAt = null;
    resp.lifecycle.calculationState.status = 'not_requested';
    resp.lifecycle.calculationState.configVersion = null;
    resp.lifecycle.calculationState.runId = null;
    resp.lifecycle.calculationState.lastCalculatedAt = null;

    mockFundPageFetches({ results: resp, history: { fundId: 123, entries: [] } });
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-reserve-allocation');
    expect(within(header).getAllByText('UNAVAILABLE').length).toBeGreaterThanOrEqual(1);
    expect(within(header).getByText('CONFIG UNAVAILABLE')).toBeInTheDocument();
    expect(within(header).getByText('RUN UNAVAILABLE')).toBeInTheDocument();
    expect(within(header).getByText('CALCULATED UNAVAILABLE')).toBeInTheDocument();
    expect(header).not.toHaveTextContent('RUN #');
    expect(header).not.toHaveTextContent('CONFIG v');
  });

  it('renders null configVersion and runId as unavailable evidence segments', async () => {
    const resp = readyResponse();
    resp.lifecycle.calculationState.configVersion = null;
    resp.lifecycle.calculationState.runId = null;

    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    const header = await screen.findByTestId('evidence-header-reserve-allocation');
    expect(within(header).getByText('CONFIG UNAVAILABLE')).toBeInTheDocument();
    expect(within(header).getByText('RUN UNAVAILABLE')).toBeInTheDocument();
    expect(header).not.toHaveTextContent('RUN #');
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
    expect(screen.getByRole('link', { name: /review and publish/i })).toHaveAttribute(
      'href',
      '/fund-setup?step=7&fundId=123'
    );
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
    expect(
      within(diagnosticsCard).getByText(/run 10 did not complete successfully/i)
    ).toBeInTheDocument();
    expect(within(diagnosticsCard).queryByText('test-corr-id')).not.toBeInTheDocument();
    expect(within(diagnosticsCard).queryByText('dispatched')).not.toBeInTheDocument();
    expect(
      await screen.findByText(/Worker timed out during reserve snapshot generation/i)
    ).toBeInTheDocument();
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
      within(comparisonCard).getByText(
        (_, element) => element?.textContent === 'Delta +$20M (+25.0%)'
      )
    ).toBeInTheDocument();
  });

  it('renders a source-labeled quarterly analytics trace with owned action links', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const trace = await screen.findByTestId('quarterly-review-trace');

    expect(within(trace).getByText('Quarterly Analytics Trace')).toBeInTheDocument();
    expect(within(trace).getByText('Are we on plan?')).toBeInTheDocument();
    expect(within(trace).getByText('Where are the gaps by segment?')).toBeInTheDocument();
    expect(within(trace).getByText('Which follow-ons need action?')).toBeInTheDocument();
    expect(within(trace).getByText('What if the model changes?')).toBeInTheDocument();
    expect(within(trace).getByText('What can LPs receive today?')).toBeInTheDocument();

    expect(within(trace).getByText('Publish comparison')).toBeInTheDocument();
    expect(within(trace).getByText('Performance breakdown route')).toBeInTheDocument();
    expect(within(trace).getByText('Reserve snapshot')).toBeInTheDocument();
    expect(within(trace).getByText('Scenario workspaces')).toBeInTheDocument();
    expect(within(trace).getByText('Reports workspace')).toBeInTheDocument();

    expect(within(trace).getByRole('link', { name: /Review comparison/i })).toHaveAttribute(
      'href',
      '/fund-model-results/123'
    );
    expect(
      within(trace).getByRole('link', { name: /Open performance breakdown/i })
    ).toHaveAttribute('href', '/performance');
    expect(within(trace).getByRole('link', { name: /Open reserve planning/i })).toHaveAttribute(
      'href',
      '/portfolio?tab=reserve-planning'
    );
    expect(within(trace).getByRole('link', { name: /Open sensitivity analysis/i })).toHaveAttribute(
      'href',
      '/sensitivity-analysis'
    );
    expect(within(trace).getByRole('link', { name: /Open forecasting/i })).toHaveAttribute(
      'href',
      '/forecasting?fundId=123'
    );
    expect(within(trace).getByRole('link', { name: /Open reports/i })).toHaveAttribute(
      'href',
      '/reports'
    );

    const statuses = within(trace)
      .getAllByTestId('analytics-trace-status')
      .map((status) => status.textContent);
    expect(statuses).toEqual(expect.arrayContaining(['Available', 'Linked', 'Deferred']));
    expect(within(trace).getByText('Deferred Parity Ledger')).toBeInTheDocument();
    expect(within(trace).getByText('MOIC distribution')).toBeInTheDocument();
    expect(within(trace).getByText('Founder benchmarking')).toBeInTheDocument();
  });

  it('hides drift when a metric is not marked drift-capable', async () => {
    const comparison = resultsComparisonResponse();
    comparison.metricDeltas[0] = {
      ...comparison.metricDeltas[0]!,
      previousValue: 0,
      percentageDelta: null,
      driftCapable: false,
      driftReason: 'zero_previous',
    };

    mockFundPageFetches({ comparison });
    await renderPage('/fund-model-results/123');

    const comparisonCard = await screen.findByTestId('publish-comparison-card');
    expect(within(comparisonCard).getByText('Fund Size')).toBeInTheDocument();
    expect(within(comparisonCard).getByText(/Drift unavailable/i)).toBeInTheDocument();
    expect(
      within(comparisonCard).getByText(/Previous value is zero, so percentage drift is unstable\./i)
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
        return Promise.resolve(
          jsonResponse(responses.shift() ?? calculatingResponse({ runId: 11 }))
        );
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
    expect(screen.getAllByText('Test Fund').length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(countFetches('/api/funds/123/results')).toBe(2);
    expect(screen.getAllByText('Test Fund').length).toBeGreaterThanOrEqual(1);
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

  // -- Plan 9 Wave 9B1: workspace row + scenario evidence drawer --

  it('keeps the workspace row mounted through loading and error states (review P3-7)', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/123');

    // Loading: hub navigation is already available.
    expect(screen.getByRole('status')).toBeInTheDocument();
    let nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    expect(within(nav).getByRole('link', { name: 'Summary' })).toHaveAttribute(
      'href',
      '/fund-model-results/123'
    );

    // Error: the failing spoke never removes the hub.
    await act(async () => {
      fetchDeferred.resolve(
        new Response(JSON.stringify({ error: 'Fund not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      await Promise.resolve();
    });

    // 9B2 narrow re-scope: the rollup repeats the failure cause, so pin the
    // alert region semantically (see the 404 error-state test).
    expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
    nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    expect(within(nav).getByRole('link', { name: 'Reserves' })).toHaveAttribute(
      'href',
      '/fund-model-results/123/moic-analysis'
    );
  });

  it('mounts the workspace row with Summary active and the construction-basis indicator', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    // Wait for the loaded surface (the loading-state row is replaced by the
    // fund-labeled row once results resolve).
    await screen.findByRole('heading', { level: 1, name: 'Test Fund' });
    const nav = screen.getByRole('navigation', { name: 'Fund workspace' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Summary',
      'Forecast',
      'Portfolio Actuals',
      'Reserves',
      'Scenarios',
      'Reports',
    ]);
    expect(within(nav).getByRole('link', { name: 'Summary' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Portfolio Actuals' })).toHaveAttribute(
      'href',
      '/portfolio?tab=reserve-planning&fundId=123'
    );
    expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/fund-model-results/123/reports'
    );
    expect(within(nav).getByText('Basis: Construction')).toBeInTheDocument();
  });

  // -- Plan 9 Wave 9B2: cross-surface readiness rollup (D-H) --

  it('mounts the readiness rollup as the dominant object directly under the workspace row', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    await screen.findByRole('heading', { level: 1, name: 'Test Fund' });
    const nav = screen.getByTestId('workspace-nav');
    const rollup = screen.getByTestId('fund-readiness-rollup');
    expect(nav.nextElementSibling).toBe(rollup);

    const scoped = within(rollup);
    expect(
      scoped.getByRole('heading', { level: 2, name: 'Readiness — what is blocked and where' })
    ).toBeInTheDocument();
    for (const key of ['forecast', 'portfolio-actuals', 'reserves', 'scenarios', 'reports']) {
      expect(scoped.getByTestId(`readiness-row-${key}`)).toBeInTheDocument();
    }
  });

  it('fails rollup rows closed on data-source errors and keeps the static Reports row honest', async () => {
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    // Wait for the loaded surface (the Scenarios row is a skeleton until the
    // page's own /results read resolves).
    await screen.findByRole('heading', { level: 1, name: 'Test Fund' });
    const rollup = within(screen.getByTestId('fund-readiness-rollup'));
    // The mocked hook failures read Facts unavailable with the short cause.
    expect(rollup.getByTestId('readiness-row-forecast-reason')).toHaveTextContent(
      'dual forecast unavailable'
    );
    expect(
      within(rollup.getByTestId('readiness-row-forecast')).getByText('Facts unavailable')
    ).toBeInTheDocument();
    // The Scenarios row derives from the page's own /results payload
    // (SCENARIOS_NONE_EXIST in the default fixture -> D-C empty copy).
    expect(rollup.getByTestId('readiness-row-scenarios-reason')).toHaveTextContent(
      'No scenario sets disclosed'
    );
    // Reports never claims export readiness from the Summary (pre-decision).
    const reportsRow = within(rollup.getByTestId('readiness-row-reports'));
    expect(reportsRow.getByText('Not verified')).toBeInTheDocument();
    expect(rollup.getByTestId('fund-readiness-rollup-blocked-count')).toHaveTextContent(
      '5 of 5 surfaces not actionable'
    );
  });

  it('reads calculated-current scenario sets as actionable when the inventory agrees (F1)', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    // F1 join: the actionable claim requires the scenario-set LIST to confirm
    // every active set is calculated.
    rollupHookMocks.scenarioSetList = {
      isSuccess: true,
      isError: false,
      data: [{ id: '00000000-0000-0000-0000-000000000111', archivedAt: null }],
      error: null,
    };
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await screen.findByRole('heading', { level: 1, name: 'Test Fund' });
    const rollup = within(screen.getByTestId('fund-readiness-rollup'));
    const scenariosRow = within(rollup.getByTestId('readiness-row-scenarios'));
    expect(scenariosRow.getByText('Actionable')).toBeInTheDocument();
    expect(scenariosRow.getByText('2026-05-26')).toBeInTheDocument();
  });

  it('caps calculated-current scenario sets at indicative when the inventory is unavailable (F1)', async () => {
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    // Default list mock is errored: completeness unprovable -> never actionable.
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    await screen.findByRole('heading', { level: 1, name: 'Test Fund' });
    const rollup = within(screen.getByTestId('fund-readiness-rollup'));
    const scenariosRow = within(rollup.getByTestId('readiness-row-scenarios'));
    expect(scenariosRow.queryByText('Actionable')).not.toBeInTheDocument();
    expect(rollup.getByTestId('readiness-row-scenarios-reason')).toHaveTextContent(
      'Scenario set inventory unavailable'
    );
  });

  it('keeps the rollup mounted with fallback rows through loading and error states', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/123');

    // Loading: the rollup is already the first section under the nav row.
    expect(screen.getByTestId('workspace-nav').nextElementSibling).toBe(
      screen.getByTestId('fund-readiness-rollup')
    );

    await act(async () => {
      fetchDeferred.resolve(
        new Response(JSON.stringify({ error: 'Fund not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/not found/i);
    const rollup = screen.getByTestId('fund-readiness-rollup');
    expect(screen.getByTestId('workspace-nav').nextElementSibling).toBe(rollup);
    // The failing spoke reads Facts unavailable in the Scenarios row, with
    // the short cause — the page never blanks its dominant object (D-C).
    expect(within(rollup).getByTestId('readiness-row-scenarios-reason')).toHaveTextContent(
      'Fund not found'
    );
  });

  it('opens the scenario evidence drawer with comparison evidence and restores focus on close', async () => {
    const user = userEvent.setup();
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    mockFundPageFetches({ results: resp });
    await renderPage('/fund-model-results/123');

    const trigger = await screen.findByTestId('scenario-evidence-trigger');
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Fee sensitivity' });
    await within(dialog).findByText('scenario_comparison');
    expect(within(dialog).getByText('CURRENT')).toBeInTheDocument();
    expect(within(dialog).getByText('Decision state')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Fee sensitivity' })).not.toBeInTheDocument()
    );
    expect(trigger).toHaveFocus();
  });

  it('shows the D-C empty copy in the drawer when no scenario comparisons are disclosed', async () => {
    const user = userEvent.setup();
    mockFundPageFetches();
    await renderPage('/fund-model-results/123');

    const trigger = await screen.findByTestId('scenario-evidence-trigger');
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Scenario comparison' });
    expect(within(dialog).getByText('No scenario comparisons disclosed')).toBeInTheDocument();
  });

  it('presents a failed comparison fetch as facts unavailable in the drawer, never blank', async () => {
    const user = userEvent.setup();
    const resp = readyResponse();
    resp.sections.scenarios = validScenariosSection();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/results')) return Promise.resolve(jsonResponse(resp));
      if (url.endsWith('/lifecycle-history'))
        return Promise.resolve(jsonResponse(lifecycleHistoryResponse()));
      if (url.endsWith('/results-comparison'))
        return Promise.resolve(jsonResponse(resultsComparisonResponse()));
      if (url.includes('/scenario-sets/') && url.endsWith('/comparison')) {
        return Promise.resolve(new Response('server error', { status: 500 }));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });
    await renderPage('/fund-model-results/123');

    const trigger = await screen.findByTestId('scenario-evidence-trigger');
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Scenario comparison' });
    await within(dialog).findByText('Facts unavailable', { selector: 'p' });
  });
});

// -- Helpers --

function formatEvidenceTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

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
      scenarios: {
        status: 'unavailable' as const,
        reason: 'No scenario sets exist for this fund',
        reasonCode: 'SCENARIOS_NONE_EXIST' as const,
      },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
      economics: {
        status: 'unavailable' as const,
        reason: 'GP economics is disabled',
        reasonCode: 'ECONOMICS_DISABLED' as const,
      },
    },
  };
}

function validEconomicsSection() {
  return {
    status: 'available' as const,
    source: 'fund_snapshots' as const,
    configVersion: 1,
    calculatedAt: '2026-03-20T12:30:00.000Z',
    payload: {
      version: 'v1' as const,
      annual: [
        {
          year: 1,
          lpCapitalCalls: 9_800_000,
          gpCommitmentCalls: 200_000,
          grossExitProceeds: 0,
          beginningCash: 0,
          investments: 8_000_000,
          feesPaidToManager: 2_000_000,
          expensesPaid: 0,
          recycledProceeds: 0,
          endingCash: 0,
          lpDistributions: 0,
          gpInvestmentDistributions: 0,
          gpCarryDistributed: 0,
          gpCarryEscrowed: 0,
          gpCarryReleasedFromEscrow: 0,
          clawbackPaid: 0,
          grossNav: 8_000_000,
          lpNetNav: 7_840_000,
          dpi: 0,
          rvpi: 0.8,
          tvpi: 0.8,
          conservationDelta: 0,
        },
      ],
      summary: {
        grossIrr: 0.2,
        lpNetIrr: 0.15,
        gpNetIrr: null,
        totalLpPaidIn: 9_800_000,
        totalGpCommitmentCalled: 200_000,
        totalManagementFees: 2_000_000,
        totalExpenses: 0,
        totalRecycled: 0,
        totalLpDistributions: 0,
        totalGpInvestmentDistributions: 0,
        totalGpCarryDistributed: 0,
        totalGpFeeIncome: 2_000_000,
        finalDpi: 0,
        finalRvpi: 0.8,
        finalTvpi: 0.8,
        finalClawbackDue: 0,
        maxEscrowAvailable: 0,
        netGpCarryAfterClawback: 0,
      },
      checks: {
        passed: true,
        tolerance: 0.01,
        errors: [],
      },
    },
  };
}

function secondScenariosSet() {
  const base = validScenariosSection().payload.sets[0]!;
  return {
    ...base,
    scenarioSetId: '00000000-0000-0000-0000-000000000222',
    name: 'Carry sensitivity',
    sourceConfigVersion: 5,
    variants: base.variants.map((variant) => ({
      ...variant,
      variantId: '00000000-0000-0000-0000-000000000223',
      name: 'Higher carry',
    })),
  };
}

function twoSetScenariosSection() {
  const section = validScenariosSection();
  return {
    ...section,
    payload: {
      ...section.payload,
      sets: [section.payload.sets[0]!, secondScenariosSet()],
    },
  };
}

function secondScenarioComparison(): FundScenarioComparisonV1 {
  const base = scenarioComparisonResponse();
  return {
    ...base,
    scenarioSet: {
      ...base.scenarioSet,
      scenarioSetId: '00000000-0000-0000-0000-000000000222',
      name: 'Carry sensitivity',
      sourceConfigVersion: 5,
    },
    variants: base.variants.map((variant) => ({
      ...variant,
      variantId: '00000000-0000-0000-0000-000000000223',
      name: 'Higher carry',
    })),
  };
}

function validScenariosSection() {
  return {
    status: 'available' as const,
    source: 'fund_snapshots' as const,
    calculatedAt: '2026-05-26T12:30:00.000Z',
    payload: {
      version: 'fund-scenarios-v1' as const,
      aggregateStaleness: 'CURRENT' as const,
      sets: [
        {
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          name: 'Fee sensitivity',
          sourceConfigId: 12,
          sourceConfigVersion: 4,
          calculatedAt: '2026-05-26T12:30:00.000Z',
          staleness: 'CURRENT' as const,
          variantCount: 1,
          variants: [
            {
              variantId: '00000000-0000-0000-0000-000000000112',
              name: 'Lower fee',
              overrideType: 'fee_profile' as const,
              economicsSummary: {
                grossIrr: 0.2,
                lpNetIrr: 0.15,
                gpNetIrr: null,
                totalLpPaidIn: 9_800_000,
                totalGpCommitmentCalled: 200_000,
                totalManagementFees: 2_000_000,
                totalExpenses: 0,
                totalRecycled: 0,
                totalLpDistributions: 14_000_000,
                totalGpInvestmentDistributions: 300_000,
                totalGpCarryDistributed: 500_000,
                totalGpFeeIncome: 2_000_000,
                finalDpi: 0.6,
                finalRvpi: 0.8,
                finalTvpi: 2.1,
                finalClawbackDue: 0,
                maxEscrowAvailable: 0,
                netGpCarryAfterClawback: 500_000,
              },
            },
          ],
        },
      ],
    },
  };
}

function scenarioComparisonResponse(): FundScenarioComparisonV1 {
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
  resp.lifecycle.calculationState.lastError = 'Worker timed out during reserve snapshot generation';
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
        driftCapable: true,
        driftReason: 'stable' as const,
      },
      {
        metric: 'reserveRatio' as const,
        displayName: 'Reserve Ratio',
        currentValue: 0.4,
        previousValue: 0.35,
        absoluteDelta: 0.05,
        percentageDelta: 14.2857142857,
        driftCapable: true,
        driftReason: 'stable' as const,
      },
      {
        metric: 'avgConfidence' as const,
        displayName: 'Average Confidence',
        currentValue: 0.85,
        previousValue: 0.8,
        absoluteDelta: 0.05,
        percentageDelta: 6.25,
        driftCapable: true,
        driftReason: 'stable' as const,
      },
      {
        metric: 'yearsToFullDeploy' as const,
        displayName: 'Years To Full Deploy',
        currentValue: 5,
        previousValue: 6,
        absoluteDelta: -1,
        percentageDelta: -16.6666666667,
        driftCapable: true,
        driftReason: 'stable' as const,
      },
    ],
  };
}
