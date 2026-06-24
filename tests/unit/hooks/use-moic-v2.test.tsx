import React, { type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFundMoicRankingsV2 } from '../../../client/src/hooks/use-moic';
import type { FundMoicRankingsResponseV2 } from '../../../shared/contracts/fund-moic-v2.contract';

function makeV2Response(fundId: number): FundMoicRankingsResponseV2 {
  return {
    contractVersion: '2.0.0',
    fundId,
    rankings: [
      {
        rank: 1,
        investmentId: '101',
        investmentName: 'Acme Corp',
        reservesMoic: {
          value: 0,
          description: 'Expected return on planned reserves',
          formula: 'reserve exit value / planned reserves',
        },
      },
    ],
    provenance: { mode: 'legacy', warnings: [] },
    latestReconciliation: null,
    materiality: { status: 'not_run', candidateMaterial: false, epsilon: 1e-8 },
    roundEvidenceSummary: { activeRoundCount: 0, activeOverrideCount: 0, warningCodes: [] },
    generatedAt: '2026-06-24T00:00:00.000Z',
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

describe('useFundMoicRankingsV2', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a valid V2 payload and requests the v2 contract', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeV2Response(5)));

    const { result } = renderHook(() => useFundMoicRankingsV2(5), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.contractVersion).toBe('2.0.0');
    expect(result.current.data?.materiality.status).toBe('not_run');
    expect(fetchSpy).toHaveBeenCalledWith('/api/funds/5/moic/rankings?contract=v2', {
      credentials: 'include',
    });
  });

  it('rejects a payload that violates the strict V2 allowlist with CONTRACT_PARSE_ERROR', async () => {
    // A forbidden top-level leakage field must fail the strict safeParse — the
    // hook is the client-side enforcement point for the no-leakage contract.
    const leaky = { ...makeV2Response(5), rawDiff: [{ legacy: 0, candidate: 1 }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(leaky));

    const { result } = renderHook(() => useFundMoicRankingsV2(5), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });

  it.each<number | null>([null, 0, -1, Number.NaN])(
    'does not fetch for non-positive or missing fund ID %s',
    (fundId) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      renderHook(() => useFundMoicRankingsV2(fundId), { wrapper: createWrapper() });

      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
