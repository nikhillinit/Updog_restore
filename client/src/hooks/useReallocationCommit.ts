import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { readCurrentVersions } from '@/lib/reallocation-utils';
import { invalidatePortfolioData } from '@/lib/invalidate-portfolio-data';
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
        const response = await apiRequest<ReallocationCommitResponse>(
          'POST',
          `/api/funds/${fundId}/reallocation/commit`,
          request
        );
        // Invalidate here, not in a hook-level onSuccess: this closure holds the
        // fund the request was sent to even if the tab switched funds meanwhile.
        void queryClient.invalidateQueries({ queryKey: ['/api/allocations'] });
        void queryClient.invalidateQueries({ queryKey: [`/api/funds/${fundId}`] });
        invalidatePortfolioData(queryClient, fundId);
        return response;
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string; errors?: string[] };
        const reallocationError: ReallocationError = {
          status: err.status || 500,
          message: err.message || 'Commit failed',
          errors: err.errors || [],
        };
        if (error instanceof ApiError) {
          const currentVersions = readCurrentVersions(error.details);
          if (currentVersions) reallocationError.currentVersions = currentVersions;
        }
        throw reallocationError;
      }
    },
  });
}
