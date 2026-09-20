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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { useRoute, useSearch } from 'wouter';
import { RefreshCw } from 'lucide-react';
import {
  deriveFundScenarioPolicy,
  reserveStatusPollIntervalMs,
  type FundScenarioSetPolicy,
} from '@/lib/fund-scenario-policy';
import {
  ALLOCATION_MODEL_LIMITATION,
  CreateAllocationScenarioModal,
} from '@/components/scenarios/CreateAllocationScenarioModal';
import {
  ScenarioActionList,
  type ReserveCommandNotice,
} from '@/components/scenarios/ScenarioActionList';
import { CreateMethodologyScenarioModal } from '@/components/scenarios/CreateMethodologyScenarioModal';
import { CreateCapitalPlanScenarioModal } from '@/components/scenarios/CreateCapitalPlanScenarioModal';
import { CapitalScenarioCard } from '@/components/scenarios/CapitalScenarioCard';
import {
  duplicateCapitalDraft,
  replaceCapitalDraft,
} from '@/components/scenarios/capital-plan-draft';
import { capitalScenarioListQueryKey } from '@/lib/fund-scenario-workspace-query-keys';
import { fetchCapitalScenarioList } from '@/lib/fund-scenario-workspace-api';
import { ScenarioFactsSeedPicker } from '@/components/scenarios/ScenarioFactsSeedPicker';
import { WorkspaceContextRail } from '@/components/fund-results/WorkspaceContextRail';
import { FundWorkspaceProvider } from '@/contexts/FundWorkspaceContext';
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
  FundScenarioSetDetailV1Schema,
  type FundScenarioCalculationStatusV1,
  type FundScenarioSetDetailV1,
  type FundScenarioSetSummaryV1,
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
import {
  createReserveCalculationIntent,
  executeReserveCalculationCommand,
  type ReserveCalculationIntent,
  type ReserveCommandOutcome,
} from '@/lib/fund-scenario-reserve-command';

const FUND_SCENARIO_WORKSPACE_ROUTE = '/fund-model-results/:fundId/scenarios';
const EMPTY_SCENARIO_SETS: FundScenarioSetSummaryV1[] = [];
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

// Reserve sets go through the durable idempotent command runner instead
// (executeReserveCalculationCommand); this path serves sync sets only.
async function calculateScenarioSet(fundId: string, detail: FundScenarioSetDetailV1) {
  const raw = await apiRequest('POST', scenarioSetApiPath(fundId, detail.id, '/calculate'));
  return FundScenarioCalculationResponseV1Schema.parse(raw);
}

function reserveNoticeForOutcome(outcome: ReserveCommandOutcome): ReserveCommandNotice | null {
  switch (outcome.kind) {
    case 'queued':
      return null;
    case 'in_progress':
      return { message: 'Reserve calculation is still processing.', canRetry: true };
    case 'inputs_changed':
      return { message: 'Inputs changed; review and submit again.', canRetry: false };
    case 'queue_unavailable':
      return { message: 'Calculation queue is unavailable.', canRetry: true };
    case 'retryable_error':
      return {
        message: `Reserve calculation could not be confirmed: ${outcome.message}`,
        canRetry: true,
      };
    case 'terminal_error':
      return { message: outcome.message, canRetry: false };
  }
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
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
          Hypothetical variant deltas against the baseline for each pinned source configuration.
        </p>
      </div>
      <div className="space-y-6">
        {comparisons.map((comparison) => (
          <div
            key={comparison.scenarioSet.scenarioSetId}
            className="space-y-3"
            role="group"
            aria-label={`${comparison.scenarioSet.name} comparison`}
          >
            {comparison.variants.some((variant) => variant.overrideType === 'allocation') && (
              <p className="text-sm font-poppins text-presson-textMuted" role="note">
                {ALLOCATION_MODEL_LIMITATION}
              </p>
            )}
            <ScenarioComparisonTable comparison={comparison} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function FundScenarioWorkspacePage({
  capitalPlanEnabled = true,
}: { capitalPlanEnabled?: boolean } = {}) {
  const { currentFund } = useFundContext();
  const fundId = useWorkspaceFundId();
  const fundLabel =
    fundId !== null
      ? String(currentFund?.id) === fundId
        ? currentFund!.name
        : `Fund ${fundId}`
      : 'No fund';
  const queryClient = useQueryClient();
  const [pendingScenarioSetId, setPendingScenarioSetId] = useState<string | null>(null);
  const [reserveNotices, setReserveNotices] = useState<Record<string, ReserveCommandNotice>>({});
  // One intent (one Idempotency-Key) per scenario set, retained until known
  // success or deterministic invalidation; the in-flight set stops a
  // double-click from minting a second intent while one is active.
  const reserveIntentsRef = useRef(new Map<string, ReserveCalculationIntent>());
  const reserveInFlightRef = useRef(new Set<string>());
  const [isCreateMethodologyOpen, setIsCreateMethodologyOpen] = useState(false);
  const [isCreateAllocationOpen, setIsCreateAllocationOpen] = useState(false);
  const [isCreateCapitalOpen, setIsCreateCapitalOpen] = useState(false);
  const [capitalDraftRevision, setCapitalDraftRevision] = useState(0);
  const [includeArchivedCapital, setIncludeArchivedCapital] = useState(false);
  const [isSeedPickerOpen, setIsSeedPickerOpen] = useState(false);
  const [highlightedScenarioSetId, setHighlightedScenarioSetId] = useState<string | null>(null);
  const seedPickerEnabled = useFeatureFlag('enable_scenario_seed_picker');
  const search = useSearch();
  const seedDeepLink = useMemo(
    () => resolveSeedDeepLink(search, seedPickerEnabled),
    [search, seedPickerEnabled]
  );
  const handledSeedDeepLinkRef = useRef<typeof seedDeepLink | null>(null);

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
  const legacyScenarioDataAvailable = scenarioSetsQuery.isSuccess && resultsQuery.isSuccess;

  useEffect(() => {
    if (handledSeedDeepLinkRef.current === seedDeepLink) return;
    if (seedDeepLink.kind === 'open' && !legacyScenarioDataAvailable) return;

    handledSeedDeepLinkRef.current = seedDeepLink;
    setIsSeedPickerOpen(seedDeepLink.kind === 'open');
  }, [legacyScenarioDataAvailable, seedDeepLink]);

  const scenarioSets = scenarioSetsQuery.data ?? EMPTY_SCENARIO_SETS;

  const capitalSetsQuery = useQuery({
    queryKey: capitalScenarioListQueryKey(fundId ?? '', includeArchivedCapital),
    queryFn: () =>
      fetchCapitalScenarioList(fundId ?? '', includeArchivedCapital, 'capital-plan-v2'),
    enabled: capitalPlanEnabled && fundId !== null,
  });
  const combinedScenarioSets = [
    ...scenarioSets.map((summary) => ({ family: 'legacy' as const, summary })),
    ...(capitalSetsQuery.data?.scenarioSets ?? []).map((summary) => ({
      family: 'capital-plan-v1' as const,
      summary,
    })),
  ].sort(
    (a, b) =>
      b.summary.updatedAt.localeCompare(a.summary.updatedAt) ||
      b.summary.id.localeCompare(a.summary.id)
  );

  const detailQueries = useQueries({
    queries: scenarioSets.map((summary) => ({
      queryKey: scenarioSetDetailQueryKey(fundId ?? '', summary.id),
      queryFn: () => fetchScenarioSetDetail(fundId ?? '', summary.id),
      enabled: fundId != null,
    })),
  });

  const scenarioPayload = scenarioPayloadFromResults(resultsQuery.data);
  const scenarioEvidence = {
    scenarioSets,
    details: detailQueries.map((query) => query.data),
    results: scenarioPayload?.sets ?? [],
  };
  const { reserveScenarioSetIds, comparisonScenarioSetIds } =
    deriveFundScenarioPolicy(scenarioEvidence);

  const statusQueries = useQueries({
    queries: reserveScenarioSetIds.map((scenarioSetId) => ({
      queryKey: scenarioSetStatusQueryKey(fundId ?? '', scenarioSetId),
      queryFn: () => fetchScenarioStatus(fundId ?? '', scenarioSetId),
      enabled: fundId != null,
      refetchInterval: (query: Query<FundScenarioCalculationStatusV1>) =>
        reserveStatusPollIntervalMs(query.state.data?.status),
    })),
  });

  const comparisonQueries = useQueries({
    queries: comparisonScenarioSetIds.map((scenarioSetId) => ({
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

  async function runReserveCalculation(detail: FundScenarioSetDetailV1) {
    if (!fundId) return;
    const scenarioSetId = detail.id;
    if (reserveInFlightRef.current.has(scenarioSetId)) return;
    const intent = reserveIntentsRef.current.get(scenarioSetId) ?? createReserveCalculationIntent();
    reserveIntentsRef.current.set(scenarioSetId, intent);
    reserveInFlightRef.current.add(scenarioSetId);
    setPendingScenarioSetId(scenarioSetId);
    setReserveNotices((notices) => omitKey(notices, scenarioSetId));
    try {
      const outcome = await executeReserveCalculationCommand({
        fundId: Number(fundId),
        scenarioSetId,
        intent,
      });
      const settled =
        outcome.kind === 'queued' ||
        outcome.kind === 'inputs_changed' ||
        outcome.kind === 'terminal_error';
      if (settled) {
        reserveIntentsRef.current.delete(scenarioSetId);
      }
      const notice = reserveNoticeForOutcome(outcome);
      setReserveNotices((notices) =>
        notice ? { ...notices, [scenarioSetId]: notice } : omitKey(notices, scenarioSetId)
      );
      if (outcome.kind === 'queued' || outcome.kind === 'inputs_changed') {
        await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
      }
    } finally {
      reserveInFlightRef.current.delete(scenarioSetId);
      setPendingScenarioSetId(null);
    }
  }

  function calculateScenario({ detail, calculationPath }: FundScenarioSetPolicy) {
    if (!detail) return;
    if (calculationPath === 'reserve') {
      void runReserveCalculation(detail);
      return;
    }
    setPendingScenarioSetId(detail.id);
    calculateMutation.mutate(detail);
  }

  const createReserveOptimizationMutation = useMutation({
    mutationFn: () => createReserveOptimizationScenarioSet(fundId ?? ''),
    onSuccess: async () => {
      if (!fundId) return;
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
    },
  });

  const { byId: policyById } = deriveFundScenarioPolicy({
    ...scenarioEvidence,
    reserveStatuses: statusQueries.map((query) => query.data),
  });
  const comparisons = useMemo(
    () => comparisonDataFromQueries(comparisonQueries),
    [comparisonQueries]
  );

  // Review P3-7: the workspace row stays mounted through invalid, loading,
  // and error states so hub navigation survives a failing spoke (D-C:
  // partial context renders what is known plus disabled items).
  const routeFundNumber = fundId !== null ? Number(fundId) : null;
  const partialStateFrame = (content: React.ReactNode) => (
    <FundWorkspaceProvider fundId={routeFundNumber}>
      <WorkspaceNav
        fundId={fundId}
        fundLabel={fundLabel}
        active="scenarios"
        indicator={<WorkspaceBasisIndicator mode="construction" />}
      />
      <WorkspaceContextRail>{content}</WorkspaceContextRail>
    </FundWorkspaceProvider>
  );

  if (!fundId) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {partialStateFrame(
          <WorkspaceErrorState
            title="Invalid scenario workspace route"
            message="Use /fund-model-results/:fundId/scenarios with a numeric fund ID."
          />
        )}
      </div>
    );
  }

  if (!capitalPlanEnabled && (scenarioSetsQuery.isLoading || resultsQuery.isLoading)) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {partialStateFrame(<WorkspaceLoadingState />)}
      </div>
    );
  }

  if (!capitalPlanEnabled && (scenarioSetsQuery.isError || resultsQuery.isError)) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {partialStateFrame(
          <WorkspaceErrorState
            title="Scenario workspace unavailable"
            message="Scenario workspace data could not be loaded."
            onRetry={() => queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) })}
          />
        )}
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
      <FundWorkspaceProvider fundId={routeFundNumber}>
        <WorkspaceNav
          fundId={fundId}
          fundLabel={fund ? fund.name : fundLabel}
          active="scenarios"
          indicator={<WorkspaceBasisIndicator mode="construction" />}
        />
        <WorkspaceContextRail>
          <div className="space-y-8">
            <header className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {capitalPlanEnabled && (
                    <Button type="button" onClick={() => setIsCreateCapitalOpen(true)}>
                      New capital planning scenario
                    </Button>
                  )}
                  {seedPickerEnabled && legacyScenarioDataAvailable && (
                    <Button variant="outline" size="sm" onClick={() => setIsSeedPickerOpen(true)}>
                      Start case from portfolio actuals
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateMethodologyOpen(true)}
                  >
                    New methodology scenario
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateAllocationOpen(true)}
                    className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
                  >
                    New allocation scenarios
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
                    {(capitalPlanEnabled ? combinedScenarioSets.length : scenarioSets.length) === 1
                      ? '1 scenario set'
                      : `${capitalPlanEnabled ? combinedScenarioSets.length : scenarioSets.length} scenario sets`}
                  </span>
                </p>
              </div>
              {seedDeepLink.kind === 'notice' && (
                <p className="text-sm text-presson-textMuted" data-testid="seed-source-unavailable">
                  Seed source unavailable: {seedDeepLink.reason}
                </p>
              )}
            </header>

            {capitalPlanEnabled && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeArchivedCapital}
                    onChange={(event) => setIncludeArchivedCapital(event.target.checked)}
                  />
                  Include archived capital plans
                </label>
                {(scenarioSetsQuery.isLoading || resultsQuery.isLoading) && (
                  <p>Loading legacy scenarios.</p>
                )}
                {(scenarioSetsQuery.isError || resultsQuery.isError) && (
                  <p role="alert">Legacy scenario data unavailable. Capital plans remain usable.</p>
                )}
                {capitalSetsQuery.isLoading && <p>Loading capital plans.</p>}
                {capitalSetsQuery.isError && (
                  <p role="alert">Capital plan list unavailable. Legacy scenarios remain usable.</p>
                )}
              </>
            )}
            {capitalPlanEnabled ? (
              combinedScenarioSets.map((item) =>
                item.family === 'capital-plan-v1' ? (
                  <CapitalScenarioCard
                    key={`capital-${item.summary.id}`}
                    fundId={fundId}
                    summary={item.summary}
                    onDuplicate={(detail) => {
                      replaceCapitalDraft(fundId, duplicateCapitalDraft(detail));
                      setCapitalDraftRevision((value) => value + 1);
                      setIsCreateCapitalOpen(true);
                    }}
                  />
                ) : (
                  <ScenarioActionList
                    key={`legacy-${item.summary.id}`}
                    scenarioSets={[item.summary]}
                    policyById={policyById}
                    noticeById={reserveNotices}
                    pendingScenarioSetId={pendingScenarioSetId}
                    highlightedScenarioSetId={highlightedScenarioSetId}
                    onCalculate={calculateScenario}
                  />
                )
              )
            ) : (
              <ScenarioActionList
                scenarioSets={scenarioSets}
                policyById={policyById}
                noticeById={reserveNotices}
                pendingScenarioSetId={pendingScenarioSetId}
                highlightedScenarioSetId={highlightedScenarioSetId}
                onCalculate={calculateScenario}
              />
            )}

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-medium text-charcoal">Calculated Results</h2>
                <p className="mt-1 text-sm text-charcoal-500 font-poppins">
                  Hypothetical scenario outputs from the latest calculated results; these are not
                  verified actuals.
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
            <CreateAllocationScenarioModal
              fundId={fundId}
              open={isCreateAllocationOpen}
              onOpenChange={setIsCreateAllocationOpen}
              onSuccess={(created) => setHighlightedScenarioSetId(created.id)}
            />
            {capitalPlanEnabled && (
              <CreateCapitalPlanScenarioModal
                key={`${fundId}-${capitalDraftRevision}`}
                fundId={fundId}
                open={isCreateCapitalOpen}
                onOpenChange={setIsCreateCapitalOpen}
                onSuccess={(created) => setHighlightedScenarioSetId(created.scenarioSetId)}
              />
            )}
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
        </WorkspaceContextRail>
      </FundWorkspaceProvider>
    </div>
  );
}

export default FundScenarioWorkspacePage;
