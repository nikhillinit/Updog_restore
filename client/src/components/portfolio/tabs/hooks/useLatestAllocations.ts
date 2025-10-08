/**
 * Custom hook to fetch latest allocation data for a fund
 */
import { useQuery } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type { AllocationsResponse } from '../types';

export function useLatestAllocations() {
  const { fundId } = useFundContext();

  return useQuery<AllocationsResponse>({
    queryKey: ['allocations', 'latest', fundId],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('Fund ID is required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocations/latest`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch allocations');
      }

      return response.json();
    },
    enabled: !!fundId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}
