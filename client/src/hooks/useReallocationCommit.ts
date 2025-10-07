/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  ReallocationCommitRequest,
  ReallocationCommitResponse,
  ReallocationError,
} from '@/types/reallocation';

/**
 * Hook for committing reallocation changes
 *
 * Makes a transactional API call to apply changes to the database.
 * Invalidates relevant queries on success to refresh UI.
 */
export function useReallocationCommit(fundId: number) {
  const queryClient = useQueryClient();

  return useMutation<
    ReallocationCommitResponse,
    ReallocationError,
    ReallocationCommitRequest
  >({
    mutationFn: async (request: ReallocationCommitRequest) => {
      try {
        const response = await apiRequest(
          'POST',
          `/api/funds/${fundId}/reallocation/commit`,
          request
        );
        return await response.json();
      } catch (error: any) {
        // Transform error to match ReallocationError type
        throw {
          status: error.status || 500,
          message: error.message || 'Commit failed',
          errors: error.errors || [],
        } as ReallocationError;
      }
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/allocations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio-companies'] });
      queryClient.invalidateQueries({ queryKey: [`/api/funds/${fundId}`] });
    },
  });
}
