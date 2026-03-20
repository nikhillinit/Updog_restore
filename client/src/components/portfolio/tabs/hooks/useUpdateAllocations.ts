/**
 * Custom hook to update allocation data with optimistic locking
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type { UpdateAllocationPayload } from '../types';

interface ApiErrorBody {
  message?: string;
}

interface UpdateAllocationsOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useUpdateAllocations(options?: UpdateAllocationsOptions) {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateAllocationPayload>({
    mutationFn: async (updates) => {
      if (!fundId) {
        throw new Error('Fund ID is required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;

        // Handle optimistic locking conflict
        if (response.status === 409) {
          throw new Error('Allocation has been modified by another user. Please refresh and try again.');
        }

        throw new Error(errorData.message || 'Failed to update allocation');
      }

      await response.text();
    },
    onSuccess: () => {
      // Invalidate and refetch allocations
      queryClient.invalidateQueries({ queryKey: ['allocations', 'latest', fundId] });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });
}
