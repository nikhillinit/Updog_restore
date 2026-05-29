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

import React, { useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
  FundScenarioSetListResponseV1Schema,
  type FundScenarioCalculationStatusV1,
  type FundScenarioSetDetailV1,
  type FundScenarioSetSummaryV1,
  type FundScenarioOverrideTypeV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  FundScenarioComparisonV1Schema,
  type FundScenarioComparisonV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';

const FUND_SCENARIO_WORKSPACE_ROUTE = '/fund-model-results/:fundId/scenarios';
const FUND_ID_PATH_SEGMENT_PATTERN = /^\d+$/;
const SCENARIO_SET_ID_PATH_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function workspaceQueryKey(fundId: string) {
  return ['fund-scenario-workspace', fundId] as const;
}

function scenarioSetListQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets'] as const;
}

function scenarioSetDetailQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', scenarioSetId, 'detail'] as const;
}

function scenarioSetStatusQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', scenarioSetId, 'status'] as const;
}

function fundResultsQueryKey(fundId: string) {
  return [...workspaceQueryKey(fundId), 'results'] as const;
}

function scenarioComparisonQueryKey(fundId: string, scenarioSetId: string) {
  return [...workspaceQueryKey(fundId), 'scenario-sets', scenarioSetId, 'comparison'] as const;
}

function assertFundId(fundId: string): void {
  if (!FUND_ID_PATH_SEGMENT_PATTERN.test(fundId)) {
    throw new Error('Invalid fund ID');
  }
}

function assertScenarioSetId(scenarioSetId: string): void {
  if (!SCENARIO_SET_ID_PATH_SEGMENT_PATTERN.test(scenarioSetId)) {
    throw new Error('Invalid scenario set ID');
  }
}

function scenarioApiPath(fundId: string, suffix: string): string {
  assertFundId(fundId);
  return `/api/funds/${encodeURIComponent(fundId)}${suffix}`;
}

function scenarioSetApiPath(fundId: string, scenarioSetId: string, suffix = ''): string {
  assertScenarioSetId(scenarioSetId);
  return scenarioApiPath(
    fundId,
    `/scenario-sets/${encodeURIComponent(scenarioSetId)}${suffix}`
  );
}

async function fetchScenarioSetList(fundId: string) {
  const raw = await apiRequest('GET', scenarioApiPath(fundId, '/scenario-sets'));
  return FundScenarioSetListResponseV1Schema.parse(raw).scenarioSets;
}

async function fetchScenarioSetDetail(fundId: string, scenarioSetId: string) {
  const raw = await apiRequest('GET', scenarioSetApiPath(fundId, scenarioSetId));
  return FundScenarioSetDetailV1Schema.parse(raw);
}

async function fetchScenarioStatus(fundId: string, scenarioSetId: string) {
  const raw = await apiRequest('GET', scenarioSetApiPath(fundId, scenarioSetId, '/calculation-status'));
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

function scenarioSetOverrideType(detail: FundScenarioSetDetailV1): FundScenarioOverrideTypeV1 | null {
  return detail.variants[0]?.override.overrideType ?? null;
}

async function calculateScenarioSet(fundId: string, detail: FundScenarioSetDetailV1) {
  const overrideType = scenarioSetOverrideType(detail);
  if (overrideType === 'reserve_allocation') {
    const raw = await apiRequest('POST', scenarioSetApiPath(fundId, detail.id, '/calculate-reserve'), {});
    return FundScenarioReserveCalculationQueuedV1Schema.parse(raw);
  }

  const raw = await apiRequest('POST', scenarioSetApiPath(fundId, detail.id, '/calculate'));
  return FundScenarioCalculationResponseV1Schema.parse(raw);
}

function useWorkspaceFundId() {
  const [, params] = useRoute(FUND_SCENARIO_WORKSPACE_ROUTE);
  const fundId = params?.fundId ?? null;
  return fundId && FUND_ID_PATH_SEGMENT_PATTERN.test(fundId) ? fundId : null;
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
  if (status === 'succeeded') return 'bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'bg-red-50 text-red-800';
  if (status === 'queued' || status === 'calculating') return 'bg-blue-50 text-blue-800';
  return 'bg-beige-100 text-charcoal-600';
}

function actionLabelFor(summary: FundScenarioSetSummaryV1, detail: FundScenarioSetDetailV1 | null) {
  const overrideType = detail ? scenarioSetOverrideType(detail) : null;
  return overrideType === 'reserve_allocation' ? `Queue ${summary.name}` : `Calculate ${summary.name}`;
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

function comparisonDataFromQueries(
  queries: Array<{ data: FundScenarioComparisonV1 | undefined }>
): FundScenarioComparisonV1[] {
  return queries.flatMap((query) => (query.data ? [query.data] : []));
}

function WorkspaceLoadingState() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16" role="status">
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-beige-100" />
        <div className="h-28 rounded bg-beige-100" />
        <div className="h-44 rounded bg-beige-100" />
      </div>
    </div>
  );
}

function WorkspaceErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Alert className="border-beige-200">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="font-poppins text-charcoal-500">{message}</AlertDescription>
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
  onCalculate,
}: {
  summary: FundScenarioSetSummaryV1;
  detail: FundScenarioSetDetailV1 | null;
  status: FundScenarioCalculationStatusV1 | null;
  pendingScenarioSetId: string | null;
  onCalculate: (detail: FundScenarioSetDetailV1) => void;
}) {
  const isPending = pendingScenarioSetId === summary.id;
  const overrideType = detail ? scenarioSetOverrideType(detail) : null;
  const disabled = !detail || isPending;

  return (
    <article
      className="rounded-md border border-beige-200 bg-white p-4"
      data-testid={`scenario-workspace-set-${summary.id}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="font-inter text-base font-semibold text-charcoal">{summary.name}</h3>
            <p className="mt-1 font-poppins text-sm text-charcoal-500">
              {summary.variantCount === 1 ? '1 variant' : `${summary.variantCount} variants`} |
              Source config v{summary.sourceConfigVersion}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={scenarioStatusTone(status?.status)}>
              {scenarioStatusLabel(status?.status)}
            </Badge>
            {overrideType && (
              <Badge variant="outline">
                {overrideType === 'fee_profile' ? 'Fee profile' : 'Reserve allocation'}
              </Badge>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label={actionLabelFor(summary, detail)}
          disabled={disabled}
          onClick={() => detail && onCalculate(detail)}
        >
          {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
          {isPending ? 'Submitting' : actionButtonText(detail)}
        </Button>
      </div>
      {status?.lastError && (
        <p className="mt-3 text-sm text-red-700 font-poppins">{status.lastError}</p>
      )}
    </article>
  );
}

function ScenarioActionList({
  scenarioSets,
  detailById,
  statusById,
  pendingScenarioSetId,
  onCalculate,
}: {
  scenarioSets: FundScenarioSetSummaryV1[];
  detailById: Map<string, FundScenarioSetDetailV1>;
  statusById: Map<string, FundScenarioCalculationStatusV1>;
  pendingScenarioSetId: string | null;
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
    return (
      <p className="text-sm text-charcoal-500 font-poppins">Loading scenario comparisons...</p>
    );
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

  const scenarioSets = scenarioSetsQuery.data ?? [];

  const detailQueries = useQueries({
    queries: scenarioSets.map((summary) => ({
      queryKey: scenarioSetDetailQueryKey(fundId ?? '', summary.id),
      queryFn: () => fetchScenarioSetDetail(fundId ?? '', summary.id),
      enabled: fundId != null,
    })),
  });

  const statusQueries = useQueries({
    queries: scenarioSets.map((summary) => ({
      queryKey: scenarioSetStatusQueryKey(fundId ?? '', summary.id),
      queryFn: () => fetchScenarioStatus(fundId ?? '', summary.id),
      enabled: fundId != null,
    })),
  });

  const scenarioPayload = scenarioPayloadFromResults(resultsQuery.data);
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

  const detailById = useMemo(() => detailMapFromQueries(detailQueries), [detailQueries]);
  const statusById = useMemo(() => statusMapFromQueries(statusQueries), [statusQueries]);
  const comparisons = useMemo(
    () => comparisonDataFromQueries(comparisonQueries),
    [comparisonQueries]
  );

  if (!fundId) {
    return (
      <WorkspaceErrorState
        title="Invalid scenario workspace route"
        message="Use /fund-model-results/:fundId/scenarios with a numeric fund ID."
      />
    );
  }

  if (scenarioSetsQuery.isLoading || resultsQuery.isLoading) {
    return <WorkspaceLoadingState />;
  }

  if (scenarioSetsQuery.isError || resultsQuery.isError) {
    return (
      <WorkspaceErrorState
        title="Scenario workspace unavailable"
        message="Scenario workspace data could not be loaded."
      />
    );
  }

  const fund = resultsQuery.data?.fund;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <header className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href={`/fund-model-results/${fundId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Results
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-charcoal">Scenario Workspace</h1>
          <p className="mt-1 text-sm text-charcoal-500 font-poppins">
            {fund ? `${fund.name} | Vintage ${fund.vintageYear}` : `Fund ${fundId}`} |{' '}
            {scenarioSets.length === 1 ? '1 scenario set' : `${scenarioSets.length} scenario sets`}
          </p>
        </div>
      </header>

      <ScenarioActionList
        scenarioSets={scenarioSets}
        detailById={detailById}
        statusById={statusById}
        pendingScenarioSetId={pendingScenarioSetId}
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
    </div>
  );
}

export default FundScenarioWorkspacePage;
