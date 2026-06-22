import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCompanyInvestments } from '@/hooks/useCompanyInvestments';
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

describe('useCompanyInvestments', () => {
  beforeEach(() => mockApi.mockReset());

  it('filters fund investments down to the company', async () => {
    mockApi.mockResolvedValue([
      { id: 1, fundId: 7, companyId: 42 },
      { id: 2, fundId: 7, companyId: 99 },
      { id: 3, fundId: 7, companyId: 42 },
    ] as never);
    const { result } = renderHook(() => useCompanyInvestments(7, 42), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockApi).toHaveBeenCalledWith('GET', '/api/investments?fundId=7');
    expect(result.current.investments.map((i) => i.id)).toEqual([1, 3]);
  });

  it('is disabled without both ids', () => {
    const { result } = renderHook(() => useCompanyInvestments(undefined, 42), { wrapper: wrapper() });
    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.investments).toEqual([]);
  });
});
