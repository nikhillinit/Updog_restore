/**
 * usePerformanceDashboard Hook
 *
 * Data fetching hook for the Portfolio Performance Dashboard.
 * Provides access to timeseries, breakdown, and comparison data.
 *
 * @module client/hooks/usePerformanceDashboard
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type {
  TimeseriesResponse,
  BreakdownResponse,
  ComparisonResponse,
  Granularity,
  GroupByDimension,
} from '@shared/types/performance-api';

// ============================================================================
// TIMESERIES HOOK
// ============================================================================

interface UsePerformanceTimeseriesOptions {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  metrics?: string[];
  enabled?: boolean;
}

/**
 * Hook for fetching performance timeseries data
 *
 * @example
 * ```tsx
 * const { data, isLoading } = usePerformanceTimeseries({
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31',
 *   granularity: 'monthly',
 * });
 * ```
 */
export function usePerformanceTimeseries(options: UsePerformanceTimeseriesOptions) {
  const { fundId } = useFundContext();
  const { startDate, endDate, granularity, metrics, enabled = true } = options;

  return useQuery<TimeseriesResponse, Error>({
    queryKey: ['performance-timeseries', fundId, startDate, endDate, granularity, metrics],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const params = new URLSearchParams({
        startDate,
        endDate,
        granularity,
      });

      if (metrics && metrics.length > 0) {
        params.append('metrics', metrics.join(','));
      }

      const response = await fetch(
        `/api/funds/${fundId}/performance/timeseries?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch timeseries`);
      }

      return response.json();
    },
    enabled: enabled && !!fundId && !!startDate && !!endDate,
    staleTime: 60_000, // 1 minute
    gcTime: 300_000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

// ============================================================================
// BREAKDOWN HOOK
// ============================================================================

interface UsePerformanceBreakdownOptions {
  groupBy: GroupByDimension;
  asOfDate?: string;
  includeExited?: boolean;
  enabled?: boolean;
}

/**
 * Hook for fetching performance breakdown by sector/stage/company
 *
 * @example
 * ```tsx
 * const { data, isLoading } = usePerformanceBreakdown({
 *   groupBy: 'sector',
 *   includeExited: false,
 * });
 * ```
 */
export function usePerformanceBreakdown(options: UsePerformanceBreakdownOptions) {
  const { fundId } = useFundContext();
  const { groupBy, asOfDate, includeExited = false, enabled = true } = options;

  return useQuery<BreakdownResponse, Error>({
    queryKey: ['performance-breakdown', fundId, groupBy, asOfDate, includeExited],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const params = new URLSearchParams({ groupBy });

      if (asOfDate) {
        params.append('asOfDate', asOfDate);
      }

      if (includeExited) {
        params.append('includeExited', 'true');
      }

      const response = await fetch(
        `/api/funds/${fundId}/performance/breakdown?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch breakdown`);
      }

      return response.json();
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

// ============================================================================
// COMPARISON HOOK
// ============================================================================

interface UsePerformanceComparisonOptions {
  dates: string[];
  metrics?: string[];
  enabled?: boolean;
}

/**
 * Hook for comparing fund metrics across multiple dates
 *
 * @example
 * ```tsx
 * const { data, isLoading } = usePerformanceComparison({
 *   dates: ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31'],
 * });
 * ```
 */
export function usePerformanceComparison(options: UsePerformanceComparisonOptions) {
  const { fundId } = useFundContext();
  const { dates, metrics, enabled = true } = options;

  return useQuery<ComparisonResponse, Error>({
    queryKey: ['performance-comparison', fundId, dates, metrics],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      if (!dates || dates.length === 0) {
        throw new Error('At least one date is required for comparison');
      }

      const params = new URLSearchParams({
        dates: dates.join(','),
      });

      if (metrics && metrics.length > 0) {
        params.append('metrics', metrics.join(','));
      }

      const response = await fetch(
        `/api/funds/${fundId}/performance/comparison?${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch comparison`);
      }

      return response.json();
    },
    enabled: enabled && !!fundId && dates.length > 0,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

// ============================================================================
// COMBINED DASHBOARD HOOK
// ============================================================================

interface UsePerformanceDashboardOptions {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  granularity?: Granularity;
  groupBy?: GroupByDimension;
  enabled?: boolean;
}

/**
 * Combined hook for fetching all performance dashboard data
 *
 * Fetches timeseries and breakdown data in parallel.
 *
 * @example
 * ```tsx
 * const { timeseries, breakdown, isLoading } = usePerformanceDashboard({
 *   dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' },
 *   granularity: 'monthly',
 *   groupBy: 'sector',
 * });
 * ```
 */
export function usePerformanceDashboard(options: UsePerformanceDashboardOptions) {
  const {
    dateRange,
    granularity = 'monthly',
    groupBy = 'sector',
    enabled = true,
  } = options;

  const timeseriesQuery = usePerformanceTimeseries({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity,
    enabled,
  });

  const breakdownQuery = usePerformanceBreakdown({
    groupBy,
    enabled,
  });

  return {
    timeseries: timeseriesQuery.data,
    breakdown: breakdownQuery.data,
    isLoading: timeseriesQuery.isLoading || breakdownQuery.isLoading,
    isError: timeseriesQuery.isError || breakdownQuery.isError,
    error: timeseriesQuery.error || breakdownQuery.error,
    refetch: async () => {
      await Promise.all([timeseriesQuery.refetch(), breakdownQuery.refetch()]);
    },
  };
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Hook for invalidating performance dashboard cache
 */
export function useInvalidatePerformanceCache() {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    if (!fundId) return;

    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return (
          key.startsWith('performance-') &&
          query.queryKey[1] === fundId
        );
      },
    });
  };

  return { invalidate };
}
