import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type {
  PlanningFmvOverrideCreateRequest,
  PlanningFmvOverrideCreateResponse,
  PlanningFmvOverrideLatestResponse,
} from '@shared/contracts/lp-reporting';
import { buildErrorMessage, readApiErrorBody, readJsonResponse } from './jsonResponse';

export type CreatePlanningFmvOverridePayload = PlanningFmvOverrideCreateRequest;

export function getPlanningFmvLatestQueryKey(fundId: number | null | undefined) {
  return ['allocations', 'planning-fmv-overrides', 'latest', fundId] as const;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `planning-fmv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useLatestPlanningFmvOverrides(options?: { enabled?: boolean }) {
  const { fundId } = useFundContext();

  return useQuery<PlanningFmvOverrideLatestResponse>({
    queryKey: getPlanningFmvLatestQueryKey(fundId),
    queryFn: async () => {
      if (!fundId) {
        throw new Error('Fund ID is required');
      }

      const response = await fetch(`/api/funds/${fundId}/planning/fmv-overrides/latest`);
      if (!response.ok) {
        const errorData = await readApiErrorBody(
          response,
          'Failed to fetch Planning FMV overrides'
        );
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch Planning FMV overrides'));
      }

      return readJsonResponse<PlanningFmvOverrideLatestResponse>(
        response,
        'Failed to fetch Planning FMV overrides'
      );
    },
    enabled: !!fundId && (options?.enabled ?? true),
    staleTime: 1000 * 30,
  });
}

export function useCreatePlanningFmvOverride() {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation<PlanningFmvOverrideCreateResponse, Error, CreatePlanningFmvOverridePayload>({
    mutationFn: async (payload) => {
      if (!fundId) {
        throw new Error('Fund ID is required');
      }

      const response = await fetch(`/api/funds/${fundId}/planning/fmv-overrides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': createIdempotencyKey(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await readApiErrorBody(response, 'Failed to save Planning FMV override');
        throw new Error(buildErrorMessage(errorData, 'Failed to save Planning FMV override'));
      }

      return readJsonResponse<PlanningFmvOverrideCreateResponse>(
        response,
        'Failed to save Planning FMV override'
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getPlanningFmvLatestQueryKey(fundId) });
    },
  });
}
