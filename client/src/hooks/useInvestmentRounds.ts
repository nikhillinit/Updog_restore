import { useQuery } from '@tanstack/react-query';
import type {
  InvestmentRoundListResponse,
  InvestmentRoundResponse,
} from '@shared/contracts/investments/investment-round.contract';
import { apiRequest } from '@/lib/queryClient';
import { investmentRoundsQueryKey } from '@/hooks/useCreateRound';

export function useInvestmentRounds(investmentId: number | undefined) {
  const query = useQuery<InvestmentRoundResponse[]>({
    queryKey: investmentRoundsQueryKey(investmentId),
    enabled: investmentId != null,
    queryFn: async () => {
      const res = await apiRequest<InvestmentRoundListResponse>(
        'GET',
        `/api/investments/${investmentId}/rounds`
      );
      return res.data;
    },
  });

  return {
    rounds: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
