import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface TimelineEvent {
  id: number;
  eventType: string;
  eventTime: string;
  operation: string;
  entityType: string;
  metadata: Record<string, unknown>;
}

export interface Snapshot {
  id: number;
  snapshotTime: string;
  eventCount: number;
  stateHash: string;
  metadata: Record<string, unknown>;
}

export interface TimelineData {
  fundId: number;
  timeRange: {
    start: string;
    end: string;
  };
  events: TimelineEvent[];
  snapshots: Snapshot[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface StateComparison {
  fundId: string;
  comparison: {
    timestamp1: string;
    timestamp2: string;
    state1: {
      snapshotId: number;
      eventCount: number;
    };
    state2: {
      snapshotId: number;
      eventCount: number;
    };
  };
  differences: Array<Record<string, unknown>>;
  summary: {
    totalChanges: number;
    timeSpan: number;
  };
}

export interface PointInTimeState {
  fundId: number;
  timestamp: string;
  snapshot: {
    id: number;
    time: string;
    eventCount: number;
    stateHash: string;
  };
  state: Record<string, unknown>;
  eventsApplied: number;
  events?: TimelineEvent[];
}

/**
 * Hook to fetch timeline data for a fund
 */
export function useTimelineData(
  fundId: number,
  options: {
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  return useQuery<TimelineData>({
    queryKey: ['/api/timeline', fundId, options],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (options.startTime) searchParams['set']('startTime', options.startTime);
      if (options.endTime) searchParams['set']('endTime', options.endTime);
      if (options.limit) searchParams['set']('limit', options.limit.toString());
      if (options.offset) searchParams['set']('offset', options.offset.toString());

      const url = `/api/timeline/${fundId}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      return apiRequest<TimelineData>('GET', url);
    },
    enabled: !!fundId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch fund state at a specific point in time
 */
export function usePointInTimeState(
  fundId: number,
  timestamp: string,
  includeEvents: boolean = false
) {
  return useQuery<PointInTimeState>({
    queryKey: ['/api/timeline', fundId, 'state', timestamp, includeEvents],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        timestamp,
        includeEvents: includeEvents.toString(),
      });

      return apiRequest<PointInTimeState>(
        'GET',
        `/api/timeline/${fundId}/state?${searchParams.toString()}`
      );
    },
    enabled: !!fundId && !!timestamp,
    staleTime: 300000, // 5 minutes (historical data changes rarely)
  });
}

/**
 * Hook to compare fund states at two different times
 */
export function useStateComparison(
  fundId: number,
  timestamp1: string,
  timestamp2: string,
  includeDiff: boolean = true
) {
  return useQuery<StateComparison>({
    queryKey: ['/api/timeline', fundId, 'compare', timestamp1, timestamp2, includeDiff],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        timestamp1,
        timestamp2,
        includeDiff: includeDiff.toString(),
      });

      return apiRequest<StateComparison>(
        'GET',
        `/api/timeline/${fundId}/compare?${searchParams.toString()}`
      );
    },
    enabled: !!fundId && !!timestamp1 && !!timestamp2,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook to fetch latest events across all funds
 */
export function useLatestEvents(limit: number = 20, eventTypes?: string[]) {
  return useQuery({
    queryKey: ['/api/timeline/events/latest', limit, eventTypes],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams['set']('limit', limit.toString());
      if (eventTypes && eventTypes.length > 0) {
        eventTypes.forEach((type) => searchParams.append('eventTypes', type));
      }

      return apiRequest<{ success: boolean; events: TimelineEvent[]; count: number }>(
        'GET',
        `/api/timeline/events/latest?${searchParams.toString()}`
      );
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}

/**
 * Mutation to create a new snapshot
 */
export function useCreateSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      type?: 'manual' | 'scheduled' | 'auto';
      description?: string;
    }) => {
      return apiRequest<{ success: boolean; snapshot: Snapshot }>(
        'POST',
        `/api/timeline/${params.fundId}/snapshot`,
        {
          type: params.type || 'manual',
          description: params.description,
        }
      );
    },
    onSuccess: (_data, variables) => {
      // Invalidate timeline queries for this fund
      queryClient.invalidateQueries({
        queryKey: ['/api/timeline', variables.fundId],
      });
    },
  });
}

/**
 * Hook to restore fund state from a snapshot
 */
export function useRestoreSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      snapshotId: number;
      confirmationCode?: string;
    }) => {
      // This would typically be a separate API endpoint for restoration
      // For now, we'll just simulate the action
      return apiRequest<{ success: boolean; message: string }>(
        'POST',
        `/api/timeline/${params.fundId}/restore`,
        {
          snapshotId: params.snapshotId,
          confirmationCode: params.confirmationCode,
        }
      );
    },
    onSuccess: (_data, variables) => {
      // Invalidate all fund-related queries after restoration
      queryClient.invalidateQueries({
        queryKey: ['/api/timeline', variables.fundId],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/funds', variables.fundId],
      });
    },
  });
}
