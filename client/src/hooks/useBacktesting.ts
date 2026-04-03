/**
 * Backtesting TanStack Query Hooks
 *
 * Async job lifecycle: mutation to start, polling to track, fetch for results.
 * Polling auto-stops on terminal status. URL resume via jobId search param.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'timed_out', 'cancelled', 'unknown']);

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

function clearResumeJobIdFromUrl(searchString: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const params = new URLSearchParams(searchString);
  if (!params.has('jobId')) {
    return;
  }

  params.delete('jobId');
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl);
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
export function useBacktestLifecycle(fundId: number | null) {
  const searchString = useSearch();
  const resumeJobId = useResumeJobId();
  const asyncRun = useBacktestAsyncRun();
  const [localJob, setLocalJob] = useState<{ jobId: string; fundId: number } | null>(null);
  const [dismissedResumeJobId, setDismissedResumeJobId] = useState<string | null>(null);
  const [resumeMismatch, setResumeMismatch] = useState<{
    jobId: string;
    actualFundId: number;
  } | null>(null);

  useEffect(() => {
    if (localJob && fundId !== null && localJob.fundId !== fundId) {
      setLocalJob(null);
    }
  }, [fundId, localJob]);

  const activeLocalJobId = fundId !== null && localJob?.fundId === fundId ? localJob.jobId : null;
  const activeResumeJobId =
    fundId !== null && resumeJobId && resumeJobId !== dismissedResumeJobId ? resumeJobId : null;

  // Active job: either from mutation result or URL resume
  const activeJobId = activeLocalJobId ?? activeResumeJobId;
  const jobStatus = useBacktestJobStatus(activeJobId);
  const hasResumeMismatch =
    activeResumeJobId !== null &&
    fundId !== null &&
    jobStatus.data?.fundId !== undefined &&
    jobStatus.data.fundId !== fundId;

  useEffect(() => {
    if (!hasResumeMismatch || !activeResumeJobId || !jobStatus.data?.fundId) {
      return;
    }

    setDismissedResumeJobId(activeResumeJobId);
    setResumeMismatch({
      jobId: activeResumeJobId,
      actualFundId: jobStatus.data.fundId,
    });
    clearResumeJobIdFromUrl(searchString);
  }, [activeResumeJobId, hasResumeMismatch, jobStatus.data?.fundId, searchString]);

  useEffect(() => {
    if (!activeResumeJobId) {
      return;
    }
    setResumeMismatch(null);
  }, [activeResumeJobId]);

  useEffect(() => {
    if (!resumeMismatch || fundId !== resumeMismatch.actualFundId) {
      return;
    }

    setDismissedResumeJobId(null);
    setResumeMismatch(null);
  }, [fundId, resumeMismatch]);

  const effectiveJobViewModel = useMemo(
    () => (hasResumeMismatch ? toJobViewModel(null, null) : jobStatus.viewModel),
    [hasResumeMismatch, jobStatus.viewModel]
  );

  // Auto-fetch result when job completes
  const backtestId = hasResumeMismatch ? null : effectiveJobViewModel.backtestId;
  const result = useBacktestResult(backtestId);

  const startBacktest = useCallback(
    (config: BacktestConfig) => {
      setResumeMismatch(null);
      asyncRun.mutate(config, {
        onSuccess: (response) => {
          setLocalJob({ jobId: response.jobId, fundId: config.fundId });
        },
      });
    },
    [asyncRun]
  );

  const isRunning =
    effectiveJobViewModel.phase === 'queued' || effectiveJobViewModel.phase === 'running';

  return {
    startBacktest,
    activeJobId: hasResumeMismatch ? null : activeJobId,
    jobStatus: effectiveJobViewModel,
    result: result.viewModel,
    rawResult: result.data?.result ?? null,
    isRunning,
    isSubmitting: asyncRun.isPending,
    submitError: asyncRun.error,
    resumeMismatch,
  };
}
