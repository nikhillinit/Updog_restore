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
  distributionType: 'regular' | 'special' | 'final' | 'return_of_capital';
  grossAmount: string;
  netAmount: string;
  distributionDate: string;
  recordDate: string;
  paymentDate: string | null;
  paymentMethod: 'wire' | 'check' | 'ach' | null;
  status: 'announced' | 'pending' | 'paid' | 'processed';
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

      return response.json() as Promise<DistributionsResponse>;
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

      // Fetch all distributions and YTD distributions
      const [allResponse, ytdResponse] = await Promise.all([
        fetch(`/api/lp/distributions?lpId=${lpId}&limit=5`),
        fetch(`/api/lp/distributions?lpId=${lpId}&year=${currentYear}&limit=100`),
      ]);

      if (!allResponse.ok || !ytdResponse.ok) {
        throw new Error('Failed to fetch distributions summary');
      }

      const [allData, ytdData] = (await Promise.all([
        allResponse.json() as Promise<DistributionsResponse>,
        ytdResponse.json() as Promise<DistributionsResponse>,
      ])) as [DistributionsResponse, DistributionsResponse];

      // Calculate pending count
      const pendingCount = allData.distributions.filter(
        (d) => d.status === 'announced' || d.status === 'pending'
      ).length;

      return {
        totalDistributed: allData.totalNetAmount,
        ytdDistributed: ytdData.totalNetAmount,
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
