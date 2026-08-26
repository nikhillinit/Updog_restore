import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { api } from '@/lib';

type FundMode = 'construction' | 'current';

// Local state for UI toggle
interface ToggleStore {
  mode: FundMode;
  isTransitioning: boolean;
  setMode: (mode: FundMode) => void;
  setTransitioning: (transitioning: boolean) => void;
}

const useToggleStore = create<ToggleStore>()(subscribeWithSelector(
  (set): ToggleStore => ({
    mode: 'current' as const,
    isTransitioning: false,
    setMode: (mode: FundMode) => set({ mode }),
    setTransitioning: (transitioning: boolean) => set({ isTransitioning: transitioning }),
  })
));

// API response with pre-computed delta
interface FundStateResponse {
  fundId: number;
  mode: FundMode;
  state: unknown;
  delta?: {
    capitalLeft: number;
    irr: number;
    tvpi: number;
    companiesCount: number;
  };
  patch?: unknown[]; // Immer patches for efficient updates
  checksum: string;
}

interface ToggleMutationContext {
  previousMode: FundMode;
}

export function useFundToggle(fundId: number) {
  const queryClient = useQueryClient();
  const { mode, isTransitioning, setMode, setTransitioning } = useToggleStore();

  // Fetch both states with React Query caching
  const constructionQuery = useQuery({
    queryKey: ['fund', fundId, 'construction'],
    queryFn: () => api.get<FundStateResponse>(`/funds/${fundId}/state/construction`),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const currentQuery = useQuery({
    queryKey: ['fund', fundId, 'current'],
    queryFn: () => api.get<FundStateResponse>(`/funds/${fundId}/state/current`),
    staleTime: 1 * 60 * 1000, // 1 minute (more frequent updates)
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Toggle mutation with optimistic updates
  const toggleMutation = useMutation<FundStateResponse, Error, FundMode, ToggleMutationContext>({
    mutationFn: async (newMode: FundMode) => {
      // API returns the delta for UI to render immediately
      return api.post<FundStateResponse>(`/funds/${fundId}/toggle`, { mode: newMode });
    },
    onMutate: async (newMode: FundMode) => {
      setTransitioning(true);
      setMode(newMode);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['fund', fundId] });

      // Return context for rollback
      return { previousMode: mode };
    },
    onError: (_error, _newMode, context) => {
      // Rollback on error
      if (context?.previousMode) {
        setMode(context.previousMode);
      }
      setTransitioning(false);
    },
    onSuccess: (data) => {
      // Update cache with new data
      queryClient.setQueryData(['fund', fundId, data.mode], data);
      setTransitioning(false);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['fund', fundId] });
    },
  });

  // Get active state based on mode
  const activeQuery = mode === 'construction' ? constructionQuery : currentQuery;
  const activeState = activeQuery.data;

  // Pre-compute UI values
  const uiState = activeState ? {
    fundId,
    mode,
    isLoading: activeQuery.isLoading || isTransitioning,
    isError: activeQuery.isError,
    error: activeQuery.error,
    
    // Direct values from pre-computed delta
    capitalLeft: activeState.delta?.capitalLeft || 0,
    irr: activeState.delta?.irr || 0,
    tvpi: activeState.delta?.tvpi || 0,
    companiesCount: activeState.delta?.companiesCount || 0,
    
    // Full state for detailed views
    state: activeState.state,
    checksum: activeState.checksum,
  } : null;

  return {
    ...uiState,
    toggle: (newMode: FundMode) => {
      if (newMode !== mode && !isTransitioning) {
        toggleMutation.mutate(newMode);
      }
    },
    prefetch: () => {
      // Prefetch both states for instant switching
      queryClient.prefetchQuery({
        queryKey: ['fund', fundId, 'construction'],
        queryFn: () => api.get<FundStateResponse>(`/funds/${fundId}/state/construction`),
      });
      queryClient.prefetchQuery({
        queryKey: ['fund', fundId, 'current'],
        queryFn: () => api.get<FundStateResponse>(`/funds/${fundId}/state/current`),
      });
    },
  };
}

// Subscribe to mode changes for analytics
useToggleStore.subscribe(
  (state: ToggleStore) => state.mode,
  (mode: FundMode) => {
    // Track mode changes
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'fund_mode_toggle', {
        mode,
        timestamp: new Date().toISOString(),
      });
    }
  }
);
