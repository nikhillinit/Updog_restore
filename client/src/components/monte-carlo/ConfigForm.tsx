import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { useScenarios } from '@/hooks/useBacktesting';
import type { BacktestConfig, BacktestMetric, HistoricalScenarioName } from '@shared/types/backtesting';

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

type FormConfigState = {
  startDate: string;
  endDate: string;
  simulationRuns: number;
  selectedMetrics: BacktestMetric[];
  includeScenarios: boolean;
  selectedScenarios: HistoricalScenarioName[];
  useRandomSeed: boolean;
  randomSeed: number;
};

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

function buildBacktestConfig(fundId: number, state: FormConfigState): BacktestConfig {
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
        selectedMetrics,
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

function ConfigSubmitButton({ disabled, metricCount }: { disabled: boolean; metricCount: number }) {
  return (
    <Button type="submit" disabled={disabled || metricCount === 0} className="w-full">
      {disabled ? 'Running...' : 'Run Backtest'}
    </Button>
  );
}

function ConfigFormFields({
  form,
  scenarios,
  disabled,
}: {
  form: ReturnType<typeof useConfigFormState>;
  scenarios: HistoricalScenarioName[];
  disabled: boolean;
}) {
  return (
    <>
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
        scenarios={scenarios}
        selected={form.selectedScenarios}
        onToggleEnabled={form.setIncludeScenarios}
        onToggleScenario={form.toggleScenario}
        disabled={disabled}
      />
      <ConfigSubmitButton disabled={disabled} metricCount={form.selectedMetrics.length} />
    </>
  );
}

export interface ConfigFormProps {
  fundId: number;
  onSubmit: (config: BacktestConfig) => void;
  disabled: boolean;
  lastConfig: BacktestConfig | null;
}

export function ConfigForm({ fundId, onSubmit, disabled, lastConfig }: ConfigFormProps) {
  const form = useConfigFormState(lastConfig);
  const { data: scenariosData } = useScenarios();
  const availableScenarios = scenariosData?.scenarios?.filter((s) => s !== 'custom') ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form.buildConfig(fundId));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ConfigFormFields form={form} scenarios={availableScenarios} disabled={disabled} />
    </form>
  );
}
