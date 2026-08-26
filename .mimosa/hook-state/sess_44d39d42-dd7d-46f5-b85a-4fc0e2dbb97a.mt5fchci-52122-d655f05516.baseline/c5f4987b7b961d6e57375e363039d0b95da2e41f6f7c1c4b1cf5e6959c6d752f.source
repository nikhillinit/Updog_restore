/**
 * useLPDistributions Hook
 *
 * Data fetching hook for LP distributions with pagination and filtering.
 *
 * @module client/hooks/useLPDistributions
 */

import { useQuery } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';

// ============================================================================
// TYPES
// ============================================================================

export interface Distribution {
  id: string;
  fundId: number;
  fundName: string;
  distributionNumber: number;
  distributionType: 'return_of_capital' | 'capital_gains' | 'dividend' | 'mixed';
  grossAmount: string;
  netAmount: string;
  distributionDate: string;
  recordDate: string;
  paymentDate: string | null;
  paymentMethod: 'wire' | 'check' | 'ach' | null;
  status: 'pending' | 'processing' | 'completed';
  taxYear: number | null;
}

export interface DistributionsResponse {
  distributions: Distribution[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  totalGrossAmount: string;
  totalNetAmount: string;
}

interface UseLPDistributionsOptions {
  fundId?: number;
  year?: number;
  limit?: number;
  enabled?: boolean;
}

type ServerDistribution = {
  id: string;
  fundId: number;
  fundName: string;
  distributionNumber: number;
  distributionType: Distribution['distributionType'];
  totalAmount?: string;
  grossAmount?: string;
  netAmount?: string;
  distributionDate: string;
  recordDate?: string;
  paymentDate?: string | null;
  paymentMethod?: Distribution['paymentMethod'];
  status: Distribution['status'];
  taxYear?: number | null;
};

type ServerDistributionsResponse = {
  distributions: ServerDistribution[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
  totalDistributed?: string;
  totalGrossAmount?: string;
  totalNetAmount?: string;
};

type ServerDistributionYearSummary = {
  year: number;
  totalDistributed: string;
};

type ServerDistributionsSummaryResponse = {
  summary: ServerDistributionYearSummary[];
  totalAllTime: string;
};

function normalizeDistribution(distribution: ServerDistribution): Distribution {
  const amount = distribution.netAmount ?? distribution.totalAmount ?? '0';

  return {
    id: distribution.id,
    fundId: distribution.fundId,
    fundName: distribution.fundName,
    distributionNumber: distribution.distributionNumber,
    distributionType: distribution.distributionType,
    grossAmount: distribution.grossAmount ?? distribution.totalAmount ?? amount,
    netAmount: amount,
    distributionDate: distribution.distributionDate,
    recordDate: distribution.recordDate ?? distribution.distributionDate,
    paymentDate: distribution.paymentDate ?? null,
    paymentMethod: distribution.paymentMethod ?? null,
    status: distribution.status,
    taxYear: distribution.taxYear ?? null,
  };
}

function normalizeDistributionsResponse(
  response: ServerDistributionsResponse
): DistributionsResponse {
  const totalAmount = response.totalNetAmount ?? response.totalDistributed ?? '0';

  return {
    distributions: response.distributions.map(normalizeDistribution),
    nextCursor: response.nextCursor,
    hasMore: response.hasMore,
    totalCount: response.totalCount ?? response.distributions.length,
    totalGrossAmount: response.totalGrossAmount ?? response.totalDistributed ?? totalAmount,
    totalNetAmount: totalAmount,
  };
}

function ytdDistributedFromSummary(
  response: ServerDistributionsSummaryResponse,
  currentYear: number
): string {
  return response.summary.find((yearSummary) => yearSummary.year === currentYear)
    ?.totalDistributed ?? '0';
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for fetching LP distributions
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPDistributions({
 *   year: 2025,
 *   limit: 10,
 * });
 * ```
 */
export function useLPDistributions(options: UseLPDistributionsOptions = {}) {
  const { lpId } = useLPContext();
  const { fundId, year, limit = 10, enabled = true } = options;

  return useQuery<DistributionsResponse, Error>({
    queryKey: ['lp-distributions', lpId, fundId, year, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      params.append('lpId', lpId.toString());
      if (fundId) params.append('fundId', fundId.toString());
      if (year) params.append('year', year.toString());
      params.append('limit', limit.toString());

      const response = await fetch(`/api/lp/distributions?${params.toString()}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch distributions`
        );
      }

      const data = (await response.json()) as ServerDistributionsResponse;
      return normalizeDistributionsResponse(data);
    },
    enabled: enabled && !!lpId,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Hook for fetching distribution summary by year
 */
export function useLPDistributionsSummary(options: { enabled?: boolean } = {}) {
  const { lpId } = useLPContext();
  const { enabled = true } = options;

  return useQuery<{
    totalDistributed: string;
    ytdDistributed: string;
    recentDistributions: Distribution[];
    pendingDistributions: number;
  }>({
    queryKey: ['lp-distributions-summary', lpId],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const currentYear = new Date().getFullYear();

      // Fetch recent rows separately from aggregate totals. The list route totals
      // are page-derived, while the summary route totals are all-time.
      const [recentResponse, summaryResponse] = await Promise.all([
        fetch(`/api/lp/distributions?lpId=${lpId}&limit=5`),
        fetch(`/api/lp/distributions/summary?lpId=${lpId}`),
      ]);

      if (!recentResponse.ok || !summaryResponse.ok) {
        throw new Error('Failed to fetch distributions summary');
      }

      const [recentData, summaryData] = await Promise.all([
        recentResponse.json() as Promise<ServerDistributionsResponse>,
        summaryResponse.json() as Promise<ServerDistributionsSummaryResponse>,
      ]);

      const allData = normalizeDistributionsResponse(recentData);
      const ytdDistributed = ytdDistributedFromSummary(summaryData, currentYear);

      // Calculate pending count
      const pendingCount = allData.distributions.filter(
        (d) => d.status === 'pending' || d.status === 'processing'
      ).length;

      return {
        totalDistributed: summaryData.totalAllTime,
        ytdDistributed,
        recentDistributions: allData.distributions.slice(0, 3),
        pendingDistributions: pendingCount,
      };
    },
    enabled: enabled && !!lpId,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });
}
