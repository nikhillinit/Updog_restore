import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface TimelineEvent {
  id: number;
  eventType: string;
  eventTime: string;
  operation: string;
  entityType: string;
  metadata: any;
}

export interface Snapshot {
  id: number;
  snapshotTime: string;
  eventCount: number;
  stateHash: string;
  metadata: any;
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
  differences: any[];
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
  state: any;
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
      if (options.startTime) searchParams.set('startTime', options.startTime);
      if (options.endTime) searchParams.set('endTime', options.endTime);
      if (options.limit) searchParams.set('limit', options.limit.toString());
      if (options.offset) searchParams.set('offset', options.offset.toString());

      const url = `/api/timeline/${fundId}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const response = await apiRequest('GET', url);
      return response.json();
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

      const response = await apiRequest('GET', `/api/timeline/${fundId}/state?${searchParams.toString()}`);
      return response.json();
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

      const response = await apiRequest('GET', `/api/timeline/${fundId}/compare?${searchParams.toString()}`);
      return response.json();
    },
    enabled: !!fundId && !!timestamp1 && !!timestamp2,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook to fetch latest events across all funds
 */
export function useLatestEvents(
  limit: number = 20,
  eventTypes?: string[]
) {
  return useQuery({
    queryKey: ['/api/timeline/events/latest', limit, eventTypes],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('limit', limit.toString());
      if (eventTypes && eventTypes.length > 0) {
        eventTypes.forEach(type => searchParams.append('eventTypes', type));
      }

      const response = await apiRequest('GET', `/api/timeline/events/latest?${searchParams.toString()}`);
      return response.json();
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
      const response = await apiRequest('POST', `/api/timeline/${params.fundId}/snapshot`, {
        type: params.type || 'manual',
        description: params.description,
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
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
      const response = await apiRequest('POST', `/api/timeline/${params.fundId}/restore`, {
        snapshotId: params.snapshotId,
        confirmationCode: params.confirmationCode,
      });
      return response.json();
    },
    onSuccess: (data, variables) => {
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