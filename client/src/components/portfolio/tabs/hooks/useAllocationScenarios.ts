import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type {
  AllocationScenarioDetail,
  AllocationScenarioListResponse,
  CreateAllocationScenarioPayload,
  UpdateAllocationScenarioPayload,
} from '../types';

interface ApiErrorBody {
  message?: string;
}

function buildErrorMessage(errorData: ApiErrorBody, fallback: string) {
  return errorData.message || fallback;
}

export function useAllocationScenarioList() {
  const { fundId } = useFundContext();

  return useQuery<AllocationScenarioListResponse>({
    queryKey: ['allocations', 'scenarios', fundId],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('Fund ID is required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch allocation scenarios'));
      }

      return response.json() as Promise<AllocationScenarioListResponse>;
    },
    enabled: !!fundId,
    staleTime: 1000 * 30,
  });
}

export function useAllocationScenarioDetail(
  scenarioId: string | null,
  options?: { enabled?: boolean }
) {
  const { fundId } = useFundContext();

  return useQuery<AllocationScenarioDetail>({
    queryKey: ['allocations', 'scenarios', fundId, scenarioId],
    queryFn: async () => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios/${scenarioId}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch allocation scenario'));
      }

      return response.json() as Promise<AllocationScenarioDetail>;
    },
    enabled: !!fundId && !!scenarioId && (options?.enabled ?? true),
    staleTime: 0,
  });
}

export function useCreateAllocationScenario() {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation<AllocationScenarioDetail, Error, CreateAllocationScenarioPayload>({
    mutationFn: async (payload) => {
      if (!fundId) {
        throw new Error('Fund ID is required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to create allocation scenario'));
      }

      return response.json() as Promise<AllocationScenarioDetail>;
    },
    onSuccess: async (scenario) => {
      await queryClient.invalidateQueries({ queryKey: ['allocations', 'scenarios', fundId] });
      queryClient.setQueryData(['allocations', 'scenarios', fundId, scenario.id], scenario);
    },
  });
}

export function useUpdateAllocationScenario(scenarioId: string | null) {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation<AllocationScenarioDetail, Error, UpdateAllocationScenarioPayload>({
    mutationFn: async (payload) => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios/${scenarioId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to update allocation scenario'));
      }

      return response.json() as Promise<AllocationScenarioDetail>;
    },
    onSuccess: async (scenario) => {
      await queryClient.invalidateQueries({ queryKey: ['allocations', 'scenarios', fundId] });
      queryClient.setQueryData(['allocations', 'scenarios', fundId, scenario.id], scenario);
    },
  });
}
