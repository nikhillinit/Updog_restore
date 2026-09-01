import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TaskCreate,
  TaskListResponse,
  TaskResponse,
} from '@shared/contracts/operating-objects/task.contract';
import type {
  TaskEvidenceLinkListResponse,
  TaskEvidenceLinkV1,
} from '@shared/contracts/operating-objects/task-evidence-link.contract';
import { apiRequest } from '@/lib/queryClient';

interface EvidenceLinksOptions {
  enabled: boolean;
}

export function useTasks(fundId: string | undefined): UseQueryResult<TaskResponse[], Error> {
  return useQuery<TaskResponse[], Error>({
    queryKey: ['tasks', fundId],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const response = await apiRequest<TaskListResponse>('GET', `/api/funds/${fundId}/tasks`);
      return response.data;
    },
    enabled: Boolean(fundId),
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateTask(
  fundId: string | undefined
): UseMutationResult<TaskResponse, Error, TaskCreate> {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, TaskCreate>({
    mutationFn: async (input) => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      return apiRequest<TaskResponse>('POST', `/api/funds/${fundId}/tasks`, input, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', fundId] }),
  });
}

export function useTaskEvidenceLinks(
  fundId: string | undefined,
  taskId: number | undefined,
  options: EvidenceLinksOptions
): UseQueryResult<TaskEvidenceLinkV1[], Error> {
  return useQuery<TaskEvidenceLinkV1[], Error>({
    queryKey: ['task-evidence-links', fundId, taskId],
    queryFn: async () => {
      if (!fundId || taskId === undefined) {
        throw new Error('Fund and task IDs are required');
      }

      const response = await apiRequest<TaskEvidenceLinkListResponse>(
        'GET',
        `/api/funds/${fundId}/tasks/${taskId}/evidence-links`
      );
      return response.data;
    },
    enabled: options.enabled && Boolean(fundId) && taskId !== undefined,
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}
