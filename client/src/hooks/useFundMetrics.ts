/**
 * useFundMetrics Hook
 *
 * Single source of truth for fund metrics across all UI components.
 * This hook fetches unified metrics from the Metrics Aggregator API.
 *
 * Features:
 * - Automatic caching via TanStack Query
 * - Background refetching every 5 minutes
 * - Loading and error states
 * - Type-safe access to actual, projected, target, and variance metrics
 *
 * @module client/hooks/useFundMetrics
 */

import { useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import { useFundContext } from '@/contexts/FundContext';

interface UseFundMetricsOptions {
  /** Skip expensive projection calculations for fast loading */
  skipProjections?: boolean;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Custom refetch interval in ms (default: 5 minutes) */
  refetchInterval?: number;
}

/**
 * Main hook for accessing unified fund metrics
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { data: metrics, isLoading, error } = useFundMetrics();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return (
 *     <div>
 *       <MetricsCard
 *         title="IRR"
 *         actual={metrics.actual.irr}
 *         target={metrics.target.targetIRR}
 *         variance={metrics.variance.performanceVariance}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFundMetrics(
  options: UseFundMetricsOptions = {}
): UseQueryResult<UnifiedFundMetrics, Error> {
  const { fundId } = useFundContext();
  const { skipProjections = false, enabled = true, refetchInterval = 300000 } = options;

  return useQuery<UnifiedFundMetrics, Error>({
    queryKey: ['fund-metrics', fundId, { skipProjections }],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const params = new URLSearchParams();
      if (skipProjections) {
        params.append('skipProjections', 'true');
      }

      const url = `/api/funds/${fundId}/metrics${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch metrics`);
      }

      return response.json();
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000, // Consider data fresh for 1 minute
    gcTime: 600_000, // Keep in cache for 10 minutes
    refetchInterval,
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook for accessing only actual metrics
 *
 * More performant when you only need actual data (skips projection calculations)
 */
export function useActualMetrics() {
  const { data, ...rest } = useFundMetrics({ skipProjections: true });
  return {
    data: data?.actual,
    ...rest,
  };
}

/**
 * Hook for accessing only projected metrics
 */
export function useProjectedMetrics() {
  const { data, ...rest } = useFundMetrics();
  return {
    data: data?.projected,
    ...rest,
  };
}

/**
 * Hook for accessing only target metrics
 */
export function useTargetMetrics() {
  const { data, ...rest } = useFundMetrics({ skipProjections: true });
  return {
    data: data?.target,
    ...rest,
  };
}

/**
 * Hook for accessing only variance metrics
 */
export function useVarianceMetrics() {
  const { data, ...rest } = useFundMetrics();
  return {
    data: data?.variance,
    ...rest,
  };
}

/**
 * Hook for invalidating metrics cache
 *
 * Call this after creating investments, updating valuations, etc.
 *
 * @example
 * ```tsx
 * function InvestmentForm() {
 *   const { invalidateMetrics } = useInvalidateMetrics();
 *
 *   const handleSubmit = async (data) => {
 *     await createInvestment(data);
 *     await invalidateMetrics(); // Force metrics refresh
 *   };
 * }
 * ```
 */
export function useInvalidateMetrics() {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  const invalidateMetrics = async () => {
    if (!fundId) return;

    try {
      // Invalidate server-side cache
      const response = await fetch(`/api/funds/${fundId}/metrics/invalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Note: Add Authorization header if using JWT auth
          // 'Authorization': `Bearer ${getToken()}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to invalidate server cache:', errorText);
      }

      // Invalidate client-side TanStack Query cache
      // 1. Invalidate all fund-metrics queries for this fund
      await queryClient.invalidateQueries({
        queryKey: ['fund-metrics', fundId],
      });

      // 2. Invalidate all related fund queries (variance, timeline, etc.)
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = String(query.queryKey[0] || '');
          return key.startsWith('fund-') && query.queryKey[1] === fundId;
        },
      });

      console.log(`✅ Cache invalidated for fund ${fundId} (server + client + related queries)`);
    } catch (error) {
      console.error('Error invalidating metrics cache:', error);
      throw error;
    }
  };

  return { invalidateMetrics };
}

/**
 * Hook for specific metric values (type-safe selectors)
 *
 * @example
 * ```tsx
 * const irr = useMetricValue('actual', 'irr');
 * const targetTVPI = useMetricValue('target', 'targetTVPI');
 * ```
 */
export function useMetricValue<
  T extends 'actual' | 'projected' | 'target' | 'variance',
  K extends keyof NonNullable<UnifiedFundMetrics[T]>
>(type: T, key: K): NonNullable<UnifiedFundMetrics[T]>[K] | undefined {
  const { data } = useFundMetrics();
  return data?.[type]?.[key];
}
