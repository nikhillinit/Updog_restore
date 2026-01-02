/**
 * Unit tests for useLatestAllocations hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLatestAllocations } from '../useLatestAllocations';
import type { ReactNode } from 'react';

// Mock FundContext
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

const mockAllocationsData = {
  companies: [
    {
      company_id: 1,
      company_name: 'Test Company',
      sector: 'FinTech',
      stage: 'Series A',
      status: 'active',
      invested_amount_cents: 100000000,
      deployed_reserves_cents: 50000000,
      planned_reserves_cents: 150000000,
      allocation_cap_cents: 300000000,
      allocation_reason: 'Test reason',
      allocation_version: 1,
      last_allocation_at: '2024-01-01T00:00:00Z',
    },
  ],
  metadata: {
    total_planned_cents: 150000000,
    total_deployed_cents: 50000000,
    companies_count: 1,
    last_updated_at: '2024-01-01T00:00:00Z',
  },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useLatestAllocations', () => {
  beforeEach(() => {
    vi['clearAllMocks']();
    global.fetch = vi.fn();
  });

  it('fetches allocations data successfully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    const { result } = renderHook(() => useLatestAllocations(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockAllocationsData);
    expect(result.current.error).toBe(null);
    expect(global.fetch).toHaveBeenCalledWith('/api/funds/1/allocations/latest');
  });

  it('handles fetch errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Not found' }),
    });

    const { result } = renderHook(() => useLatestAllocations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
  });

  it('retries failed requests up to 2 times', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockAllocationsData,
      });

    global.fetch = fetchMock;

    const { result } = renderHook(() => useLatestAllocations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should retry twice (3 total attempts)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.data).toEqual(mockAllocationsData);
  });

  it('does not fetch when fundId is null', () => {
    vi.mock('@/contexts/FundContext', () => ({
      useFundContext: () => ({ fundId: null }),
    }));

    const { result } = renderHook(() => useLatestAllocations(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
