import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDualForecast } from '@/hooks/useDualForecast';
import { DualForecastResponseSchema } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';

const factsWarning = {
  code: 'PLANNING_FMV_MISSING',
  severity: 'warning',
  message: 'No approved planning FMV mark is available for this company.',
  source: 'company:10',
};

const dualForecast = {
  fundId: 7,
  fundName: 'Truth Fund I',
  asOfDate: '2026-04-01T00:00:00.000Z',
  series: [
    {
      quarterIndex: 0,
      label: 'As of',
      date: '2026-04-01T00:00:00.000Z',
      construction: {
        nav: 10_000_000,
        calledCapital: 5_000_000,
        distributions: 0,
        tvpi: 2,
        dpi: 0,
        rvpi: 2,
        irr: 0.2,
      },
      actual: {
        nav: 9_000_000,
        calledCapital: 5_000_000,
        distributions: 0,
        tvpi: 1.8,
        dpi: 0,
        rvpi: 1.8,
        irr: 0.18,
      },
      currentMode: 'actual',
      current: {
        nav: 9_000_000,
        calledCapital: 5_000_000,
        distributions: 0,
        tvpi: 1.8,
        dpi: 0,
        rvpi: 1.8,
        irr: 0.18,
      },
      variance: {
        nav: -1_000_000,
        calledCapital: 0,
        distributions: 0,
        tvpi: -0.2,
        dpi: 0,
        rvpi: -0.2,
        irr: -0.02,
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
  actualsFacts: {
    asOfDate: '2026-04-01',
    generatedAt: '2026-04-01T00:00:00.000Z',
    inputHash: 'a1'.repeat(32),
    companies: [
      {
        companyId: 10,
        companyName: 'Northstar AI',
        trustState: 'PARTIAL',
        planningFmvStatus: 'none',
        currency: 'USD',
        currencyStatus: 'base_currency',
        latestRoundDate: '2026-01-15',
        latestRoundValuation: '120000000.000000',
        latestPlanningFmvDate: null,
        latestPlanningFmvValue: null,
        warnings: [factsWarning],
      },
    ],
    warnings: [factsWarning],
  },
  navAnchoring: {
    blendedNav: '9000000.000000',
    countsByTrustState: { LIVE: 0, PARTIAL: 1, UNAVAILABLE: 0, FAILED: 0 },
    companies: [
      {
        companyId: 10,
        companyName: 'Northstar AI',
        inNavUniverse: true,
        trustState: 'PARTIAL',
        anchor: 'legacy_current_valuation',
        contribution: '9000000.000000',
      },
    ],
  },
  currentProjection: { status: 'projected', fallbackReason: null },
  warnings: [],
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient = createQueryClient()) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function mockFetchJson(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: vi.fn().mockResolvedValue(payload),
    })
  );
}

describe('useDualForecast', () => {
  beforeEach(() => {
    mockFetchJson(dualForecast);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch when there is no fund id', async () => {
    renderHook(() => useDualForecast(null), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the dual forecast endpoint with credentials', async () => {
    const { result } = renderHook(() => useDualForecast(7), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith('/api/funds/7/dual-forecast', {
      credentials: 'include',
    });
    expect(result.current.data).toEqual(dualForecast);
  });

  it('keeps the fund id in the query cache identity', async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDualForecast(7), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(['dual-forecast', 7])).toEqual(dualForecast);
  });

  it('uses a fixture that satisfies the response contract (fixture guard)', () => {
    expect(DualForecastResponseSchema.parse(dualForecast)).toEqual(dualForecast);
  });

  it('surfaces a contract-invalid payload as a query error instead of caching it', async () => {
    mockFetchJson({ ...dualForecast, fundId: 'twelve' });

    const { result } = renderHook(() => useDualForecast(7, { retry: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('surfaces API error messages', async () => {
    mockFetchJson({ message: 'Forecast unavailable' }, false);

    const { result } = renderHook(() => useDualForecast(7, { retry: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Forecast unavailable');
  });
});
