import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type {
  TaskListResponse,
  TaskResponse,
} from '@shared/contracts/operating-objects/task.contract';
import { apiRequest } from '@/lib/queryClient';

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
