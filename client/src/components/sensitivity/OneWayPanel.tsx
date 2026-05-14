/**
 * OneWayPanel -- Phase 1B sensitivity workspace.
 *
 * Renders a configuration sidebar (variable picker, range, steps, metric) plus
 * a results panel that visualizes a one-way deterministic sweep against the
 * latest published fund config. Mirrors the BacktestingWorkspace shape so the
 * sensitivity tab feels native to the existing analytics surfaces.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { ReferenceLine } from 'recharts/es6/cartesian/ReferenceLine';

import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useOneWayRun,
  useSensitivityHistory,
  type SensitivityHookError,
} from '@/hooks/useSensitivityRuns';
import {
  SUPPORTED_VARIABLES,
  SUPPORTED_METRICS,
  getVariableDefinition,
  getMetricDefinition,
  type SensitivityVariableId,
  type SensitivityMetricId,
} from '@shared/contracts/sensitivity-variables-v1';
import {
  OneWayAnalysisResultV1Schema,
  type OneWayAnalysisRequestV1,
  type OneWayAnalysisResultV1,
  type SensitivityRunV1,
} from '@shared/contracts/sensitivity-run-v1.contract';
import { formatMetricValue, formatVariableValue, useElapsedSeconds, SummaryCard } from './_shared';

// =====================
// VALIDATION
// =====================

interface FormState {
  variableId: SensitivityVariableId;
  min: number;
  max: number;
  steps: number;
  metricId: SensitivityMetricId;
}

interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

function validateForm(form: FormState): ValidationOutcome {
  const errors: string[] = [];
  if (!Number.isFinite(form.min) || !Number.isFinite(form.max)) {
    errors.push('Min and max must be numeric');
  } else if (form.min >= form.max) {
    errors.push('Min must be strictly less than max');
  }
  if (!Number.isInteger(form.steps) || form.steps < 2 || form.steps > 50) {
    errors.push('Steps must be an integer between 2 and 50');
  }
  return { ok: errors.length === 0, errors };
}

function buildRequest(form: FormState): OneWayAnalysisRequestV1 {
  return {
    variableId: form.variableId,
    range: { min: form.min, max: form.max },
    steps: form.steps,
    metricId: form.metricId,
  };
}

function defaultFormFor(variableId: SensitivityVariableId): FormState {
  const def = getVariableDefinition(variableId);
  return {
    variableId,
    min: def.min,
    max: def.max,
    steps: def.defaultSteps,
    metricId: 'tvpi',
  };
}

// =====================
// HISTORY ENTRY -> RESULT
// =====================

function parseHistoryResult(run: SensitivityRunV1): OneWayAnalysisResultV1 | null {
  if (run.results === null || run.results === undefined) return null;
  const parsed = OneWayAnalysisResultV1Schema.safeParse(run.results);
  return parsed.success ? parsed.data : null;
}

function formatRunTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// =====================
// HISTORY PANEL
// =====================

function HistoryPanel({
  fundId,
  onSelect,
}: {
  fundId: number | null;
  onSelect: (result: OneWayAnalysisResultV1) => void;
}) {
  const { data, isLoading } = useSensitivityHistory(fundId, 'one_way', 10);

  if (isLoading) {
    return <p className="text-xs text-gray-500">Loading history...</p>;
  }

  const runs = data?.runs ?? [];
  if (runs.length === 0) {
    return (
      <p className="text-xs text-gray-500" data-testid="one-way-history-empty">
        No previous one-way analyses
      </p>
    );
  }

  return (
    <div className="space-y-1" data-testid="one-way-history-list">
      <h3 className="mb-2 text-xs font-medium text-gray-600">Recent Runs</h3>
      {runs.map((run) => {
        const parsed = parseHistoryResult(run);
        const disabled = parsed === null;
        return (
          <button
            key={run.id}
            type="button"
            disabled={disabled}
            onClick={() => parsed && onSelect(parsed)}
            className={cn(
              'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
              disabled ? 'cursor-not-allowed text-gray-400' : 'hover:bg-gray-100 text-gray-800'
            )}
            data-testid={`one-way-history-item-${run.id}`}
          >
            <span>#{run.id}</span>
            <span className="mx-1 text-gray-400">·</span>
            <span>{formatRunTimestamp(run.createdAt)}</span>
            <span className="mx-1 text-gray-400">·</span>
            <span className="uppercase tracking-wide text-[10px]">{run.status}</span>
          </button>
        );
      })}
    </div>
  );
}

// =====================
// RESULTS SECTION
// =====================

function ResultsSection({ result }: { result: OneWayAnalysisResultV1 }) {
  const variable = getVariableDefinition(result.variableId);
  const metric = getMetricDefinition(result.metricId);

  const chartData = result.datapoints.map((d) => ({
    variableValue: d.variableValue,
    metricValue: d.metricValue,
  }));

  return (
    <div className="space-y-4" data-testid="one-way-results">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Variable" value={variable.label} />
        <SummaryCard label="Metric" value={metric.label} />
        <SummaryCard label="Baseline" value={formatMetricValue(result.baselineValue, metric)} />
        <SummaryCard label="Range" value={formatMetricValue(result.summary.range, metric)} />
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="h-72" data-testid="one-way-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 24, bottom: 10, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="variableValue"
                  tickFormatter={(v: number) => formatVariableValue(v, variable)}
                  fontSize={11}
                  stroke="#6b7280"
                />
                <YAxis
                  dataKey="metricValue"
                  tickFormatter={(v: number) => formatMetricValue(v, metric)}
                  fontSize={11}
                  stroke="#6b7280"
                />
                <Tooltip
                  formatter={
                    ((value: number): [string, string] => [
                      formatMetricValue(value, metric),
                      metric.label,
                    ]) as never
                  }
                  labelFormatter={
                    ((label: number) => formatVariableValue(label, variable)) as never
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
                />
                <ReferenceLine
                  y={result.baselineValue}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: 'Baseline', fill: '#64748b', fontSize: 10, position: 'right' }}
                />
                <Line
                  type="monotone"
                  dataKey="metricValue"
                  stroke="#1e293b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
// MAIN COMPONENT
// =====================

export interface OneWayPanelProps {
  fundId: number | null;
}

export function OneWayPanel({ fundId }: OneWayPanelProps) {
  const [form, setForm] = useState<FormState>(() => defaultFormFor('reserve_pool_pct'));
  const [displayedResult, setDisplayedResult] = useState<OneWayAnalysisResultV1 | null>(null);

  // Reset displayed result when fund changes so we never show stale numbers
  // attached to a different fund.
  useEffect(() => {
    setDisplayedResult(null);
  }, [fundId]);

  const mutation = useOneWayRun(fundId);
  const validation = useMemo(() => validateForm(form), [form]);
  const elapsed = useElapsedSeconds(mutation.isPending);

  const onVariableChange = useCallback((next: string) => {
    const nextId = next as SensitivityVariableId;
    setForm((prev) => ({
      ...defaultFormFor(nextId),
      // preserve metric selection across variable changes
      metricId: prev.metricId,
    }));
  }, []);

  const onMetricChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, metricId: next as SensitivityMetricId }));
  }, []);

  const onMinChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, min: parseFloat(next) }));
  }, []);

  const onMaxChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, max: parseFloat(next) }));
  }, []);

  const onStepsChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, steps: parseInt(next, 10) }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!validation.ok || fundId === null) return;
    setDisplayedResult(null);
    mutation.mutate(buildRequest(form), {
      onSuccess: (response) => {
        setDisplayedResult(response.result);
      },
    });
  }, [form, fundId, mutation, validation.ok]);

  const handleHistorySelect = useCallback((result: OneWayAnalysisResultV1) => {
    setDisplayedResult(result);
  }, []);

  const variableDefinition = getVariableDefinition(form.variableId);
  const runDisabled = fundId === null || mutation.isPending || !validation.ok;
  const runDisabledReason =
    fundId === null
      ? 'Select a fund before running a sweep.'
      : mutation.isPending
        ? 'A sweep is already running.'
        : !validation.ok
          ? 'Resolve validation errors before running a sweep.'
          : undefined;
  const runDisabledReasonId = runDisabledReason ? 'one-way-run-disabled-reason' : undefined;
  const error = mutation.error as SensitivityHookError | null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="one-way-panel">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="one-way-variable">Variable</Label>
              <Select value={form.variableId} onValueChange={onVariableChange}>
                <SelectTrigger id="one-way-variable" aria-label="One-way variable">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_VARIABLES.map((variable) => (
                    <SelectItem key={variable.id} value={variable.id}>
                      {variable.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">{variableDefinition.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="one-way-min">Min</Label>
                <Input
                  id="one-way-min"
                  type="number"
                  step="any"
                  value={Number.isFinite(form.min) ? form.min : ''}
                  onChange={(e) => onMinChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="one-way-max">Max</Label>
                <Input
                  id="one-way-max"
                  type="number"
                  step="any"
                  value={Number.isFinite(form.max) ? form.max : ''}
                  onChange={(e) => onMaxChange(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="one-way-steps">Steps</Label>
              <Input
                id="one-way-steps"
                type="number"
                min={2}
                max={50}
                step={1}
                value={Number.isFinite(form.steps) ? form.steps : ''}
                onChange={(e) => onStepsChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="one-way-metric">Metric</Label>
              <Select value={form.metricId} onValueChange={onMetricChange}>
                <SelectTrigger id="one-way-metric" aria-label="One-way metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_METRICS.map((metric) => (
                    <SelectItem key={metric.id} value={metric.id}>
                      {metric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!validation.ok && validation.errors.length > 0 && (
              <ul
                className="space-y-0.5 text-xs text-red-600"
                data-testid="one-way-validation-errors"
              >
                {validation.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={runDisabled}
              aria-describedby={runDisabledReasonId}
              className="w-full"
              data-testid="one-way-run-button"
            >
              {runDisabledReason && (
                <span id={runDisabledReasonId} className="sr-only">
                  {runDisabledReason}
                </span>
              )}
              Run Sweep
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <HistoryPanel fundId={fundId} onSelect={handleHistorySelect} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2">
        {mutation.isPending && (
          <Card className="border-blue-200">
            <CardContent className="px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-sm font-medium text-gray-700">Running sweep...</span>
                </div>
                <span className="tabular-nums text-xs text-gray-500">{elapsed}s</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!mutation.isPending && error && (
          <Card className="border-red-200" data-testid="one-way-error">
            <CardContent className="px-4 py-3">
              <p className="text-sm font-medium text-red-700" data-testid="one-way-error-code">
                {error.code ?? 'UNKNOWN'}
              </p>
              <p className="mt-0.5 text-xs text-gray-600" data-testid="one-way-error-message">
                {error.message}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmit}
                disabled={runDisabled}
                aria-describedby={runDisabledReason ? 'one-way-retry-disabled-reason' : undefined}
                className="mt-2"
                data-testid="one-way-retry-button"
              >
                {runDisabledReason && (
                  <span id="one-way-retry-disabled-reason" className="sr-only">
                    {runDisabledReason}
                  </span>
                )}
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!mutation.isPending && !error && displayedResult && (
          <ResultsSection result={displayedResult} />
        )}

        {!mutation.isPending && !error && !displayedResult && (
          <div
            className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-300"
            data-testid="one-way-idle"
          >
            <p className="text-sm text-gray-400">Configure and run a sweep to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default OneWayPanel;
