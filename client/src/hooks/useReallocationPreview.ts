import { useMutation } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { readCurrentVersions } from '@/lib/reallocation-utils';
import type {
  ReallocationPreviewRequest,
  ReallocationPreviewResponse,
  ReallocationError,
} from '@/types/reallocation';

/**
 * Hook for previewing reallocation changes
 *
 * Makes a read-only API call to calculate deltas, validate changes,
 * and return warnings without modifying data.
 */
export function useReallocationPreview(fundId: number) {
  return useMutation<ReallocationPreviewResponse, ReallocationError, ReallocationPreviewRequest>({
    mutationFn: async (request: ReallocationPreviewRequest) => {
      try {
        return await apiRequest<ReallocationPreviewResponse>(
          'POST',
          `/api/funds/${fundId}/reallocation/preview`,
          request
        );
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string; errors?: string[] };
        const reallocationError: ReallocationError = {
          status: err.status || 500,
          message: err.message || 'Preview failed',
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
