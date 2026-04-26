/**
 * Custom hook to fetch latest allocation data for a fund
 */
import { useQuery } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type { AllocationsResponse } from '../types';
import { buildErrorMessage, readApiErrorBody, readJsonResponse } from './jsonResponse';

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
        const errorData = await readApiErrorBody(response, 'Failed to fetch allocations');
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch allocations'));
      }

      return readJsonResponse<AllocationsResponse>(response, 'Failed to fetch allocations');
    },
    enabled: !!fundId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes('expected JSON')) {
        return false;
      }

      return failureCount < 2;
    },
  });
}
