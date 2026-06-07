import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DualForecastDashboard from '@/components/dashboard/dual-forecast-dashboard';

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
    },
    summary: {
      totalCompanies: 1,
      deploymentRate: 25,
      currentIRR: 0.18,
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
    warnings: [],
  };
}

describe('DualForecastDashboard', () => {
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

  it('labels forward-looking forecast outputs separately from API actuals', async () => {
    mockFundContext = {
      currentFund: { id: 42, name: 'Fund Forty Two' },
      isLoading: false,
      needsSetup: false,
      isDemoMode: false,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/dashboard-summary/42')) {
        return new Response(JSON.stringify(makeDashboardSummary()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/funds/42/dual-forecast')) {
        return new Response(JSON.stringify(makeDualForecast()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' });
    });

    renderWithQueryClient();

    expect(await screen.findAllByText('Construction Plan')).not.toHaveLength(0);
    expect(screen.getAllByText('Current Forecast')).not.toHaveLength(0);
    expect(screen.getAllByText('Actuals')).not.toHaveLength(0);
    expect(screen.getByText('API actuals')).toBeInTheDocument();
    expect(screen.getByText(/quarterly nav comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/cumulative called capital by quarter/i)).toBeInTheDocument();
    expect(screen.queryByText('Live Data')).toBeNull();
    expect(screen.queryByText('Real-time')).toBeNull();

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
});
