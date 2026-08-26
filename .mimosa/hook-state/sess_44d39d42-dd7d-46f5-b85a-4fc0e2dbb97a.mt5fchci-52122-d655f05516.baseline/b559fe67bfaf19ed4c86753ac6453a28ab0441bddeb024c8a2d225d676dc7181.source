/**
 * Scenario-set list query hook (Plan 9 Wave 9B2 fix round F1).
 *
 * Reuses the scenario workspace's fetcher and query key VERBATIM so the
 * Summary readiness rollup shares the react-query cache with the Scenarios
 * destination page. The list is the completeness authority for the rollup's
 * Scenarios row: the results section only carries sets with calculated
 * snapshots, so active sets missing from it must degrade the row.
 *
 * @module client/hooks/use-scenario-set-list
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchScenarioSetList } from '@/lib/fund-scenario-workspace-api';
import { scenarioSetListQueryKey } from '@/lib/fund-scenario-workspace-query-keys';
import type { FundScenarioSetSummaryV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';

export function useScenarioSetList(
  fundId: string | null
): UseQueryResult<FundScenarioSetSummaryV1[], Error> {
  return useQuery<FundScenarioSetSummaryV1[], Error>({
    queryKey:
      fundId !== null ? scenarioSetListQueryKey(fundId) : ['fund-scenario-workspace', 'invalid'],
    queryFn: () => fetchScenarioSetList(fundId ?? ''),
    enabled: fundId !== null,
  });
}
