import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSetDefaultBaseline } from '@/hooks/useVarianceData';
import { apiRequest } from '@/lib/queryClient';

vi.mock('@/lib/queryClient', async (orig) => {
  const actual = await orig<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: vi.fn() };
});

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

describe('useSetDefaultBaseline', () => {
  it('invalidates baselines and the dashboard after a successful default-baseline change', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true, data: { id: 'baseline-2' } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSetDefaultBaseline(), { wrapper });
    await result.current.mutateAsync({ fundId: 7, baselineId: 'baseline-2' });

    expect(apiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/funds/7/baselines/baseline-2/set-default',
      {}
    );
    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(invalidatedKeys).toContainEqual(['/api/funds', 7, 'baselines']);
    expect(invalidatedKeys).toContainEqual(['/api/funds', 7, 'variance-dashboard']);
  });

  it("clears the fund's alert results so the previous default's result cannot show while refetching", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true, data: { id: 'baseline-2' } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    for (const baselineScope of ['current', 'all'] as const) {
      queryClient.setQueryData(['/api/funds', 7, 'alerts', { baselineScope }], {
        success: true,
        data: [],
        count: 0,
      });
    }
    queryClient.setQueryData(['/api/funds', 8, 'alerts', { baselineScope: 'current' }], {
      success: true,
      data: [],
      count: 0,
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSetDefaultBaseline(), { wrapper });
    await result.current.mutateAsync({ fundId: 7, baselineId: 'baseline-2' });

    for (const baselineScope of ['current', 'all'] as const) {
      expect(
        queryClient.getQueryData(['/api/funds', 7, 'alerts', { baselineScope }])
      ).toBeUndefined();
    }
    expect(
      queryClient.getQueryData(['/api/funds', 8, 'alerts', { baselineScope: 'current' }])
    ).toEqual({ success: true, data: [], count: 0 });
  });
});
