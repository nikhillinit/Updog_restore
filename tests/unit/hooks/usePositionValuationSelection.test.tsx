import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { waitFor } from '@testing-library/react';
import { usePositionValuationSelection } from '@/hooks/usePositionValuationSelection';

let mockFundId: number | null = 1;

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: mockFundId }),
}));

const mockSelection = {
  fundId: 1,
  vehicleId: 1,
  companyIdentityId: 1,
  companyId: 10,
  asOfDate: '2026-07-01',
  aggregateFairValue: '15000.000000',
  basis: 'derived',
  directMarkId: null,
  directSourceObservationId: null,
  ownershipSnapshotId: 1,
  derivedTrancheId: 7,
  derivedTrancheVersion: 1,
  derivedParticipationId: 12,
  derivedParticipationVersion: 1,
  evidenceDate: '2026-06-30',
  valuationAgeDays: 5,
  pricedComponentFairValue: '15000.000000',
  warnings: [],
  sourceHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
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

describe('usePositionValuationSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFundId = 1;
    global.fetch = vi.fn();
  });

  it('fetches valuation selection for required params', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockSelection,
    });

    const { result } = renderHook(
      () =>
        usePositionValuationSelection({
          vehicleId: 1,
          companyIdentityId: 1,
          companyId: 10,
          asOfDate: '2026-07-01',
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockSelection);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/funds/1/investment-ledger/position-valuations?vehicleId=1&companyIdentityId=1&companyId=10&asOfDate=2026-07-01'
    );
  });

  it('does not run or fabricate sentinel params when required scope is missing', async () => {
    const { result } = renderHook(() => usePositionValuationSelection({ vehicleId: 1 }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();

    const refetch = await result.current.refetch();
    expect(refetch.error).toMatchObject({
      message: 'Complete position valuation scope is required.',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
