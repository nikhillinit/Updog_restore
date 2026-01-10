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

  return useMutation<ReallocationCommitResponse, ReallocationError, ReallocationCommitRequest>({
    mutationFn: async (request: ReallocationCommitRequest) => {
      try {
        return apiRequest<ReallocationCommitResponse>(
          'POST',
          `/api/funds/${fundId}/reallocation/commit`,
          request
        );
      } catch (error: unknown) {
        // Transform error to match ReallocationError type
        const err = error as { status?: number; message?: string; errors?: string[] };
        throw {
          status: err.status || 500,
          message: err.message || 'Commit failed',
          errors: err.errors || [],
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
