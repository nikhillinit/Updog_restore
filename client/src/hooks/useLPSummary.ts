/**
 * useLPSummary Hook
 *
 * Data fetching hook for LP dashboard summary metrics and fund summaries.
 *
 * @module client/hooks/useLPSummary
 */

import { useQuery } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';
import type { LPSummaryResponse } from '@shared/types/lp-api';

// ============================================================================
// HOOK
// ============================================================================

interface UseLPSummaryOptions {
  asOfDate?: string;
  enabled?: boolean;
}

/**
 * Hook for fetching LP dashboard summary data
 *
 * Provides aggregate metrics across all funds and individual fund summaries.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPSummary({
 *   asOfDate: '2024-12-31',
 * });
 * ```
 */
export function useLPSummary(options: UseLPSummaryOptions = {}) {
  const { lpId } = useLPContext();
  const { asOfDate, enabled = true } = options;

  return useQuery<LPSummaryResponse, Error>({
    queryKey: ['lp-summary', lpId, asOfDate],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      if (asOfDate) {
        params.append('asOfDate', asOfDate);
      }

      const response = await fetch(
        `/api/lp/summary?lpId=${lpId}${params.toString() ? `&${params.toString()}` : ''}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch LP summary`);
      }

      return response.json();
    },
    enabled: enabled && !!lpId,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
