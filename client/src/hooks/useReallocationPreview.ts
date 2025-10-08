/* eslint-disable @typescript-eslint/no-explicit-any */
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
  return useMutation<
    ReallocationPreviewResponse,
    ReallocationError,
    ReallocationPreviewRequest
  >({
    mutationFn: async (request: ReallocationPreviewRequest) => {
      try {
        const response = await apiRequest(
          'POST',
          `/api/funds/${fundId}/reallocation/preview`,
          request
        );
        return await response.json();
      } catch (error: any) {
        // Transform error to match ReallocationError type
        throw {
          status: error.status || 500,
          message: error.message || 'Preview failed',
          errors: error.errors || [],
        } as ReallocationError;
      }
    },
  });
}
