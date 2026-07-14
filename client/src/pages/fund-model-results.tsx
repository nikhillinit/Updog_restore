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

import { useRef, useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { FinancialEvidenceDrawer } from '@/components/fund-results';
import { QuarterlyReviewTrace } from '@/features/analytics-parity/QuarterlyReviewTrace';
import type {
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';
import type { EconomicsResultV1 } from '@shared/contracts/economics-v1.contract';
import type { ScenariosSectionPayloadV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  configBackedEvidence,
  evidenceFromLifecycle,
  mixedScorecardEvidence,
  sectionBackedEvidence,
} from './fund-model-results/evidence';
import {
  ConfigDiffBanner,
  LifecycleStatusCard,
  PublishComparisonCard,
  PublishHistoryCard,
} from './fund-model-results/lifecycle-cards';
import {
  EconomicsResultsCard,
  OverviewCard,
  WaterfallSetupCard,
} from './fund-model-results/result-section-cards';
import {
  isActiveCalculationStatus,
  isTerminalCalculationStatus,
  scenarioSetIdsFromFetchState,
  useFundLifecycleHistory,
  useFundResults,
  useFundResultsComparison,
  useFundScenarioComparisons,
  useRecalculatePublished,
} from './fund-model-results/results-hooks';
import { ScenarioAnalysisCard } from './fund-model-results/scenario-section';
import {
  SCENARIO_FACTS_DOMAIN_NOUN,
  scenarioEvidenceDrawerState,
} from './fund-model-results/scenario-evidence-drawer';
import { SectionRenderer } from './fund-model-results/SectionRenderer';
import { WorkspaceBasisIndicator, WorkspaceNav } from './fund-model-results/workspace-nav';
import { ErrorState, LatestErrorState, LoadingState } from './fund-model-results/states';
import type { LifecycleStatus } from './fund-model-results/types';

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
  // Scenario-section evidence drawer (D-B work panel; trigger lives in the
  // section header and focus returns to it on close).
  const [scenarioEvidenceOpen, setScenarioEvidenceOpen] = useState(false);
  const scenarioEvidenceTriggerRef = useRef<HTMLButtonElement | null>(null);

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
  const scenarioDrawer = scenarioEvidenceDrawerState(scenarioComparisonState);

  // D-F.4 outcome-bearing headings: each states what is true on this surface,
  // not the container name. Sections render statically (scroll-fade wrappers
  // removed per D-F.6); order stays decision-first — lifecycle/publish state
  // ahead of waterfall/GP-economics chrome.
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

      {/* Workspace row (D-F.2): fund context + six destinations + basis indicator */}
      <WorkspaceNav
        fundId={fundId}
        fundLabel={results.fund.name}
        active="summary"
        indicator={<WorkspaceBasisIndicator mode="construction" />}
      />

      <ConfigDiffBanner lifecycle={results.lifecycle} />

      <LifecycleStatusCard
        lifecycle={results.lifecycle}
        recalculateState={recalculateState}
        onRecalculate={recalculate}
      />

      <PublishHistoryCard historyState={historyState} />

      <PublishComparisonCard comparisonState={comparisonState} />

      <QuarterlyReviewTrace
        results={results}
        comparison={comparisonState.comparison}
        fundId={fundId}
      />

      {/* Reserve section */}
      <SectionRenderer
        title="Reserve allocation — awaiting current actuals"
        section={results.sections.reserve}
        evidenceLifecycle={evidenceLifecycle}
        evidenceTestId="evidence-header-reserve-allocation"
      />

      {/* Pacing section */}
      <SectionRenderer
        title="Deployment pacing — modeled from construction assumptions"
        section={results.sections.pacing}
        evidenceLifecycle={evidenceLifecycle}
        evidenceTestId="evidence-header-deployment-pacing"
      />

      {/* Overview (scorecard) section */}
      <SectionRenderer
        title="Overview — current recorded fund metrics"
        section={results.sections.scorecard}
        renderPayload={(p) => <OverviewCard payload={p as ScorecardPayload} />}
        evidenceLifecycle={mixedScorecardEvidence(evidenceLifecycle, results.sections.scorecard)}
        evidenceTestId="evidence-header-overview"
      />

      {/* Scenarios section — the one section whose contract exposes evidence
          today; the Evidence link opens the shared work panel (D-B/D-C). */}
      <SectionRenderer
        title="Scenario analysis — compare saved cases to the published baseline"
        section={results.sections.scenarios}
        headerAction={
          <button
            ref={scenarioEvidenceTriggerRef}
            type="button"
            data-testid="scenario-evidence-trigger"
            className="text-xs font-medium text-pov-charcoal underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2"
            onClick={() => setScenarioEvidenceOpen(true)}
          >
            Evidence
          </button>
        }
        renderPayload={(p) => (
          <ScenarioAnalysisCard
            fundId={fundId}
            payload={p as ScenariosSectionPayloadV1}
            comparisonState={scenarioComparisonState}
          />
        )}
      />

      {/* Waterfall section */}
      <SectionRenderer
        title="Waterfall setup — published distribution terms"
        section={results.sections.waterfall}
        renderPayload={(p) => <WaterfallSetupCard payload={p as WaterfallSetupSection} />}
        evidenceLifecycle={configBackedEvidence(evidenceLifecycle, results.sections.waterfall)}
        evidenceTestId="evidence-header-waterfall-setup"
      />

      {/* Economics section */}
      <SectionRenderer
        title="GP economics — projected carry and fees from the published model"
        section={results.sections.economics}
        renderPayload={(p) => <EconomicsResultsCard payload={p as EconomicsResultV1} />}
        evidenceLifecycle={sectionBackedEvidence(evidenceLifecycle, results.sections.economics)}
        evidenceTestId="evidence-header-gp-economics"
      />

      <FinancialEvidenceDrawer
        {...scenarioDrawer}
        open={scenarioEvidenceOpen}
        onOpenChange={setScenarioEvidenceOpen}
        factsDomainNoun={SCENARIO_FACTS_DOMAIN_NOUN}
        returnFocusRef={scenarioEvidenceTriggerRef}
      />
    </div>
  );
}

export default FundModelResultsPage;
