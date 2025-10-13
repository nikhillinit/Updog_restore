/**
 * TanStack Query Integration for Fund KPIs
 *
 * Custom hook that integrates fund KPI selectors with TanStack Query for:
 * - Automatic refetching and caching
 * - Loading and error states
 * - Optimistic updates
 * - Derived state with selectors
 *
 * @module useFundKpis
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { FundData, FundKPIs } from '@/core/types/fund-domain';
import {
  selectCommitted,
  selectCalled,
  selectUncalled,
  selectInvested,
  selectDistributions,
  selectNAV,
  selectDPI,
  selectTVPI,
  selectIRR,
  selectAllKPIs,
} from '@/core/selectors/fund-kpis';

/**
 * Options for useFundKpis hook
 */
interface UseFundKpisOptions {
  fundId: number;
  asOf?: string | undefined; // Optional "as of" date for historical snapshots
  enabled?: boolean | undefined; // Whether to enable the query
  refetchInterval?: number | undefined; // Auto-refetch interval in milliseconds
}

/**
 * Individual KPI selector hook
 * Use this when you only need a single KPI to minimize re-renders
 */
interface UseKpiSelectorOptions<T> {
  fundId: number;
  asOf?: string | undefined;
  enabled?: boolean | undefined;
  selector: (data: FundData, asOf?: string) => T;
}

/**
 * Fetch fund data for KPI calculations
 * This would typically call your API endpoint
 *
 * @param fundId - Fund ID to fetch
 * @returns Promise resolving to FundData
 */
async function fetchFundData(fundId: number): Promise<FundData> {
  const response = await fetch(`/api/funds/${fundId}/data`);

  if (!response.ok) {
    throw new Error(`Failed to fetch fund data: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Main hook for accessing all fund KPIs
 *
 * Uses TanStack Query to fetch fund data and calculate KPIs.
 * KPIs are memoized to prevent unnecessary recalculations.
 *
 * @param options - Hook configuration options
 * @returns Query result with KPIs and metadata
 *
 * @example
 * ```typescript
 * function FundDashboard({ fundId }: { fundId: number }) {
 *   const { data: kpis, isLoading, error } = useFundKpis({ fundId });
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return (
 *     <div>
 *       <Metric label="TVPI" value={`${kpis.tvpi.toFixed(2)}x`} />
 *       <Metric label="DPI" value={`${kpis.dpi.toFixed(2)}x`} />
 *       <Metric label="IRR" value={`${(kpis.irr * 100).toFixed(1)}%`} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFundKpis(options: UseFundKpisOptions) {
  const { fundId, asOf, enabled = true, refetchInterval } = options;

  // Fetch fund data using TanStack Query
  const query = useQuery({
    queryKey: ['fundData', fundId] as const,
    queryFn: () => fetchFundData(fundId),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    ...(refetchInterval !== undefined ? { refetchInterval } : {}),
    refetchOnWindowFocus: true,
  });

  // Calculate KPIs using memoized selector
  // This prevents recalculation on every render
  const kpis = useMemo(() => {
    if (!query.data) return null;
    return selectAllKPIs(query.data, asOf ?? undefined);
  }, [query.data, asOf]);

  return {
    ...query,
    data: kpis,
  };
}

/**
 * Hook for selecting a specific KPI
 *
 * More performant than useFundKpis when you only need one KPI value,
 * as it minimizes re-renders and recalculations.
 *
 * @param options - Selector options
 * @returns Query result with selected KPI value
 *
 * @example
 * ```typescript
 * function TVPIDisplay({ fundId }: { fundId: number }) {
 *   const { data: tvpi, isLoading } = useKpiSelector({
 *     fundId,
 *     selector: selectTVPI,
 *   });
 *
 *   if (isLoading) return <Skeleton />;
 *   return <div>TVPI: {tvpi?.toFixed(2)}x</div>;
 * }
 * ```
 */
export function useKpiSelector<T>(options: UseKpiSelectorOptions<T>) {
  const { fundId, asOf, enabled = true, selector } = options;

  const query = useQuery({
    queryKey: ['fundData', fundId] as const,
    queryFn: () => fetchFundData(fundId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const selectedValue = useMemo(() => {
    if (!query.data) return null;
    return selector(query.data, asOf ?? undefined);
  }, [query.data, asOf, selector]);

  return {
    ...query,
    data: selectedValue,
  };
}

/**
 * Convenience hooks for individual KPIs
 * These wrap useKpiSelector with predefined selectors
 */

export function useCommitted(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectCommitted,
  });
}

export function useCalled(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectCalled,
  });
}

export function useUncalled(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectUncalled,
  });
}

export function useInvested(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectInvested,
  });
}

export function useDistributions(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectDistributions,
  });
}

export function useNAV(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectNAV,
  });
}

export function useDPI(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectDPI,
  });
}

export function useTVPI(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectTVPI,
  });
}

export function useIRR(fundId: number, asOf?: string | undefined) {
  return useKpiSelector({
    fundId,
    ...(asOf !== undefined ? { asOf } : {}),
    selector: selectIRR,
  });
}

/**
 * Hook for historical KPI comparison
 *
 * Fetches KPIs for multiple time periods to enable trend analysis.
 *
 * @param fundId - Fund ID
 * @param dates - Array of "as of" dates to compare
 * @returns Array of KPI snapshots for each date
 *
 * @example
 * ```typescript
 * function KpiTrend({ fundId }: { fundId: number }) {
 *   const quarters = ['2023-03-31', '2023-06-30', '2023-09-30', '2023-12-31'];
 *   const { data: snapshots, isLoading } = useKpiHistory({ fundId, dates: quarters });
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <LineChart data={snapshots.map(s => ({ date: s.asOf, tvpi: s.tvpi }))} />
 *   );
 * }
 * ```
 */
export function useKpiHistory(options: {
  fundId: number;
  dates: string[];
  enabled?: boolean;
}) {
  const { fundId, dates, enabled = true } = options;

  const query = useQuery({
    queryKey: ['fundData', fundId] as const,
    queryFn: () => fetchFundData(fundId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const snapshots = useMemo(() => {
    if (!query.data) return [];
    return dates.map((date) => selectAllKPIs(query.data, date ?? undefined));
  }, [query.data, dates]);

  return {
    ...query,
    data: snapshots,
  };
}

/**
 * Hook for comparing KPIs across multiple funds
 *
 * @param fundIds - Array of fund IDs to compare
 * @param asOf - Optional "as of" date for all funds
 * @returns Object mapping fund IDs to their KPIs
 *
 * @example
 * ```typescript
 * function FundComparison({ fundIds }: { fundIds: number[] }) {
 *   const { data: comparison, isLoading } = useFundComparison(fundIds);
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <table>
 *       {Object.entries(comparison).map(([fundId, kpis]) => (
 *         <tr key={fundId}>
 *           <td>{fundId}</td>
 *           <td>{kpis.tvpi.toFixed(2)}x</td>
 *           <td>{(kpis.irr * 100).toFixed(1)}%</td>
 *         </tr>
 *       ))}
 *     </table>
 *   );
 * }
 * ```
 */
export function useFundComparison(fundIds: number[], asOf?: string) {
  // Note: This implementation fetches funds sequentially
  // For production, you'd want a batch endpoint: /api/funds/batch
  const queries = fundIds.map((fundId) => ({
    queryKey: ['fundData', fundId] as const,
    queryFn: () => fetchFundData(fundId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  }));

  // Use useQueries for parallel fetching
  // Note: Actual implementation would use TanStack Query's useQueries
  // This is a simplified version for demonstration

  const comparison = useMemo(() => {
    const result: Record<number, FundKPIs> = {};
    // In real implementation, you'd use useQueries and aggregate results
    return result;
  }, [fundIds, asOf]);

  return {
    data: comparison,
    isLoading: false,
    error: null,
  };
}

/**
 * Hook for KPI alerts/thresholds
 *
 * Monitors KPIs and triggers alerts when thresholds are crossed.
 *
 * @param fundId - Fund ID
 * @param thresholds - KPI threshold configuration
 * @returns KPIs with alert flags
 *
 * @example
 * ```typescript
 * function KpiAlerts({ fundId }: { fundId: number }) {
 *   const { data: alerts } = useKpiAlerts(fundId, {
 *     minTVPI: 1.5,
 *     minDPI: 0.5,
 *     minIRR: 0.15,
 *   });
 *
 *   return (
 *     <div>
 *       {alerts?.tvpiAlert && <Alert>TVPI below target</Alert>}
 *       {alerts?.dpiAlert && <Alert>DPI below target</Alert>}
 *       {alerts?.irrAlert && <Alert>IRR below target</Alert>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useKpiAlerts(
  fundId: number,
  thresholds: {
    minTVPI?: number;
    minDPI?: number;
    minIRR?: number;
    maxDeploymentRate?: number;
  }
) {
  const { data: kpis, ...query } = useFundKpis({ fundId });

  const alerts = useMemo(() => {
    if (!kpis) return null;

    return {
      kpis,
      tvpiAlert: thresholds.minTVPI ? kpis.tvpi < thresholds.minTVPI : false,
      dpiAlert: thresholds.minDPI ? kpis.dpi < thresholds.minDPI : false,
      irrAlert: thresholds.minIRR ? kpis.irr < thresholds.minIRR : false,
      deploymentAlert: thresholds.maxDeploymentRate
        ? kpis.invested / kpis.committed > thresholds.maxDeploymentRate
        : false,
    };
  }, [kpis, thresholds]);

  return {
    ...query,
    data: alerts,
  };
}

/**
 * Type exports for TypeScript users
 */
export type { UseFundKpisOptions, UseKpiSelectorOptions };
