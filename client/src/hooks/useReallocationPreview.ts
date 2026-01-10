import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
        return apiRequest<ReallocationPreviewResponse>(
          'POST',
          `/api/funds/${fundId}/reallocation/preview`,
          request
        );
      } catch (error: unknown) {
        // Transform error to match ReallocationError type
        const err = error as { status?: number; message?: string; errors?: string[] };
        throw {
          status: err.status || 500,
          message: err.message || 'Preview failed',
          errors: err.errors || [],
        } as ReallocationError;
      }
    },
  });
}
