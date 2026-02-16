/**
 * Monte Carlo Backtesting Page
 *
 * Config form -> async job runner -> progressive result disclosure.
 * Supports URL resume via ?jobId=X search param.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBacktestLifecycle, useBacktestHistory } from '@/hooks/useBacktesting';
import { MetricDistributionChart } from '@/components/monte-carlo/MetricDistributionChart';
import { PercentileBandTable } from '@/components/monte-carlo/PercentileBandTable';
import { CalibrationStatusCard } from '@/components/monte-carlo/CalibrationStatusCard';
import { DataQualityCard } from '@/components/monte-carlo/DataQualityCard';
import { RecommendationsPanel } from '@/components/monte-carlo/RecommendationsPanel';
import { ConfigForm } from '@/components/monte-carlo/ConfigForm';
import { classifyErrorTier, ERROR_TIER_MESSAGES, toResultViewModel } from '@/types/backtesting-ui';
import type { BacktestConfig } from '@shared/types/backtesting';
import type { BacktestResultViewModel } from '@/types/backtesting-ui';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCENARIO_LABELS: Record<string, string> = {
  financial_crisis_2008: '2008 Financial Crisis',
  dotcom_bust_2000: '2000 Dotcom Bust',
  covid_2020: 'COVID-19 (2020)',
  bull_market_2021: '2021 Bull Market',
  rate_hikes_2022: '2022 Rate Hikes',
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  validating_input: 'Validating inputs...',
  simulating: 'Running simulation...',
  calibrating: 'Calibrating model...',
  persisting: 'Saving results...',
};

// ============================================================================
// RUNNER PANEL HELPERS
// ============================================================================

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
  if (phase === 'failed') return 'border-red-200';
  if (phase === 'queued' || phase === 'running') return 'border-blue-200';
  return 'border-emerald-200';
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
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {isActive && <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
        <span className="text-sm font-medium text-gray-700">{statusText}</span>
      </div>
      {isActive && <span className="text-xs text-gray-500 tabular-nums">{elapsed}s</span>}
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
    <div className="w-full bg-gray-200 rounded-full h-1.5">
      <div
        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
        style={{ width: `${Math.max(progressPercent, 2)}%` }}
      />
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
      <p className="font-medium text-red-700">{config.title}</p>
      <p className="text-gray-600 text-xs mt-0.5">{errorMessage}</p>
      <p className="text-gray-500 text-xs mt-1">{config.guidance}</p>
    </div>
  );
}

// ============================================================================
// RUNNER PANEL
// ============================================================================

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
      <CardContent className="py-3 px-4">
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
          <p className="text-[10px] text-gray-400 mt-1 font-mono">{correlationId}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// RESULTS SECTION + SUB-COMPONENTS
// ============================================================================

function ResultsSummaryGrid({ result }: { result: BacktestResultViewModel }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          {comparisons.map((sc) => (
            <div key={sc.scenario} className="border-l-2 border-gray-300 pl-3">
              <p className="text-sm font-medium text-gray-800">
                {SCENARIO_LABELS[sc.scenario] ?? sc.scenario}
              </p>
              <p className="text-xs text-gray-500">{sc.description}</p>
              {sc.keyInsights.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {sc.keyInsights.map((insight, i) => (
                    <li key={i} className="text-xs text-gray-600">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CalibrationStatusCard
          calibrationStatus={result.calibrationStatus}
          modelQualityScore={result.modelQualityScore}
        />
        <DataQualityCard dataQuality={result.dataQuality} />
      </div>
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
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-amber-600' : 'text-gray-800'}`}>
        {value}
      </p>
    </div>
  );
}

// ============================================================================
// HISTORY PANEL
// ============================================================================

function HistoryPanel({
  fundId,
  onSelect,
}: {
  fundId: number;
  onSelect: (result: BacktestResultViewModel) => void;
}) {
  const { data, isLoading } = useBacktestHistory(fundId);

  if (isLoading) {
    return <p className="text-xs text-gray-500">Loading history...</p>;
  }

  if (!data?.history?.length) {
    return <p className="text-xs text-gray-500">No previous backtests</p>;
  }

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium text-gray-600 mb-2">Recent Backtests</h3>
      {data.history.slice(0, 5).map((result) => (
        <button
          key={result.backtestId}
          onClick={() => onSelect(toResultViewModel(result))}
          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 transition-colors"
        >
          <span className="text-gray-800">{new Date(result.timestamp).toLocaleDateString()}</span>
          <span className="text-gray-500 ml-2">
            {result.simulationSummary.runs.toLocaleString()} runs
          </span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// PAGE STATE HOOK
// ============================================================================

function useMonteCarloState(fundId: number | null) {
  const {
    startBacktest,
    jobStatus,
    result: liveResult,
    isRunning,
    isSubmitting,
  } = useBacktestLifecycle(fundId);

  const [displayedResult, setDisplayedResult] = useState<BacktestResultViewModel | null>(null);
  const [lastConfig, setLastConfig] = useState<BacktestConfig | null>(null);

  useEffect(() => {
    if (liveResult) setDisplayedResult(liveResult);
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
    if (lastConfig) {
      setDisplayedResult(null);
      startBacktest(lastConfig);
    }
  }, [lastConfig, startBacktest]);

  const handleHistorySelect = useCallback((vm: BacktestResultViewModel) => {
    setDisplayedResult(vm);
  }, []);

  return {
    jobStatus,
    isRunning,
    isSubmitting,
    displayedResult,
    lastConfig,
    handleSubmit,
    handleRetry,
    handleHistorySelect,
  };
}

// ============================================================================
// PAGE LAYOUT COMPONENTS
// ============================================================================

function MonteCarloSidebar({
  fundId,
  state,
}: {
  fundId: number;
  state: ReturnType<typeof useMonteCarloState>;
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

function MonteCarloMainPanel({ state }: { state: ReturnType<typeof useMonteCarloState> }) {
  return (
    <div className="lg:col-span-2 space-y-4">
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
      {!state.displayedResult && state.jobStatus.phase === 'idle' && (
        <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-gray-300">
          <p className="text-sm text-gray-400">Configure and run a backtest to see results</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function MonteCarloPage() {
  const { fundId } = useFundContext();
  const state = useMonteCarloState(fundId);

  if (!fundId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Monte Carlo Backtesting</h1>
        <p className="text-sm text-gray-500">Please select a fund to begin backtesting.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 mb-1">Monte Carlo Backtesting</h1>
      <p className="text-sm text-gray-500 mb-6">
        Validate simulation accuracy against historical fund performance.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MonteCarloSidebar fundId={fundId} state={state} />
        <MonteCarloMainPanel state={state} />
      </div>
    </div>
  );
}
