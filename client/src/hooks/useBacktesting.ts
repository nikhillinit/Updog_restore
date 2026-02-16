/**
 * Backtesting TanStack Query Hooks
 *
 * Async job lifecycle: mutation to start, polling to track, fetch for results.
 * Polling auto-stops on terminal status. URL resume via jobId search param.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearch } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import type {
  BacktestConfig,
  BacktestAsyncRunResponse,
  BacktestJobStatusResponse,
  BacktestResult,
  BacktestHistoryResponse,
  HistoricalScenarioName,
  ScenarioCompareResponse,
} from '@shared/types/backtesting';
import { toJobViewModel, toResultViewModel } from '@/types/backtesting-ui';

// ============================================================================
// QUERY KEY NAMESPACE
// ============================================================================

const KEYS = {
  all: ['backtesting'] as const,
  job: (jobId: string) => ['backtesting', 'job', jobId] as const,
  result: (backtestId: string) => ['backtesting', 'result', backtestId] as const,
  history: (fundId: number) => ['backtesting', 'history', fundId] as const,
  scenarios: ['backtesting', 'scenarios'] as const,
};

// ============================================================================
// TERMINAL STATUS CHECK
// ============================================================================

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timed_out', 'cancelled']);

function isTerminal(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

// ============================================================================
// URL RESUME HELPER
// ============================================================================

export function useResumeJobId(): string | null {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  return params.get('jobId');
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Mutation to start an async backtest run.
 * Returns jobId for subsequent polling.
 */
export function useBacktestAsyncRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: BacktestConfig) => {
      return apiRequest<BacktestAsyncRunResponse>('POST', '/api/backtesting/run/async', config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/**
 * Poll job status. Refetches every 2s while non-terminal.
 * Automatically stops polling when job reaches terminal state.
 */
export function useBacktestJobStatus(jobId: string | null) {
  const query = useQuery<BacktestJobStatusResponse>({
    queryKey: jobId ? KEYS.job(jobId) : ['backtesting', 'job', 'none'],
    queryFn: async () => {
      return apiRequest<BacktestJobStatusResponse>('GET', `/api/backtesting/jobs/${jobId}`);
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || isTerminal(data.status)) return false;
      return 2000;
    },
    staleTime: 1000,
  });

  const viewModel = useMemo(() => toJobViewModel(query.data ?? null, jobId), [query.data, jobId]);

  return { ...query, viewModel };
}

/**
 * Fetch a completed backtest result by ID.
 */
export function useBacktestResult(backtestId: string | null) {
  const query = useQuery<{ result: BacktestResult }>({
    queryKey: backtestId ? KEYS.result(backtestId) : ['backtesting', 'result', 'none'],
    queryFn: async () => {
      return apiRequest<{ result: BacktestResult }>('GET', `/api/backtesting/result/${backtestId}`);
    },
    enabled: !!backtestId,
    staleTime: Infinity,
  });

  const viewModel = useMemo(
    () => (query.data?.result ? toResultViewModel(query.data.result) : null),
    [query.data]
  );

  return { ...query, viewModel };
}

/**
 * Paginated backtest history for a fund.
 */
export function useBacktestHistory(fundId: number | null, limit = 10, offset = 0) {
  return useQuery<BacktestHistoryResponse>({
    queryKey: fundId
      ? [...KEYS.history(fundId), limit, offset]
      : ['backtesting', 'history', 'none'],
    queryFn: async () => {
      return apiRequest<BacktestHistoryResponse>(
        'GET',
        `/api/backtesting/fund/${fundId}/history?limit=${limit}&offset=${offset}`
      );
    },
    enabled: !!fundId,
    staleTime: 30000,
  });
}

/**
 * Available historical scenarios.
 */
export function useScenarios() {
  return useQuery<{ scenarios: HistoricalScenarioName[] }>({
    queryKey: KEYS.scenarios,
    queryFn: async () => {
      return apiRequest<{ scenarios: HistoricalScenarioName[] }>(
        'GET',
        '/api/backtesting/scenarios'
      );
    },
    staleTime: Infinity,
  });
}

/**
 * Compare multiple scenarios for a fund.
 */
export function useScenarioCompare() {
  return useMutation({
    mutationFn: async (params: {
      fundId: number;
      scenarios: HistoricalScenarioName[];
      simulationRuns?: number;
    }) => {
      return apiRequest<ScenarioCompareResponse>(
        'POST',
        '/api/backtesting/compare-scenarios',
        params
      );
    },
  });
}

/**
 * Composite hook for full backtest lifecycle.
 * Manages: config -> run -> poll -> result fetch.
 */
export function useBacktestLifecycle(_fundId: number | null) {
  const resumeJobId = useResumeJobId();
  const asyncRun = useBacktestAsyncRun();

  // Active job: either from mutation result or URL resume
  const activeJobId = asyncRun.data?.jobId ?? resumeJobId;
  const jobStatus = useBacktestJobStatus(activeJobId);

  // Auto-fetch result when job completes
  const backtestId = jobStatus.viewModel.backtestId;
  const result = useBacktestResult(backtestId);

  const startBacktest = useCallback(
    (config: BacktestConfig) => {
      asyncRun.mutate(config);
    },
    [asyncRun]
  );

  const isRunning =
    jobStatus.viewModel.phase === 'queued' || jobStatus.viewModel.phase === 'running';

  return {
    startBacktest,
    activeJobId,
    jobStatus: jobStatus.viewModel,
    result: result.viewModel,
    rawResult: result.data?.result ?? null,
    isRunning,
    isSubmitting: asyncRun.isPending,
    submitError: asyncRun.error,
  };
}
