import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DualForecastDashboard from '@/components/dashboard/dual-forecast-dashboard';
import { DualForecastResponseSchema } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';

type MockFundContext = {
  currentFund: { id: number; name: string } | null;
  isLoading: boolean;
  needsSetup: boolean;
  isDemoMode: boolean;
};

let mockFundContext: MockFundContext = {
  currentFund: null,
  isLoading: false,
  needsSetup: true,
  isDemoMode: false,
};

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockFundContext,
}));

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const response = await fetch(queryKey.join('/') as string, { credentials: 'include' });
          if (!response.ok) {
            throw new Error(`${response.status}: ${response.statusText}`);
          }
          return response.json();
        },
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DualForecastDashboard />
    </QueryClientProvider>
  );
}

function makeDashboardSummary() {
  return {
    fund: {
      id: 42,
      name: 'Fund Forty Two',
      size: '20000000',
      deployedCapital: '5000000',
      managementFee: '2',
      carryPercentage: '20',
      vintageYear: 2024,
      status: 'active',
    },
    portfolioCompanies: [
      {
        id: 1,
        name: 'Northstar AI',
        sector: 'AI',
        stage: 'Seed',
        investmentAmount: '2500000',
        currentValuation: '7000000',
        foundedYear: 2021,
        status: 'active',
        description: null,
      },
    ],
    recentActivities: [],
    metrics: {
      totalValue: '7000000',
      irr: '0.18',
      multiple: '2.8',
      dpi: '0',
      tvpi: '2.8',
      asOfDate: '2026-04-01T00:00:00.000Z',
      createdAt: '2026-04-02T00:00:00.000Z',
    },
    summary: {
      totalCompanies: 1,
      deploymentRate: 25,
      currentIRR: 0.18,
    },
    evidence: {
      fundId: 42,
      sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
      readModel: 'dashboard-summary-read-service',
      generatedAt: '2026-04-02T00:00:00.000Z',
      kpis: {
        currentAum: {
          source: 'fund_metrics.totalvalue',
          sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
          readModel: 'dashboard-summary-read-service',
          fundId: 42,
          asOfDate: '2026-04-01T00:00:00.000Z',
          calculatedAt: '2026-04-02T00:00:00.000Z',
          freshness: 'timestamped',
          status: 'available',
          note: 'Dashboard summary value from the latest fund_metrics row.',
        },
        irr: {
          source: 'fund_metrics.irr',
          sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
          readModel: 'dashboard-summary-read-service',
          fundId: 42,
          asOfDate: '2026-04-01T00:00:00.000Z',
          calculatedAt: '2026-04-02T00:00:00.000Z',
          freshness: 'timestamped',
          status: 'unverified',
          note: 'Unverified dashboard metric; not authoritative IRR/XIRR.',
        },
        portfolioCompanies: {
          source: 'storage.getPortfolioCompanies.count',
          sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
          readModel: 'dashboard-summary-read-service',
          fundId: 42,
          asOfDate: null,
          calculatedAt: null,
          freshness: 'timestamp_unavailable',
          status: 'available',
          note: 'Count is scoped to the requested fund in the dashboard summary read model.',
        },
        deployment: {
          source: 'funds.deployed_capital / funds.size',
          sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
          readModel: 'dashboard-summary-read-service',
          fundId: 42,
          asOfDate: null,
          calculatedAt: null,
          freshness: 'timestamp_unavailable',
          status: 'available',
          note: 'Deployment is derived from the fund row; this read model has no fund updated timestamp.',
        },
      },
      portfolioAllocation: {
        source: 'storage.getPortfolioCompanies',
        sourceTable: 'portfoliocompanies',
        sourceEndpoint: 'GET /api/dashboard-summary/:fundId',
        readModel: 'dashboard-summary-read-service',
        fundId: 42,
        companyCount: 1,
        valuedCompanyCount: 1,
        valuationFreshness: {
          status: 'unavailable',
          reason:
            'Legacy portfolio company rows do not include valuation timestamps; valuation freshness is unavailable until valuation marks feed this read model.',
        },
      },
    },
  };
}

function makeDualForecast() {
  return {
    fundId: 42,
    fundName: 'Fund Forty Two',
    asOfDate: '2026-04-01T00:00:00.000Z',
    series: [
      {
        quarterIndex: 0,
        label: 'As of',
        date: '2026-04-01T00:00:00.000Z',
        construction: {
          nav: 6_000_000,
          calledCapital: 5_000_000,
          distributions: 0,
          tvpi: 1.2,
          dpi: 0,
          rvpi: 1.2,
          irr: 0.2,
        },
        actual: {
          nav: 7_000_000,
          calledCapital: 5_000_000,
          distributions: 0,
          tvpi: 1.4,
          dpi: 0,
          rvpi: 1.4,
          irr: 0.18,
        },
        currentMode: 'actual',
        current: {
          nav: 7_000_000,
          calledCapital: 5_000_000,
          distributions: 0,
          tvpi: 1.4,
          dpi: 0,
          rvpi: 1.4,
          irr: 0.18,
        },
        variance: {
          nav: 1_000_000,
          calledCapital: 0,
          distributions: 0,
          tvpi: 0.2,
          dpi: 0,
          rvpi: 0.2,
          irr: -0.02,
        },
      },
      {
        quarterIndex: 1,
        label: 'Q2 2026',
        date: '2026-07-01T00:00:00.000Z',
        construction: {
          nav: 8_000_000,
          calledCapital: 7_000_000,
          distributions: 0,
          tvpi: 1.14,
          dpi: 0,
          rvpi: 1.14,
          irr: 0.2,
        },
        actual: null,
        currentMode: 'forecast',
        current: {
          nav: 9_000_000,
          calledCapital: 7_500_000,
          distributions: 500_000,
          tvpi: 1.27,
          dpi: 0.07,
          rvpi: 1.2,
          irr: 0.18,
        },
        variance: {
          nav: 1_000_000,
          calledCapital: 500_000,
          distributions: 500_000,
          tvpi: 0.13,
          dpi: 0.07,
          rvpi: 0.06,
          irr: -0.02,
        },
      },
      {
        quarterIndex: 2,
        label: 'Q3 2026',
        date: '2026-10-01T00:00:00.000Z',
        construction: {
          nav: 40_000_000,
          calledCapital: 25_000_000,
          distributions: 0,
          tvpi: null,
          dpi: null,
          rvpi: null,
          irr: null,
        },
        actual: null,
        currentMode: 'forecast',
        current: {
          nav: 38_000_000,
          calledCapital: 26_000_000,
          distributions: 0,
          tvpi: null,
          dpi: null,
          rvpi: null,
          irr: null,
        },
        variance: {
          nav: -2_000_000,
          calledCapital: 1_000_000,
          distributions: 0,
          tvpi: null,
          dpi: null,
          rvpi: null,
          irr: null,
        },
      },
      {
        quarterIndex: 3,
        label: 'Q4 2026',
        date: '2027-01-01T00:00:00.000Z',
        construction: {
          nav: 59_000_000,
          calledCapital: 34_000_000,
          distributions: 0,
          tvpi: null,
          dpi: null,
          rvpi: null,
          irr: null,
        },
        actual: null,
        currentMode: 'forecast',
        current: {
          nav: 51_000_000,
          calledCapital: 39_000_000,
          distributions: 0,
          tvpi: null,
          dpi: null,
          rvpi: null,
          irr: null,
        },
        variance: {
          nav: -8_000_000,
          calledCapital: 5_000_000,
          distributions: 0,
          tvpi: null,
          dpi: null,
          rvpi: null,
          irr: null,
        },
      },
    ],
    sources: {
      construction: 'construction_forecast_jcurve',
      current: 'projected_metrics_calculator',
      actual: 'actual_metrics_calculator',
    },
    config: {
      source: 'published',
      version: 2,
      publishedAt: '2026-03-01T00:00:00.000Z',
      fallbackReason: null,
    },
    actualsFacts: null,
    navAnchoring: null,
    currentProjection: { status: 'projected', fallbackReason: null },
    warnings: [],
  };
}

const POPULATED_INPUT_HASH = 'a1b2c3d4'.repeat(8);

function makeFactsCompany(overrides: Record<string, unknown>) {
  return {
    planningFmvStatus: 'active',
    currency: 'USD',
    currencyStatus: 'base_currency',
    activeRoundIds: [],
    supersedeLineage: [],
    latestRoundDate: null,
    latestRoundValuation: null,
    latestPlanningFmvDate: null,
    latestPlanningFmvValue: null,
    warnings: [],
    ...overrides,
  };
}

function makePopulatedDualForecast() {
  return {
    ...makeDualForecast(),
    actualsFacts: {
      asOfDate: '2026-07-01',
      generatedAt: '2026-07-01T00:00:00.000Z',
      inputHash: POPULATED_INPUT_HASH,
      companies: [
        makeFactsCompany({ companyId: 1, companyName: 'Northstar AI', trustState: 'LIVE' }),
        makeFactsCompany({
          companyId: 2,
          companyName: 'Beta Health',
          trustState: 'PARTIAL',
          planningFmvStatus: 'none',
          warnings: [
            {
              code: 'PLANNING_FMV_MISSING',
              severity: 'warning',
              message: 'Planning FMV mark missing; descended to recorded valuation.',
            },
          ],
        }),
        makeFactsCompany({
          companyId: 5,
          companyName: 'Epsilon Labs',
          trustState: 'PARTIAL',
          planningFmvStatus: 'stale',
          warnings: [
            {
              code: 'PLANNING_FMV_STALE',
              severity: 'warning',
              message: 'Planning FMV mark is past its freshness window.',
            },
          ],
        }),
        makeFactsCompany({
          companyId: 3,
          companyName: 'Gamma Robotics',
          trustState: 'UNAVAILABLE',
          currency: 'EUR',
          currencyStatus: 'mismatch_blocked',
          activeRoundIds: [7],
          supersedeLineage: [{ roundId: 7, supersedesRoundId: null }],
          warnings: [
            {
              code: 'CURRENCY_MISMATCH_BLOCK',
              severity: 'blocking',
              message: 'EUR valuation blocked pending currency normalization.',
            },
          ],
        }),
      ],
      warnings: [],
    },
    navAnchoring: {
      blendedNav: '47500000',
      countsByTrustState: { LIVE: 1, PARTIAL: 2, UNAVAILABLE: 1, FAILED: 0 },
      companies: [
        {
          companyId: 1,
          companyName: 'Northstar AI',
          inNavUniverse: true,
          trustState: 'LIVE',
          anchor: 'planning_fmv',
          contribution: '13200000',
        },
        {
          companyId: 2,
          companyName: 'Beta Health',
          inNavUniverse: true,
          trustState: 'PARTIAL',
          anchor: 'legacy_current_valuation',
          contribution: '7000000',
        },
        {
          companyId: 5,
          companyName: 'Epsilon Labs',
          inNavUniverse: true,
          trustState: 'PARTIAL',
          anchor: 'planning_fmv_stale',
          contribution: '5000000',
        },
        {
          companyId: 3,
          companyName: 'Gamma Robotics',
          inNavUniverse: true,
          trustState: 'UNAVAILABLE',
          anchor: 'legacy_current_valuation',
          contribution: '4000000',
        },
        {
          companyId: 6,
          companyName: 'Zeta NoFacts',
          inNavUniverse: true,
          trustState: null,
          anchor: 'legacy_current_valuation',
          contribution: '2000000',
        },
        {
          companyId: 7,
          companyName: 'Omega Exited',
          inNavUniverse: false,
          trustState: null,
          anchor: null,
          contribution: null,
        },
      ],
    },
  };
}

function setActiveFundContext() {
  mockFundContext = {
    currentFund: { id: 42, name: 'Fund Forty Two' },
    isLoading: false,
    needsSetup: false,
    isDemoMode: false,
  };
}

function stubFetch(options: {
  summary?: { body?: unknown; status?: number };
  forecast?: { body?: unknown; status?: number };
}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('/api/dashboard-summary/42')) {
      const status = options.summary?.status ?? 200;
      return new Response(
        status === 200 ? JSON.stringify(options.summary?.body ?? makeDashboardSummary()) : 'error',
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/api/funds/42/dual-forecast')) {
      const status = options.forecast?.status ?? 200;
      return new Response(
        status === 200 ? JSON.stringify(options.forecast?.body ?? makeDualForecast()) : 'error',
        { status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('not found', { status: 404, statusText: 'Not Found' });
  });
}

describe('DualForecastDashboard', () => {
  it('uses fixtures that satisfy the response contract (fixture guard)', () => {
    const fixture = makeDualForecast();
    expect(DualForecastResponseSchema.parse(fixture)).toEqual(fixture);
    const populated = makePopulatedDualForecast();
    expect(DualForecastResponseSchema.parse(populated)).toEqual(populated);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockFundContext = {
      currentFund: null,
      isLoading: false,
      needsSetup: true,
      isDemoMode: false,
    };
  });

  it('does not fetch a hardcoded fund when there is no active fund context', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderWithQueryClient();

    expect(
      screen.getByText(/select or create a fund to view forecasting data/i)
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scopes requests to the active fund id', async () => {
    mockFundContext = {
      currentFund: { id: 42, name: 'Fund Forty Two' },
      isLoading: false,
      needsSetup: false,
      isDemoMode: false,
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response('server error', { status: 500, statusText: 'Server Error' })
      );

    renderWithQueryClient();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/dashboard-summary/42', {
        credentials: 'include',
      });
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/funds/42/dual-forecast', {
      credentials: 'include',
    });
  });

  it('does not fetch deterministic forecasting data when fund context is demo mode', () => {
    mockFundContext = {
      currentFund: null,
      isLoading: false,
      needsSetup: false,
      isDemoMode: true,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderWithQueryClient();

    expect(screen.getByText(/forecasting unavailable in demo mode/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('labels legacy valuations honestly and keeps drift callouts server-driven', async () => {
    setActiveFundContext();
    stubFetch({});

    renderWithQueryClient();

    expect(await screen.findByText('Dashboard IRR')).toBeInTheDocument();
    expect(
      screen.getByText(/fund_metrics\.totalvalue · fund 42 · as of 2026-04-01/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/fund_metrics\.irr · fund 42 · as of 2026-04-01/i)).toBeInTheDocument();
    expect(screen.getByText(/not authoritative IRR\/XIRR/i)).toBeInTheDocument();
    expect(
      screen.getByText(/storage\.getPortfolioCompanies\.count · fund 42 · timestamp unavailable/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/funds\.deployed_capital \/ funds\.size · fund 42 · timestamp unavailable/i)
    ).toBeInTheDocument();

    // CP2 (D4): the Portfolio Allocation surfaces stopped claiming "actuals" —
    // currentValuation is ADR-029's un-provenanced legacy rung.
    expect(await screen.findByText('Recorded valuations')).toBeInTheDocument();
    expect(
      screen.getByText(/recorded \(unverified\) valuation vs invested capital/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('API actuals')).toBeNull();
    expect(screen.getByText(/quarterly nav comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/cumulative called capital by quarter/i)).toBeInTheDocument();
    expect(screen.queryByText('Live Data')).toBeNull();
    expect(screen.queryByText('Real-time')).toBeNull();
    const allocationEvidence = screen.getByRole('note', {
      name: /portfolio allocation evidence/i,
    });
    expect(allocationEvidence).toHaveTextContent(
      'Source: storage.getPortfolioCompanies · fund 42 · 1 companies · 1 valued'
    );
    expect(allocationEvidence).toHaveTextContent('Valuation freshness unavailable');
    expect(allocationEvidence).toHaveTextContent('dashboard-summary-read-service');

    // Drift callouts: Q4 2026 is the latest forecast point with meaningful variance
    const navSummary = await screen.findByLabelText('Forecast drift summary');
    expect(navSummary).toHaveTextContent('Q4 2026 NAV drift');
    expect(navSummary).toHaveTextContent('-$8M');
    expect(navSummary).toHaveTextContent('Current forecast is 13.6% below construction plan.');

    const calledSummary = screen.getByLabelText('Called capital drift summary');
    expect(calledSummary).toHaveTextContent('Q4 2026 called capital drift');
    expect(calledSummary).toHaveTextContent('+$5M');
    expect(calledSummary).toHaveTextContent('Current forecast is 14.7% above construction plan.');
  });

  it('discloses the unblended state when the facts blocks are null (ADR-028: render never blocks)', async () => {
    setActiveFundContext();
    stubFetch({});

    renderWithQueryClient();

    expect(await screen.findByText('Verified actuals unavailable')).toBeInTheDocument();
    expect(screen.getByText('Fund Value Forecast')).toBeInTheDocument();
    // No attribution card without a navAnchoring universe
    expect(screen.queryByText('NAV Attribution')).toBeNull();
  });

  it('renders the blended NAV figure and trust-count chips from navAnchoring', async () => {
    setActiveFundContext();
    stubFetch({ forecast: { body: makePopulatedDualForecast() } });

    renderWithQueryClient();

    expect(await screen.findByText('$48M')).toBeInTheDocument();
    expect(screen.getByText('Blended NAV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter to 1 live companies' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Filter to 2 partial companies' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Filter to 1 unavailable companies' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Filter to 0 failed companies' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Filter to 2 no facts companies' })).toBeEnabled();
  });

  it('chip click filters the attribution table by trust state and click-again clears', async () => {
    setActiveFundContext();
    stubFetch({ forecast: { body: makePopulatedDualForecast() } });

    renderWithQueryClient();

    const partialChip = await screen.findByRole('button', {
      name: 'Filter to 2 partial companies',
    });
    expect(partialChip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(partialChip);
    expect(partialChip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/showing 2 of 6 companies/i)).toBeInTheDocument();
    expect(screen.getAllByText('Beta Health').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Epsilon Labs').length).toBeGreaterThan(0);
    expect(screen.queryByText('Northstar AI')).toBeNull();

    fireEvent.click(partialChip);
    expect(partialChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/showing 2 of 6 companies/i)).toBeNull();
    expect(screen.getAllByText('Northstar AI').length).toBeGreaterThan(0);
  });

  it('discloses the full universe: no-facts and exited rows are present and labeled', async () => {
    setActiveFundContext();
    stubFetch({ forecast: { body: makePopulatedDualForecast() } });

    renderWithQueryClient();

    expect(await screen.findByText('NAV Attribution')).toBeInTheDocument();
    expect(screen.getAllByText('Zeta NoFacts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Omega Exited').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Exited — not in NAV universe').length).toBeGreaterThan(0);
    // Freshness line: asOfDate + 8-char inputHash prefix
    expect(
      screen.getByText(`Facts as of 2026-07-01 · input ${POPULATED_INPUT_HASH.slice(0, 8)}`)
    ).toBeInTheDocument();
  });

  it('shows the degraded-projection notice with the server reason', async () => {
    setActiveFundContext();
    const payload = {
      ...makePopulatedDualForecast(),
      currentProjection: {
        status: 'fallback_default',
        fallbackReason: 'projection engine timeout',
      },
    };
    stubFetch({ forecast: { body: payload } });

    renderWithQueryClient();

    expect(
      await screen.findByText('Current-forecast quarters are using default projections')
    ).toBeInTheDocument();
    expect(screen.getByText(/reason: projection engine timeout/i)).toBeInTheDocument();
  });

  it('shows fallback copy for a null fallbackReason without rendering the word null', async () => {
    setActiveFundContext();
    const payload = {
      ...makePopulatedDualForecast(),
      currentProjection: { status: 'fallback_default', fallbackReason: null },
    };
    stubFetch({ forecast: { body: payload } });

    renderWithQueryClient();

    expect(
      await screen.findByText('Current-forecast quarters are using default projections')
    ).toBeInTheDocument();
    expect(screen.getByText(/no further detail was reported/i)).toBeInTheDocument();
    expect(screen.queryByText(/reason: null/i)).toBeNull();
  });

  it('renders the empty-universe copy for a fund with no NAV companies', async () => {
    setActiveFundContext();
    const populated = makePopulatedDualForecast();
    const payload = {
      ...populated,
      actualsFacts: { ...populated.actualsFacts, companies: [] },
      navAnchoring: {
        blendedNav: '0',
        countsByTrustState: { LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0 },
        companies: [],
      },
    };
    stubFetch({ forecast: { body: payload } });

    renderWithQueryClient();

    expect(
      await screen.findByText(
        'No portfolio companies in the NAV universe yet. Trust attribution appears once companies are added.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter to 0 live companies' })).toBeDisabled();
  });

  it('summary failure degrades header cards and allocation behind one notice; forecast stays live (CP1)', async () => {
    setActiveFundContext();
    stubFetch({
      summary: { status: 500 },
      forecast: { body: makePopulatedDualForecast() },
    });

    renderWithQueryClient();

    expect(await screen.findByText('Fund summary unavailable')).toBeInTheDocument();
    expect(await screen.findByText('Fund Value Forecast')).toBeInTheDocument();
    expect(screen.getByText('$48M')).toBeInTheDocument();
    expect(screen.queryByText('Portfolio Allocation')).toBeNull();
    expect(screen.queryByText('Current AUM')).toBeNull();
    expect(screen.queryByText('Unable to load forecast data')).toBeNull();
  });

  it('forecast failure blocks only the forecast region; allocation stays live (CP1)', async () => {
    setActiveFundContext();
    stubFetch({ forecast: { status: 500 } });

    renderWithQueryClient();

    // useDualForecast retries 3 times with exponential backoff (~7s) before
    // surfacing the error — the wait must outlast it.
    expect(
      await screen.findByText('Unable to load forecast data', {}, { timeout: 12_000 })
    ).toBeInTheDocument();
    expect(await screen.findByText('Portfolio Allocation')).toBeInTheDocument();
    expect(screen.getByText('Current AUM')).toBeInTheDocument();
    expect(screen.queryByText('Fund summary unavailable')).toBeNull();
    expect(screen.queryByText('Fund Value Forecast')).toBeNull();
    expect(screen.queryByText('Capital Deployment Forecast')).toBeNull();
  }, 20_000);
});
