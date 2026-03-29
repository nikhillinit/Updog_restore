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
import { useRoute, useLocation } from 'wouter';
import { AlertCircle, ArrowLeft, ChevronDown, ChevronRight, History, RefreshCw } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type {
  FundResultsReadV1,
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type {
  FundLifecycleHistoryV1,
  LifecycleHistoryEntry,
} from '@shared/contracts/fund-lifecycle-history-v1.contract';

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

type LifecycleHistoryRunStatus = NonNullable<LifecycleHistoryEntry['calcRun']>['status'];
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
  const inFlightRef = useRef(false);
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
    inFlightRef.current = false;
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

  const fetchResults = useCallback(async (options: FetchOptions = {}) => {
    if (!fundId || fundId === 'latest') return;

    if (options.resetBackoff) {
      attemptRef.current = 0;
      clearScheduledPoll();
    }

    if (inFlightRef.current) {
      if (options.background) {
        return;
      }
      cancelInFlight();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

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
      inFlightRef.current = false;
    }
  }, [cancelInFlight, clearScheduledPoll, fundId, scheduleNextPoll]);

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

function useRecalculatePublished(
  fundId: string | null,
  onSuccess: () => void
) {
  const [state, setState] = useState<RecalculateState>({ kind: 'idle' });

  const recalculate = useCallback(async () => {
    if (!fundId || fundId === 'latest') return;
    setState({ kind: 'submitting' });
    try {
      const res = await fetch(`/api/funds/${fundId}/recalculate`, {
        method: 'POST',
      });
      const payload = (await res.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!res.ok) {
        setState({
          kind: 'error',
          message:
            payload?.message ??
            payload?.error ??
            `Failed to recalculate (${res.status})`,
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

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function percentPoints(value: number) {
  return `${value}%`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function formatHistoryRunStatus(status: LifecycleHistoryRunStatus | null) {
  if (!status) return 'Not started';
  return formatLifecycleStatus(status);
}

function historyBadgeClasses(status: LifecycleHistoryRunStatus | null) {
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

function hasStaleEvidence(lifecycle: FundStateReadV1) {
  const publishedVersion = lifecycle.configState.publishedVersion;
  const calculationVersion = lifecycle.calculationState.configVersion;
  return (
    publishedVersion != null &&
    calculationVersion != null &&
    calculationVersion < publishedVersion
  );
}

function ConfigDiffBanner({ lifecycle }: { lifecycle: FundStateReadV1 }) {
  if (!hasStaleEvidence(lifecycle)) return null;

  return (
    <Alert className="border-amber-200 bg-amber-50">
      <AlertCircle className="h-4 w-4 text-amber-700" />
      <AlertTitle>Results are stale</AlertTitle>
      <AlertDescription className="font-poppins text-amber-900">
        Latest published configuration is v{lifecycle.configState.publishedVersion}, but the
        current calculation is still on v{lifecycle.calculationState.configVersion}. Recalculate
        to refresh the published results.
      </AlertDescription>
    </Alert>
  );
}

function PublishHistoryCard({ historyState }: { historyState: LifecycleHistoryState }) {
  const [isOpen, setIsOpen] = useState(false);
  const entryCount =
    historyState.kind === 'data' ? historyState.history.entries.length : historyState.history?.entries.length ?? 0;

  return (
    <div className="bg-white rounded-lg border border-beige-200 p-6 space-y-4">
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
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
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

  return (
    <div className="bg-white rounded-lg border border-beige-200 p-6 space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-medium text-charcoal">Lifecycle Status</h2>
          <p className="text-sm text-charcoal-500 font-poppins mt-1">
            Server-backed publication and calculation state for this fund.
          </p>
        </div>

        <RecalcButton
          lifecycle={lifecycle}
          recalculateState={recalculateState}
          onRecalculate={onRecalculate}
        />
      </div>

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FactTile
          label="Draft Version"
          value={configState.draftVersion != null ? `v${configState.draftVersion}` : 'No draft'}
        />
        <FactTile
          label="Run ID"
          value={calculationState.runId != null ? String(calculationState.runId) : 'Not started'}
        />
        <FactTile
          label="Dispatch State"
          value={calculationState.dispatchState ?? 'Not dispatched'}
        />
        <FactTile
          label="Snapshot Coverage"
          value={`${calculationState.availableSnapshotTypes.length}/${calculationState.expectedSnapshotTypes.length}`}
        />
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
}

function SectionRenderer({ title, section, renderPayload }: SectionRendererProps) {
  if (section.status === 'available') {
    return (
      <div className="bg-white rounded-lg border border-beige-200 p-6">
        <h2 className="text-lg font-medium text-charcoal mb-4">{title}</h2>
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
      <h2 className="text-lg font-medium text-charcoal-400 mb-2">{title}</h2>
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
  const { state: recalculateState, recalculate } = useRecalculatePublished(fundId, () => {
    void refreshResults();
    void refreshHistory();
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
    }

    previousCalculationStatusRef.current = status;
  }, [fetchState, refreshHistory]);

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

      {/* Reserve section */}
      <FadeInSection>
        <SectionRenderer title="Reserve Allocation" section={results.sections.reserve} />
      </FadeInSection>

      {/* Pacing section */}
      <FadeInSection>
        <SectionRenderer title="Deployment Pacing" section={results.sections.pacing} />
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
        <SectionRenderer title="Scenario Analysis" section={results.sections.scenarios} />
      </FadeInSection>

      {/* Waterfall section */}
      <FadeInSection>
        <SectionRenderer
          title="Waterfall Setup"
          section={results.sections.waterfall}
          renderPayload={(p) => <WaterfallSetupCard payload={p as WaterfallSetupSection} />}
        />
      </FadeInSection>
    </div>
  );
}

export default FundModelResultsPage;
