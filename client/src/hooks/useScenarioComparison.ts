/**
 * Scenario Comparison Hooks
 *
 * TanStack Query hooks for the Scenario Comparison Tool.
 * Provides data fetching, caching, and mutations for comparing scenarios.
 *
 * @module client/hooks/useScenarioComparison
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { useFundContext } from '@/contexts/FundContext';
import type {
  ComparisonResponse,
  SavedComparisonConfig,
} from '@shared/types/scenario-comparison';
import type {
  CreateComparisonRequest,
  CreateSavedConfigRequest,
  UpdateSavedConfigRequest,
  TrackAccessRequest,
} from '@shared/schemas/comparison-tool.schemas';

// ============================================================================
// Types
// ============================================================================

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface UseComparisonListOptions {
  status?: 'computing' | 'ready' | 'stale' | 'error';
  page?: number;
  limit?: number;
  enabled?: boolean;
}

interface UseSavedConfigsOptions {
  includePublic?: boolean;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

// ============================================================================
// Query Keys
// ============================================================================

export const comparisonKeys = {
  all: ['scenario-comparisons'] as const,
  lists: () => [...comparisonKeys.all, 'list'] as const,
  list: (fundId: number, filters?: Record<string, unknown>) =>
    [...comparisonKeys.lists(), fundId, filters] as const,
  details: () => [...comparisonKeys.all, 'detail'] as const,
  detail: (id: string) => [...comparisonKeys.details(), id] as const,
  configs: () => [...comparisonKeys.all, 'configs'] as const,
  configList: (fundId: number, filters?: Record<string, unknown>) =>
    [...comparisonKeys.configs(), 'list', fundId, filters] as const,
  configDetail: (id: string) => [...comparisonKeys.configs(), 'detail', id] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchComparisons(
  fundId: number,
  options: UseComparisonListOptions = {}
): Promise<PaginatedResponse<ComparisonResponse>> {
  const params = new URLSearchParams();
  params.append('fundId', String(fundId));
  if (options.status) params.append('status', options.status);
  if (options.page) params.append('page', String(options.page));
  if (options.limit) params.append('limit', String(options.limit));

  const response = await fetch(`/api/portfolio/comparisons?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to fetch comparisons`);
  }
  return response.json() as Promise<PaginatedResponse<ComparisonResponse>>;
}

async function fetchComparison(comparisonId: string): Promise<ComparisonResponse> {
  const response = await fetch(`/api/portfolio/comparisons/${comparisonId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to fetch comparison`);
  }
  const result = await response.json() as { data: ComparisonResponse };
  return result.data;
}

async function createComparison(request: CreateComparisonRequest): Promise<ComparisonResponse> {
  const response = await fetch('/api/portfolio/comparisons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to create comparison`);
  }
  const result = await response.json() as { data: ComparisonResponse };
  return result.data;
}

async function deleteComparison(comparisonId: string): Promise<void> {
  const response = await fetch(`/api/portfolio/comparisons/${comparisonId}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to delete comparison`);
  }
}

async function exportComparison(
  comparisonId: string,
  format: 'csv' | 'json' | 'pdf' | 'xlsx'
): Promise<Blob | ComparisonResponse> {
  const response = await fetch(
    `/api/portfolio/comparisons/${comparisonId}/export?format=${format}`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to export comparison`);
  }
  if (format === 'json') {
    return response.json() as Promise<ComparisonResponse>;
  }
  return response.blob();
}

async function fetchSavedConfigs(
  fundId: number,
  options: UseSavedConfigsOptions = {}
): Promise<PaginatedResponse<SavedComparisonConfig>> {
  const params = new URLSearchParams();
  params.append('fundId', String(fundId));
  if (options.includePublic !== undefined)
    params.append('includePublic', String(options.includePublic));
  if (options.page) params.append('page', String(options.page));
  if (options.limit) params.append('limit', String(options.limit));

  const response = await fetch(`/api/portfolio/comparison-configs?${params.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to fetch configs`);
  }
  return response.json() as Promise<PaginatedResponse<SavedComparisonConfig>>;
}

async function fetchSavedConfig(configId: string): Promise<SavedComparisonConfig> {
  const response = await fetch(`/api/portfolio/comparison-configs/${configId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to fetch config`);
  }
  const result = await response.json() as { data: SavedComparisonConfig };
  return result.data;
}

async function createSavedConfig(
  request: CreateSavedConfigRequest
): Promise<SavedComparisonConfig> {
  const response = await fetch('/api/portfolio/comparison-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to create config`);
  }
  const result = await response.json() as { data: SavedComparisonConfig };
  return result.data;
}

async function updateSavedConfig(
  configId: string,
  request: UpdateSavedConfigRequest
): Promise<SavedComparisonConfig> {
  const response = await fetch(`/api/portfolio/comparison-configs/${configId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to update config`);
  }
  const result = await response.json() as { data: SavedComparisonConfig };
  return result.data;
}

async function deleteSavedConfig(configId: string): Promise<void> {
  const response = await fetch(`/api/portfolio/comparison-configs/${configId}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `HTTP ${response.status}: Failed to delete config`);
  }
}

async function trackAccess(request: TrackAccessRequest): Promise<void> {
  await fetch('/api/portfolio/comparison-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  // Don't throw on tracking errors - they're non-critical
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Hook for fetching a list of comparisons for the current fund
 */
export function useComparisonList(
  options: UseComparisonListOptions = {}
): UseQueryResult<PaginatedResponse<ComparisonResponse>, Error> {
  const { fundId } = useFundContext();
  const { status, page = 1, limit = 20, enabled = true } = options;
  const queryFilters: Record<string, unknown> = { page, limit };
  if (status) queryFilters['status'] = status;
  const fetchOptions: UseComparisonListOptions = { page, limit };
  if (status) fetchOptions.status = status;

  return useQuery({
    queryKey: comparisonKeys.list(fundId ?? 0, queryFilters),
    queryFn: () => fetchComparisons(fundId!, fetchOptions),
    enabled: enabled && fundId !== null,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}

/**
 * Hook for fetching a single comparison by ID
 */
export function useComparison(
  comparisonId: string | undefined,
  options: { enabled?: boolean } = {}
): UseQueryResult<ComparisonResponse, Error> {
  const { enabled = true } = options;

  return useQuery({
    queryKey: comparisonKeys.detail(comparisonId || ''),
    queryFn: () => fetchComparison(comparisonId!),
    enabled: enabled && !!comparisonId,
    staleTime: 30_000,
    gcTime: 300_000,
  });
}

/**
 * Hook for fetching saved comparison configurations
 */
export function useSavedConfigs(
  options: UseSavedConfigsOptions = {}
): UseQueryResult<PaginatedResponse<SavedComparisonConfig>, Error> {
  const { fundId } = useFundContext();
  const { includePublic = true, page = 1, limit = 20, enabled = true } = options;

  return useQuery({
    queryKey: comparisonKeys.configList(fundId ?? 0, { includePublic, page, limit }),
    queryFn: () => fetchSavedConfigs(fundId!, { includePublic, page, limit }),
    enabled: enabled && fundId !== null,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}

/**
 * Hook for fetching a single saved configuration
 */
export function useSavedConfig(
  configId: string | undefined,
  options: { enabled?: boolean } = {}
): UseQueryResult<SavedComparisonConfig, Error> {
  const { enabled = true } = options;

  return useQuery({
    queryKey: comparisonKeys.configDetail(configId || ''),
    queryFn: () => fetchSavedConfig(configId!),
    enabled: enabled && !!configId,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Hook for creating a new comparison
 */
export function useCreateComparison(): UseMutationResult<
  ComparisonResponse,
  Error,
  CreateComparisonRequest
> {
  const queryClient = useQueryClient();
  const { fundId } = useFundContext();

  return useMutation({
    mutationFn: createComparison,
    onSuccess: (data) => {
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: comparisonKeys.lists() });
      // Add to cache
      queryClient.setQueryData(comparisonKeys.detail(data.id), data);
    },
  });
}

/**
 * Hook for deleting a comparison
 */
export function useDeleteComparison(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteComparison,
    onSuccess: (_, comparisonId) => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.lists() });
      queryClient.removeQueries({ queryKey: comparisonKeys.detail(comparisonId) });
    },
  });
}

/**
 * Hook for exporting a comparison
 */
export function useExportComparison(): UseMutationResult<
  Blob | ComparisonResponse,
  Error,
  { comparisonId: string; format: 'csv' | 'json' | 'pdf' | 'xlsx' }
> {
  const { fundId } = useFundContext();

  return useMutation({
    mutationFn: ({ comparisonId, format }) => exportComparison(comparisonId, format),
    onSuccess: (data, { comparisonId, format }) => {
      // Track export access
      if (fundId !== null) {
        trackAccess({
          comparisonId,
          fundId,
          accessType: 'export',
          scenariosCompared: [],
          cacheHit: false,
        });
      }

      // Trigger download for non-JSON formats
      if (data instanceof Blob) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comparison-${comparisonId}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    },
  });
}

/**
 * Hook for creating a saved configuration
 */
export function useCreateSavedConfig(): UseMutationResult<
  SavedComparisonConfig,
  Error,
  CreateSavedConfigRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSavedConfig,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.configs() });
      queryClient.setQueryData(comparisonKeys.configDetail(data.id), data);
    },
  });
}

/**
 * Hook for updating a saved configuration
 */
export function useUpdateSavedConfig(): UseMutationResult<
  SavedComparisonConfig,
  Error,
  { configId: string; request: UpdateSavedConfigRequest }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ configId, request }) => updateSavedConfig(configId, request),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.configs() });
      queryClient.setQueryData(comparisonKeys.configDetail(data.id), data);
    },
  });
}

/**
 * Hook for deleting a saved configuration
 */
export function useDeleteSavedConfig(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSavedConfig,
    onSuccess: (_, configId) => {
      queryClient.invalidateQueries({ queryKey: comparisonKeys.configs() });
      queryClient.removeQueries({ queryKey: comparisonKeys.configDetail(configId) });
    },
  });
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for invalidating all comparison-related caches
 */
export function useInvalidateComparisons() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: comparisonKeys.all }),
    invalidateLists: () =>
      queryClient.invalidateQueries({ queryKey: comparisonKeys.lists() }),
    invalidateConfigs: () =>
      queryClient.invalidateQueries({ queryKey: comparisonKeys.configs() }),
  };
}

/**
 * Hook for prefetching a comparison (for hover states, etc.)
 */
export function usePrefetchComparison() {
  const queryClient = useQueryClient();

  return (comparisonId: string) => {
    queryClient.prefetchQuery({
      queryKey: comparisonKeys.detail(comparisonId),
      queryFn: () => fetchComparison(comparisonId),
      staleTime: 30_000,
    });
  };
}

/**
 * Hook for tracking comparison access (for analytics)
 */
export function useTrackAccess(): UseMutationResult<void, Error, TrackAccessRequest> {
  return useMutation({
    mutationFn: trackAccess,
    // Silent UI - don't show errors for tracking, but log for observability
    onError: (error) => {
      console.debug('[useTrackAccess] Tracking failed (non-blocking):', error.message);
    },
  });
}

/**
 * Hook for managing comparison URL state
 * Syncs comparison IDs with URL search params for shareable links
 */
export function useComparisonUrl() {
  const parseUrl = (): { baseId?: string; compareIds?: string[]; configId?: string } => {
    if (typeof window === 'undefined') return {};
    const params = new URLSearchParams(window.location.search);
    const result: { baseId?: string; compareIds?: string[]; configId?: string } = {};
    const baseId = params.get('base');
    if (baseId) result.baseId = baseId;
    const compare = params.get('compare');
    if (compare) result.compareIds = compare.split(',').filter(Boolean);
    const configId = params.get('config');
    if (configId) result.configId = configId;
    return result;
  };

  const setUrl = (options: {
    baseId?: string;
    compareIds?: string[];
    configId?: string;
  }) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    if (options.baseId) {
      params.set('base', options.baseId);
    } else {
      params.delete('base');
    }

    if (options.compareIds?.length) {
      params.set('compare', options.compareIds.join(','));
    } else {
      params.delete('compare');
    }

    if (options.configId) {
      params.set('config', options.configId);
    } else {
      params.delete('config');
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  };

  const clearUrl = () => {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, '', window.location.pathname);
  };

  return { parseUrl, setUrl, clearUrl };
}
