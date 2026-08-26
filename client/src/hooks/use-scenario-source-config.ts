import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchScenarioSourceConfig } from '@/lib/fund-scenario-workspace-api';
import { scenarioSourceConfigQueryKey } from '@/lib/fund-scenario-workspace-query-keys';
import type { FundScenarioSourceConfigResponseV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';

export function useScenarioSourceConfig(
  fundId: string | null,
  enabled = true
): UseQueryResult<FundScenarioSourceConfigResponseV1, Error> {
  return useQuery<FundScenarioSourceConfigResponseV1, Error>({
    queryKey:
      fundId !== null
        ? scenarioSourceConfigQueryKey(fundId)
        : ['fund-scenario-workspace', 'invalid-source-config'],
    queryFn: () => fetchScenarioSourceConfig(fundId ?? ''),
    enabled: fundId !== null && enabled,
  });
}
