/**
 * useLPFundDetail Hook
 *
 * Data fetching hook for fund-specific LP detail view (capital account + performance).
 *
 * @module client/hooks/useLPFundDetail
 */

import { useQuery } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';
import type { LPFundDetailResponse } from '@shared/types/lp-api';

// ============================================================================
// HOOK
// ============================================================================

interface UseLPFundDetailOptions {
  fundId: number;
  asOfDate?: string;
  enabled?: boolean;
}

function readErrorMessage(payload: unknown): string | undefined {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    return (payload as { message: string }).message;
  }

  return undefined;
}

/**
 * Hook for fetching fund-specific LP detail
 *
 * Provides comprehensive fund-level metrics, capital account summary,
 * and recent transactions.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPFundDetail({
 *   fundId: 1,
 *   asOfDate: '2024-12-31',
 * });
 * ```
 */
export function useLPFundDetail(options: UseLPFundDetailOptions) {
  const { lpId } = useLPContext();
  const { fundId, asOfDate, enabled = true } = options;

  return useQuery<LPFundDetailResponse, Error>({
    queryKey: ['lp-fund-detail', lpId, fundId, asOfDate],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      if (asOfDate) {
        params.append('asOfDate', asOfDate);
      }

      const response = await fetch(
        `/api/lp/funds/${fundId}/detail?lpId=${lpId}${params.toString() ? `&${params.toString()}` : ''}`
      );

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        throw new Error(
          readErrorMessage(errorData) || `HTTP ${response.status}: Failed to fetch fund detail`
        );
      }

      return response.json() as Promise<LPFundDetailResponse>;
    },
    enabled: enabled && !!lpId && !!fundId,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
