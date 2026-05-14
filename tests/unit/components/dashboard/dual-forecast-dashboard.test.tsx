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
      .mockResolvedValue(new Response('server error', { status: 500, statusText: 'Server Error' }));

    renderWithQueryClient();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/dashboard-summary/42', {
        credentials: 'include',
      });
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/fund-metrics/42', { credentials: 'include' });
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

      if (url.includes('/api/fund-metrics/42')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('not found', { status: 404, statusText: 'Not Found' });
    });

    renderWithQueryClient();

    expect(await screen.findByText('Projected scenario')).toBeInTheDocument();
    expect(screen.getByText('API actuals')).toBeInTheDocument();
    expect(screen.getByText(/projection, not actuals/i)).toBeInTheDocument();
    expect(screen.getByText(/flat monthly deployment assumption/i)).toBeInTheDocument();
    expect(screen.queryByText('Live Data')).toBeNull();
    expect(screen.queryByText('Real-time')).toBeNull();
  });
});
