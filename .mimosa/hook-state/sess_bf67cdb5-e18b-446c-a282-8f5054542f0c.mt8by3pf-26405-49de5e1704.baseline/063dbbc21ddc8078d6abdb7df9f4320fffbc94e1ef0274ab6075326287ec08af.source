/**
 * Config diff, lifecycle status, recalculate, publish history, and publish
 * comparison cards for the fund model results route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/lifecycle-cards
 */

import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, History, RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { PublishedVersionSummary } from '@shared/contracts/fund-results-comparison-v1.contract';
import { getLifecycleDiagnostic } from './evidence';
import { FactTile } from './result-section-cards';
import {
  diagnosticAlertClasses,
  formatComparisonDelta,
  formatComparisonMetricValue,
  formatDateOrFallback,
  formatDriftCapabilityReason,
  formatHistoryRunStatus,
  formatLifecycleStatus,
  hasStaleEvidence,
  historyBadgeClasses,
} from './formatters';
import type { LifecycleHistoryState, RecalculateState, ResultsComparisonState } from './types';

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

function ConfigDiffBanner({ lifecycle }: { lifecycle: FundStateReadV1 }) {
  if (!hasStaleEvidence(lifecycle)) return null;

  return (
    <Alert className="border-warning/30 bg-warning-light">
      <AlertCircle className="h-4 w-4 text-warning" />
      <AlertTitle>Results are stale</AlertTitle>
      <AlertDescription className="font-poppins text-warning-dark">
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

export { ConfigDiffBanner, LifecycleStatusCard, PublishComparisonCard, PublishHistoryCard };
