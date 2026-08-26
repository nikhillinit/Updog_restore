import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useActualMetrics,
  useFundMetrics,
  useProjectedMetrics,
  useTargetMetrics,
} from '@/hooks/useFundMetrics';

const { mockUseFundContext } = vi.hoisted(() => ({
  mockUseFundContext: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockUseFundContext(),
}));

const unifiedMetrics = {
  fundId: 7,
  fundName: 'Truth Fund I',
  actual: {
    totalDeployed: 12_000_000,
    currentNAV: 40_000_000,
  },
  projected: {
    expectedTVPI: 2.5,
  },
  target: {
    targetTVPI: 2.5,
  },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

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

describe('useFundMetrics', () => {
  beforeEach(() => {
    mockUseFundContext.mockReturnValue({ fundId: 7 });
    mockFetchJson(unifiedMetrics);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch when there is no fund id', async () => {
    mockUseFundContext.mockReturnValue({ fundId: null });

    renderHook(() => useFundMetrics(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the fund metrics endpoint with skipProjections when requested', async () => {
    const { result } = renderHook(() => useFundMetrics({ skipProjections: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith('/api/funds/7/metrics?skipProjections=true');
    expect(result.current.data).toEqual(unifiedMetrics);
  });

  it('keeps fund id and skipProjections in the query cache identity', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useFundMetrics({ skipProjections: true }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(['fund-metrics', 7, { skipProjections: true }])).toEqual(
      unifiedMetrics
    );
  });

  it('surfaces API error messages', async () => {
    mockFetchJson({ message: 'Metrics unavailable' }, false);

    const { result } = renderHook(() => useFundMetrics({ retry: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Metrics unavailable');
  });

  it('selector helpers preserve the underlying fund metrics contract', async () => {
    const actual = renderHook(() => useActualMetrics(), { wrapper: createWrapper() });
    const projected = renderHook(() => useProjectedMetrics(), { wrapper: createWrapper() });
    const target = renderHook(() => useTargetMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(actual.result.current.data).toBe(unifiedMetrics.actual));
    await waitFor(() => expect(projected.result.current.data).toBe(unifiedMetrics.projected));
    await waitFor(() => expect(target.result.current.data).toBe(unifiedMetrics.target));

    expect(fetch).toHaveBeenCalledWith('/api/funds/7/metrics?skipProjections=true');
    expect(fetch).toHaveBeenCalledWith('/api/funds/7/metrics');
  });
});
