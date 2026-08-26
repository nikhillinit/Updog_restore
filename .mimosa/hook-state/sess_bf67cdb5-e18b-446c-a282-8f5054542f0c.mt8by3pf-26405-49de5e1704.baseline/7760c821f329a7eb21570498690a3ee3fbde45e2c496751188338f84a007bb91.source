import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { waitFor } from '@testing-library/react';
import { useCurrentPositions } from '@/hooks/useCurrentPositions';

let mockFundId: number | null = 1;

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: mockFundId }),
}));

const mockCurrentPositions = {
  fundId: 1,
  asOfDate: '2026-07-01',
  knowledgeCutoff: '2026-07-01T00:00:00.000Z',
  positions: [
    {
      fundId: 1,
      vehicleId: 1,
      companyIdentityId: 1,
      asOfDate: '2026-07-01',
      knowledgeCutoff: '2026-07-01T00:00:00.000Z',
      shares: '5.000000',
      costBasis: '10000.000000',
      proceeds: '12000.000000',
      components: [
        {
          kind: 'priced',
          shares: '5.000000',
          costBasis: '10000.000000',
          participationIds: [101],
        },
      ],
      warnings: [],
    },
  ],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCurrentPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFundId = 1;
    global.fetch = vi.fn();
  });

  it('fetches current positions for a fund', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockCurrentPositions,
    });

    const { result } = renderHook(() => useCurrentPositions({ vehicleId: 1, companyIdentityId: 1 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockCurrentPositions);
    expect(global.fetch).toHaveBeenCalledWith('/api/funds/1/investment-ledger/positions?vehicleId=1&companyIdentityId=1');
  });

  it('returns an error on failed fetch', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Not found' }),
    });

    const { result } = renderHook(() => useCurrentPositions({ vehicleId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toContain('Not found');
  });

  it('does not fetch when fundId is unavailable', () => {
    mockFundId = null;

    const { result } = renderHook(() => useCurrentPositions({ vehicleId: 1 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
