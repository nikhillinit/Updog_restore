/**
 * useLPPerformance Hook
 *
 * Data fetching hook for LP performance analytics with benchmark comparisons.
 *
 * @module client/hooks/useLPPerformance
 */

import { useQuery } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';
import type { LPPerformanceResponse, LPPerformanceQuery } from '@shared/types/lp-api';

// ============================================================================
// HOOK
// ============================================================================

interface UseLPPerformanceOptions extends Omit<LPPerformanceQuery, 'fundId'> {
  fundId: number;
  enabled?: boolean;
}

/**
 * Hook for fetching LP performance timeseries with benchmarks
 *
 * Provides historical performance data and optional benchmark comparisons
 * (Cambridge Associates, Burgiss, etc.).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPPerformance({
 *   fundId: 1,
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31',
 *   granularity: 'quarterly',
 *   includeBenchmarks: true,
 * });
 * ```
 */
export function useLPPerformance(options: UseLPPerformanceOptions) {
  const { lpId } = useLPContext();
  const {
    fundId,
    startDate,
    endDate,
    granularity = 'quarterly',
    includeBenchmarks = true,
    enabled = true,
  } = options;

  return useQuery<LPPerformanceResponse, Error>({
    queryKey: ['lp-performance', lpId, fundId, startDate, endDate, granularity, includeBenchmarks],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams({ granularity });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (includeBenchmarks) params.append('includeBenchmarks', 'true');

      const response = await fetch(
        `/api/lp/funds/${fundId}/performance?lpId=${lpId}&${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch performance`);
      }

      return response.json();
    },
    enabled: enabled && !!lpId && !!fundId,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

// ============================================================================
// HOLDINGS HOOK
// ============================================================================

import type { LPHoldingsResponse, LPHoldingsQuery } from '@shared/types/lp-api';

interface UseLPHoldingsOptions extends Omit<LPHoldingsQuery, 'fundId'> {
  fundId: number;
  enabled?: boolean;
}

/**
 * Hook for fetching LP pro-rata portfolio holdings
 *
 * Provides company-level holdings with LP's pro-rata share of fund investments.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPHoldings({
 *   fundId: 1,
 *   asOfDate: '2024-12-31',
 *   includeExited: false,
 * });
 * ```
 */
export function useLPHoldings(options: UseLPHoldingsOptions) {
  const { lpId } = useLPContext();
  const { fundId, asOfDate, includeExited = false, enabled = true } = options;

  return useQuery<LPHoldingsResponse, Error>({
    queryKey: ['lp-holdings', lpId, fundId, asOfDate, includeExited],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      if (asOfDate) params.append('asOfDate', asOfDate);
      if (includeExited) params.append('includeExited', 'true');

      const response = await fetch(
        `/api/lp/funds/${fundId}/holdings?lpId=${lpId}${params.toString() ? `&${params.toString()}` : ''}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch holdings`);
      }

      return response.json();
    },
    enabled: enabled && !!lpId && !!fundId,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
