/**
 * Custom hook to fetch latest allocation data for a fund
 */
import { useQuery } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type { AllocationsResponse } from '../types';

interface ApiErrorBody {
  message?: string;
  error?: string;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType && !contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${fallbackMessage}: expected JSON but received ${contentType}`);
  }

  return response.json() as Promise<T>;
}

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
        const errorData = await readJsonResponse<ApiErrorBody>(
          response,
          'Failed to fetch allocations'
        ).catch(() => null);
        throw new Error(errorData?.message || errorData?.error || 'Failed to fetch allocations');
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
