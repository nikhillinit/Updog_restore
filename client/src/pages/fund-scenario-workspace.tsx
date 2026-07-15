/**
 * Fund Scenario Workspace
 *
 * Dedicated ADR-022 scenario workspace backed by existing scenario-set
 * endpoints and strict shared contracts.
 *
 * Route: /fund-model-results/:fundId/scenarios
 *
 * @module client/pages/fund-scenario-workspace
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRoute, useSearch } from 'wouter';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateMethodologyScenarioModal } from '@/components/scenarios/CreateMethodologyScenarioModal';
import { ScenarioFactsSeedPicker } from '@/components/scenarios/ScenarioFactsSeedPicker';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';
import { useFeatureFlag } from '@/core/flags/flagAdapter';
import {
  type Query,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScenarioComparisonTable, ScenarioSetsSummary } from '@/components/fund-results';
import { apiRequest } from '@/lib/queryClient';
import {
  FundResultsReadV1Schema,
  type FundResultsReadV1,
} from '@shared/contracts/fund-results-v1.contract';
import {
  FundScenarioCalculationResponseV1Schema,
  FundScenarioCalculationStatusV1Schema,
  FundScenarioReserveCalculationQueuedV1Schema,
  FundScenarioSetDetailV1Schema,
  type FundScenarioCalculationModeV1,
  type FundScenarioCalculationStatusV1,
  type FundScenarioOverrideTypeV1,
  type FundScenarioSetDetailV1,
  type FundScenarioSetSummaryV1,
  type ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  FundScenarioComparisonV1Schema,
  type FundScenarioComparisonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import {
  fundResultsQueryKey,
  scenarioComparisonQueryKey,
  scenarioSetDetailQueryKey,
  scenarioSetListQueryKey,
  scenarioSetStatusQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import {
  fetchScenarioSetList,
  scenarioApiPath,
  scenarioSetApiPath,
} from '@/lib/fund-scenario-workspace-api';

const FUND_SCENARIO_WORKSPACE_ROUTE = '/fund-model-results/:fundId/scenarios';
const OVERRIDE_TYPE_LABELS: Record<FundScenarioOverrideTypeV1, string> = {
  fee_profile: 'Fee profile',
  reserve_allocation: 'Reserve allocation',
  allocation: 'Allocation',
  sector_profile: 'Sector profile',
  methodology: 'Methodology',
};
const EMPTY_SCENARIO_SETS: FundScenarioSetSummaryV1[] = [];
const RESERVE_STATUS_POLL_INTERVAL_MS = 4000;

// Poll while a reserve calculation is in flight; stop at terminal/idle states.
// A transient poll error leaves the last successful status in query.state.data, so
// polling continues through transient failures until a terminal status.
export function reserveStatusPollIntervalMs(
  status: FundScenarioCalculationStatusV1['status'] | undefined
): number | false {
  return status === 'queued' || status === 'calculating' ? RESERVE_STATUS_POLL_INTERVAL_MS : false;
}

async function fetchScenarioSetDetail(fundId: string, scenarioSetId: string) {
  const raw = await apiRequest('GET', scenarioSetApiPath(fundId, scenarioSetId));
  return FundScenarioSetDetailV1Schema.parse(raw);
}

async function fetchScenarioStatus(fundId: string, scenarioSetId: string) {
  const raw = await apiRequest(
    'GET',
    scenarioSetApiPath(fundId, scenarioSetId, '/calculation-status')
  );
  return FundScenarioCalculationStatusV1Schema.parse(raw);
}

async function fetchFundResults(fundId: string) {
  const raw = await apiRequest('GET', scenarioApiPath(fundId, '/results'));
  return FundResultsReadV1Schema.parse(raw);
}

async function fetchScenarioComparison(fundId: string, scenarioSetId: string) {
  const raw = await apiRequest('GET', scenarioSetApiPath(fundId, scenarioSetId, '/comparison'));
  return FundScenarioComparisonV1Schema.parse(raw);
}

function scenarioSetOverrideType(
  detail: FundScenarioSetDetailV1
): FundScenarioOverrideTypeV1 | null {
  return detail.variants[0]?.override.overrideType ?? null;
}

async function calculateScenarioSet(fundId: string, detail: FundScenarioSetDetailV1) {
  const overrideType = scenarioSetOverrideType(detail);
  if (overrideType === 'reserve_allocation') {
    const raw = await apiRequest(
      'POST',
      scenarioSetApiPath(fundId, detail.id, '/calculate-reserve'),
      {}
    );
    return FundScenarioReserveCalculationQueuedV1Schema.parse(raw);
  }

  const raw = await apiRequest('POST', scenarioSetApiPath(fundId, detail.id, '/calculate'));
  return FundScenarioCalculationResponseV1Schema.parse(raw);
}

async function createReserveOptimizationScenarioSet(fundId: string) {
  const raw = await apiRequest(
    'POST',
    scenarioApiPath(fundId, '/scenario-sets/reserve-optimization'),
    {}
  );
  return FundScenarioSetDetailV1Schema.parse(raw);
}

function useWorkspaceFundId() {
  const [, params] = useRoute(FUND_SCENARIO_WORKSPACE_ROUTE);
  const fundId = params?.fundId ?? null;
  return fundId && /^\d+$/.test(fundId) ? fundId : null;
}

export type SeedDeepLinkResolution =
  | { kind: 'none' }
  | { kind: 'open'; seedCompanyId: string | null }
  | { kind: 'notice'; reason: string };

/**
 * Plan 9 Wave 9B1 deep link: `?seedPicker=1&seedCompany=<id>` opens the
 * flag-gated seed picker. Validation mirrors the existing picker entry:
 * flag-off or an invalid company reference lands with the picker closed and
 * a muted inline notice (D-C deep-link failure state).
 */
export function resolveSeedDeepLink(
  search: string,
  seedPickerEnabled: boolean
): SeedDeepLinkResolution {
  const params = new URLSearchParams(search);
  if (params.get('seedPicker') !== '1') {
    return { kind: 'none' };
  }
  if (!seedPickerEnabled) {
    return { kind: 'notice', reason: 'the scenario seed picker is not enabled' };
  }
  const seedCompany = params.get('seedCompany');
  // Review P2-3 plus 9C2b-P1: canonical positive safe integer only.
  if (
    seedCompany !== null &&
    (!/^[1-9]\d*$/.test(seedCompany) || !Number.isSafeInteger(Number(seedCompany)))
  ) {
    return { kind: 'notice', reason: 'invalid company reference' };
  }
  return { kind: 'open', seedCompanyId: seedCompany };
}

function scenarioPayloadFromResults(results: FundResultsReadV1 | undefined) {
  const scenarios = results?.sections.scenarios;
  return scenarios?.status === 'available' ? scenarios.payload : null;
}

function scenarioStatusLabel(status: FundScenarioCalculationStatusV1['status'] | undefined) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'calculating':
      return 'Calculating';
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'not_requested':
      return 'Not requested';
    default:
      return 'Loading';
  }
}

function scenarioStatusTone(status: FundScenarioCalculationStatusV1['status'] | undefined) {
  if (status === 'succeeded') return 'bg-success/10 text-success-dark';
  if (status === 'failed') return 'bg-error/10 text-error-dark';
  if (status === 'queued' || status === 'calculating')
    return 'bg-presson-info/10 text-presson-info';
  return 'bg-beige-100 text-charcoal-600';
}

function syncCalculationModeForOverrideType(
  overrideType: Exclude<FundScenarioOverrideTypeV1, 'reserve_allocation'>
): FundScenarioCalculationModeV1 {
  switch (overrideType) {
    case 'fee_profile':
      return 'sync_fee_profile';
    case 'allocation':
      return 'sync_allocation';
    case 'sector_profile':
      return 'sync_sector_profile';
    case 'methodology':
      return 'sync_methodology';
  }
}

function actionLabelFor(summary: FundScenarioSetSummaryV1, detail: FundScenarioSetDetailV1 | null) {
  const overrideType = detail ? scenarioSetOverrideType(detail) : null;
  return overrideType === 'reserve_allocation'
    ? `Queue ${summary.name}`
    : `Calculate ${summary.name}`;
}

function actionButtonText(detail: FundScenarioSetDetailV1 | null) {
  const overrideType = detail ? scenarioSetOverrideType(detail) : null;
  return overrideType === 'reserve_allocation' ? 'Queue' : 'Calculate';
}

function detailMapFromQueries(
  queries: Array<{ data: FundScenarioSetDetailV1 | undefined }>
): Map<string, FundScenarioSetDetailV1> {
  return new Map(
    queries.flatMap((query) => (query.data ? [[query.data.id, query.data] as const] : []))
  );
}

function statusMapFromQueries(
  queries: Array<{ data: FundScenarioCalculationStatusV1 | undefined }>
): Map<string, FundScenarioCalculationStatusV1> {
  return new Map(
    queries.flatMap((query) =>
      query.data ? [[query.data.scenarioSetId, query.data] as const] : []
    )
  );
}

function resultMapFromScenarioPayload(
  scenarioPayload: ReturnType<typeof scenarioPayloadFromResults>
): Map<string, ScenarioSetResultSummaryV1> {
  return new Map(scenarioPayload?.sets.map((set) => [set.scenarioSetId, set] as const) ?? []);
}

function syncStatusFromDetailAndResults({
  summary,
  detail,
  result,
}: {
  summary: FundScenarioSetSummaryV1;
  detail: FundScenarioSetDetailV1 | undefined;
  result: ScenarioSetResultSummaryV1 | undefined;
}): FundScenarioCalculationStatusV1 | null {
  if (!detail) return null;

  const overrideType = scenarioSetOverrideType(detail);
  if (!overrideType || overrideType === 'reserve_allocation') return null;

  return {
    fundId: summary.fundId,
    scenarioSetId: summary.id,
    calculationMode: syncCalculationModeForOverrideType(overrideType),
    status: result ? 'succeeded' : 'not_requested',
    jobId: null,
    correlationId: null,
    snapshotId: null,
    lastEventAt: result?.calculatedAt ?? null,
    lastError: null,
  };
}

function displayStatusMapFromSources({
  scenarioSets,
  detailById,
  reserveStatusQueries,
  scenarioResultById,
}: {
  scenarioSets: FundScenarioSetSummaryV1[];
  detailById: Map<string, FundScenarioSetDetailV1>;
  reserveStatusQueries: Array<{ data: FundScenarioCalculationStatusV1 | undefined }>;
  scenarioResultById: Map<string, ScenarioSetResultSummaryV1>;
}): Map<string, FundScenarioCalculationStatusV1> {
  const statusById = statusMapFromQueries(reserveStatusQueries);

  for (const summary of scenarioSets) {
    if (statusById.has(summary.id)) continue;

    const status = syncStatusFromDetailAndResults({
      summary,
      detail: detailById.get(summary.id),
      result: scenarioResultById.get(summary.id),
    });
    if (status) {
      statusById.set(summary.id, status);
    }
  }

  return statusById;
}

function comparisonDataFromQueries(
  queries: Array<{ data: FundScenarioComparisonV1 | undefined }>
): FundScenarioComparisonV1[] {
  return queries.flatMap((query) => (query.data ? [query.data] : []));
}

function WorkspaceLoadingState() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16" role="status">
      <span className="sr-only">Loading scenario workspace…</span>
      <div className="animate-pulse space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-9 w-32 rounded bg-beige-100" />
          <div className="h-9 w-48 rounded bg-beige-100" />
        </div>
        <div className="space-y-2">
          <div className="h-7 w-64 rounded bg-beige-100" />
          <div className="h-4 w-80 max-w-full rounded bg-beige-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-36 rounded-md bg-beige-100" />
          <div className="h-36 rounded-md bg-beige-100" />
        </div>
        <div className="h-64 rounded-md bg-beige-100" />
      </div>
    </div>
  );
}

function WorkspaceErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Alert className="border-beige-200">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">{message}</AlertDescription>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Alert>
    </div>
  );
}

function ScenarioSectionEmpty({ results }: { results: FundResultsReadV1 | undefined }) {
  const scenarios = results?.sections.scenarios;
  if (!scenarios || scenarios.status === 'available') return null;

  return (
    <Alert className="border-beige-200 bg-beige-50">
      <AlertTitle>Scenario results unavailable</AlertTitle>
      <AlertDescription className="font-poppins text-charcoal-500">
        {scenarios.reason}
      </AlertDescription>
    </Alert>
  );
}

function ScenarioSetActionCard({
  summary,
  detail,
  status,
  pendingScenarioSetId,
  isHighlighted,
  onCalculate,
}: {
  summary: FundScenarioSetSummaryV1;
  detail: FundScenarioSetDetailV1 | null;
  status: FundScenarioCalculationStatusV1 | null;
  pendingScenarioSetId: string | null;
  isHighlighted?: boolean;
  onCalculate: (detail: FundScenarioSetDetailV1) => void;
}) {
  const isPending = pendingScenarioSetId === summary.id;
  const overrideType = detail ? scenarioSetOverrideType(detail) : null;
  const disabled = !detail || isPending;
  const disabledTitle = !detail && !isPending ? 'Loading scenario details…' : undefined;

  return (
    <article
      className={cn(
        'rounded-md border border-beige-200 bg-white p-4',
        isHighlighted && 'ring-2 ring-charcoal'
      )}
      data-testid={`scenario-workspace-set-${summary.id}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="font-inter text-base font-semibold text-charcoal">{summary.name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 font-poppins text-sm text-charcoal-500">
              <span>
                {summary.variantCount === 1 ? '1 variant' : `${summary.variantCount} variants`}
              </span>
              <span aria-hidden="true" className="text-charcoal-300">
                ·
              </span>
              <span>Source config v{summary.sourceConfigVersion}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={scenarioStatusTone(status?.status)}>
              {scenarioStatusLabel(status?.status)}
            </Badge>
            {overrideType && <Badge variant="outline">{OVERRIDE_TYPE_LABELS[overrideType]}</Badge>}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label={actionLabelFor(summary, detail)}
          disabled={disabled}
          title={disabledTitle}
          onClick={() => detail && onCalculate(detail)}
        >
          {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
          {isPending ? 'Submitting' : actionButtonText(detail)}
        </Button>
      </div>
      {status?.lastError && (
        <p className="mt-3 text-sm text-error-dark font-poppins">{status.lastError}</p>
      )}
    </article>
  );
}

function ScenarioActionList({
  scenarioSets,
  detailById,
  statusById,
  pendingScenarioSetId,
  highlightedScenarioSetId,
  onCalculate,
}: {
  scenarioSets: FundScenarioSetSummaryV1[];
  detailById: Map<string, FundScenarioSetDetailV1>;
  statusById: Map<string, FundScenarioCalculationStatusV1>;
  pendingScenarioSetId: string | null;
  highlightedScenarioSetId?: string | null;
  onCalculate: (detail: FundScenarioSetDetailV1) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-charcoal">Scenario Sets</h2>
        <p className="mt-1 text-sm text-charcoal-500 font-poppins">
          Latest scenario sets for the published fund configuration.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {scenarioSets.map((summary) => (
          <ScenarioSetActionCard
            key={summary.id}
            summary={summary}
            detail={detailById.get(summary.id) ?? null}
            status={statusById.get(summary.id) ?? null}
            pendingScenarioSetId={pendingScenarioSetId}
            isHighlighted={summary.id === highlightedScenarioSetId}
            onCalculate={onCalculate}
          />
        ))}
      </div>
    </section>
  );
}

function ScenarioComparisonWorkspace({
  comparisons,
  isLoading,
}: {
  comparisons: FundScenarioComparisonV1[];
  isLoading: boolean;
}) {
  if (isLoading && comparisons.length === 0) {
    return <p className="text-sm text-charcoal-500 font-poppins">Loading scenario comparisons…</p>;
  }

  if (comparisons.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-charcoal">Comparisons</h2>
        <p className="mt-1 text-sm text-charcoal-500 font-poppins">
          Variant deltas against the authoritative baseline.
        </p>
      </div>
      <div className="space-y-6">
        {comparisons.map((comparison) => (
          <ScenarioComparisonTable
            key={comparison.scenarioSet.scenarioSetId}
            comparison={comparison}
          />
        ))}
      </div>
    </section>
  );
}

function FundScenarioWorkspacePage() {
  const fundId = useWorkspaceFundId();
  const queryClient = useQueryClient();
  const [pendingScenarioSetId, setPendingScenarioSetId] = useState<string | null>(null);
  const [isCreateMethodologyOpen, setIsCreateMethodologyOpen] = useState(false);
  const [isSeedPickerOpen, setIsSeedPickerOpen] = useState(false);
  const [highlightedScenarioSetId, setHighlightedScenarioSetId] = useState<string | null>(null);
  const seedPickerEnabled = useFeatureFlag('enable_scenario_seed_picker');
  const search = useSearch();
  const seedDeepLink = useMemo(
    () => resolveSeedDeepLink(search, seedPickerEnabled),
    [search, seedPickerEnabled]
  );

  useEffect(() => {
    if (seedDeepLink.kind === 'open') {
      setIsSeedPickerOpen(true);
    } else {
      // Review P3-6: an in-place transition to an invalid/flag-off deep link
      // (or away from the deep link) explicitly closes the picker.
      setIsSeedPickerOpen(false);
    }
  }, [seedDeepLink]);

  const scenarioSetsQuery = useQuery({
    queryKey: fundId ? scenarioSetListQueryKey(fundId) : ['fund-scenario-workspace', 'invalid'],
    queryFn: () => fetchScenarioSetList(fundId ?? ''),
    enabled: fundId != null,
  });

  const resultsQuery = useQuery({
    queryKey: fundId ? fundResultsQueryKey(fundId) : ['fund-scenario-workspace', 'invalid-results'],
    queryFn: () => fetchFundResults(fundId ?? ''),
    enabled: fundId != null,
  });

  const scenarioSets = scenarioSetsQuery.data ?? EMPTY_SCENARIO_SETS;

  const detailQueries = useQueries({
    queries: scenarioSets.map((summary) => ({
      queryKey: scenarioSetDetailQueryKey(fundId ?? '', summary.id),
      queryFn: () => fetchScenarioSetDetail(fundId ?? '', summary.id),
      enabled: fundId != null,
    })),
  });

  const detailById = useMemo(() => detailMapFromQueries(detailQueries), [detailQueries]);
  const reserveScenarioSetIds = useMemo(
    () =>
      scenarioSets
        .filter((summary) => {
          const detail = detailById.get(summary.id);
          return detail ? scenarioSetOverrideType(detail) === 'reserve_allocation' : false;
        })
        .map((summary) => summary.id),
    [detailById, scenarioSets]
  );

  const statusQueries = useQueries({
    queries: reserveScenarioSetIds.map((scenarioSetId) => ({
      queryKey: scenarioSetStatusQueryKey(fundId ?? '', scenarioSetId),
      queryFn: () => fetchScenarioStatus(fundId ?? '', scenarioSetId),
      enabled: fundId != null,
      refetchInterval: (query: Query<FundScenarioCalculationStatusV1>) =>
        reserveStatusPollIntervalMs(query.state.data?.status),
    })),
  });

  const scenarioPayload = scenarioPayloadFromResults(resultsQuery.data);
  const scenarioResultById = useMemo(
    () => resultMapFromScenarioPayload(scenarioPayload),
    [scenarioPayload]
  );
  const calculatedScenarioSetIds = scenarioPayload?.sets.map((set) => set.scenarioSetId) ?? [];

  const comparisonQueries = useQueries({
    queries: calculatedScenarioSetIds.map((scenarioSetId) => ({
      queryKey: scenarioComparisonQueryKey(fundId ?? '', scenarioSetId),
      queryFn: () => fetchScenarioComparison(fundId ?? '', scenarioSetId),
      enabled: fundId != null,
    })),
  });

  const calculateMutation = useMutation({
    mutationFn: (detail: FundScenarioSetDetailV1) => calculateScenarioSet(fundId ?? '', detail),
    onSuccess: async () => {
      if (!fundId) return;
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
    },
    onSettled: () => setPendingScenarioSetId(null),
  });

  const createReserveOptimizationMutation = useMutation({
    mutationFn: () => createReserveOptimizationScenarioSet(fundId ?? ''),
    onSuccess: async () => {
      if (!fundId) return;
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
    },
  });

  const statusById = useMemo(
    () =>
      displayStatusMapFromSources({
        scenarioSets,
        detailById,
        reserveStatusQueries: statusQueries,
        scenarioResultById,
      }),
    [detailById, scenarioResultById, scenarioSets, statusQueries]
  );
  const comparisons = useMemo(
    () => comparisonDataFromQueries(comparisonQueries),
    [comparisonQueries]
  );

  // Review P3-7: the workspace row stays mounted through invalid, loading,
  // and error states so hub navigation survives a failing spoke (D-C:
  // partial context renders what is known plus disabled items).
  const partialStateNav = (
    <WorkspaceNav
      fundId={fundId}
      fundLabel={fundId !== null ? `Fund ${fundId}` : 'No fund'}
      active="scenarios"
      indicator={<WorkspaceBasisIndicator mode="construction" />}
    />
  );

  if (!fundId) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {partialStateNav}
        <WorkspaceErrorState
          title="Invalid scenario workspace route"
          message="Use /fund-model-results/:fundId/scenarios with a numeric fund ID."
        />
      </div>
    );
  }

  if (scenarioSetsQuery.isLoading || resultsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {partialStateNav}
        <WorkspaceLoadingState />
      </div>
    );
  }

  if (scenarioSetsQuery.isError || resultsQuery.isError) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {partialStateNav}
        <WorkspaceErrorState
          title="Scenario workspace unavailable"
          message="Scenario workspace data could not be loaded."
          onRetry={() => queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) })}
        />
      </div>
    );
  }

  const fund = resultsQuery.data?.fund;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      {/* Workspace row (D-F.2/D-F.5): the nav supersedes the removed
          Back-to-Results button. Scenario sets are built on the published
          (construction) configuration; the saved-scenario overlay control is
          deferred until a surface-level scenario selection exists (D-E
          fallback ordering). */}
      <WorkspaceNav
        fundId={fundId}
        fundLabel={fund ? fund.name : `Fund ${fundId}`}
        active="scenarios"
        indicator={<WorkspaceBasisIndicator mode="construction" />}
      />
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {seedPickerEnabled && (
              <Button variant="outline" size="sm" onClick={() => setIsSeedPickerOpen(true)}>
                Start case from portfolio actuals
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setIsCreateMethodologyOpen(true)}>
              New methodology scenario
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={createReserveOptimizationMutation.isPending}
              onClick={() => createReserveOptimizationMutation.mutate()}
            >
              {createReserveOptimizationMutation.isPending && (
                <RefreshCw className="h-4 w-4 animate-spin" />
              )}
              {createReserveOptimizationMutation.isPending
                ? 'Creating'
                : 'Create optimized reserve plan'}
            </Button>
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-charcoal">Scenario Workspace</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-charcoal-500 font-poppins">
            {fund ? (
              <>
                <span>{fund.name}</span>
                <span aria-hidden="true" className="text-charcoal-300">
                  ·
                </span>
                <span>Vintage {fund.vintageYear}</span>
              </>
            ) : (
              <span>Fund {fundId}</span>
            )}
            <span aria-hidden="true" className="text-charcoal-300">
              ·
            </span>
            <span>
              {scenarioSets.length === 1
                ? '1 scenario set'
                : `${scenarioSets.length} scenario sets`}
            </span>
          </p>
        </div>
        {seedDeepLink.kind === 'notice' && (
          <p className="text-sm text-presson-textMuted" data-testid="seed-source-unavailable">
            Seed source unavailable: {seedDeepLink.reason}
          </p>
        )}
      </header>

      <ScenarioActionList
        scenarioSets={scenarioSets}
        detailById={detailById}
        statusById={statusById}
        pendingScenarioSetId={pendingScenarioSetId}
        highlightedScenarioSetId={highlightedScenarioSetId}
        onCalculate={(detail) => {
          setPendingScenarioSetId(detail.id);
          calculateMutation.mutate(detail);
        }}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-charcoal">Calculated Results</h2>
          <p className="mt-1 text-sm text-charcoal-500 font-poppins">
            Scenario outputs from the latest calculated results.
          </p>
        </div>
        {scenarioPayload ? (
          <ScenarioSetsSummary payload={scenarioPayload} />
        ) : (
          <ScenarioSectionEmpty results={resultsQuery.data} />
        )}
      </section>

      <ScenarioComparisonWorkspace
        comparisons={comparisons}
        isLoading={comparisonQueries.some((query) => query.isLoading)}
      />
      <CreateMethodologyScenarioModal
        fundId={fundId}
        open={isCreateMethodologyOpen}
        onOpenChange={setIsCreateMethodologyOpen}
        onSuccess={(created) => setHighlightedScenarioSetId(created.id)}
      />
      {seedPickerEnabled && (
        <ScenarioFactsSeedPicker
          fundId={fundId}
          open={isSeedPickerOpen}
          onOpenChange={setIsSeedPickerOpen}
          {...(seedDeepLink.kind === 'open' && seedDeepLink.seedCompanyId !== null
            ? { initialSelectedCompanyId: seedDeepLink.seedCompanyId }
            : {})}
        />
      )}
    </div>
  );
}

export default FundScenarioWorkspacePage;
