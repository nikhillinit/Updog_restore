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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { useBacktestLifecycle, useBacktestHistory, useScenarios } from '@/hooks/useBacktesting';
import { MetricDistributionChart } from '@/components/monte-carlo/MetricDistributionChart';
import { PercentileBandTable } from '@/components/monte-carlo/PercentileBandTable';
import { CalibrationStatusCard } from '@/components/monte-carlo/CalibrationStatusCard';
import { DataQualityCard } from '@/components/monte-carlo/DataQualityCard';
import { RecommendationsPanel } from '@/components/monte-carlo/RecommendationsPanel';
import { classifyErrorTier, ERROR_TIER_MESSAGES, toResultViewModel } from '@/types/backtesting-ui';
import type {
  BacktestConfig,
  BacktestMetric,
  HistoricalScenarioName,
} from '@shared/types/backtesting';
import type { BacktestResultViewModel } from '@/types/backtesting-ui';

// ============================================================================
// CONSTANTS
// ============================================================================

const ALL_METRICS: { value: BacktestMetric; label: string }[] = [
  { value: 'irr', label: 'IRR' },
  { value: 'tvpi', label: 'TVPI' },
  { value: 'dpi', label: 'DPI' },
  { value: 'multiple', label: 'Multiple' },
  { value: 'totalValue', label: 'Total Value' },
];

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
// CONFIG FORM
// ============================================================================

interface ConfigFormProps {
  fundId: number;
  onSubmit: (config: BacktestConfig) => void;
  disabled: boolean;
  lastConfig: BacktestConfig | null;
}

function ConfigForm({ fundId, onSubmit, disabled, lastConfig }: ConfigFormProps) {
  const [simulationRuns, setSimulationRuns] = useState(lastConfig?.simulationRuns ?? 10000);
  const [startDate, setStartDate] = useState(lastConfig?.startDate ?? '2020-01-01');
  const [endDate, setEndDate] = useState(lastConfig?.endDate ?? '2025-01-01');
  const [selectedMetrics, setSelectedMetrics] = useState<BacktestMetric[]>(
    lastConfig?.comparisonMetrics ?? ['irr', 'tvpi', 'dpi']
  );
  const [useRandomSeed, setUseRandomSeed] = useState(lastConfig?.randomSeed !== undefined);
  const [randomSeed, setRandomSeed] = useState(lastConfig?.randomSeed ?? 42);
  const [includeScenarios, setIncludeScenarios] = useState(
    lastConfig?.includeHistoricalScenarios ?? false
  );
  const [selectedScenarios, setSelectedScenarios] = useState<HistoricalScenarioName[]>(
    lastConfig?.historicalScenarios ?? []
  );

  const { data: scenariosData } = useScenarios();
  const availableScenarios = scenariosData?.scenarios?.filter((s) => s !== 'custom') ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: BacktestConfig = {
      fundId,
      startDate,
      endDate,
      simulationRuns,
      comparisonMetrics: selectedMetrics,
      includeHistoricalScenarios: includeScenarios,
      ...(includeScenarios && selectedScenarios.length > 0
        ? { historicalScenarios: selectedScenarios }
        : {}),
      ...(useRandomSeed ? { randomSeed } : {}),
    };
    onSubmit(config);
  };

  const toggleMetric = (metric: BacktestMetric) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  };

  const toggleScenario = (scenario: HistoricalScenarioName) => {
    setSelectedScenarios((prev) =>
      prev.includes(scenario) ? prev.filter((s) => s !== scenario) : [...prev, scenario]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate" className="text-xs">
            Start Date
          </Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="endDate" className="text-xs">
            End Date
          </Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Simulation Runs Slider */}
      <div>
        <Label className="text-xs">
          Simulation Runs: <span className="font-mono">{simulationRuns.toLocaleString()}</span>
        </Label>
        <Slider
          value={[simulationRuns]}
          onValueChange={([v]) => v !== undefined && setSimulationRuns(v)}
          min={1000}
          max={50000}
          step={1000}
          disabled={disabled}
          className="mt-2"
        />
      </div>

      {/* Metrics Selection */}
      <div>
        <Label className="text-xs mb-2 block">Comparison Metrics</Label>
        <div className="flex flex-wrap gap-3">
          {ALL_METRICS.map((m) => (
            <label key={m.value} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={selectedMetrics.includes(m.value)}
                onCheckedChange={() => toggleMetric(m.value)}
                disabled={
                  disabled || (selectedMetrics.length === 1 && selectedMetrics.includes(m.value))
                }
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {/* Random Seed */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            checked={useRandomSeed}
            onCheckedChange={(checked) => setUseRandomSeed(!!checked)}
            disabled={disabled}
          />
          Fixed random seed
        </label>
        {useRandomSeed && (
          <Input
            type="number"
            value={randomSeed}
            onChange={(e) => setRandomSeed(parseInt(e.target.value, 10) || 42)}
            disabled={disabled}
            className="w-24"
            min={1}
            max={2147483647}
          />
        )}
      </div>

      {/* Historical Scenarios */}
      <div>
        <label className="flex items-center gap-1.5 text-sm mb-2">
          <Checkbox
            checked={includeScenarios}
            onCheckedChange={(checked) => setIncludeScenarios(!!checked)}
            disabled={disabled}
          />
          Include historical scenarios
        </label>
        {includeScenarios && availableScenarios.length > 0 && (
          <div className="flex flex-wrap gap-2 ml-5">
            {availableScenarios.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={selectedScenarios.includes(s)}
                  onCheckedChange={() => toggleScenario(s)}
                  disabled={disabled}
                />
                {SCENARIO_LABELS[s] ?? s}
              </label>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" disabled={disabled || selectedMetrics.length === 0} className="w-full">
        {disabled ? 'Running...' : 'Run Backtest'}
      </Button>
    </form>
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

function RunnerPanel({
  phase,
  stage,
  progressPercent,
  message,
  correlationId,
  errorCode,
  errorMessage,
  isRetryable,
  onRetry,
}: RunnerPanelProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (phase === 'running' || phase === 'queued') {
      startRef.current = Date.now();
      const timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
    setElapsed(0);
  }, [phase]);

  if (phase === 'idle') return null;

  const isActive = phase === 'queued' || phase === 'running';
  const isFailed = phase === 'failed';

  return (
    <Card
      className={`${isFailed ? 'border-red-200' : isActive ? 'border-blue-200' : 'border-emerald-200'}`}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isActive && <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
            <span className="text-sm font-medium text-gray-700">
              {isFailed
                ? 'Failed'
                : phase === 'completed'
                  ? 'Completed'
                  : (STAGE_LABELS[stage ?? ''] ?? message)}
            </span>
          </div>
          {isActive && <span className="text-xs text-gray-500 tabular-nums">{elapsed}s</span>}
        </div>

        {isActive && (
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(progressPercent, 2)}%` }}
            />
          </div>
        )}

        {isFailed && errorMessage && (
          <div className="mt-2">
            <ErrorDisplay errorCode={errorCode} errorMessage={errorMessage} />
            {isRetryable && onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                Retry
              </Button>
            )}
          </div>
        )}

        {correlationId && (
          <p className="text-[10px] text-gray-400 mt-1 font-mono">{correlationId}</p>
        )}
      </CardContent>
    </Card>
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
// RESULTS SECTION
// ============================================================================

function ResultsSection({ result }: { result: BacktestResultViewModel }) {
  const [showCharts, setShowCharts] = useState(false);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
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

      {/* Calibration + Data Quality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CalibrationStatusCard
          calibrationStatus={result.calibrationStatus}
          modelQualityScore={result.modelQualityScore}
        />
        <DataQualityCard dataQuality={result.dataQuality} />
      </div>

      {/* Expand/collapse for charts */}
      <Button variant="outline" size="sm" onClick={() => setShowCharts(!showCharts)}>
        {showCharts ? 'Hide Charts' : 'Show Distribution Charts'}
      </Button>

      {showCharts && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <MetricDistributionChart distributions={result.distributions} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <PercentileBandTable distributions={result.distributions} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scenario Comparisons */}
      {result.scenarioComparisons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scenario Comparisons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.scenarioComparisons.map((sc) => (
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
      )}

      {/* Recommendations */}
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
// PAGE COMPONENT
// ============================================================================

export default function MonteCarloPage() {
  const { fundId } = useFundContext();

  const {
    startBacktest,
    jobStatus,
    result: liveResult,
    isRunning,
    isSubmitting,
  } = useBacktestLifecycle(fundId);

  const [displayedResult, setDisplayedResult] = useState<BacktestResultViewModel | null>(null);
  const [lastConfig, setLastConfig] = useState<BacktestConfig | null>(null);

  // When live result arrives, display it
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
    if (lastConfig) {
      setDisplayedResult(null);
      startBacktest(lastConfig);
    }
  }, [lastConfig, startBacktest]);

  const handleHistorySelect = useCallback((vm: BacktestResultViewModel) => {
    setDisplayedResult(vm);
  }, []);

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
        {/* Left: Config + History */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <ConfigForm
                fundId={fundId}
                onSubmit={handleSubmit}
                disabled={isRunning || isSubmitting}
                lastConfig={lastConfig}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <HistoryPanel fundId={fundId} onSelect={handleHistorySelect} />
            </CardContent>
          </Card>
        </div>

        {/* Right: Runner + Results */}
        <div className="lg:col-span-2 space-y-4">
          <RunnerPanel
            phase={jobStatus.phase}
            stage={jobStatus.stage}
            progressPercent={jobStatus.progressPercent}
            message={jobStatus.message}
            correlationId={jobStatus.correlationId}
            errorCode={jobStatus.errorCode}
            errorMessage={jobStatus.errorMessage ?? ''}
            isRetryable={jobStatus.isRetryable}
            onRetry={handleRetry}
          />

          {displayedResult && <ResultsSection result={displayedResult} />}

          {!displayedResult && jobStatus.phase === 'idle' && (
            <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-gray-300">
              <p className="text-sm text-gray-400">Configure and run a backtest to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
