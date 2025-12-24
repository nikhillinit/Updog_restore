/**
 * useLPCapitalAccount Hook
 *
 * Data fetching hook for LP capital account transactions with pagination.
 *
 * @module client/hooks/useLPCapitalAccount
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';
import type {
  CapitalAccountResponse,
  CapitalAccountQuery,
} from '@shared/types/lp-api';

// ============================================================================
// HOOK
// ============================================================================

interface UseLPCapitalAccountOptions extends Omit<CapitalAccountQuery, 'cursor'> {
  enabled?: boolean;
}

/**
 * Hook for fetching LP capital account transactions
 *
 * Supports filtering, sorting, and cursor-based pagination.
 *
 * @example
 * ```tsx
 * const { data, isLoading, fetchNextPage } = useLPCapitalAccount({
 *   fundId: 1,
 *   startDate: '2024-01-01',
 *   types: ['capital_call', 'distribution'],
 *   limit: 20,
 * });
 * ```
 */
export function useLPCapitalAccount(options: UseLPCapitalAccountOptions = {}) {
  const { lpId } = useLPContext();
  const {
    fundId,
    startDate,
    endDate,
    types,
    limit = 50,
    sortBy = 'transactionDate',
    sortOrder = 'desc',
    enabled = true,
  } = options;

  const queryClient = useQueryClient();

  const query = useQuery<CapitalAccountResponse, Error>({
    queryKey: ['lp-capital-account', lpId, fundId, startDate, endDate, types, sortBy, sortOrder, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      if (fundId) params.append('fundId', fundId.toString());
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (types && types.length > 0) params.append('types', types.join(','));
      params.append('limit', limit.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const response = await fetch(
        `/api/lp/capital-account?lpId=${lpId}&${params.toString()}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch capital account`);
      }

      return response.json();
    },
    enabled: enabled && !!lpId,
    staleTime: 60_000, // 1 minute
    gcTime: 300_000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Helper to fetch next page
  const fetchNextPage = async () => {
    if (query.data?.pagination.hasMore && query.data?.pagination.cursor) {
      const nextCursor = query.data.pagination.cursor;
      await queryClient.fetchQuery({
        queryKey: ['lp-capital-account', lpId, fundId, startDate, endDate, types, sortBy, sortOrder, limit, nextCursor],
        queryFn: async () => {
          if (!lpId) {
            throw new Error('No LP ID available');
          }

          const params = new URLSearchParams();
          if (fundId) params.append('fundId', fundId.toString());
          if (startDate) params.append('startDate', startDate);
          if (endDate) params.append('endDate', endDate);
          if (types && types.length > 0) params.append('types', types.join(','));
          params.append('cursor', nextCursor);
          params.append('limit', limit.toString());
          params.append('sortBy', sortBy);
          params.append('sortOrder', sortOrder);

          const response = await fetch(
            `/api/lp/capital-account?lpId=${lpId}&${params.toString()}`
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}: Failed to fetch next page`);
          }

          return response.json();
        },
      });
    }
  };

  return {
    ...query,
    fetchNextPage,
    hasNextPage: query.data?.pagination.hasMore || false,
  };
}

/**
 * Hook for invalidating LP capital account cache
 */
export function useInvalidateLPCapitalAccount() {
  const { lpId } = useLPContext();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    if (!lpId) return;

    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key === 'lp-capital-account' && query.queryKey[1] === lpId;
      },
    });
  };

  return { invalidate };
}
