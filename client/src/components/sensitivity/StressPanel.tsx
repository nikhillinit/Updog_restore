/**
 * StressPanel -- Phase 4 sensitivity workspace.
 *
 * Renders a configuration sidebar (multi-select scenario picker + metric)
 * plus a results panel that visualizes a deterministic stress test against
 * the latest published fund config. Mirrors OneWayPanel's and TwoWayPanel's
 * structural layout so the four sensitivity surfaces feel consistent.
 *
 * Stress = beta interpretation: named multi-variable shock scenarios applied
 * to the deterministic fund config via the same scalar-only applyOverride
 * pattern as one-way and two-way. Alpha (historical scenario replay via
 * Monte Carlo) is OUT OF SCOPE for this panel.
 *
 * Inline delta-bar helper is intentionally local to this file -- it is
 * scenario-row-specific and has no other consumer in the sensitivity family.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useStressRun, useSensitivityHistory } from '@/hooks/useSensitivityRuns';
import type { SensitivityHookError } from '@/hooks/useSensitivityRuns';
import {
  SUPPORTED_STRESS_SCENARIOS,
  SUPPORTED_METRICS,
  getMetricDefinition,
  type SensitivityMetricId,
  type SensitivityStressScenarioId,
} from '@shared/contracts/sensitivity-variables-v1';
import {
  StressAnalysisResultV1Schema,
  type StressAnalysisRequestV1,
  type StressAnalysisResultV1,
  type SensitivityRunV1,
} from '@shared/contracts/sensitivity-run-v1.contract';
import { formatMetricValue, useElapsedSeconds, SummaryCard } from './_shared';
import { SensitivityRunErrorCard } from './SensitivityRunErrorCard';

// =====================
// DELTA BAR HELPER (inline -- scenario-row specific, no other consumers)
// =====================

interface DeltaBarStyle {
  width: string;
  backgroundColor: string;
}

function deltaBarStyle(delta: number, maxAbsDelta: number): DeltaBarStyle {
  const widthPct = maxAbsDelta === 0 ? 0 : (Math.abs(delta) / maxAbsDelta) * 100;
  // Red for negative (downside), emerald for positive (upside).
  // TODO(a11y): baseline delta bar needs a non-color direction cue.
  const backgroundColor = delta < 0 ? 'rgb(239, 68, 68)' : 'rgb(16, 185, 129)';
  return { width: `${widthPct}%`, backgroundColor };
}

// =====================
// FORM STATE
// =====================

interface FormState {
  selectedScenarioIds: ReadonlySet<SensitivityStressScenarioId>;
  metricId: SensitivityMetricId;
}

interface ValidationOutcome {
  ok: boolean;
  errors: string[];
}

function defaultFormState(): FormState {
  return {
    selectedScenarioIds: new Set<SensitivityStressScenarioId>(
      SUPPORTED_STRESS_SCENARIOS.map((s) => s.id as SensitivityStressScenarioId)
    ),
    metricId: 'tvpi',
  };
}

function validateForm(form: FormState): ValidationOutcome {
  const errors: string[] = [];
  if (form.selectedScenarioIds.size === 0) {
    errors.push('Select at least one stress scenario');
  }
  return { ok: errors.length === 0, errors };
}

function buildRequest(form: FormState): StressAnalysisRequestV1 {
  return {
    scenarioIds: Array.from(form.selectedScenarioIds),
    metricId: form.metricId,
  };
}

// =====================
// HISTORY ENTRY -> RESULT
// =====================

function parseHistoryResult(run: SensitivityRunV1): StressAnalysisResultV1 | null {
  if (run.results === null || run.results === undefined) return null;
  const parsed = StressAnalysisResultV1Schema.safeParse(run.results);
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
  onSelect: (result: StressAnalysisResultV1) => void;
}) {
  const { data, isLoading } = useSensitivityHistory(fundId, 'stress', 10);

  if (isLoading) {
    return <p className="text-xs text-charcoal-500">Loading history...</p>;
  }

  const runs = data?.runs ?? [];
  if (runs.length === 0) {
    return (
      <p className="text-xs text-charcoal-500" data-testid="stress-history-empty">
        No previous stress tests
      </p>
    );
  }

  return (
    <div className="space-y-1" data-testid="stress-history-list">
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
            data-testid={`stress-history-item-${run.id}`}
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
// RESULTS SECTION
// =====================

function ResultsSection({ result }: { result: StressAnalysisResultV1 }) {
  const metric = getMetricDefinition(result.metricId);
  const { worstCase, bestCase, range } = result.summary;

  // Sort by SUPPORTED_STRESS_SCENARIOS canonical index for stable rendering.
  const canonicalIndex = useMemo(() => {
    const map = new Map<string, number>();
    SUPPORTED_STRESS_SCENARIOS.forEach((s, i) => map.set(s.id, i));
    return map;
  }, []);

  const sortedDatapoints = useMemo(
    () =>
      [...result.datapoints].sort(
        (a, b) => (canonicalIndex.get(a.scenarioId) ?? 0) - (canonicalIndex.get(b.scenarioId) ?? 0)
      ),
    [result.datapoints, canonicalIndex]
  );

  const maxAbsDelta = useMemo(
    () => Math.max(...sortedDatapoints.map((d) => Math.abs(d.baselineDelta)), 0),
    [sortedDatapoints]
  );

  return (
    <div className="space-y-4" data-testid="stress-results">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Baseline" value={formatMetricValue(result.baselineValue, metric)} />
        <SummaryCard label="Worst" value={formatMetricValue(worstCase, metric)} />
        <SummaryCard label="Best" value={formatMetricValue(bestCase, metric)} />
        <SummaryCard label="Range" value={formatMetricValue(range, metric)} />
      </div>
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3" data-testid="stress-rows">
            {sortedDatapoints.map((dp) => {
              const scenario = SUPPORTED_STRESS_SCENARIOS.find((s) => s.id === dp.scenarioId);
              return (
                <div
                  key={dp.scenarioId}
                  className="space-y-1"
                  data-testid={`stress-row-${dp.scenarioId}`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-pov-charcoal">
                      {dp.scenarioLabel}
                    </span>
                    <span className="tabular-nums text-sm text-charcoal-700">
                      {formatMetricValue(dp.metricValue, metric)}
                    </span>
                  </div>
                  {scenario && (
                    <div className="text-xs text-charcoal-500">{scenario.description}</div>
                  )}
                  <div className="h-2 w-full overflow-hidden rounded bg-pov-gray">
                    <div
                      className="h-2 rounded"
                      style={deltaBarStyle(dp.baselineDelta, maxAbsDelta)}
                      data-testid={`stress-delta-bar-${dp.scenarioId}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================
// MAIN COMPONENT
// =====================

export interface StressPanelProps {
  fundId: number | null;
}

export function StressPanel({ fundId }: StressPanelProps): JSX.Element {
  const [form, setForm] = useState<FormState>(() => defaultFormState());
  const [displayedResult, setDisplayedResult] = useState<StressAnalysisResultV1 | null>(null);

  // Reset displayed result when fund changes so we never show stale numbers
  // attached to a different fund.
  useEffect(() => {
    setDisplayedResult(null);
  }, [fundId]);

  const mutation = useStressRun(fundId);
  const validation = useMemo(() => validateForm(form), [form]);
  const elapsed = useElapsedSeconds(mutation.isPending);

  const onScenarioToggle = useCallback((scenarioId: SensitivityStressScenarioId) => {
    setForm((prev) => {
      const next = new Set(prev.selectedScenarioIds);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
      } else {
        next.add(scenarioId);
      }
      return { ...prev, selectedScenarioIds: next };
    });
  }, []);

  const onMetricChange = useCallback((next: string) => {
    setForm((prev) => ({ ...prev, metricId: next as SensitivityMetricId }));
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

  const handleHistorySelect = useCallback((result: StressAnalysisResultV1) => {
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

  const runDisabled = fundId === null || mutation.isPending || !validation.ok;
  const runDisabledReason =
    fundId === null
      ? 'Select a fund before running a stress test.'
      : mutation.isPending
        ? 'A stress test is already running.'
        : !validation.ok
          ? 'Select at least one stress scenario before running a stress test.'
          : undefined;
  const runDisabledReasonId = runDisabledReason ? 'stress-run-disabled-reason' : undefined;
  const error = mutation.error as SensitivityHookError | null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="stress-panel">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Stress Scenarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2" data-testid="stress-scenario-picker">
              <legend className="sr-only">Stress scenarios</legend>
              {SUPPORTED_STRESS_SCENARIOS.map((scenario) => {
                const id = scenario.id as SensitivityStressScenarioId;
                const checked = form.selectedScenarioIds.has(id);
                return (
                  <label
                    key={scenario.id}
                    className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-pov-gray"
                    htmlFor={`stress-scenario-${scenario.id}`}
                  >
                    <input
                      id={`stress-scenario-${scenario.id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => onScenarioToggle(id)}
                      className="mt-1"
                      data-testid={`stress-scenario-checkbox-${scenario.id}`}
                    />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-pov-charcoal">{scenario.label}</div>
                      <div className="text-[10px] text-charcoal-500">{scenario.description}</div>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            <div className="space-y-1">
              <Label htmlFor="stress-metric">Metric</Label>
              <Select value={form.metricId} onValueChange={onMetricChange}>
                <SelectTrigger id="stress-metric" aria-label="Stress metric">
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
              <ul className="space-y-0.5 text-xs text-error" data-testid="stress-validation-errors">
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
              data-testid="stress-run-button"
            >
              {runDisabledReason && (
                <span id={runDisabledReasonId} className="sr-only">
                  {runDisabledReason}
                </span>
              )}
              Run Stress Test
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
                  <span className="text-sm font-medium text-charcoal-700">
                    Running stress test...
                  </span>
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
            testIdPrefix="stress"
          />
        )}

        {!mutation.isPending && !error && displayedResult && (
          <ResultsSection result={displayedResult} />
        )}

        {!mutation.isPending && !error && !displayedResult && (
          <div
            className="flex h-48 items-center justify-center rounded-lg border border-dashed border-charcoal-300"
            data-testid="stress-idle"
          >
            <p className="text-sm text-charcoal-400">
              Select scenarios and run a stress test to see results
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StressPanel;
