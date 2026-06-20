import React, { type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFundMoicRankings } from '../../../client/src/hooks/use-moic';
import type { FundMoicRankingsResponseV1 } from '../../../shared/contracts/fund-moic-v1.contract';

function makeRankingsResponse(fundId: number): FundMoicRankingsResponseV1 {
  return {
    fundId,
    provenance: {
      source: 'portfolio_companies',
      calculation: 'reserves_moic_rankings',
      metricBasis: 'planned_reserves',
      sourceRecordCount: 2,
    },
    generatedAt: '2026-06-07T00:00:00.000Z',
    rankings: [
      {
        rank: 1,
        investmentId: '101',
        investmentName: 'Acme Corp',
        reservesMoic: {
          value: 3.5,
          description: 'Expected return on planned reserves',
          formula: 'reserve exit value / planned reserves',
        },
      },
    ],
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function withoutProvenance(response: FundMoicRankingsResponseV1): Partial<FundMoicRankingsResponseV1> {
  const copy: Partial<FundMoicRankingsResponseV1> = { ...response };
  delete copy.provenance;
  return copy;
}

describe('useFundMoicRankings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves valid fund MOIC ranking responses', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeRankingsResponse(5)));

    const { result } = renderHook(() => useFundMoicRankings(5), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.rankings[0]?.investmentName).toBe('Acme Corp');
    expect(result.current.data?.provenance.sourceRecordCount).toBe(2);
    expect(fetchSpy).toHaveBeenCalledWith('/api/funds/5/moic/rankings', {
      credentials: 'include',
    });
  });

  it('rejects missing provenance with CONTRACT_PARSE_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(withoutProvenance(makeRankingsResponse(5)))
    );

    const { result } = renderHook(() => useFundMoicRankings(5), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });

  it('rejects invalid provenance with CONTRACT_PARSE_ERROR', async () => {
    const response = makeRankingsResponse(5);
    const invalidResponse = {
      ...response,
      provenance: {
        ...response.provenance,
        sourceRecordCount: -1,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(invalidResponse));

    const { result } = renderHook(() => useFundMoicRankings(5), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });

  it.each<number | null>([null, 0, -1, Number.NaN])(
    'does not fetch for non-positive or missing fund ID %s',
    (fundId) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      renderHook(() => useFundMoicRankings(fundId), { wrapper: createWrapper() });

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
