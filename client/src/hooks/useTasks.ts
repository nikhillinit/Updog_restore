import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TaskCreate,
  TaskListResponse,
  TaskPatch,
  TaskResponse,
} from '@shared/contracts/operating-objects/task.contract';
import type {
  TaskEvidenceLinkListResponse,
  TaskEvidenceLinkCreateRequest,
  TaskEvidenceLinkV1,
} from '@shared/contracts/operating-objects/task-evidence-link.contract';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';

interface EvidenceLinksOptions {
  enabled: boolean;
}

interface UpdateTaskVariables {
  taskId: number;
  etag: string;
  input: TaskPatch;
}

interface CreateTaskEvidenceLinkVariables {
  taskId: number;
  input: TaskEvidenceLinkCreateRequest;
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
  const idempotencyKey = useIdempotencyKey();

  return useMutation<TaskResponse, Error, TaskCreate>({
    mutationFn: async (input) => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      return apiRequest<TaskResponse>('POST', `/api/funds/${fundId}/tasks`, input, {
        headers: { 'Idempotency-Key': idempotencyKey.keyFor(input) },
      });
    },
    onSuccess: () => {
      idempotencyKey.reset();
      return queryClient.invalidateQueries({ queryKey: ['tasks', fundId] });
    },
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

export function useUpdateTask(
  fundId: string | undefined
): UseMutationResult<TaskResponse, Error, UpdateTaskVariables> {
  const queryClient = useQueryClient();
  const idempotencyKey = useIdempotencyKey();
  const mutation = useMutation<TaskResponse, Error, UpdateTaskVariables>({
    mutationFn: async ({ taskId, etag, input }) => {
      if (!fundId || !etag) throw new Error('Fund ID and task ETag are required');
      return apiRequest<TaskResponse>('PATCH', `/api/funds/${fundId}/tasks/${taskId}`, input, {
        headers: {
          'If-Match': etag,
          'Idempotency-Key': idempotencyKey.keyFor({ fundId, taskId, etag, input }),
        },
      });
    },
    onSuccess: () => {
      idempotencyKey.reset();
      return queryClient.invalidateQueries({ queryKey: ['tasks', fundId] });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 412) {
        await queryClient.invalidateQueries({ queryKey: ['tasks', fundId] });
      }
    },
  });
  return {
    ...mutation,
    reset: () => {
      idempotencyKey.reset();
      mutation.reset();
    },
  };
}

export function useCreateTaskEvidenceLink(
  fundId: string | undefined
): UseMutationResult<TaskEvidenceLinkV1, Error, CreateTaskEvidenceLinkVariables> {
  const queryClient = useQueryClient();
  const idempotencyKey = useIdempotencyKey();
  return useMutation<TaskEvidenceLinkV1, Error, CreateTaskEvidenceLinkVariables>({
    mutationFn: async ({ taskId, input }) => {
      if (!fundId) throw new Error('No fund ID available');
      return apiRequest<TaskEvidenceLinkV1>(
        'POST',
        `/api/funds/${fundId}/tasks/${taskId}/evidence-links`,
        input,
        { headers: { 'Idempotency-Key': idempotencyKey.keyFor({ fundId, taskId, input }) } }
      );
    },
    onSuccess: async (_link, { taskId }) => {
      idempotencyKey.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks', fundId] }),
        queryClient.invalidateQueries({ queryKey: ['task-evidence-links', fundId, taskId] }),
      ]);
    },
  });
}
