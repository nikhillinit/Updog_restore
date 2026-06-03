/**
 * TwoWayPanel -- Phase 2 sensitivity workspace.
 *
 * Renders a configuration sidebar (X and Y variable pickers, ranges, steps,
 * metric) plus a results panel that visualizes a two-way deterministic sweep
 * grid against the latest published fund config. Mirrors OneWayPanel's
 * structural layout so the two sensitivity surfaces feel consistent.
 *
 * Inline cell-color helpers are intentionally local to this file -- they are
 * grid-specific and have no other consumer in the sensitivity family yet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

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
import { useTwoWayRun, useSensitivityHistory } from '@/hooks/useSensitivityRuns';
import type { SensitivityHookError } from '@/hooks/useSensitivityRuns';
import {
  SUPPORTED_VARIABLES,
  SUPPORTED_METRICS,
  getVariableDefinition,
  getMetricDefinition,
  type SensitivityVariableId,
  type SensitivityMetricId,
} from '@shared/contracts/sensitivity-variables-v1';
import {
  TwoWayAnalysisResultV1Schema,
  type TwoWayAnalysisRequestV1,
  type TwoWayAnalysisResultV1,
  type SensitivityRunV1,
} from '@shared/contracts/sensitivity-run-v1.contract';
import { formatMetricValue, formatVariableValue, useElapsedSeconds, SummaryCard } from './_shared';
import { SensitivityRunErrorCard } from './SensitivityRunErrorCard';

// =====================
// CELL COLOR HELPERS (inline -- grid-specific, no other consumers)
// =====================

function interpolateCellColor(value: number, min: number, max: number): string {
  if (max === min) return 'rgb(148, 163, 184)'; // slate-400 midpoint
  const t = (value - min) / (max - min);
  const lo = { r: 248, g: 250, b: 252 }; // slate-50
  const hi = { r: 15, g: 23, b: 42 }; // slate-900
  const r = Math.round(lo.r + (hi.r - lo.r) * t);
  const g = Math.round(lo.g + (hi.g - lo.g) * t);
  const b = Math.round(lo.b + (hi.b - lo.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function cellTextColor(value: number, min: number, max: number): string {
  if (max === min) return '#0f172a';
  const t = (value - min) / (max - min);
  return t > 0.5 ? '#f8fafc' : '#0f172a';
}

// =====================
// FORM STATE
// =====================

interface AxisRange {
  min: number;
  max: number;
}

interface FormState {
  variableXId: SensitivityVariableId;
  rangeX: AxisRange;
  stepsX: number;
  variableYId: SensitivityVariableId;
  rangeY: AxisRange;
  stepsY: number;
  metricId: SensitivityMetricId;
}

interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

function defaultRangeFor(variableId: SensitivityVariableId): AxisRange {
  const def = getVariableDefinition(variableId);
  return { min: def.min, max: def.max };
}

function pickAlternateVariable(excludeId: SensitivityVariableId): SensitivityVariableId {
  const alt = SUPPORTED_VARIABLES.find((v) => v.id !== excludeId);
  if (!alt) {
    throw new Error('SUPPORTED_VARIABLES must contain at least two entries');
  }
  return alt.id as SensitivityVariableId;
}

function defaultFormState(): FormState {
  const variableXId: SensitivityVariableId = 'reserve_pool_pct';
  const variableYId: SensitivityVariableId = 'management_fee_rate';
  return {
    variableXId,
    rangeX: defaultRangeFor(variableXId),
    stepsX: 7,
    variableYId,
    rangeY: defaultRangeFor(variableYId),
    stepsY: 7,
    metricId: 'tvpi',
  };
}

function validateForm(form: FormState): ValidationOutcome {
  const errors: string[] = [];
  if (form.variableXId === form.variableYId) {
    errors.push('Variable X and Variable Y must differ');
  }
  if (!Number.isFinite(form.rangeX.min) || !Number.isFinite(form.rangeX.max)) {
    errors.push('Range X min and max must be numeric');
  } else if (form.rangeX.min >= form.rangeX.max) {
    errors.push('Range X min must be strictly less than max');
  }
  if (!Number.isFinite(form.rangeY.min) || !Number.isFinite(form.rangeY.max)) {
    errors.push('Range Y min and max must be numeric');
  } else if (form.rangeY.min >= form.rangeY.max) {
    errors.push('Range Y min must be strictly less than max');
  }
  if (!Number.isInteger(form.stepsX) || form.stepsX < 2 || form.stepsX > 50) {
    errors.push('Steps X must be an integer between 2 and 50');
  }
  if (!Number.isInteger(form.stepsY) || form.stepsY < 2 || form.stepsY > 50) {
    errors.push('Steps Y must be an integer between 2 and 50');
  }
  return { ok: errors.length === 0, errors };
}

function buildRequest(form: FormState): TwoWayAnalysisRequestV1 {
  return {
    variableXId: form.variableXId,
    rangeX: form.rangeX,
    stepsX: form.stepsX,
    variableYId: form.variableYId,
    rangeY: form.rangeY,
    stepsY: form.stepsY,
    metricId: form.metricId,
  };
}

// =====================
// HISTORY ENTRY -> RESULT
// =====================

function parseHistoryResult(run: SensitivityRunV1): TwoWayAnalysisResultV1 | null {
  if (run.results === null || run.results === undefined) return null;
  const parsed = TwoWayAnalysisResultV1Schema.safeParse(run.results);
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
  onSelect: (result: TwoWayAnalysisResultV1) => void;
}) {
  const { data, isLoading } = useSensitivityHistory(fundId, 'two_way', 10);

  if (isLoading) {
    return <p className="text-xs text-charcoal-500">Loading history...</p>;
  }

  const runs = data?.runs ?? [];
  if (runs.length === 0) {
    return (
      <p className="text-xs text-charcoal-500" data-testid="two-way-history-empty">
        No previous two-way analyses
      </p>
    );
  }

  return (
    <div className="space-y-1" data-testid="two-way-history-list">
      <h3 className="mb-2 text-xs font-medium text-charcoal-600">Recent Runs</h3>
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
              disabled
                ? 'cursor-not-allowed text-charcoal-400'
                : 'text-pov-charcoal hover:bg-pov-charcoal hover:text-pov-white'
            )}
            data-testid={`two-way-history-item-${run.id}`}
          >
            <span>#{run.id}</span>
            <span className="mx-1 text-charcoal-400">·</span>
            <span>{formatRunTimestamp(run.createdAt)}</span>
            <span className="mx-1 text-charcoal-400">·</span>
            <span className="uppercase tracking-wide text-[10px]">{run.status}</span>
          </button>
        );
      })}
    </div>
  );
}

// =====================
// RESULTS GRID
// =====================

function ResultsSection({ result }: { result: TwoWayAnalysisResultV1 }) {
  const variableX = getVariableDefinition(result.variableXId);
  const variableY = getVariableDefinition(result.variableYId);
  const metric = getMetricDefinition(result.metricId);

  // Distinct sorted axes derived from the datapoint cloud.
  const xValues = useMemo(
    () => Array.from(new Set(result.datapoints.map((d) => d.variableXValue))).sort((a, b) => a - b),
    [result.datapoints]
  );
  const yValues = useMemo(
    () => Array.from(new Set(result.datapoints.map((d) => d.variableYValue))).sort((a, b) => a - b),
    [result.datapoints]
  );

  // Cell lookup keyed on the literal "x|y" tuple for O(1) access during render.
  const cellLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of result.datapoints) {
      map.set(`${d.variableXValue}|${d.variableYValue}`, d.metricValue);
    }
    return map;
  }, [result.datapoints]);

  const { minMetric, maxMetric, range } = result.summary;

  return (
    <div className="space-y-4" data-testid="two-way-results">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Baseline" value={formatMetricValue(result.baselineValue, metric)} />
        <SummaryCard label="Min" value={formatMetricValue(minMetric, metric)} />
        <SummaryCard label="Max" value={formatMetricValue(maxMetric, metric)} />
        <SummaryCard label="Range" value={formatMetricValue(range, metric)} />
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-xs"
              data-testid="two-way-grid"
              aria-label={`${variableX.label} vs ${variableY.label} grid (${metric.label})`}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border border-beige-200 bg-pov-gray px-2 py-1 text-left font-medium text-charcoal-500"
                  >
                    {`${variableY.label} \\ ${variableX.label}`}
                  </th>
                  {xValues.map((x) => (
                    <th
                      key={`x-${x}`}
                      scope="col"
                      className="border border-beige-200 bg-pov-gray px-2 py-1 text-center font-medium text-charcoal-700"
                    >
                      {formatVariableValue(x, variableX)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yValues.map((y) => (
                  <tr key={`y-${y}`}>
                    <th
                      scope="row"
                      className="border border-beige-200 bg-pov-gray px-2 py-1 text-left font-medium text-charcoal-700"
                    >
                      {formatVariableValue(y, variableY)}
                    </th>
                    {xValues.map((x) => {
                      const value = cellLookup.get(`${x}|${y}`);
                      if (value === undefined) {
                        return (
                          <td
                            key={`cell-${x}-${y}`}
                            data-testid={`two-way-cell-${x}-${y}`}
                            className="border border-beige-200 px-2 py-1 text-center text-charcoal-300"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={`cell-${x}-${y}`}
                          data-testid={`two-way-cell-${x}-${y}`}
                          className="border border-beige-200 px-2 py-1 text-center tabular-nums"
                          style={{
                            backgroundColor: interpolateCellColor(value, minMetric, maxMetric),
                            color: cellTextColor(value, minMetric, maxMetric),
                          }}
                        >
                          {formatMetricValue(value, metric)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
// MAIN COMPONENT
// =====================

export interface TwoWayPanelProps {
  fundId: number | null;
}

export function TwoWayPanel({ fundId }: TwoWayPanelProps): JSX.Element {
  const [form, setForm] = useState<FormState>(() => defaultFormState());
  const [displayedResult, setDisplayedResult] = useState<TwoWayAnalysisResultV1 | null>(null);

  // Reset displayed result when fund changes so we never show stale numbers
  // attached to a different fund.
  useEffect(() => {
    setDisplayedResult(null);
  }, [fundId]);

  const mutation = useTwoWayRun(fundId);
  const validation = useMemo(() => validateForm(form), [form]);
  const elapsed = useElapsedSeconds(mutation.isPending);

  const onVariableXChange = useCallback((next: string) => {
    const nextId = next as SensitivityVariableId;
    setForm((prev) => {
      // If the new X collides with the current Y, flip Y to a non-X variable
      // so we can never enter an invalid X==Y state via the picker.
      const nextYId =
        prev.variableYId === nextId ? pickAlternateVariable(nextId) : prev.variableYId;
      return {
        ...prev,
        variableXId: nextId,
        rangeX: defaultRangeFor(nextId),
        variableYId: nextYId,
        rangeY: nextYId === prev.variableYId ? prev.rangeY : defaultRangeFor(nextYId),
      };
    });
  }, []);

  const onVariableYChange = useCallback((next: string) => {
    const nextId = next as SensitivityVariableId;
    setForm((prev) => ({
      ...prev,
      variableYId: nextId,
      rangeY: defaultRangeFor(nextId),
    }));
  }, []);

  const onMetricChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, metricId: next as SensitivityMetricId }));
  }, []);

  const onRangeXMinChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, rangeX: { ...prev.rangeX, min: parseFloat(next) } }));
  }, []);

  const onRangeXMaxChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, rangeX: { ...prev.rangeX, max: parseFloat(next) } }));
  }, []);

  const onRangeYMinChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, rangeY: { ...prev.rangeY, min: parseFloat(next) } }));
  }, []);

  const onRangeYMaxChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, rangeY: { ...prev.rangeY, max: parseFloat(next) } }));
  }, []);

  const onStepsXChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, stepsX: parseInt(next, 10) }));
  }, []);

  const onStepsYChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, stepsY: parseInt(next, 10) }));
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

  const handleHistorySelect = useCallback((result: TwoWayAnalysisResultV1) => {
    setDisplayedResult(result);
  }, []);

  // Mutation state from the hook can flow into displayedResult via the
  // onSuccess hop above; ALSO mirror externally-supplied data when the test
  // harness pre-seeds the mutation as success without going through mutate().
  useEffect(() => {
    if (mutation.isSuccess && mutation.data?.result && displayedResult === null) {
      setDisplayedResult(mutation.data.result);
    }
    // We intentionally do NOT depend on displayedResult here -- this effect is
    // a one-shot adopter for externally-seeded mutation success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutation.isSuccess, mutation.data]);

  const variableXDefinition = getVariableDefinition(form.variableXId);
  const variableYDefinition = getVariableDefinition(form.variableYId);
  const yOptions = useMemo(
    () => SUPPORTED_VARIABLES.filter((v) => v.id !== form.variableXId),
    [form.variableXId]
  );

  const runDisabled = fundId === null || mutation.isPending || !validation.ok;
  const runDisabledReason =
    fundId === null
      ? 'Select a fund before running a sweep.'
      : mutation.isPending
        ? 'A sweep is already running.'
        : !validation.ok
          ? 'Resolve validation errors before running a sweep.'
          : undefined;
  const runDisabledReasonId = runDisabledReason ? 'two-way-run-disabled-reason' : undefined;
  const error = mutation.error as SensitivityHookError | null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="two-way-panel">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="two-way-variable-x">Variable X</Label>
              <Select value={form.variableXId} onValueChange={onVariableXChange}>
                <SelectTrigger id="two-way-variable-x" aria-label="Two-way variable X">
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
              <p className="text-xs text-charcoal-500">{variableXDefinition.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="two-way-x-min">Range X Min</Label>
                <Input
                  id="two-way-x-min"
                  type="number"
                  step="any"
                  value={Number.isFinite(form.rangeX.min) ? form.rangeX.min : ''}
                  onChange={(e) => onRangeXMinChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="two-way-x-max">Range X Max</Label>
                <Input
                  id="two-way-x-max"
                  type="number"
                  step="any"
                  value={Number.isFinite(form.rangeX.max) ? form.rangeX.max : ''}
                  onChange={(e) => onRangeXMaxChange(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="two-way-steps-x">Steps X</Label>
              <Input
                id="two-way-steps-x"
                type="number"
                min={2}
                max={50}
                step={1}
                value={Number.isFinite(form.stepsX) ? form.stepsX : ''}
                onChange={(e) => onStepsXChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="two-way-variable-y">Variable Y</Label>
              <Select value={form.variableYId} onValueChange={onVariableYChange}>
                <SelectTrigger id="two-way-variable-y" aria-label="Two-way variable Y">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yOptions.map((variable) => (
                    <SelectItem key={variable.id} value={variable.id}>
                      {variable.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-charcoal-500">{variableYDefinition.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="two-way-y-min">Range Y Min</Label>
                <Input
                  id="two-way-y-min"
                  type="number"
                  step="any"
                  value={Number.isFinite(form.rangeY.min) ? form.rangeY.min : ''}
                  onChange={(e) => onRangeYMinChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="two-way-y-max">Range Y Max</Label>
                <Input
                  id="two-way-y-max"
                  type="number"
                  step="any"
                  value={Number.isFinite(form.rangeY.max) ? form.rangeY.max : ''}
                  onChange={(e) => onRangeYMaxChange(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="two-way-steps-y">Steps Y</Label>
              <Input
                id="two-way-steps-y"
                type="number"
                min={2}
                max={50}
                step={1}
                value={Number.isFinite(form.stepsY) ? form.stepsY : ''}
                onChange={(e) => onStepsYChange(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="two-way-metric">Metric</Label>
              <Select value={form.metricId} onValueChange={onMetricChange}>
                <SelectTrigger id="two-way-metric" aria-label="Two-way metric">
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
                className="space-y-0.5 text-xs text-error"
                data-testid="two-way-validation-errors"
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
              data-testid="two-way-run-button"
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
          <Card className="border-presson-info/20">
            <CardContent className="px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-presson-info" />
                  <span className="text-sm font-medium text-charcoal-700">Running sweep...</span>
                </div>
                <span className="tabular-nums text-xs text-charcoal-500">{elapsed}s</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!mutation.isPending && error && (
          <SensitivityRunErrorCard
            error={error}
            fundId={fundId}
            onRetry={handleSubmit}
            retryDisabled={runDisabled}
            retryDisabledReason={runDisabledReason ?? null}
            testIdPrefix="two-way"
          />
        )}

        {!mutation.isPending && !error && displayedResult && (
          <ResultsSection result={displayedResult} />
        )}

        {!mutation.isPending && !error && !displayedResult && (
          <div
            className="flex h-48 items-center justify-center rounded-lg border border-dashed border-charcoal-300"
            data-testid="two-way-idle"
          >
            <p className="text-sm text-charcoal-400">Configure and run a sweep to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TwoWayPanel;
