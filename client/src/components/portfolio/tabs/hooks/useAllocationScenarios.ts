import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type {
  AllocationScenarioActionPayload,
  AllocationScenarioApplyPreview,
  AllocationScenarioApplyResult,
  AllocationScenarioDetail,
  CreateReserveIcDecisionPayload,
  AllocationScenarioListResponse,
  AllocationScenarioSyncResult,
  ApplyAllocationScenarioPayload,
  CreateAllocationScenarioPayload,
  ReserveIcDecision,
  ReserveIcDecisionListResponse,
  UpdateReserveIcDecisionPayload,
  UpdateAllocationScenarioPayload,
} from '../types';

interface ApiErrorBody {
  message?: string;
}

function buildErrorMessage(errorData: ApiErrorBody, fallback: string) {
  return errorData.message || fallback;
}

function getScenarioDetailQueryKey(fundId: number | null | undefined, scenarioId: string | null) {
  return ['allocations', 'scenarios', fundId, scenarioId] as const;
}

function getScenarioListQueryKey(fundId: number | null | undefined) {
  return ['allocations', 'scenarios', fundId] as const;
}

function getLatestAllocationsQueryKey(fundId: number | null | undefined) {
  return ['allocations', 'latest', fundId] as const;
}

function getScenarioDecisionListQueryKey(
  fundId: number | null | undefined,
  scenarioId: string | null
) {
  return ['allocations', 'scenarios', fundId, scenarioId, 'decisions'] as const;
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

export function useAllocationScenarioDecisions(
  scenarioId: string | null,
  options?: { enabled?: boolean }
) {
  const { fundId } = useFundContext();

  return useQuery<ReserveIcDecisionListResponse>({
    queryKey: getScenarioDecisionListQueryKey(fundId, scenarioId),
    queryFn: async () => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios/${scenarioId}/decisions`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to fetch Reserve IC decisions'));
      }

      return response.json() as Promise<ReserveIcDecisionListResponse>;
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
      await queryClient.invalidateQueries({ queryKey: getScenarioListQueryKey(fundId) });
      queryClient.setQueryData(getScenarioDetailQueryKey(fundId, scenario.id), scenario);
    },
  });
}

export function useCreateReserveIcDecision(scenarioId: string | null) {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateReserveIcDecisionPayload) => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios/${scenarioId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to create Reserve IC decision'));
      }

      return response.json() as Promise<ReserveIcDecision>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getScenarioDecisionListQueryKey(fundId, scenarioId) }),
        queryClient.invalidateQueries({ queryKey: getScenarioDetailQueryKey(fundId, scenarioId) }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getScenarioListQueryKey(fundId) }),
        queryClient.invalidateQueries({
          queryKey: getScenarioDecisionListQueryKey(fundId, scenario.id),
        }),
      ]);
      queryClient.setQueryData(getScenarioDetailQueryKey(fundId, scenario.id), scenario);
    },
  });
}

export function useUpdateReserveIcDecision(scenarioId: string | null) {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      decisionId,
      payload,
    }: {
      decisionId: string;
      payload: UpdateReserveIcDecisionPayload;
    }) => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(
        `/api/funds/${fundId}/allocation-scenarios/${scenarioId}/decisions/${decisionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to update Reserve IC decision'));
      }

      return response.json() as Promise<ReserveIcDecision>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getScenarioDecisionListQueryKey(fundId, scenarioId) }),
        queryClient.invalidateQueries({ queryKey: getScenarioDetailQueryKey(fundId, scenarioId) }),
      ]);
    },
  });
}

export function useAllocationScenarioApplyPreview(scenarioId: string | null) {
  const { fundId } = useFundContext();

  return useMutation<AllocationScenarioApplyPreview, Error, void>({
    mutationFn: async () => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(
        `/api/funds/${fundId}/allocation-scenarios/${scenarioId}/apply-preview`
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(
          buildErrorMessage(errorData, 'Failed to preview allocation scenario apply')
        );
      }

      return response.json() as Promise<AllocationScenarioApplyPreview>;
    },
  });
}

export function useSyncAllocationScenario(scenarioId: string | null) {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation<AllocationScenarioSyncResult, Error, AllocationScenarioActionPayload>({
    mutationFn: async (payload) => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios/${scenarioId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to sync allocation scenario'));
      }

      return response.json() as Promise<AllocationScenarioSyncResult>;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getScenarioListQueryKey(fundId) }),
        queryClient.invalidateQueries({
          queryKey: getScenarioDecisionListQueryKey(fundId, result.scenario.id),
        }),
      ]);
      queryClient.setQueryData(getScenarioDetailQueryKey(fundId, result.scenario.id), result.scenario);
    },
  });
}

export function useApplyAllocationScenario(scenarioId: string | null) {
  const { fundId } = useFundContext();
  const queryClient = useQueryClient();

  return useMutation<AllocationScenarioApplyResult, Error, ApplyAllocationScenarioPayload>({
    mutationFn: async (payload) => {
      if (!fundId || !scenarioId) {
        throw new Error('Fund ID and scenario ID are required');
      }

      const response = await fetch(`/api/funds/${fundId}/allocation-scenarios/${scenarioId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(buildErrorMessage(errorData, 'Failed to apply allocation scenario'));
      }

      return response.json() as Promise<AllocationScenarioApplyResult>;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getScenarioListQueryKey(fundId) }),
        queryClient.invalidateQueries({ queryKey: getLatestAllocationsQueryKey(fundId) }),
        queryClient.invalidateQueries({
          queryKey: getScenarioDecisionListQueryKey(fundId, result.scenario.id),
        }),
      ]);
      queryClient.setQueryData(getScenarioDetailQueryKey(fundId, result.scenario.id), result.scenario);
    },
  });
}
