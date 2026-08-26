import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FundScenarioSeedsResponseSchema,
  useFundScenarioSeeds,
} from '@/hooks/useFundScenarioSeeds';
import { fundScenarioSeedsQueryKey } from '@/lib/fund-scenario-workspace-query-keys';
import { apiRequest } from '@/lib/queryClient';

const flagState = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/core/flags/flagAdapter', () => ({
  useFeatureFlag: () => flagState.enabled,
}));

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockApiRequest = vi.mocked(apiRequest);

const responseFixture = FundScenarioSeedsResponseSchema.parse({
  fundId: 7,
  asOfDate: '2026-07-13',
  factsStatus: 'available',
  factsInputHash: 'a'.repeat(64),
  seeds: [],
});

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useFundScenarioSeeds', () => {
  beforeEach(() => {
    flagState.enabled = true;
    mockApiRequest.mockReset();
  });

  it('fetches and parses the fund seed envelope with the canonical query key', async () => {
    mockApiRequest.mockResolvedValue(responseFixture);

    const { result } = renderHook(() => useFundScenarioSeeds('7'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/funds/7/scenario-analysis/seeds');
    expect(result.current.response).toEqual(responseFixture);
    expect(fundScenarioSeedsQueryKey('7')).toEqual(['fund-scenario-analysis', '7', 'seeds']);
  });

  it('does not fetch without a fund id', () => {
    const { result } = renderHook(() => useFundScenarioSeeds(null), { wrapper: wrapper() });

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(result.current.seeds).toEqual([]);
  });

  it('does not fetch while the client flag is off', () => {
    flagState.enabled = false;

    const { result } = renderHook(() => useFundScenarioSeeds('7'), { wrapper: wrapper() });

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(result.current.seeds).toEqual([]);
  });
});
