import type { UseMutationResult } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InvestmentRoundCreate,
  InvestmentRoundResponse,
} from '@shared/contracts/investments/investment-round.contract';
import { apiRequest } from '@/lib/queryClient';

export function investmentRoundsQueryKey(investmentId: string | number | undefined) {
  return ['investment-rounds', investmentId] as const;
}

export function useCreateRound(
  investmentId: string | number | undefined
): UseMutationResult<InvestmentRoundResponse, Error, InvestmentRoundCreate> {
  const queryClient = useQueryClient();

  return useMutation<InvestmentRoundResponse, Error, InvestmentRoundCreate>({
    mutationFn: async (payload) => {
      if (!investmentId) {
        throw new Error('No investment ID available');
      }

      return apiRequest<InvestmentRoundResponse>(
        'POST',
        `/api/investments/${investmentId}/rounds`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: investmentRoundsQueryKey(investmentId) });
    },
  });
}
