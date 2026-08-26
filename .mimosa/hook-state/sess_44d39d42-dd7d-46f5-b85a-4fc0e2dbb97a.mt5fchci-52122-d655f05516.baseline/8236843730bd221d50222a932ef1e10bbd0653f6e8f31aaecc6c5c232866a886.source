import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useFeatureFlag } from '@/core/flags/flagAdapter';
import { fundScenarioSeedsQueryKey } from '@/lib/fund-scenario-workspace-query-keys';
import { apiRequest } from '@/lib/queryClient';
import { Sha256Schema } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { ScenarioCaseSeedV1Schema } from '@shared/contracts/scenarios/scenario-case-seed-v1.contract';

export const FundScenarioSeedsResponseSchema = z.discriminatedUnion('factsStatus', [
  z
    .object({
      fundId: z.number().int().positive(),
      asOfDate: z.string().date(),
      factsStatus: z.literal('available'),
      factsInputHash: Sha256Schema,
      seeds: z.array(ScenarioCaseSeedV1Schema),
    })
    .strict(),
  z
    .object({
      fundId: z.number().int().positive(),
      asOfDate: z.string().date(),
      factsStatus: z.literal('failed'),
      factsInputHash: z.null(),
      seeds: z.array(ScenarioCaseSeedV1Schema).max(0),
    })
    .strict(),
]);

export type FundScenarioSeedsResponse = z.infer<typeof FundScenarioSeedsResponseSchema>;

export function useFundScenarioSeeds(fundId: string | null | undefined) {
  const enabledByFlag = useFeatureFlag('enable_scenario_seed_picker');
  const query = useQuery({
    queryKey: fundScenarioSeedsQueryKey(fundId ?? 'unavailable'),
    enabled: Boolean(fundId) && enabledByFlag,
    queryFn: async () => {
      const raw = await apiRequest(
        'GET',
        `/api/funds/${encodeURIComponent(fundId ?? '')}/scenario-analysis/seeds`
      );
      return FundScenarioSeedsResponseSchema.parse(raw);
    },
  });

  return {
    seeds: query.data?.seeds ?? [],
    response: query.data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
