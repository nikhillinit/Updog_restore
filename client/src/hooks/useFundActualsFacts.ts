import { useQuery } from '@tanstack/react-query';
import type { FundCompanyActualsFactsResponse } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { apiRequest } from '@/lib/queryClient';

export const fundActualsFactsQueryKey = (
  fundId: number | undefined,
  asOfDate?: string
) => ['fund-actuals-facts', fundId ?? null, asOfDate ?? null] as const;

export function useFundActualsFacts(
  fundId: number | undefined,
  asOfDate?: string
) {
  const query = useQuery<FundCompanyActualsFactsResponse>({
    queryKey: fundActualsFactsQueryKey(fundId, asOfDate),
    enabled: fundId != null,
    queryFn: async () => {
      const suffix = asOfDate
        ? `?asOfDate=${encodeURIComponent(asOfDate)}`
        : '';
      return apiRequest<FundCompanyActualsFactsResponse>(
        'GET',
        `/api/funds/${fundId}/actuals/facts${suffix}`
      );
    },
  });

  return {
    facts: query.data?.facts ?? [],
    response: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
