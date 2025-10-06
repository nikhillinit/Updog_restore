/**
 * Query Invalidation Hooks
 *
 * Convenient hooks for invalidating cached queries
 */

import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidationPredicates } from '@/lib/query-keys';

export function useInvalidateFund() {
  const queryClient = useQueryClient();

  return {
    /**
     * Invalidate all queries for a specific fund
     */
    invalidateAll: (fundId: number) => {
      return queryClient.invalidateQueries({
        predicate: invalidationPredicates.fund(fundId),
      });
    },

    /**
     * Invalidate only metrics for a specific fund
     */
    invalidateMetrics: (fundId: number) => {
      return queryClient.invalidateQueries({
        queryKey: [...queryKeys.funds.detail(fundId), 'metrics'],
      });
    },

    /**
     * Invalidate companies/portfolio for a specific fund
     */
    invalidatePortfolio: (fundId: number) => {
      return queryClient.invalidateQueries({
        queryKey: queryKeys.funds.companies(fundId),
      });
    },
  };
}

export function useInvalidateAllFunds() {
  const queryClient = useQueryClient();

  return () => {
    return queryClient.invalidateQueries({
      predicate: invalidationPredicates.allFunds,
    });
  };
}

export function useInvalidateInvestments() {
  const queryClient = useQueryClient();

  return () => {
    return queryClient.invalidateQueries({
      predicate: invalidationPredicates.allInvestments,
    });
  };
}
