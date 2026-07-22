import type { UseMutationResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CurrentPlanVersionV1 } from '@shared/contracts/current-plan-version-v1.contract';
import { apiRequest } from '@/lib/queryClient';

export const currentPlanVersionsQueryKey = (fundId: number | undefined) =>
  ['current-plan-versions', fundId ?? null] as const;

export interface MintCurrentPlanVersionInput {
  asOfDate?: string;
}

interface CurrentPlanVersionsResult {
  versions: CurrentPlanVersionV1[];
  headVersion: CurrentPlanVersionV1 | null;
  isLoading: boolean;
  error: Error | null;
  mint: UseMutationResult<CurrentPlanVersionV1, Error, MintCurrentPlanVersionInput | void>;
}

export function useCurrentPlanVersions(fundId: number | undefined): CurrentPlanVersionsResult {
  const queryClient = useQueryClient();
  const query = useQuery<CurrentPlanVersionV1[], Error>({
    queryKey: currentPlanVersionsQueryKey(fundId),
    enabled: fundId != null,
    queryFn: () =>
      apiRequest<CurrentPlanVersionV1[]>('GET', `/api/funds/${fundId}/current-plan-versions`),
  });
  const mint = useMutation<CurrentPlanVersionV1, Error, MintCurrentPlanVersionInput | void>({
    mutationFn: (input) => {
      if (fundId == null) {
        throw new Error('No fund ID available');
      }

      const asOfDate = input?.asOfDate;
      return apiRequest<CurrentPlanVersionV1>(
        'POST',
        `/api/funds/${fundId}/current-plan-versions`,
        { ...(asOfDate != null && { asOfDate }) },
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
        }
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: currentPlanVersionsQueryKey(fundId) }),
  });
  const versions = query.data ?? [];

  return {
    versions,
    headVersion: versions.find((version) => version.supersededByVersionId === null) ?? null,
    isLoading: query.isLoading,
    error: query.error,
    mint,
  };
}
