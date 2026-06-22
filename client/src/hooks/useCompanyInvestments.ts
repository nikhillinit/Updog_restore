import { useQuery } from '@tanstack/react-query';
import type { Investment } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export function companyInvestmentsQueryKey(
  fundId: number | undefined,
  companyId: number | undefined
) {
  return ['company-investments', fundId ?? null, companyId ?? null] as const;
}

export function useCompanyInvestments(
  fundId: number | undefined,
  companyId: number | undefined
) {
  const query = useQuery<Investment[]>({
    queryKey: companyInvestmentsQueryKey(fundId, companyId),
    enabled: fundId != null && companyId != null,
    staleTime: 60_000,
    queryFn: async () => {
      const all = await apiRequest<Investment[]>('GET', `/api/investments?fundId=${fundId}`);
      return all.filter((inv) => inv.companyId === companyId);
    },
  });

  return {
    investments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
