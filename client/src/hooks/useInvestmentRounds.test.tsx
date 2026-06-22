import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInvestmentRounds } from './useInvestmentRounds';
import { investmentRoundsQueryKey } from './useCreateRound';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});
const mockApi = vi.mocked(apiRequest);

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useInvestmentRounds', () => {
  beforeEach(() => mockApi.mockReset());

  it('unwraps the list response under the shared query key', async () => {
    mockApi.mockResolvedValue({ data: [{ id: 5 }, { id: 6 }] } as never);
    const { result } = renderHook(() => useInvestmentRounds(3), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApi).toHaveBeenCalledWith('GET', '/api/investments/3/rounds');
    expect(result.current.rounds.map((r) => r.id)).toEqual([5, 6]);
    expect(investmentRoundsQueryKey(3)).toEqual(['investment-rounds', 3]);
  });

  it('is disabled without an investmentId', () => {
    const { result } = renderHook(() => useInvestmentRounds(undefined), { wrapper: wrapper() });
    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.rounds).toEqual([]);
  });
});
