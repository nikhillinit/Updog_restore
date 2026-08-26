import { useQuery } from '@tanstack/react-query';

import { fetchCompanyScenarios } from '@/lib/fund-scenario-workspace-api';
import { companyScenarioListQueryKey } from '@/lib/fund-scenario-workspace-query-keys';

export function useCompanyScenarios(companyId: string | null | undefined) {
  const query = useQuery({
    queryKey: companyScenarioListQueryKey(companyId ?? 'unavailable'),
    enabled: Boolean(companyId),
    queryFn: () => fetchCompanyScenarios(companyId ?? ''),
  });

  return {
    scenarios: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
  };
}
