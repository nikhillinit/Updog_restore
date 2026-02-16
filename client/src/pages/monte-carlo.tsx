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
// CONFIG FORM HOOK + SECTIONS
// ============================================================================

function getConfigDefaults(lastConfig: BacktestConfig | null) {
  if (!lastConfig) {
    return {
      simulationRuns: 10000,
      startDate: '2020-01-01',
      endDate: '2025-01-01',
      metrics: ['irr', 'tvpi', 'dpi'] as BacktestMetric[],
      useRandomSeed: false,
      randomSeed: 42,
      includeScenarios: false,
      scenarios: [] as HistoricalScenarioName[],
    };
  }
  return {
    simulationRuns: lastConfig.simulationRuns,
    startDate: lastConfig.startDate,
    endDate: lastConfig.endDate,
    metrics: lastConfig.comparisonMetrics,
    useRandomSeed: lastConfig.randomSeed !== undefined,
    randomSeed: lastConfig.randomSeed ?? 42,
    includeScenarios: lastConfig.includeHistoricalScenarios ?? false,
    scenarios: lastConfig.historicalScenarios ?? [],
  };
}

function toggleListItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function buildBacktestConfig(
  fundId: number,
  state: {
    startDate: string;
    endDate: string;
    simulationRuns: number;
    selectedMetrics: BacktestMetric[];
    includeScenarios: boolean;
    selectedScenarios: HistoricalScenarioName[];
    useRandomSeed: boolean;
    randomSeed: number;
  }
): BacktestConfig {
  const config: BacktestConfig = {
    fundId,
    startDate: state.startDate,
    endDate: state.endDate,
    simulationRuns: state.simulationRuns,
    comparisonMetrics: state.selectedMetrics,
    includeHistoricalScenarios: state.includeScenarios,
  };
  if (state.includeScenarios && state.selectedScenarios.length > 0) {
    config.historicalScenarios = state.selectedScenarios;
  }
  if (state.useRandomSeed) config.randomSeed = state.randomSeed;
  return config;
}

function useConfigFormState(lastConfig: BacktestConfig | null) {
  const defaults = getConfigDefaults(lastConfig);
  const [simulationRuns, setSimulationRuns] = useState(defaults.simulationRuns);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [selectedMetrics, setSelectedMetrics] = useState(defaults.metrics);
  const [useRandomSeed, setUseRandomSeed] = useState(defaults.useRandomSeed);
  const [randomSeed, setRandomSeed] = useState(defaults.randomSeed);
  const [includeScenarios, setIncludeScenarios] = useState(defaults.includeScenarios);
  const [selectedScenarios, setSelectedScenarios] = useState(defaults.scenarios);

  return {
    simulationRuns,
    setSimulationRuns,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    selectedMetrics,
    toggleMetric: (m: BacktestMetric) => setSelectedMetrics((prev) => toggleListItem(prev, m)),
    useRandomSeed,
    setUseRandomSeed,
    randomSeed,
    setRandomSeed,
    includeScenarios,
    setIncludeScenarios,
    selectedScenarios,
    toggleScenario: (s: HistoricalScenarioName) =>
      setSelectedScenarios((prev) => toggleListItem(prev, s)),
    buildConfig: (fundId: number) =>
      buildBacktestConfig(fundId, {
        startDate,
        endDate,
        simulationRuns,
        selectedMetrics: selectedMetrics,
        includeScenarios,
        selectedScenarios,
        useRandomSeed,
        randomSeed,
      }),
  };
}

function DateRangeFields({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  disabled,
}: {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label htmlFor="startDate" className="text-xs">
          Start Date
        </Label>
        <Input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
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
          onChange={(e) => onEndChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function SimulationRunsSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">
        Simulation Runs: <span className="font-mono">{value.toLocaleString()}</span>
      </Label>
      <Slider
        value={[value]}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        min={1000}
        max={50000}
        step={1000}
        disabled={disabled}
        className="mt-2"
      />
    </div>
  );
}

function MetricCheckboxes({
  selected,
  onToggle,
  disabled,
}: {
  selected: BacktestMetric[];
  onToggle: (m: BacktestMetric) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Label className="text-xs mb-2 block">Comparison Metrics</Label>
      <div className="flex flex-wrap gap-3">
        {ALL_METRICS.map((m) => (
          <label key={m.value} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={selected.includes(m.value)}
              onCheckedChange={() => onToggle(m.value)}
              disabled={disabled || (selected.length === 1 && selected.includes(m.value))}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function RandomSeedField({
  enabled,
  seed,
  onToggle,
  onSeedChange,
  disabled,
}: {
  enabled: boolean;
  seed: number;
  onToggle: (v: boolean) => void;
  onSeedChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => onToggle(!!checked)}
          disabled={disabled}
        />
        Fixed random seed
      </label>
      {enabled && (
        <Input
          type="number"
          value={seed}
          onChange={(e) => onSeedChange(parseInt(e.target.value, 10) || 42)}
          disabled={disabled}
          className="w-24"
          min={1}
          max={2147483647}
        />
      )}
    </div>
  );
}

function ScenarioSelection({
  enabled,
  scenarios,
  selected,
  onToggleEnabled,
  onToggleScenario,
  disabled,
}: {
  enabled: boolean;
  scenarios: HistoricalScenarioName[];
  selected: HistoricalScenarioName[];
  onToggleEnabled: (v: boolean) => void;
  onToggleScenario: (s: HistoricalScenarioName) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm mb-2">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => onToggleEnabled(!!checked)}
          disabled={disabled}
        />
        Include historical scenarios
      </label>
      {enabled && scenarios.length > 0 && (
        <div className="flex flex-wrap gap-2 ml-5">
          {scenarios.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={selected.includes(s)}
                onCheckedChange={() => onToggleScenario(s)}
                disabled={disabled}
              />
              {SCENARIO_LABELS[s] ?? s}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const form = useConfigFormState(lastConfig);
  const { data: scenariosData } = useScenarios();
  const availableScenarios = scenariosData?.scenarios?.filter((s) => s !== 'custom') ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form.buildConfig(fundId));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DateRangeFields
        startDate={form.startDate}
        endDate={form.endDate}
        onStartChange={form.setStartDate}
        onEndChange={form.setEndDate}
        disabled={disabled}
      />
      <SimulationRunsSlider
        value={form.simulationRuns}
        onChange={form.setSimulationRuns}
        disabled={disabled}
      />
      <MetricCheckboxes
        selected={form.selectedMetrics}
        onToggle={form.toggleMetric}
        disabled={disabled}
      />
      <RandomSeedField
        enabled={form.useRandomSeed}
        seed={form.randomSeed}
        onToggle={form.setUseRandomSeed}
        onSeedChange={form.setRandomSeed}
        disabled={disabled}
      />
      <ScenarioSelection
        enabled={form.includeScenarios}
        scenarios={availableScenarios}
        selected={form.selectedScenarios}
        onToggleEnabled={form.setIncludeScenarios}
        onToggleScenario={form.toggleScenario}
        disabled={disabled}
      />
      <Button
        type="submit"
        disabled={disabled || form.selectedMetrics.length === 0}
        className="w-full"
      >
        {disabled ? 'Running...' : 'Run Backtest'}
      </Button>
    </form>
  );
}

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
