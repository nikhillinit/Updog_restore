/**
 * Fund Model Results Page
 *
 * Displays fund modeling output backed by GET /api/funds/:id/results.
 * Each section renders independently based on server-reported availability.
 * No sessionStorage reads for results data.
 *
 * Route: /fund-model-results/:fundId
 *
 * @module client/pages/fund-model-results
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  History,
  RefreshCw,
} from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ScenarioComparisonTable,
  ScenarioSetsSummary,
  type FundScenarioComparisonV1,
} from '@/components/fund-results';
import { EvidenceHeader, type EvidenceHeaderLifecycle } from '@/components/results/EvidenceHeader';
import { QuarterlyReviewTrace } from '@/features/analytics-parity/QuarterlyReviewTrace';
import { cn } from '@/lib/utils';
import type {
  FundResultsReadV1,
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';
import type { EconomicsResultV1 } from '@shared/contracts/economics-v1.contract';
import type { ScenariosSectionPayloadV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { FundLifecycleHistoryV1 } from '@shared/contracts/fund-lifecycle-history-v1.contract';
import type {
  FundResultsComparisonV1,
  MetricDelta,
  PublishedVersionSummary,
} from '@shared/contracts/fund-results-comparison-v1.contract';

// ============================================================================
// TYPES
// ============================================================================

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'data'; results: FundResultsReadV1 };

type LifecycleHistoryState =
  | { kind: 'loading'; history: FundLifecycleHistoryV1 | null }
  | { kind: 'error'; message: string; history: FundLifecycleHistoryV1 | null }
  | { kind: 'data'; history: FundLifecycleHistoryV1 };

type RecalculateState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

type ResultsComparisonState =
  | { kind: 'loading'; comparison: FundResultsComparisonV1 | null }
  | { kind: 'error'; message: string; comparison: FundResultsComparisonV1 | null }
  | { kind: 'data'; comparison: FundResultsComparisonV1 };

type ScenarioComparisonState =
  | { kind: 'idle'; comparisons: FundScenarioComparisonV1[] }
  | { kind: 'loading'; comparisons: FundScenarioComparisonV1[] }
  | { kind: 'error'; message: string; comparisons: FundScenarioComparisonV1[] }
  | { kind: 'data'; comparisons: FundScenarioComparisonV1[] };

type LifecycleStatus = FundStateReadV1['calculationState']['status'];

interface FetchOptions {
  initial?: boolean;
  background?: boolean;
  resetBackoff?: boolean;
}

interface LifecyclePollingKey {
  fundId: string;
  status: LifecycleStatus;
  runId: number | null;
  configVersion: number | null;
}

const RESULTS_BACKOFF_MS = [2000, 4000, 8000, 15000] as const;

function isActiveCalculationStatus(status: LifecycleStatus) {
  return status === 'submitted' || status === 'calculating';
}

function isTerminalCalculationStatus(status: LifecycleStatus) {
  return status === 'ready' || status === 'failed' || status === 'not_requested';
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fade-in effect triggered once when the element enters the viewport.
 * Uses IntersectionObserver with a 10% visibility threshold.
 */
function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

/** Wrapper div that fades in when scrolled into view */
function FadeInSection({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useFadeInOnScroll();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {children}
    </div>
  );
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

function useFundScenarioComparisons(fundId: string | null, scenarioSetIds: readonly string[]) {
  const scenarioSetIdsKey = scenarioSetIds.join('|');
  const [state, setState] = useState<ScenarioComparisonState>({
    kind: 'idle',
    comparisons: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const fetchComparisons = useCallback(async () => {
    const ids = scenarioSetIdsKey.length > 0 ? scenarioSetIdsKey.split('|') : [];
    if (!fundId || fundId === 'latest' || ids.length === 0) {
      cancelInFlight();
      setState({ kind: 'idle', comparisons: [] });
      return;
    }

    cancelInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((previous) => ({
      kind: 'loading',
      comparisons: previous.comparisons,
    }));

    try {
      const comparisons = await Promise.all(
        ids.map(async (scenarioSetId) => {
          const res = await fetch(
            `/api/funds/${fundId}/scenario-sets/${encodeURIComponent(scenarioSetId)}/comparison`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            throw new Error(`Scenario comparison unavailable (${res.status})`);
          }
          return (await res.json()) as FundScenarioComparisonV1;
        })
      );
      setState({ kind: 'data', comparisons });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Scenario comparison unavailable';
      setState((previous) => ({
        kind: 'error',
        message,
        comparisons: previous.comparisons,
      }));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
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

// ============================================================================
// REASON CODE COPY
// ============================================================================

const REASON_COPY: Record<string, string> = {
  NO_PUBLISHED_CONFIG: 'Publish your fund configuration to see this section.',
  CALCULATION_PENDING: 'Results are being calculated. Check back shortly.',
  STALE_EVIDENCE: 'A newer configuration was published. Request recalculation to update.',
  INVALID_PUBLISHED_CONFIG: 'The published configuration has validation issues.',
  NO_AUTHORITATIVE_SOURCE: 'This section is not yet available for your fund.',
  SCENARIOS_NONE_EXIST: 'Create a scenario set to compare alternate fund economics.',
  SCENARIOS_NONE_CALCULATED: 'Calculate a scenario set to show scenario results here.',
  SCENARIOS_LOAD_FAILED: 'Scenario results could not be loaded.',
  ECONOMICS_DISABLED: 'GP economics is currently disabled for this environment.',
  ECONOMICS_NOT_CONFIGURED: 'Publish economics assumptions to see GP economics.',
  ECONOMICS_SNAPSHOT_PENDING: 'Economics is configured and waiting for a calculation snapshot.',
  ECONOMICS_INPUT_INVALID: 'The published economics assumptions have validation issues.',
  ECONOMICS_ENGINE_FAILED: 'The economics engine failed before producing a valid result.',
  ECONOMICS_INVARIANT_FAILED: 'The economics engine found a reconciliation issue.',
  ECONOMICS_STALE_CONFIG_VERSION:
    'Economics results belong to an older published configuration. Recalculate to update.',
};

function reasonCopyFor(section: { [key: string]: unknown }): string {
  // Bracket notation required: TS4111 with noPropertyAccessFromIndexSignature
  const code = typeof section['reasonCode'] === 'string' ? section['reasonCode'] : undefined;
  const reason = typeof section['reason'] === 'string' ? section['reason'] : undefined;
  if (code && REASON_COPY[code]) {
    return REASON_COPY[code];
  }
  return reason ?? 'Not available';
}

// ============================================================================
// OVERVIEW (SCORECARD) CARD
// ============================================================================

function OverviewCard({ payload }: { payload: ScorecardPayload }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <FactTile label="Fund Size" value={`$${(payload.fundSize.value / 1_000_000).toFixed(0)}M`} />
      {payload.vintageYear && (
        <FactTile label="Vintage Year" value={String(payload.vintageYear.value)} />
      )}
      {payload.reserveRatio && (
        <FactTile
          label="Reserve Ratio"
          value={`${(payload.reserveRatio.value * 100).toFixed(1)}%`}
        />
      )}
      {payload.avgConfidence && (
        <FactTile
          label="Avg Confidence"
          value={`${(payload.avgConfidence.value * 100).toFixed(0)}%`}
        />
      )}
      {payload.yearsToFullDeploy && (
        <FactTile label="Years to Full Deploy" value={`${payload.yearsToFullDeploy.value} yrs`} />
      )}
      {payload.lastCalculatedAt && (
        <FactTile
          label="Last Calculated"
          value={new Date(payload.lastCalculatedAt.value).toLocaleDateString()}
        />
      )}
    </div>
  );
}

function WaterfallSetupCard({ payload }: { payload: WaterfallSetupSection }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FactTile label="Structure" value={capitalize(payload.type)} />
        <FactTile label="Tiers" value={String(payload.tierCount)} />
        <FactTile
          label="Recycling"
          value={
            payload.recyclingEnabled == null
              ? 'Not set'
              : payload.recyclingEnabled
                ? 'Enabled'
                : 'Disabled'
          }
        />
        <FactTile
          label="Recycling Type"
          value={payload.recyclingType ? capitalize(payload.recyclingType) : 'Not set'}
        />
      </div>

      <div className="space-y-3">
        {payload.tiers.map((tier, index) => (
          <div key={`${tier.name}-${index}`} className="rounded-md border border-beige-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-charcoal">{tier.name}</p>
                <p className="text-sm text-charcoal-500 font-poppins">
                  GP {tier.gpSplit}% / LP {tier.lpSplit}%
                </p>
              </div>
              {tier.condition && tier.condition !== 'none' && tier.conditionValue != null && (
                <p className="text-sm text-charcoal-500 font-poppins">
                  {tier.condition.toUpperCase()} hurdle {tier.conditionValue}
                </p>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <FactTile
                label="Preferred Return"
                value={tier.preferredReturn != null ? percent(tier.preferredReturn) : 'Not set'}
              />
              <FactTile
                label="Catch-up"
                value={tier.catchUp != null ? percent(tier.catchUp) : 'Not set'}
              />
              <FactTile
                label="Recycling Cap"
                value={
                  payload.recyclingCap != null ? percentPoints(payload.recyclingCap) : 'Not set'
                }
              />
              <FactTile
                label="Future Recycling"
                value={
                  payload.allowFutureRecycling == null
                    ? 'Not set'
                    : payload.allowFutureRecycling
                      ? 'Allowed'
                      : 'Not allowed'
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioComparisonPanel({ state }: { state: ScenarioComparisonState }) {
  if (state.kind === 'idle') return null;

  const hasComparisons = state.comparisons.length > 0;

  return (
    <div className="space-y-4">
      {state.kind === 'loading' && !hasComparisons && (
        <p className="text-sm text-charcoal-500 font-poppins">Loading scenario comparison...</p>
      )}

      {state.kind === 'loading' && hasComparisons && (
        <p className="text-xs text-charcoal-400 font-poppins">Refreshing scenario comparison...</p>
      )}

      {state.kind === 'error' && (
        <Alert className="border-beige-200 bg-beige-50">
          <AlertCircle className="h-4 w-4 text-charcoal-400" />
          <AlertTitle>Scenario comparison unavailable</AlertTitle>
          <AlertDescription className="font-poppins text-charcoal-500">
            {state.message}
          </AlertDescription>
        </Alert>
      )}

      {state.comparisons.map((comparison) => (
        <ScenarioComparisonTable
          key={comparison.scenarioSet.scenarioSetId}
          comparison={comparison}
        />
      ))}
    </div>
  );
}

function ScenarioAnalysisCard({
  payload,
  comparisonState,
}: {
  payload: ScenariosSectionPayloadV1;
  comparisonState: ScenarioComparisonState;
}) {
  return (
    <div className="space-y-6">
      <ScenarioSetsSummary payload={payload} />
      <ScenarioComparisonPanel state={comparisonState} />
    </div>
  );
}

function EconomicsResultsCard({ payload }: { payload: EconomicsResultV1 }) {
  const { summary, annual, checks } = payload;

  return (
    <div className="space-y-6" data-testid="economics-results-card">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <FactTile label="Gross IRR" value={formatNullablePercent(summary.grossIrr)} />
        <FactTile label="Net LP IRR" value={formatNullablePercent(summary.lpNetIrr)} />
        <FactTile label="Net GP IRR" value={formatNullablePercent(summary.gpNetIrr)} />
        <FactTile
          label="Total GP Carry"
          value={formatCompactMoney(summary.totalGpCarryDistributed)}
        />
        <FactTile label="Management Fees" value={formatCompactMoney(summary.totalManagementFees)} />
        <FactTile label="DPI" value={formatMultiple(summary.finalDpi)} />
        <FactTile label="TVPI" value={formatMultiple(summary.finalTvpi)} />
        <FactTile label="Clawback Exposure" value={formatCompactMoney(summary.finalClawbackDue)} />
      </div>

      <div className="rounded-md border border-beige-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="font-medium text-charcoal">Economics Cashflows</h3>
          <Badge variant={checks.passed ? 'secondary' : 'destructive'}>
            {checks.passed ? 'Invariants Passed' : `${checks.errors.length} Invariant Issues`}
          </Badge>
        </div>
        <EconomicsCashflowChart rows={annual} />
      </div>

      <div className="rounded-md border border-beige-200 p-4">
        <h3 className="mb-3 font-medium text-charcoal">DPI / RVPI / TVPI</h3>
        <EconomicsJCurveChart rows={annual} />
      </div>

      <div className="rounded-md border border-beige-200 p-4">
        <h3 className="mb-3 font-medium text-charcoal">Waterfall and Carry</h3>
        <EconomicsCarryTable rows={annual} />
      </div>
    </div>
  );
}

function EconomicsCashflowChart({ rows }: { rows: EconomicsResultV1['annual'] }) {
  const maxAbs = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.lpCapitalCalls,
      row.gpCommitmentCalls,
      row.lpDistributions,
      row.gpInvestmentDistributions,
      row.gpCarryDistributed,
      row.feesPaidToManager,
      row.expensesPaid,
    ])
  );
  const series = [
    { key: 'lpCapitalCalls', label: 'LP Calls', color: 'bg-charcoal-300' },
    { key: 'gpCommitmentCalls', label: 'GP Calls', color: 'bg-stone-400' },
    { key: 'lpDistributions', label: 'LP Distributions', color: 'bg-green-600' },
    { key: 'gpInvestmentDistributions', label: 'GP Investment', color: 'bg-blue-500' },
    { key: 'gpCarryDistributed', label: 'GP Carry', color: 'bg-purple-500' },
    { key: 'feesPaidToManager', label: 'Fees', color: 'bg-amber-500' },
    { key: 'expensesPaid', label: 'Expenses', color: 'bg-red-400' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {series.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs text-charcoal-500">
            <span className={cn('h-2.5 w-2.5 rounded-sm', item.color)} />
            {item.label}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.year} className="grid grid-cols-[3rem_1fr] items-center gap-3">
            <div className="text-xs font-medium text-charcoal-500">Y{row.year}</div>
            <div className="grid h-14 grid-cols-7 items-end gap-1 rounded-md bg-beige-50 px-2 py-1">
              {series.map((item) => {
                const value = row[item.key];
                const heightPct = Math.max(4, (value / maxAbs) * 100);
                return (
                  <div
                    key={item.key}
                    className={cn('rounded-sm', item.color)}
                    style={{ height: `${heightPct}%` }}
                    title={`${item.label}: ${formatCompactMoney(value)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EconomicsJCurveChart({ rows }: { rows: EconomicsResultV1['annual'] }) {
  const maxMultiple = Math.max(1, ...rows.map((row) => Math.max(row.dpi, row.rvpi, row.tvpi)));
  const metrics = [
    { key: 'dpi', label: 'DPI', color: 'bg-green-600' },
    { key: 'rvpi', label: 'RVPI', color: 'bg-blue-500' },
    { key: 'tvpi', label: 'TVPI', color: 'bg-charcoal-500' },
  ] as const;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.year} className="grid grid-cols-[3rem_1fr] gap-3">
          <div className="text-xs font-medium text-charcoal-500">Y{row.year}</div>
          <div className="space-y-1.5">
            {metrics.map((metric) => (
              <div key={metric.key} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                <span className="text-xs text-charcoal-400">{metric.label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-beige-100">
                  <div
                    className={cn('h-full rounded-full', metric.color)}
                    style={{ width: `${Math.max(1, (row[metric.key] / maxMultiple) * 100)}%` }}
                  />
                </div>
                <span className="text-right text-xs text-charcoal-500">
                  {formatMultiple(row[metric.key])}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EconomicsCarryTable({ rows }: { rows: EconomicsResultV1['annual'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-beige-200 text-xs text-charcoal-400">
          <tr>
            <th className="py-2 pr-4 font-medium">Year</th>
            <th className="py-2 pr-4 font-medium">LP Dist.</th>
            <th className="py-2 pr-4 font-medium">GP Inv. Dist.</th>
            <th className="py-2 pr-4 font-medium">GP Carry</th>
            <th className="py-2 pr-4 font-medium">Escrowed</th>
            <th className="py-2 pr-4 font-medium">Released</th>
            <th className="py-2 pr-4 font-medium">Clawback</th>
            <th className="py-2 pr-4 font-medium">DPI</th>
            <th className="py-2 pr-4 font-medium">TVPI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-beige-100">
          {rows.map((row) => (
            <tr key={row.year}>
              <td className="py-2 pr-4 font-medium text-charcoal">Y{row.year}</td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.lpDistributions)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpInvestmentDistributions)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpCarryDistributed)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpCarryEscrowed)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.gpCarryReleasedFromEscrow)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">
                {formatCompactMoney(row.clawbackPaid)}
              </td>
              <td className="py-2 pr-4 text-charcoal-500">{formatMultiple(row.dpi)}</td>
              <td className="py-2 pr-4 text-charcoal-500">{formatMultiple(row.tvpi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function percentPoints(value: number) {
  return `${value}%`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNullablePercent(value: number | null) {
  return value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function formatMultiple(value: number) {
  return `${value.toFixed(2)}x`;
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-beige-50 rounded-md p-3">
      <p className="text-xs text-charcoal-400 font-poppins">{label}</p>
      <p className="text-lg font-medium text-charcoal">{value}</p>
    </div>
  );
}

function formatDateOrFallback(value: string | null, fallback = 'Not available') {
  return value ? new Date(value).toLocaleDateString() : fallback;
}

function formatLifecycleStatus(status: FundStateReadV1['calculationState']['status']) {
  switch (status) {
    case 'not_requested':
      return 'Not requested';
    case 'submitted':
      return 'Submitted';
    case 'calculating':
      return 'Calculating';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function formatHistoryRunStatus(status: LifecycleStatus | null) {
  if (!status) return 'Not started';
  return formatLifecycleStatus(status);
}

function historyBadgeClasses(status: LifecycleStatus | null) {
  switch (status) {
    case 'ready':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'failed':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'submitted':
    case 'calculating':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-beige-100 text-charcoal-600 border-beige-200';
  }
}

function formatComparisonMetricValue(metric: MetricDelta['metric'], value: number | null) {
  if (value == null) return 'Not available';

  switch (metric) {
    case 'fundSize':
      return `$${(value / 1_000_000).toFixed(0)}M`;
    case 'reserveRatio':
    case 'avgConfidence':
      return `${(value * 100).toFixed(1)}%`;
    case 'yearsToFullDeploy':
      return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} yrs`;
    default:
      return String(value);
  }
}

function formatComparisonDelta(delta: MetricDelta) {
  if (delta.absoluteDelta == null) return 'No delta available';

  const sign = delta.absoluteDelta > 0 ? '+' : delta.absoluteDelta < 0 ? '-' : '';
  const magnitude = formatComparisonMetricValue(delta.metric, Math.abs(delta.absoluteDelta));

  if (delta.percentageDelta == null) {
    return `${sign}${magnitude}`;
  }

  const percentSign = delta.percentageDelta > 0 ? '+' : '';
  return `${sign}${magnitude} (${percentSign}${delta.percentageDelta.toFixed(1)}%)`;
}

function formatDriftCapabilityReason(delta: MetricDelta) {
  switch (delta.driftReason) {
    case 'missing_both':
      return 'Current and previous values are unavailable.';
    case 'missing_current':
      return 'Current value is unavailable.';
    case 'missing_previous':
      return 'Previous value is unavailable.';
    case 'zero_previous':
      return 'Previous value is zero, so percentage drift is unstable.';
    case 'stable':
    default:
      return 'Drift is stable.';
  }
}

function renderRunSummary(summary: PublishedVersionSummary) {
  if (!summary.calcRun) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={historyBadgeClasses(null)}>
          Not started
        </Badge>
        <span className="text-sm text-charcoal-500 font-poppins">No calculation run</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={historyBadgeClasses(summary.calcRun.status)}>
        {formatLifecycleStatus(summary.calcRun.status)}
      </Badge>
      <span className="text-sm text-charcoal-500 font-poppins">Run {summary.calcRun.runId}</span>
    </div>
  );
}

function hasStaleEvidence(lifecycle: FundStateReadV1) {
  const publishedVersion = lifecycle.configState.publishedVersion;
  const calculationVersion = lifecycle.calculationState.configVersion;
  return (
    publishedVersion != null && calculationVersion != null && calculationVersion < publishedVersion
  );
}

function diagnosticAlertClasses(tone: 'neutral' | 'warning' | 'danger' | 'success') {
  switch (tone) {
    case 'danger':
      return 'border-rose-200 bg-rose-50';
    case 'warning':
      return 'border-amber-200 bg-amber-50';
    case 'success':
      return 'border-emerald-200 bg-emerald-50';
    default:
      return 'border-beige-200 bg-beige-50';
  }
}

function getLifecycleDiagnostic(lifecycle: FundStateReadV1) {
  const { configState, calculationState } = lifecycle;
  const publishedVersion =
    configState.publishedVersion != null
      ? `v${configState.publishedVersion}`
      : 'an unpublished draft';
  const runLabel =
    calculationState.runId != null ? `run ${calculationState.runId}` : 'the next calculation run';

  if (!configState.hasPublished) {
    return {
      tone: 'neutral' as const,
      title: 'No published configuration yet',
      description:
        'This fund does not have a published configuration yet, so authoritative calculations have not started. Publish a configuration before relying on lifecycle-backed results.',
    };
  }

  if (calculationState.status === 'failed') {
    return {
      tone: 'danger' as const,
      title: 'Published configuration exists, but the latest calculation failed',
      description: `${publishedVersion} is published, but ${runLabel} did not complete successfully. Review the latest calculation error and retry once the issue is resolved.`,
    };
  }

  if (calculationState.status === 'submitted' || calculationState.status === 'calculating') {
    return {
      tone: 'warning' as const,
      title: 'Calculation is in progress',
      description: `${publishedVersion} is currently being processed under ${runLabel}. The page will keep polling the results endpoint until the lifecycle reaches a terminal state.`,
    };
  }

  if (hasStaleEvidence(lifecycle)) {
    return {
      tone: 'warning' as const,
      title: 'Published configuration is ahead of the current calculation',
      description: `The latest publish is ${publishedVersion}, but the current evidence is still tied to v${calculationState.configVersion}. Recalculate to bring the displayed results back in sync.`,
    };
  }

  if (calculationState.status === 'ready') {
    return {
      tone: 'success' as const,
      title: 'Results are current',
      description: `${publishedVersion} has a completed calculation run, and the results page is showing current server-backed evidence for that publish.`,
    };
  }

  return {
    tone: 'neutral' as const,
    title: 'Calculation has not been requested',
    description: `${publishedVersion} is published, but no calculation run has been requested yet.`,
  };
}

function ConfigDiffBanner({ lifecycle }: { lifecycle: FundStateReadV1 }) {
  if (!hasStaleEvidence(lifecycle)) return null;

  return (
    <Alert className="border-amber-200 bg-amber-50">
      <AlertCircle className="h-4 w-4 text-amber-700" />
      <AlertTitle>Results are stale</AlertTitle>
      <AlertDescription className="font-poppins text-amber-900">
        Latest published configuration is v{lifecycle.configState.publishedVersion}, but the current
        calculation is still on v{lifecycle.calculationState.configVersion}. Recalculate to refresh
        the published results.
      </AlertDescription>
    </Alert>
  );
}

function PublishHistoryCard({ historyState }: { historyState: LifecycleHistoryState }) {
  const [isOpen, setIsOpen] = useState(false);
  const entryCount =
    historyState.kind === 'data'
      ? historyState.history.entries.length
      : (historyState.history?.entries.length ?? 0);

  return (
    <div
      className="bg-white rounded-lg border border-beige-200 p-6 space-y-4"
      data-testid="publish-history-card"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-charcoal-500" />
              <h2 className="text-lg font-medium text-charcoal">Publish History</h2>
            </div>
            <p className="mt-1 text-sm text-charcoal-500 font-poppins">
              {entryCount > 0
                ? `${entryCount} published version${entryCount === 1 ? '' : 's'} with latest run status`
                : 'No published versions recorded yet.'}
            </p>
          </div>

          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" disabled={entryCount === 0}>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {isOpen ? 'Hide history' : 'Show history'}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="space-y-3 pt-2">
          {historyState.kind === 'loading' && (
            <p className="text-sm text-charcoal-500 font-poppins">Loading publish history…</p>
          )}

          {historyState.kind === 'error' && (
            <Alert className="border-beige-200">
              <AlertCircle className="h-4 w-4 text-charcoal-400" />
              <AlertTitle>Publish history unavailable</AlertTitle>
              <AlertDescription className="font-poppins text-charcoal-500">
                {historyState.message}
              </AlertDescription>
            </Alert>
          )}

          {historyState.kind === 'data' &&
            historyState.history.entries.map((entry) => (
              <div
                key={`publish-history-${entry.version}`}
                className="flex flex-col gap-3 rounded-md border border-beige-200 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-charcoal">Version v{entry.version}</p>
                  <p className="text-sm text-charcoal-500 font-poppins">
                    Published {formatDateOrFallback(entry.publishedAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Badge
                    variant="outline"
                    className={historyBadgeClasses(entry.calcRun?.status ?? null)}
                  >
                    {formatHistoryRunStatus(entry.calcRun?.status ?? null)}
                  </Badge>
                  <span className="text-sm text-charcoal-500 font-poppins">
                    {entry.calcRun?.runId != null
                      ? `Run ${entry.calcRun.runId}`
                      : 'No calculation run'}
                  </span>
                </div>
              </div>
            ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function PublishComparisonCard({ comparisonState }: { comparisonState: ResultsComparisonState }) {
  return (
    <div
      className="bg-white rounded-lg border border-beige-200 p-6 space-y-4"
      data-testid="publish-comparison-card"
    >
      <div>
        <h2 className="text-lg font-medium text-charcoal">Publish Comparison</h2>
        <p className="mt-1 text-sm text-charcoal-500 font-poppins">
          Compare the current published version with the immediately previous publication.
        </p>
      </div>

      {comparisonState.kind === 'loading' && (
        <p className="text-sm text-charcoal-500 font-poppins">Loading publish comparison…</p>
      )}

      {comparisonState.kind === 'error' && (
        <Alert className="border-beige-200">
          <AlertCircle className="h-4 w-4 text-charcoal-400" />
          <AlertTitle>Comparison unavailable</AlertTitle>
          <AlertDescription className="font-poppins text-charcoal-500">
            {comparisonState.message}
          </AlertDescription>
        </Alert>
      )}

      {comparisonState.kind === 'data' &&
        comparisonState.comparison.comparisonStatus === 'no_published_version' && (
          <Alert className="border-beige-200">
            <AlertCircle className="h-4 w-4 text-charcoal-400" />
            <AlertTitle>No published version yet</AlertTitle>
            <AlertDescription className="font-poppins text-charcoal-500">
              Publish a configuration to unlock publish-to-publish comparison.
            </AlertDescription>
          </Alert>
        )}

      {comparisonState.kind === 'data' &&
        comparisonState.comparison.comparisonStatus === 'no_previous_version' &&
        comparisonState.comparison.currentVersion && (
          <>
            <div className="rounded-md border border-beige-200 p-4 space-y-3">
              <div>
                <p className="font-medium text-charcoal">
                  Current Published Version v{comparisonState.comparison.currentVersion.version}
                </p>
                <p className="text-sm text-charcoal-500 font-poppins">
                  Published{' '}
                  {formatDateOrFallback(comparisonState.comparison.currentVersion.publishedAt)}
                </p>
              </div>
              {renderRunSummary(comparisonState.comparison.currentVersion)}
            </div>

            <Alert className="border-beige-200">
              <AlertCircle className="h-4 w-4 text-charcoal-400" />
              <AlertTitle>Previous version unavailable</AlertTitle>
              <AlertDescription className="font-poppins text-charcoal-500">
                Publish at least two versions to see metric deltas between releases.
              </AlertDescription>
            </Alert>
          </>
        )}

      {comparisonState.kind === 'data' &&
        comparisonState.comparison.comparisonStatus === 'comparable' &&
        comparisonState.comparison.currentVersion &&
        comparisonState.comparison.previousVersion && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-beige-200 p-4 space-y-3">
                <div>
                  <p className="font-medium text-charcoal">
                    Current Published Version v{comparisonState.comparison.currentVersion.version}
                  </p>
                  <p className="text-sm text-charcoal-500 font-poppins">
                    Published{' '}
                    {formatDateOrFallback(comparisonState.comparison.currentVersion.publishedAt)}
                  </p>
                </div>
                {renderRunSummary(comparisonState.comparison.currentVersion)}
              </div>

              <div className="rounded-md border border-beige-200 p-4 space-y-3">
                <div>
                  <p className="font-medium text-charcoal">
                    Previous Published Version v{comparisonState.comparison.previousVersion.version}
                  </p>
                  <p className="text-sm text-charcoal-500 font-poppins">
                    Published{' '}
                    {formatDateOrFallback(comparisonState.comparison.previousVersion.publishedAt)}
                  </p>
                </div>
                {renderRunSummary(comparisonState.comparison.previousVersion)}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {comparisonState.comparison.metricDeltas.map((delta) => (
                <div
                  key={delta.metric}
                  className="rounded-md border border-beige-200 bg-beige-50 p-4 space-y-2"
                >
                  <p className="text-xs text-charcoal-400 font-poppins">{delta.displayName}</p>
                  <p className="text-lg font-medium text-charcoal">
                    {formatComparisonMetricValue(delta.metric, delta.currentValue)}
                  </p>
                  <p className="text-sm text-charcoal-500 font-poppins">
                    Previous {formatComparisonMetricValue(delta.metric, delta.previousValue)}
                  </p>
                  {delta.driftCapable ? (
                    <p className="text-sm font-medium text-charcoal">
                      Delta {formatComparisonDelta(delta)}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-charcoal">Drift unavailable</p>
                      <p className="text-xs text-charcoal-500 font-poppins">
                        {formatDriftCapabilityReason(delta)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
    </div>
  );
}

function RecalcButton({
  lifecycle,
  recalculateState,
  onRecalculate,
}: {
  lifecycle: FundStateReadV1;
  recalculateState: RecalculateState;
  onRecalculate: () => void;
}) {
  const hasPublished = lifecycle.configState.hasPublished;
  const status = lifecycle.calculationState.status;
  const calculationInProgress = status === 'submitted' || status === 'calculating';
  const disabled = !hasPublished || calculationInProgress || recalculateState.kind === 'submitting';

  let helperText = 'Re-run calculations for the current published configuration.';
  if (!hasPublished) {
    helperText = 'Publish a configuration before recalculating results.';
  } else if (calculationInProgress) {
    helperText = 'Calculation is already in progress for the published configuration.';
  } else if (recalculateState.kind === 'submitting') {
    helperText = 'Starting recalculation for the published configuration.';
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <Button
        onClick={onRecalculate}
        disabled={disabled}
        variant="outline"
        data-testid="recalculate-button"
      >
        <RefreshCw
          className={cn('h-4 w-4', recalculateState.kind === 'submitting' && 'animate-spin')}
        />
        {recalculateState.kind === 'submitting' ? 'Starting Recalculation…' : 'Recalculate'}
      </Button>
      <p className="text-xs text-charcoal-400 font-poppins">{helperText}</p>
    </div>
  );
}

function LifecycleStatusCard({
  lifecycle,
  recalculateState,
  onRecalculate,
}: {
  lifecycle: FundStateReadV1;
  recalculateState: RecalculateState;
  onRecalculate: () => void;
}) {
  const { configState, calculationState } = lifecycle;
  const diagnostic = getLifecycleDiagnostic(lifecycle);
  const availableSnapshotList =
    calculationState.availableSnapshotTypes.length > 0
      ? calculationState.availableSnapshotTypes.join(', ')
      : 'None yet';
  const expectedSnapshotList =
    calculationState.expectedSnapshotTypes.length > 0
      ? calculationState.expectedSnapshotTypes.join(', ')
      : 'None';

  return (
    <div
      className="bg-white rounded-lg border border-beige-200 p-6 space-y-4"
      data-testid="run-diagnostics-card"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-medium text-charcoal">Lifecycle Status</h2>
          <p className="text-sm text-charcoal-500 font-poppins mt-1">
            Server-backed publication, calculation, and run diagnostics for this fund.
          </p>
        </div>

        <RecalcButton
          lifecycle={lifecycle}
          recalculateState={recalculateState}
          onRecalculate={onRecalculate}
        />
      </div>

      <Alert className={diagnosticAlertClasses(diagnostic.tone)}>
        <AlertCircle className="h-4 w-4 text-charcoal-500" />
        <AlertTitle>{diagnostic.title}</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-600">
          {diagnostic.description}
        </AlertDescription>
      </Alert>

      {!configState.hasPublished && (
        <div className="rounded-md border border-beige-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-charcoal">Publish the fund configuration</p>
              <p className="mt-1 text-sm text-charcoal-500 font-poppins">
                Review the current setup, publish it, then return here to request lifecycle-backed
                calculations.
              </p>
            </div>
            <Button asChild>
              <Link href={`/fund-setup?step=7&fundId=${lifecycle.fundId}`}>Review and publish</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FactTile
          label="Published Version"
          value={
            configState.publishedVersion != null
              ? `v${configState.publishedVersion}`
              : 'Not published'
          }
        />
        <FactTile
          label="Published At"
          value={formatDateOrFallback(configState.publishedAt, 'Not published')}
        />
        <FactTile
          label="Calculation Status"
          value={formatLifecycleStatus(calculationState.status)}
        />
        <FactTile
          label="Last Calculated"
          value={formatDateOrFallback(calculationState.lastCalculatedAt)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <FactTile
          label="Draft Version"
          value={configState.draftVersion != null ? `v${configState.draftVersion}` : 'No draft'}
        />
        <FactTile
          label="Latest Run"
          value={calculationState.runId != null ? String(calculationState.runId) : 'Not started'}
        />
        <FactTile
          label="Snapshot Coverage"
          value={`${calculationState.availableSnapshotTypes.length}/${calculationState.expectedSnapshotTypes.length}`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-beige-200 bg-beige-50 p-4">
          <p className="text-xs text-charcoal-400 font-poppins">Available Snapshots</p>
          <p className="mt-1 text-sm text-charcoal font-medium">{availableSnapshotList}</p>
        </div>
        <div className="rounded-md border border-beige-200 bg-beige-50 p-4">
          <p className="text-xs text-charcoal-400 font-poppins">Expected Snapshots</p>
          <p className="mt-1 text-sm text-charcoal font-medium">{expectedSnapshotList}</p>
        </div>
      </div>

      {calculationState.lastError && (
        <Alert className="border-beige-200">
          <AlertCircle className="h-4 w-4 text-charcoal-400" />
          <AlertTitle>Latest calculation error</AlertTitle>
          <AlertDescription className="font-poppins text-charcoal-500">
            {calculationState.lastError}
          </AlertDescription>
        </Alert>
      )}

      {recalculateState.kind === 'error' && (
        <Alert className="border-beige-200">
          <AlertCircle className="h-4 w-4 text-charcoal-400" />
          <AlertTitle>Recalculation failed</AlertTitle>
          <AlertDescription className="font-poppins text-charcoal-500">
            {recalculateState.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ============================================================================
// SECTION RENDERER
// ============================================================================

interface SectionRendererProps {
  title: string;
  // Accept the Zod-inferred union types: each section is a discriminated union
  // of available/unavailable/pending/failed variants with different shapes
  section: {
    status: string;
    reason?: string | undefined;
    reasonCode?: string | undefined;
    payload?: unknown | undefined;
    legacyEvidence?: boolean | undefined;
    [key: string]: unknown;
  };
  renderPayload?: (payload: unknown) => React.ReactNode;
  evidenceLifecycle?: EvidenceHeaderLifecycle;
  evidenceTestId?: string;
}

function getSectionSource(section: SectionRendererProps['section']) {
  const source = section['source'];
  return typeof source === 'string' && source.trim().length > 0 ? source : null;
}

function sectionEvidence(
  lifecycle: EvidenceHeaderLifecycle | undefined,
  section: SectionRendererProps['section']
): EvidenceHeaderLifecycle | null {
  if (!lifecycle) return null;
  return {
    ...lifecycle,
    source: getSectionSource(section) ?? lifecycle.source ?? null,
  };
}

function evidenceFromLifecycle(lifecycle: FundStateReadV1): EvidenceHeaderLifecycle {
  return {
    status: lifecycle.calculationState.status,
    configVersion: lifecycle.calculationState.configVersion,
    runId: lifecycle.calculationState.runId,
    lastCalculatedAt: lifecycle.calculationState.lastCalculatedAt,
    publishedVersion: lifecycle.configState.publishedVersion,
    source: '/api/funds/:id/results',
  };
}

function SectionRenderer({
  title,
  section,
  renderPayload,
  evidenceLifecycle,
  evidenceTestId,
}: SectionRendererProps) {
  const evidence = sectionEvidence(evidenceLifecycle, section);

  if (section.status === 'available') {
    return (
      <div className="bg-white rounded-lg border border-beige-200 p-6">
        <div className="mb-4 space-y-2">
          <h2 className="text-lg font-medium text-charcoal">{title}</h2>
          {evidence && <EvidenceHeader lifecycle={evidence} testId={evidenceTestId} />}
        </div>
        {section.legacyEvidence && (
          <p className="text-xs text-charcoal-400 mb-2">
            Based on previous calculation (legacy data)
          </p>
        )}
        {renderPayload ? (
          renderPayload(section.payload)
        ) : (
          <pre className="text-sm text-charcoal-600 whitespace-pre-wrap font-mono">
            {JSON.stringify(section.payload, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  const statusLabel =
    section.status === 'failed'
      ? section.reasonCode === 'INVALID_PUBLISHED_CONFIG'
        ? 'Configuration issue'
        : 'Calculation failed'
      : section.status === 'pending'
        ? 'Pending'
        : '';
  const copy = reasonCopyFor(section);

  return (
    <div className="bg-beige-50 rounded-lg border border-beige-200 p-6">
      <div className="mb-2 space-y-2">
        <h2 className="text-lg font-medium text-charcoal-400">{title}</h2>
        {evidence && <EvidenceHeader lifecycle={evidence} testId={evidenceTestId} />}
      </div>
      <p className="text-sm text-charcoal-500 font-poppins">
        {statusLabel ? `${statusLabel}: ` : ''}
        {copy}
      </p>
    </div>
  );
}

// ============================================================================
// STATE COMPONENTS
// ============================================================================

function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-24 text-center" role="status">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-beige-100 rounded w-1/3 mx-auto" />
        <div className="h-4 bg-beige-100 rounded w-1/2 mx-auto" />
        <div className="h-32 bg-beige-100 rounded" />
        <div className="h-32 bg-beige-100 rounded" />
      </div>
    </div>
  );
}

function LatestErrorState() {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Invalid results route</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">
          No fund ID specified. Please complete the modeling wizard to view results.
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Go to Fund Setup
      </Button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <div className="max-w-xl mx-auto px-8 py-24 text-center">
      <Alert className="mb-8 border-beige-200">
        <AlertCircle className="h-5 w-5 text-charcoal-400" />
        <AlertTitle>Error loading results</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">{message}</AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="border-charcoal-300 text-charcoal hover:bg-charcoal-50"
        onClick={() => navigate('/fund-setup')}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Fund Setup
      </Button>
    </div>
  );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

function FundModelResultsPage() {
  const [, params] = useRoute('/fund-model-results/:fundId');
  const fundId = params?.fundId ?? null;

  // Hook must be called unconditionally (React rules of hooks)
  const { state: fetchState, refresh: refreshResults } = useFundResults(fundId);
  const { state: historyState, refresh: refreshHistory } = useFundLifecycleHistory(fundId);
  const { state: comparisonState, refresh: refreshComparison } = useFundResultsComparison(fundId);
  const scenarioSetIds = scenarioSetIdsFromFetchState(fetchState);
  const { state: scenarioComparisonState, refresh: refreshScenarioComparisons } =
    useFundScenarioComparisons(fundId, scenarioSetIds);
  const { state: recalculateState, recalculate } = useRecalculatePublished(fundId, () => {
    void refreshResults();
    void refreshHistory();
    void refreshComparison();
    void refreshScenarioComparisons();
  });
  const previousCalculationStatusRef = useRef<LifecycleStatus | null>(null);

  useEffect(() => {
    if (fetchState.kind !== 'data') return;
    const status = fetchState.results.lifecycle.calculationState.status;
    const previousStatus = previousCalculationStatusRef.current;

    if (
      previousStatus &&
      isActiveCalculationStatus(previousStatus) &&
      isTerminalCalculationStatus(status)
    ) {
      void refreshHistory();
      void refreshComparison();
      void refreshScenarioComparisons();
    }

    previousCalculationStatusRef.current = status;
  }, [fetchState, refreshComparison, refreshHistory, refreshScenarioComparisons]);

  // Handle /latest or missing fundId
  if (fundId === 'latest' || !fundId) {
    return <LatestErrorState />;
  }

  if (fetchState.kind === 'loading') {
    return <LoadingState />;
  }

  if (fetchState.kind === 'error') {
    return <ErrorState message={fetchState.message} />;
  }

  const { results } = fetchState;
  const evidenceLifecycle = evidenceFromLifecycle(results.lifecycle);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Fund identity header */}
      <div>
        <h1 className="text-2xl font-semibold text-charcoal">{results.fund.name}</h1>
        <p className="text-charcoal-500 font-poppins">
          Vintage {results.fund.vintageYear} | Fund size: $
          {(results.fund.size / 1_000_000).toFixed(0)}M
        </p>
      </div>

      <FadeInSection>
        <ConfigDiffBanner lifecycle={results.lifecycle} />
      </FadeInSection>

      <FadeInSection>
        <LifecycleStatusCard
          lifecycle={results.lifecycle}
          recalculateState={recalculateState}
          onRecalculate={recalculate}
        />
      </FadeInSection>

      <FadeInSection>
        <PublishHistoryCard historyState={historyState} />
      </FadeInSection>

      <FadeInSection>
        <PublishComparisonCard comparisonState={comparisonState} />
      </FadeInSection>

      <FadeInSection>
        <QuarterlyReviewTrace
          results={results}
          comparison={comparisonState.comparison}
          fundId={fundId}
        />
      </FadeInSection>

      {/* Reserve section */}
      <FadeInSection>
        <SectionRenderer
          title="Reserve Allocation"
          section={results.sections.reserve}
          evidenceLifecycle={evidenceLifecycle}
          evidenceTestId="evidence-header-reserve-allocation"
        />
      </FadeInSection>

      {/* Pacing section */}
      <FadeInSection>
        <SectionRenderer
          title="Deployment Pacing"
          section={results.sections.pacing}
          evidenceLifecycle={evidenceLifecycle}
          evidenceTestId="evidence-header-deployment-pacing"
        />
      </FadeInSection>

      {/* Overview (scorecard) section */}
      <FadeInSection>
        <SectionRenderer
          title="Overview"
          section={results.sections.scorecard}
          renderPayload={(p) => <OverviewCard payload={p as ScorecardPayload} />}
        />
      </FadeInSection>

      {/* Scenarios section */}
      <FadeInSection>
        <SectionRenderer
          title="Scenario Analysis"
          section={results.sections.scenarios}
          renderPayload={(p) => (
            <ScenarioAnalysisCard
              payload={p as ScenariosSectionPayloadV1}
              comparisonState={scenarioComparisonState}
            />
          )}
        />
      </FadeInSection>

      {/* Waterfall section */}
      <FadeInSection>
        <SectionRenderer
          title="Waterfall Setup"
          section={results.sections.waterfall}
          renderPayload={(p) => <WaterfallSetupCard payload={p as WaterfallSetupSection} />}
        />
      </FadeInSection>

      {/* Economics section */}
      <FadeInSection>
        <SectionRenderer
          title="GP Economics"
          section={results.sections.economics}
          renderPayload={(p) => <EconomicsResultsCard payload={p as EconomicsResultV1} />}
        />
      </FadeInSection>
    </div>
  );
}

export default FundModelResultsPage;
