/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { api } from '@/lib';

// Local state for UI toggle
interface ToggleStore {
  mode: 'construction' | 'current';
  isTransitioning: boolean;
  setMode: (_mode: 'construction' | 'current') => void;
  setTransitioning: (_transitioning: boolean) => void;
}

const useToggleStore = create<ToggleStore>()(subscribeWithSelector((set) => ({
  mode: 'current',
  isTransitioning: false,
  setMode: (mode) => set({ mode }),
  setTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
})));

// API response with pre-computed delta
interface FundStateResponse {
  fundId: number;
  mode: 'construction' | 'current';
  state: any;
  delta?: {
    capitalLeft: number;
    irr: number;
    tvpi: number;
    companiesCount: number;
  };
  patch?: any[]; // Immer patches for efficient updates
  checksum: string;
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
  const toggleMutation = useMutation({
    mutationFn: async (newMode: 'construction' | 'current') => {
      // API returns the delta for UI to render immediately
      return api.post<FundStateResponse>(`/funds/${fundId}/toggle`, { mode: newMode });
    },
    onMutate: async (newMode) => {
      setTransitioning(true);
      setMode(newMode);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['fund', fundId] });

      // Return context for rollback
      return { previousMode: mode };
    },
    onError: (err, newMode, context) => {
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
    toggle: (newMode: 'construction' | 'current') => {
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
  (state) => state.mode,
  (mode) => {
    // Track mode changes
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'fund_mode_toggle', {
        mode,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

