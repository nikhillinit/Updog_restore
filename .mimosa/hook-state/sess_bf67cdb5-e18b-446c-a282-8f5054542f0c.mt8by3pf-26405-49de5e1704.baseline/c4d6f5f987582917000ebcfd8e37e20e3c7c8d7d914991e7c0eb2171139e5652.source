/**
 * Container hook for the Summary readiness rollup (Plan 9 Wave 9B2).
 *
 * Consumes ONLY existing hooks/endpoints (dual forecast, latest allocations,
 * MOIC rankings v2) plus the scenarios section the page already fetched, and
 * maps their query states onto the pure derivation's inputs. Fail-closed fund
 * scoping: the allocations hook reads the FundContext fund, so its data is
 * rendered ONLY when that fund is the validated route fund — a mismatched or
 * unresolved context reads "Facts unavailable", never another fund's facts.
 *
 * @module client/pages/fund-model-results/use-readiness-rollup
 */

import { useFundContext } from '@/contexts/FundContext';
import { useDualForecast } from '@/hooks/useDualForecast';
import { useFundMoicRankingsV2 } from '@/hooks/use-moic';
import { useScenarioSetList } from '@/hooks/use-scenario-set-list';
import { useLatestAllocations } from '@/components/portfolio/tabs/hooks/useLatestAllocations';
import type { AllocationsResponse } from '@/components/portfolio/tabs/types';
import {
  deriveReadinessRollup,
  type ReadinessRollupModel,
  type ReadinessSourceInput,
  type ScenariosSection,
} from './readiness-rollup';

const NO_FUND_MESSAGE = 'No fund is resolved on this route';

interface QueryLike<T> {
  isSuccess: boolean;
  isError: boolean;
  data: T | undefined;
  error: unknown;
}

function queryInput<T>(query: QueryLike<T>): ReadinessSourceInput<T> {
  if (query.isSuccess && query.data !== undefined) {
    return { kind: 'data', data: query.data };
  }
  if (query.isError) {
    const message =
      query.error instanceof Error && query.error.message.length > 0 ? query.error.message : null;
    return { kind: 'error', message };
  }
  return { kind: 'loading' };
}

export function useReadinessRollup(
  routeFundId: string | null,
  scenarios: ReadinessSourceInput<ScenariosSection>
): ReadinessRollupModel {
  const validFundId = routeFundId !== null && /^[1-9]\d*$/.test(routeFundId) ? routeFundId : null;
  const numericFundId = validFundId === null ? null : Number(validFundId);

  // Hooks run unconditionally (rules of hooks); their queries are disabled
  // while the route fund is unresolved.
  const forecastQuery = useDualForecast(numericFundId);
  const reservesQuery = useFundMoicRankingsV2(numericFundId);
  // Fix round F1: the scenario-set list (workspace fetcher + query key,
  // shared cache) is the completeness authority for the Scenarios row.
  const scenarioSetListQuery = useScenarioSetList(validFundId);
  const allocationsQuery = useLatestAllocations();
  const { fundId: contextFundId, isLoading: fundContextLoading } = useFundContext();

  if (numericFundId === null) {
    const noFund: ReadinessSourceInput<never> = { kind: 'error', message: NO_FUND_MESSAGE };
    return deriveReadinessRollup({
      fundId: null,
      forecast: noFund,
      portfolioActuals: noFund,
      reserves: noFund,
      scenarios: noFund,
      scenarioSetList: noFund,
    });
  }

  const portfolioActuals: ReadinessSourceInput<AllocationsResponse> =
    contextFundId === numericFundId
      ? queryInput(allocationsQuery)
      : fundContextLoading
        ? { kind: 'loading' }
        : { kind: 'error', message: 'Allocation facts are not resolved for this fund' };

  return deriveReadinessRollup({
    fundId: validFundId,
    forecast: queryInput(forecastQuery),
    portfolioActuals,
    reserves: queryInput(reservesQuery),
    scenarios,
    scenarioSetList: queryInput(scenarioSetListQuery),
  });
}
