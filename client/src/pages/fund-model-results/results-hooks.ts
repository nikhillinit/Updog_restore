/**
 * Results, lifecycle history, publish comparison, scenario comparison, and
 * recalculate hooks for the fund model results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/results-hooks
 */

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  FundScenarioComparisonV1Schema,
  type FundScenarioComparisonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type { FundLifecycleHistoryV1 } from '@shared/contracts/fund-lifecycle-history-v1.contract';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type {
  FetchOptions,
  FetchState,
  LifecycleHistoryState,
  LifecyclePollingKey,
  LifecycleStatus,
  RecalculateState,
  ResultsComparisonState,
  ScenarioComparisonBatchResult,
  ScenarioComparisonState,
} from './types';

const RESULTS_BACKOFF_MS = [2000, 4000, 8000, 15000] as const;

function isActiveCalculationStatus(status: LifecycleStatus) {
  return status === 'submitted' || status === 'calculating';
}

function isTerminalCalculationStatus(status: LifecycleStatus) {
  return status === 'ready' || status === 'failed' || status === 'not_requested';
}

// ============================================================================
// DATA FETCHING
// ============================================================================

function useFundResults(fundId: string | null) {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const stateRef = useRef<FetchState>({ kind: 'loading' });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetchResultsRef = useRef<(options?: FetchOptions) => Promise<void>>();
  const lastLifecycleKeyRef = useRef<LifecyclePollingKey | null>(null);

  const clearScheduledPoll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const scheduleNextPoll = useCallback(() => {
    clearScheduledPoll();
    const delay =
      RESULTS_BACKOFF_MS[Math.min(attemptRef.current, RESULTS_BACKOFF_MS.length - 1)] ??
      RESULTS_BACKOFF_MS[RESULTS_BACKOFF_MS.length - 1];
    attemptRef.current += 1;
    timeoutRef.current = setTimeout(() => {
      void fetchResultsRef.current?.({ background: true });
    }, delay);
  }, [clearScheduledPoll]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fetchResults = useCallback(
    async (options: FetchOptions = {}) => {
      if (!fundId || fundId === 'latest') return;

      if (options.resetBackoff) {
        attemptRef.current = 0;
        clearScheduledPoll();
      }

      if (abortRef.current) {
        if (options.background) {
          return;
        }
        cancelInFlight();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/funds/${fundId}/results`, {
          signal: controller.signal,
        });

        if (res.status === 404) {
          if (stateRef.current.kind !== 'data' || options.initial) {
            setState({ kind: 'error', message: 'Fund not found' });
          }
          return;
        }
        if (!res.ok) {
          if (stateRef.current.kind !== 'data' || options.initial) {
            setState({ kind: 'error', message: `Server error (${res.status})` });
          } else if (
            stateRef.current.kind === 'data' &&
            isActiveCalculationStatus(stateRef.current.results.lifecycle.calculationState.status)
          ) {
            scheduleNextPoll();
          }
          return;
        }

        const data = (await res.json()) as FundResultsReadV1;
        setState({ kind: 'data', results: data });

        const currentLifecycleKey: LifecyclePollingKey = {
          fundId,
          status: data.lifecycle.calculationState.status,
          runId: data.lifecycle.calculationState.runId,
          configVersion: data.lifecycle.calculationState.configVersion,
        };
        const previousLifecycleKey = lastLifecycleKeyRef.current;
        const shouldResetBackoff =
          options.resetBackoff === true ||
          previousLifecycleKey == null ||
          previousLifecycleKey.fundId !== currentLifecycleKey.fundId ||
          previousLifecycleKey.runId !== currentLifecycleKey.runId ||
          previousLifecycleKey.configVersion !== currentLifecycleKey.configVersion ||
          (!isActiveCalculationStatus(previousLifecycleKey.status) &&
            isActiveCalculationStatus(currentLifecycleKey.status));

        lastLifecycleKeyRef.current = currentLifecycleKey;

        if (isActiveCalculationStatus(currentLifecycleKey.status)) {
          if (shouldResetBackoff) {
            attemptRef.current = 0;
          }
          scheduleNextPoll();
        } else {
          attemptRef.current = 0;
          clearScheduledPoll();
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        if (stateRef.current.kind !== 'data' || options.initial) {
          setState({ kind: 'error', message: 'Network error' });
        } else if (
          stateRef.current.kind === 'data' &&
          isActiveCalculationStatus(stateRef.current.results.lifecycle.calculationState.status)
        ) {
          scheduleNextPoll();
        } else if (error instanceof Error) {
          void error;
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [cancelInFlight, clearScheduledPoll, fundId, scheduleNextPoll]
  );

  fetchResultsRef.current = fetchResults;

  useEffect(() => {
    if (!fundId || fundId === 'latest') {
      clearScheduledPoll();
      cancelInFlight();
      attemptRef.current = 0;
      lastLifecycleKeyRef.current = null;
      setState({ kind: 'error', message: 'No fund ID provided' });
      return;
    }

    clearScheduledPoll();
    cancelInFlight();
    attemptRef.current = 0;
    lastLifecycleKeyRef.current = null;
    setState({ kind: 'loading' });
    void fetchResults({ initial: true, resetBackoff: true });

    return () => {
      clearScheduledPoll();
      cancelInFlight();
    };
  }, [cancelInFlight, clearScheduledPoll, fundId, fetchResults]);

  return {
    state,
    refresh: () => fetchResults({ resetBackoff: true }),
  };
}

function useFundLifecycleHistory(fundId: string | null) {
  const [state, setState] = useState<LifecycleHistoryState>({
    kind: 'loading',
    history: null,
  });

  const fetchHistory = useCallback(async () => {
    if (!fundId || fundId === 'latest') return;
    try {
      const res = await fetch(`/api/funds/${fundId}/lifecycle-history`);
      if (res.status === 404) {
        setState({
          kind: 'error',
          message: 'Publish history unavailable',
          history: null,
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: 'error',
          message: `Publish history unavailable (${res.status})`,
          history: null,
        });
        return;
      }
      const raw = (await res.json()) as Partial<FundLifecycleHistoryV1>;
      const safeHistory: FundLifecycleHistoryV1 = {
        fundId: typeof raw.fundId === 'number' ? raw.fundId : Number(fundId),
        entries: Array.isArray(raw.entries) ? raw.entries : [],
      };
      setState({ kind: 'data', history: safeHistory });
    } catch {
      setState({
        kind: 'error',
        message: 'Publish history unavailable',
        history: null,
      });
    }
  }, [fundId]);

  useEffect(() => {
    if (!fundId || fundId === 'latest') {
      setState({ kind: 'loading', history: null });
      return;
    }
    void fetchHistory();
  }, [fundId, fetchHistory]);

  return { state, refresh: fetchHistory };
}

function useFundResultsComparison(fundId: string | null) {
  const [state, setState] = useState<ResultsComparisonState>({
    kind: 'loading',
    comparison: null,
  });

  const fetchComparison = useCallback(async () => {
    if (!fundId || fundId === 'latest') return;
    try {
      const res = await fetch(`/api/funds/${fundId}/results-comparison`);
      if (res.status === 404) {
        setState({
          kind: 'error',
          message: 'Results comparison unavailable',
          comparison: null,
        });
        return;
      }
      if (!res.ok) {
        setState({
          kind: 'error',
          message: `Results comparison unavailable (${res.status})`,
          comparison: null,
        });
        return;
      }

      const comparison = (await res.json()) as FundResultsComparisonV1;
      setState({ kind: 'data', comparison });
    } catch {
      setState({
        kind: 'error',
        message: 'Results comparison unavailable',
        comparison: null,
      });
    }
  }, [fundId]);

  useEffect(() => {
    if (!fundId || fundId === 'latest') {
      setState({ kind: 'loading', comparison: null });
      return;
    }
    void fetchComparison();
  }, [fundId, fetchComparison]);

  return { state, refresh: fetchComparison };
}

interface ScenarioComparisonFetchRequest {
  fundId: string;
  scenarioSetIds: string[];
}

const FUND_ID_PATH_SEGMENT_PATTERN = /^\d+$/;
const SCENARIO_SET_ID_PATH_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCENARIO_COMPARISON_API_ROOT = '/api/funds';

function scenarioComparisonIdsFromKey(scenarioSetIdsKey: string) {
  return scenarioSetIdsKey.length > 0 ? scenarioSetIdsKey.split('|') : [];
}

function isSafeScenarioComparisonRequest(request: ScenarioComparisonFetchRequest) {
  return (
    FUND_ID_PATH_SEGMENT_PATTERN.test(request.fundId) &&
    request.scenarioSetIds.length > 0 &&
    request.scenarioSetIds.every((id) => SCENARIO_SET_ID_PATH_SEGMENT_PATTERN.test(id))
  );
}

function createScenarioComparisonFetchRequest(
  fundId: string | null,
  scenarioSetIdsKey: string
): ScenarioComparisonFetchRequest | null {
  if (!fundId || fundId === 'latest') return null;

  const request = {
    fundId,
    scenarioSetIds: scenarioComparisonIdsFromKey(scenarioSetIdsKey),
  };
  return isSafeScenarioComparisonRequest(request) ? request : null;
}

function scenarioComparisonQueryKey(fundId: string, scenarioSetId: string) {
  return [
    SCENARIO_COMPARISON_API_ROOT,
    fundId,
    'scenario-sets',
    scenarioSetId,
    'comparison',
  ] as const;
}

function scenarioComparisonQueryPrefix(fundId: string) {
  return [SCENARIO_COMPARISON_API_ROOT, fundId, 'scenario-sets'] as const;
}

function scenarioComparisonApiPath(fundId: string, scenarioSetId: string) {
  if (
    !FUND_ID_PATH_SEGMENT_PATTERN.test(fundId) ||
    !SCENARIO_SET_ID_PATH_SEGMENT_PATTERN.test(scenarioSetId)
  ) {
    throw new Error('Invalid scenario comparison request path');
  }

  return `${SCENARIO_COMPARISON_API_ROOT}/${encodeURIComponent(fundId)}/scenario-sets/${encodeURIComponent(scenarioSetId)}/comparison`;
}

async function fetchScenarioComparisonForSet(fundId: string, scenarioSetId: string) {
  return queryClient.fetchQuery<FundScenarioComparisonV1>({
    queryKey: scenarioComparisonQueryKey(fundId, scenarioSetId),
    queryFn: async () => {
      const response = await apiRequest('GET', scenarioComparisonApiPath(fundId, scenarioSetId));
      return FundScenarioComparisonV1Schema.parse(response);
    },
    staleTime: 0,
  });
}

async function fetchScenarioComparisonBatch(
  request: ScenarioComparisonFetchRequest
): Promise<ScenarioComparisonBatchResult> {
  const settled = await Promise.allSettled(
    request.scenarioSetIds.map((scenarioSetId) =>
      fetchScenarioComparisonForSet(request.fundId, scenarioSetId)
    )
  );
  const comparisons: FundScenarioComparisonV1[] = [];
  const failedScenarioSetIds: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      comparisons.push(result.value);
    } else {
      const scenarioSetId = request.scenarioSetIds[index];
      if (scenarioSetId) failedScenarioSetIds.push(scenarioSetId);
    }
  });
  return { comparisons, failedScenarioSetIds };
}

function scenarioComparisonErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Scenario comparison unavailable';
}

function clearScenarioComparisonAbort(
  abortRef: React.MutableRefObject<AbortController | null>,
  controller: AbortController
) {
  if (abortRef.current === controller) {
    abortRef.current = null;
  }
}

function useFundScenarioComparisons(fundId: string | null, scenarioSetIds: readonly string[]) {
  const scenarioSetIdsKey = scenarioSetIds.join('|');
  const [state, setState] = useState<ScenarioComparisonState>({
    kind: 'idle',
    comparisons: [],
    failedScenarioSetIds: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const request = createScenarioComparisonFetchRequest(fundId, scenarioSetIdsKey);
    if (request) {
      void queryClient.cancelQueries({ queryKey: scenarioComparisonQueryPrefix(request.fundId) });
    }
  }, [fundId, scenarioSetIdsKey]);

  const fetchComparisons = useCallback(async () => {
    const request = createScenarioComparisonFetchRequest(fundId, scenarioSetIdsKey);
    if (!request) {
      cancelInFlight();
      setState({ kind: 'idle', comparisons: [], failedScenarioSetIds: [] });
      return;
    }

    cancelInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((previous) => ({
      kind: 'loading',
      comparisons: previous.comparisons,
      failedScenarioSetIds: previous.failedScenarioSetIds,
    }));

    try {
      const { comparisons, failedScenarioSetIds } = await fetchScenarioComparisonBatch(request);
      if (controller.signal.aborted) return;
      setState({ kind: 'data', comparisons, failedScenarioSetIds });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        kind: 'error',
        message: scenarioComparisonErrorMessage(error),
        comparisons: previous.comparisons,
        failedScenarioSetIds: previous.failedScenarioSetIds,
      }));
    } finally {
      clearScenarioComparisonAbort(abortRef, controller);
    }
  }, [cancelInFlight, fundId, scenarioSetIdsKey]);

  useEffect(() => {
    void fetchComparisons();
    return () => cancelInFlight();
  }, [cancelInFlight, fetchComparisons]);

  return { state, refresh: fetchComparisons };
}

function scenarioSetIdsFromFetchState(fetchState: FetchState): string[] {
  if (fetchState.kind !== 'data') return [];
  const scenarios = fetchState.results.sections.scenarios;
  if (scenarios.status !== 'available') return [];
  return scenarios.payload.sets.map((scenarioSet) => scenarioSet.scenarioSetId);
}

function useRecalculatePublished(fundId: string | null, onSuccess: () => void) {
  const [state, setState] = useState<RecalculateState>({ kind: 'idle' });

  const recalculate = useCallback(async () => {
    if (!fundId || fundId === 'latest') return;
    setState({ kind: 'submitting' });
    try {
      const res = await fetch(`/api/funds/${fundId}/recalculate`, {
        method: 'POST',
      });
      const payload = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!res.ok) {
        setState({
          kind: 'error',
          message: payload?.message ?? payload?.error ?? `Failed to recalculate (${res.status})`,
        });
        return;
      }

      setState({ kind: 'idle' });
      onSuccess();
    } catch {
      setState({
        kind: 'error',
        message: 'Failed to recalculate',
      });
    }
  }, [fundId, onSuccess]);

  return {
    state,
    recalculate,
    clearError: () => setState({ kind: 'idle' }),
  };
}

export {
  isActiveCalculationStatus,
  isTerminalCalculationStatus,
  scenarioSetIdsFromFetchState,
  useFundLifecycleHistory,
  useFundResults,
  useFundResultsComparison,
  useFundScenarioComparisons,
  useRecalculatePublished,
};
