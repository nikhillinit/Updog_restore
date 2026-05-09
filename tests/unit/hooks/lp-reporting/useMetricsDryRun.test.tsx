/**
 * LP Reporting -- useMetricsDryRun hook tests.
 *
 * MSW-style fetch stubbing (mirrors `useSensitivityRuns.test.tsx`):
 * - Happy path: hook returns the parsed `LpMetricRunResults` shape.
 * - 401 path: hook surfaces the typed error envelope with status +
 *   code from the server response body.
 * - Synchronous null fundId: the mutation rejects without making a
 *   network call.
 * - Contract drift: parse failure surfaces `code = 'CONTRACT_PARSE_ERROR'`.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useMetricsDryRun } from '@/hooks/lp-reporting';
import type { MetricsDryRunRequest } from '@/hooks/lp-reporting';
import type { LpMetricRunResults } from '@shared/contracts/lp-reporting';

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
        convergence: 'converged',
        iterations: 4,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
    },
    contributionsTotal: '50000000',
    distributionsTotal: '22500000',
    currentNav: '62500000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

const baseRequest: MetricsDryRunRequest = {
  asOfDate: '2026-03-31',
  perspective: 'lp_net',
};

describe('useMetricsDryRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/funds/:id/metric-runs/dry-run and parses the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeCanonicalResults()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/dry-run');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual(baseRequest);

    expect(result.current.data?.tvpi).toBe('1.700000');
    expect(result.current.data?.xirrDiagnostic.net.convergence).toBe('converged');
    expect(result.current.data?.markConfidenceMix.high).toBe(8);
  });

  it('surfaces a typed error envelope on 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeTruthy();
    expect(err?.code).toBe('UNAUTHORIZED');
    expect(err?.status).toBe(401);
    expect(err?.message).toBe('Not authenticated');
  });

  it('rejects synchronously when fundId is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(null), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toMatch(/fundId is required/);
    expect(result.current.error?.code).toBe('MISSING_FUND_ID');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags contract drift with code=CONTRACT_PARSE_ERROR when the response is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ asOfDate: 'not-a-date' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });
});
