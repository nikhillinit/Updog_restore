import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useOneWayRun, useSensitivityHistory } from '@/hooks/useSensitivityRuns';
import type {
  OneWayAnalysisRequestV1,
  OneWayAnalysisResultV1,
  SensitivityRunV1,
} from '@shared/contracts/sensitivity-run-v1.contract';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

function makeRunRecord(): SensitivityRunV1 {
  return {
    id: 42,
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
    createdAt: '2026-04-06T00:00:00.000Z',
    completedAt: '2026-04-06T00:00:01.000Z',
    durationMs: 1000,
    errorCode: null,
    errorMessage: null,
  };
}

function makeResult(): OneWayAnalysisResultV1 {
  return {
    variableId: 'reserve_pool_pct',
    metricId: 'tvpi',
    baselineValue: 2.4,
    datapoints: [
      { variableValue: 0, metricValue: 2.0 },
      { variableValue: 0.5, metricValue: 2.8 },
    ],
    summary: { minMetric: 2.0, maxMetric: 2.8, range: 0.8 },
    computedAt: '2026-04-06T00:00:01.000Z',
  };
}

const baseRequest: OneWayAnalysisRequestV1 = {
  variableId: 'reserve_pool_pct',
  range: { min: 0, max: 0.5 },
  steps: 11,
  metricId: 'tvpi',
};

describe('useOneWayRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/funds/:id/sensitivity/one-way with the request body', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ run: makeRunRecord(), result: makeResult() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOneWayRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/sensitivity/one-way');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual(baseRequest);
    expect(result.current.data?.result.baselineValue).toBe(2.4);
  });

  it('parses { code, message } off non-OK responses and exposes status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'NO_PUBLISHED_CONFIG', message: 'no published config' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOneWayRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeTruthy();
    expect(err?.code).toBe('NO_PUBLISHED_CONFIG');
    expect(err?.status).toBe(409);
    expect(err?.message).toBe('no published config');
  });

  it('throws synchronously when fundId is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useOneWayRun(null), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toMatch(/fundId is required/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('invalidates the one_way history query on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ run: makeRunRecord(), result: makeResult() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useOneWayRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['sensitivity-runs', 7, 'one_way'],
    });
  });
});

describe('useSensitivityHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes kind and limit as query parameters when provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runs: [makeRunRecord()] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensitivityHistory(7, 'one_way', 5), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain('/api/funds/7/sensitivity/runs?');
    expect(url).toContain('limit=5');
    expect(url).toContain('kind=one_way');
  });

  it('omits the kind parameter when undefined', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runs: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensitivityHistory(7), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).not.toContain('kind=');
    expect(url).toContain('limit=10');
  });

  it('does not fetch when fundId is null', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSensitivityHistory(null, 'one_way'), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
