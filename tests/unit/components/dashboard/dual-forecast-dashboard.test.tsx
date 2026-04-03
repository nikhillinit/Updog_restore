import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DualForecastDashboard from '@/components/dashboard/dual-forecast-dashboard';

type MockFundContext = {
  currentFund: { id: number; name: string } | null;
  isLoading: boolean;
  needsSetup: boolean;
};

let mockFundContext: MockFundContext = {
  currentFund: null,
  isLoading: false,
  needsSetup: true,
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

describe('DualForecastDashboard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockFundContext = {
      currentFund: null,
      isLoading: false,
      needsSetup: true,
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
});
