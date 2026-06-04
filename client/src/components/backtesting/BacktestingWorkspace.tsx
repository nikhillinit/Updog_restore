import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBacktestLifecycle, useBacktestHistory } from '@/hooks/useBacktesting';
import { MetricDistributionChart } from '@/components/monte-carlo/MetricDistributionChart';
import { PercentileBandTable } from '@/components/monte-carlo/PercentileBandTable';
import { CalibrationStatusCard } from '@/components/monte-carlo/CalibrationStatusCard';
import { DataQualityCard } from '@/components/monte-carlo/DataQualityCard';
import { RecommendationsPanel } from '@/components/monte-carlo/RecommendationsPanel';
import { ConfigForm } from '@/components/monte-carlo/ConfigForm';
import { cn } from '@/lib/utils';
import { classifyErrorTier, ERROR_TIER_MESSAGES, toResultViewModel } from '@/types/backtesting-ui';
import type { BacktestConfig, HistoricalScenarioName } from '@shared/types/backtesting';
import type { BacktestResultViewModel, BacktestSubmitErrorViewModel } from '@/types/backtesting-ui';

const SCENARIO_LABELS: Record<HistoricalScenarioName, string> = {
  financial_crisis_2008: '2008 Financial Crisis',
  dotcom_bust_2000: '2000 Dotcom Bust',
  covid_2020: 'COVID-19 (2020)',
  bull_market_2021: '2021 Bull Market',
  rate_hikes_2022: '2022 Rate Hikes',
  custom: 'Custom Scenario',
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  validating_input: 'Validating inputs...',
  simulating: 'Running simulation...',
  calibrating: 'Calibrating model...',
  persisting: 'Saving results...',
};

function formatScenarioLabel(scenario: HistoricalScenarioName): string {
  return SCENARIO_LABELS[scenario] ?? scenario;
}

function useElapsedSeconds(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (isActive) {
      startRef.current = Date.now();
      const timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
    setElapsed(0);
  }, [isActive]);

  return elapsed;
}

function getRunnerBorderColor(phase: string): string {
  if (phase === 'failed') return 'border-error/50';
  if (phase === 'queued' || phase === 'running') return 'border-presson-info/30';
  return 'border-success/50';
}

function getRunnerStatusText(phase: string, stage: string | null, message: string): string {
  if (phase === 'failed') return 'Failed';
  if (phase === 'completed') return 'Completed';
  return STAGE_LABELS[stage ?? ''] ?? message;
}

function RunnerHeader({
  isActive,
  statusText,
  elapsed,
}: {
  isActive: boolean;
  statusText: string;
  elapsed: number;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {isActive && <div className="h-2 w-2 animate-pulse rounded-full bg-presson-info" />}
        <span className="text-sm font-medium text-charcoal-700">{statusText}</span>
      </div>
      {isActive && <span className="tabular-nums text-xs text-charcoal-500">{elapsed}s</span>}
    </div>
  );
}

function RunnerProgressBar({
  isActive,
  progressPercent,
}: {
  isActive: boolean;
  progressPercent: number;
}) {
  if (!isActive) return null;
  return (
    <div className="h-1.5 w-full rounded-full bg-pov-gray">
      <div
        className="h-1.5 rounded-full bg-presson-info transition-all duration-500"
        style={{ width: `${Math.max(progressPercent, 2)}%` }}
      />
    </div>
  );
}

function ErrorDisplay({
  errorCode,
  errorMessage,
}: {
  errorCode: string | null;
  errorMessage: string;
}) {
  const tier = classifyErrorTier(errorCode as Parameters<typeof classifyErrorTier>[0]);
  const config = ERROR_TIER_MESSAGES[tier];
  return (
    <div className="text-sm">
      <p className="font-medium text-error-dark">{config.title}</p>
      <p className="mt-0.5 text-xs text-charcoal-600">{errorMessage}</p>
      <p className="mt-1 text-xs text-charcoal-500">{config.guidance}</p>
    </div>
  );
}

function RunnerError({
  phase,
  errorCode,
  errorMessage,
  isRetryable,
  onRetry,
}: {
  phase: string;
  errorCode: string | null;
  errorMessage: string | null;
  isRetryable: boolean;
  onRetry?: () => void;
}) {
  if (phase !== 'failed' || !errorMessage) return null;
  return (
    <div className="mt-2">
      <ErrorDisplay errorCode={errorCode} errorMessage={errorMessage} />
      {isRetryable && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Retry
        </Button>
      )}
    </div>
  );
}

interface RunnerPanelProps {
  phase: string;
  stage: string | null;
  progressPercent: number;
  message: string;
  correlationId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  isRetryable: boolean;
  onRetry?: () => void;
}

function RunnerPanel(props: RunnerPanelProps) {
  const { phase, stage, progressPercent, message, correlationId } = props;
  const isActive = phase === 'queued' || phase === 'running';
  const elapsed = useElapsedSeconds(isActive);

  if (phase === 'idle') return null;

  return (
    <Card className={getRunnerBorderColor(phase)}>
      <CardContent className="px-4 py-3">
        <RunnerHeader
          isActive={isActive}
          statusText={getRunnerStatusText(phase, stage, message)}
          elapsed={elapsed}
        />
        <RunnerProgressBar isActive={isActive} progressPercent={progressPercent} />
        <RunnerError
          phase={phase}
          errorCode={props.errorCode}
          errorMessage={props.errorMessage}
          isRetryable={props.isRetryable}
          {...(props.onRetry ? { onRetry: props.onRetry } : {})}
        />
        {correlationId && (
          <p className="mt-1 font-mono text-[10px] text-charcoal-400">{correlationId}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SubmitErrorPanel({
  error,
  onRetry,
}: {
  error: BacktestSubmitErrorViewModel | null;
  onRetry?: () => void;
}) {
  if (!error) return null;

  return (
    <Card className="border-error/50">
      <CardContent className="px-4 py-3">
        <ErrorDisplay errorCode={error.errorCode} errorMessage={error.errorMessage} />
        {error.status && (
          <p className="mt-1 font-mono text-[10px] text-charcoal-400">HTTP {error.status}</p>
        )}
        {error.isRetryable && onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-beige-200 p-3">
      <p className="text-xs text-charcoal-500">{label}</p>
      <p className={cn('text-lg font-semibold text-pov-charcoal', highlight && 'text-warning')}>
        {value}
      </p>
    </div>
  );
}

function ResultsSummaryGrid({ result }: { result: BacktestResultViewModel }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard label="Runs" value={result.simulationRuns.toLocaleString()} />
      <SummaryCard label="Engine" value={result.engineUsed} />
      <SummaryCard label="Execution" value={`${(result.executionTimeMs / 1000).toFixed(1)}s`} />
      <SummaryCard
        label="Quality Score"
        value={`${result.modelQualityScore}/100`}
        highlight={result.modelQualityScore < 50}
      />
    </div>
  );
}

function DistributionChartsBlock({
  distributions,
}: {
  distributions: BacktestResultViewModel['distributions'];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <MetricDistributionChart distributions={distributions} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <PercentileBandTable distributions={distributions} />
        </CardContent>
      </Card>
    </div>
  );
}

function ScenarioComparisonWarning({ result }: { result: BacktestResultViewModel }) {
  const summary = result.scenarioComparisonSummary;
  if (!summary || summary.failedScenarios.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning-dark">
      <p className="font-medium">
        Scenario comparison incomplete: {summary.scenariosCompared} of {summary.requestedScenarios}{' '}
        requested historical scenarios succeeded.
      </p>
      <p className="mt-1 text-xs text-warning">
        Failed scenarios: {summary.failedScenarios.map(formatScenarioLabel).join(', ')}
      </p>
    </div>
  );
}

function ScenarioComparisons({
  comparisons,
}: {
  comparisons: BacktestResultViewModel['scenarioComparisons'];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Scenario Comparisons</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {comparisons.map((comparison) => (
            <div key={comparison.scenario} className="border-l-2 border-charcoal-300 pl-3">
              <p className="text-sm font-medium text-pov-charcoal">
                {formatScenarioLabel(comparison.scenario)}
              </p>
              <p className="text-xs text-charcoal-500">{comparison.description}</p>
              {comparison.keyInsights.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {comparison.keyInsights.map((insight, index) => (
                    <li key={index} className="text-xs text-charcoal-600">
                      - {insight}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsSection({ result }: { result: BacktestResultViewModel }) {
  const [showCharts, setShowCharts] = useState(false);

  return (
    <div className="space-y-4">
      <ResultsSummaryGrid result={result} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CalibrationStatusCard
          calibrationStatus={result.calibrationStatus}
          modelQualityScore={result.modelQualityScore}
        />
        <DataQualityCard dataQuality={result.dataQuality} />
      </div>
      <ScenarioComparisonWarning result={result} />
      <Button variant="outline" size="sm" onClick={() => setShowCharts(!showCharts)}>
        {showCharts ? 'Hide Charts' : 'Show Distribution Charts'}
      </Button>
      {showCharts && <DistributionChartsBlock distributions={result.distributions} />}
      {result.scenarioComparisons.length > 0 && (
        <ScenarioComparisons comparisons={result.scenarioComparisons} />
      )}
      <RecommendationsPanel recommendations={result.recommendations} />
    </div>
  );
}

function HistoryPanel({
  fundId,
  onSelect,
}: {
  fundId: number;
  onSelect: (result: BacktestResultViewModel) => void;
}) {
  const { data, isLoading } = useBacktestHistory(fundId);

  if (isLoading) {
    return <p className="text-xs text-charcoal-500">Loading history...</p>;
  }

  if (!data?.history?.length) {
    return <p className="text-xs text-charcoal-500">No previous backtests</p>;
  }

  return (
    <div className="space-y-1">
      <h3 className="mb-2 text-xs font-medium text-charcoal-600">Recent Backtests</h3>
      {data.history.slice(0, 5).map((result) => (
        <button
          key={result.backtestId}
          onClick={() => onSelect(toResultViewModel(result))}
          className="w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-pov-gray"
        >
          <span className="text-pov-charcoal">
            {new Date(result.timestamp).toLocaleDateString()}
          </span>
          <span className="ml-2 text-charcoal-500">
            {result.simulationSummary.runs.toLocaleString()} runs
          </span>
        </button>
      ))}
    </div>
  );
}

function useBacktestingWorkspaceState(fundId: number | null) {
  const {
    startBacktest,
    jobStatus,
    result: liveResult,
    isRunning,
    isSubmitting,
    submitError,
    resumeMismatch,
  } = useBacktestLifecycle(fundId);

  const [displayedResult, setDisplayedResult] = useState<BacktestResultViewModel | null>(null);
  const [lastConfig, setLastConfig] = useState<BacktestConfig | null>(null);

  useEffect(() => {
    setDisplayedResult(null);
    setLastConfig(null);
  }, [fundId]);

  useEffect(() => {
    if (liveResult) {
      setDisplayedResult(liveResult);
    }
  }, [liveResult]);

  const handleSubmit = useCallback(
    (config: BacktestConfig) => {
      setLastConfig(config);
      setDisplayedResult(null);
      startBacktest(config);
    },
    [startBacktest]
  );

  const handleRetry = useCallback(() => {
    if (!lastConfig) return;
    setDisplayedResult(null);
    startBacktest(lastConfig);
  }, [lastConfig, startBacktest]);

  const handleHistorySelect = useCallback((result: BacktestResultViewModel) => {
    setDisplayedResult(result);
  }, []);

  return {
    jobStatus,
    isRunning,
    isSubmitting,
    submitError,
    displayedResult,
    lastConfig,
    resumeMismatch,
    handleSubmit,
    handleRetry,
    handleHistorySelect,
  };
}

function BacktestingSidebar({
  fundId,
  state,
}: {
  fundId: number;
  state: ReturnType<typeof useBacktestingWorkspaceState>;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <ConfigForm
            fundId={fundId}
            onSubmit={state.handleSubmit}
            disabled={state.isRunning || state.isSubmitting}
            lastConfig={state.lastConfig}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <HistoryPanel fundId={fundId} onSelect={state.handleHistorySelect} />
        </CardContent>
      </Card>
    </div>
  );
}

function BacktestingMainPanel({
  state,
}: {
  state: ReturnType<typeof useBacktestingWorkspaceState>;
}) {
  return (
    <div className="space-y-4 lg:col-span-2">
      {state.resumeMismatch && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning-dark">
          Ignored resumed backtest job from fund {state.resumeMismatch.actualFundId} while viewing
          the currently selected fund.
        </div>
      )}
      <SubmitErrorPanel error={state.submitError} onRetry={state.handleRetry} />
      <RunnerPanel
        phase={state.jobStatus.phase}
        stage={state.jobStatus.stage}
        progressPercent={state.jobStatus.progressPercent}
        message={state.jobStatus.message}
        correlationId={state.jobStatus.correlationId}
        errorCode={state.jobStatus.errorCode}
        errorMessage={state.jobStatus.errorMessage ?? ''}
        isRetryable={state.jobStatus.isRetryable}
        onRetry={state.handleRetry}
      />
      {state.displayedResult && <ResultsSection result={state.displayedResult} />}
      {!state.displayedResult && !state.submitError && state.jobStatus.phase === 'idle' && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-beige-200">
          <p className="text-sm text-charcoal-400">Configure and run a backtest to see results</p>
        </div>
      )}
    </div>
  );
}

export interface BacktestingWorkspaceProps {
  fundId: number | null;
  title?: string;
  description?: string;
  showHeader?: boolean;
  containerClassName?: string;
}

export function BacktestingWorkspace({
  fundId,
  title = 'Monte Carlo Backtesting',
  description = 'Validate simulation accuracy against historical fund performance.',
  showHeader = true,
  containerClassName,
}: BacktestingWorkspaceProps) {
  const state = useBacktestingWorkspaceState(fundId);

  if (!fundId) {
    return (
      <div className={cn('max-w-6xl mx-auto p-6', containerClassName)}>
        {showHeader && (
          <>
            <h1 className="mb-1 text-xl font-semibold text-pov-charcoal">{title}</h1>
            <p className="mb-6 text-sm text-charcoal-500">{description}</p>
          </>
        )}
        <p className="text-sm text-charcoal-500">Please select a fund to begin backtesting.</p>
      </div>
    );
  }

  return (
    <div className={cn('max-w-6xl mx-auto p-6', containerClassName)}>
      {showHeader && (
        <>
          <h1 className="mb-1 text-xl font-semibold text-pov-charcoal">{title}</h1>
          <p className="mb-6 text-sm text-charcoal-500">{description}</p>
        </>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <BacktestingSidebar fundId={fundId} state={state} />
        <BacktestingMainPanel state={state} />
      </div>
    </div>
  );
}
