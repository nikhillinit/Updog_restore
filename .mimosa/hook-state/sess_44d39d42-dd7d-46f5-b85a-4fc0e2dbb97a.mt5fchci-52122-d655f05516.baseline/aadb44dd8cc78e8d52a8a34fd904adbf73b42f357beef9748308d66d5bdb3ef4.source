/**
 * Scenario analysis card and scenario comparison panel for the fund model
 * results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/scenario-section
 */

import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  CrossSetScenarioComparisonTable,
  isComparableEconomicsComparison,
  ScenarioComparisonTable,
  ScenarioSetsSummary,
} from '@/components/fund-results';
import type { ScenariosSectionPayloadV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import type { ScenarioComparisonState } from './types';

function ScenarioComparisonPanel({ state }: { state: ScenarioComparisonState }) {
  if (state.kind === 'idle') return null;

  const comparable = state.comparisons.filter(isComparableEconomicsComparison);
  const nonComparable = state.comparisons.filter(
    (comparison) => !isComparableEconomicsComparison(comparison)
  );
  const hasContent = state.comparisons.length > 0 || state.failedScenarioSetIds.length > 0;

  return (
    <div className="space-y-4">
      {state.kind === 'loading' && !hasContent && (
        <p className="text-sm text-charcoal-500 font-poppins">Loading scenario comparison...</p>
      )}

      {state.kind === 'loading' && hasContent && (
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

      {comparable.length >= 2 && <CrossSetScenarioComparisonTable comparisons={comparable} />}

      {comparable.length === 1 && comparable[0] && (
        <ScenarioComparisonTable comparison={comparable[0]} />
      )}

      {nonComparable.map((comparison) => (
        <ScenarioComparisonTable
          key={comparison.scenarioSet.scenarioSetId}
          comparison={comparison}
        />
      ))}

      {state.failedScenarioSetIds.map((scenarioSetId) => (
        <div
          key={scenarioSetId}
          data-testid="scenario-comparison-failed-card"
          className="rounded-md border border-beige-200 bg-beige-50 p-4"
        >
          <p className="text-sm text-charcoal-600 font-poppins">
            Scenario comparison could not be loaded for this scenario set.
          </p>
        </div>
      ))}
    </div>
  );
}

function ScenarioAnalysisCard({
  fundId,
  payload,
  comparisonState,
}: {
  fundId: string;
  payload: ScenariosSectionPayloadV1;
  comparisonState: ScenarioComparisonState;
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/fund-model-results/${fundId}/scenarios`}>Open Scenario Workspace</Link>
        </Button>
      </div>
      <ScenarioSetsSummary payload={payload} />
      <ScenarioComparisonPanel state={comparisonState} />
    </div>
  );
}

export { ScenarioAnalysisCard, ScenarioComparisonPanel };
