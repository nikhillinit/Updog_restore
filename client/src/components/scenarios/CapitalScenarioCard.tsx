import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CapitalPlanComparisonTable } from '@/components/fund-results/CapitalPlanComparisonTable';
import {
  archiveCapitalScenario,
  calculateCapitalScenario,
  fetchCapitalScenarioComparison,
  fetchCapitalScenarioDetail,
  fetchCapitalScenarioResults,
} from '@/lib/fund-scenario-workspace-api';
import {
  capitalScenarioComparisonQueryKey,
  capitalScenarioDetailQueryKey,
  capitalScenarioResultsQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import type {
  FundScenarioCapitalSetSummary,
  FundScenarioCapitalDetailResponse,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export function CapitalScenarioCard({
  fundId,
  summary,
  onDuplicate,
}: {
  fundId: string;
  summary: FundScenarioCapitalSetSummary;
  onDuplicate: (detail: FundScenarioCapitalDetailResponse) => void;
}) {
  const representation = 'representation' in summary ? summary.representation : 'capital-plan-v1';
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const detail = useQuery({
    queryKey: capitalScenarioDetailQueryKey(fundId, summary.id),
    queryFn: () => fetchCapitalScenarioDetail(fundId, summary.id, representation),
  });
  const results = useQuery({
    queryKey: capitalScenarioResultsQueryKey(fundId, summary.id),
    queryFn: () => fetchCapitalScenarioResults(fundId, summary.id, representation),
  });
  const comparison = useQuery({
    queryKey: capitalScenarioComparisonQueryKey(fundId, summary.id),
    queryFn: () => fetchCapitalScenarioComparison(fundId, summary.id, representation),
  });
  const calculate = useMutation({
    mutationFn: () => calculateCapitalScenario(fundId, summary.id, representation),
    onMutate: () => setMessage('Calculating saved capital inputs.'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
      setMessage('Capital calculation saved and reloaded.');
    },
    onError: (error) =>
      setMessage(
        `Calculation failed or its response was lost. Retry the saved set to recover the same result. ${error.message}`
      ),
  });
  const archive = useMutation({
    mutationFn: () => archiveCapitalScenario(fundId, summary.id, representation),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
      setMessage('Capital scenario archived. Saved history remains readable.');
    },
    onError: (error) => setMessage(`Archive failed. ${error.message}`),
  });
  return (
    <article
      className="min-w-0 space-y-4 rounded-presson-md border border-presson-borderSubtle bg-presson-surface p-4 text-presson-text"
      data-scenario-id={summary.id}
      data-representation={representation}
    >
      <header>
        <h2 className="break-words font-heading text-lg font-semibold">{summary.name}</h2>
        <p>
          Capital plan · {summary.variantCount} variants ·{' '}
          {summary.archivedAt ? 'Archived' : 'Active'}
        </p>
        <p>
          Source freshness: {summary.readState.sourceFreshness}; saved input readiness:{' '}
          {summary.readState.calculationReadiness.state}; interpretation:{' '}
          {summary.readState.interpretationCompatibility.state}
        </p>
      </header>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            Boolean(summary.archivedAt) || calculate.isPending || archive.isPending || !detail.data
          }
          onClick={() => calculate.mutate()}
        >
          {calculate.isPending ? 'Calculating capital scenario' : 'Calculate capital scenario'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!detail.data || calculate.isPending}
          onClick={() => detail.data && onDuplicate(detail.data)}
        >
          Duplicate to draft
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(summary.archivedAt) || archive.isPending || calculate.isPending}
          onClick={() => archive.mutate()}
        >
          Archive capital scenario
        </Button>
      </div>
      {detail.isError && <p>Capital inputs unavailable: {detail.error.message}</p>}
      {results.isError && <p>Capital results unavailable: {results.error.message}</p>}
      {comparison.isError && <p>Capital comparison unavailable: {comparison.error.message}</p>}
      {(detail.isPending || results.isPending || comparison.isPending) && (
        <p>Loading saved capital scenario.</p>
      )}
      {results.data?.unavailableReason && (
        <p>No calculated result. Calculate the saved inputs to produce a saved memo.</p>
      )}
      {results.data?.savedResult && (
        <p>
          Saved snapshot {results.data.savedResult.snapshotId}; source{' '}
          {results.data.readState.sourceFreshness}. Historical financial values remain unchanged by
          current-source refresh.
        </p>
      )}
      {comparison.data && <CapitalPlanComparisonTable comparison={comparison.data} />}
    </article>
  );
}
