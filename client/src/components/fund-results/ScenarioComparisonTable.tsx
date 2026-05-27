/**
 * ScenarioComparisonTable - ADR-022 scenario-set comparison cards.
 *
 * Renders one calculated fee-profile scenario set against the authoritative
 * economics baseline for that set's source configuration version.
 *
 * @module client/components/fund-results/ScenarioComparisonTable
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ScenarioEvidenceStateV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';

export const SCENARIO_COMPARISON_METRIC_KEYS = [
  'lpNetIrr',
  'gpNetIrr',
  'totalManagementFees',
  'totalGpCarryDistributed',
  'totalGpFeeIncome',
  'finalDpi',
  'finalTvpi',
  'finalClawbackDue',
] as const;

export type ScenarioComparisonMetricKey = (typeof SCENARIO_COMPARISON_METRIC_KEYS)[number];
export type ScenarioComparisonStatus =
  | 'no_scenario_results'
  | 'baseline_unavailable'
  | 'comparable';
export type ScenarioComparisonMetricValue = number | null;
export type ScenarioComparisonMetricMap = Record<
  ScenarioComparisonMetricKey,
  ScenarioComparisonMetricValue
>;
export interface ScenarioComparisonStalenessObjectV1 {
  state: ScenarioEvidenceStateV1;
  sourceConfigVersion: number;
  currentPublishedConfigVersion: number | null;
}
export type ScenarioComparisonStalenessV1 =
  | ScenarioEvidenceStateV1
  | ScenarioComparisonStalenessObjectV1;
export type ScenarioComparisonMetricKind = 'percent' | 'money' | 'multiple';
export type ScenarioComparisonDriftReason =
  | 'stable'
  | 'missing_baseline'
  | 'missing_scenario'
  | 'missing_both'
  | 'zero_baseline';

export interface ScenarioComparisonScenarioSetV1 {
  scenarioSetId: string;
  name: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
}

export interface ScenarioComparisonBaselineV1 {
  label?: string | null;
  metrics: ScenarioComparisonMetricMap;
}

export interface ScenarioComparisonMetricDeltaV1 {
  metric: ScenarioComparisonMetricKey;
  displayName: string;
  baselineValue: ScenarioComparisonMetricValue;
  scenarioValue: ScenarioComparisonMetricValue;
  absoluteDelta: ScenarioComparisonMetricValue;
  percentageDelta: ScenarioComparisonMetricValue;
  driftCapable: boolean;
  driftReason: ScenarioComparisonDriftReason;
}

export interface ScenarioComparisonVariantV1 {
  variantId: string;
  name: string;
  overrideType: 'fee_profile';
  metrics: ScenarioComparisonMetricMap;
  metricDeltas: ScenarioComparisonMetricDeltaV1[];
}

export interface FundScenarioComparisonV1 {
  fundId: number;
  comparisonStatus: ScenarioComparisonStatus;
  scenarioSet: ScenarioComparisonScenarioSetV1;
  baseline: ScenarioComparisonBaselineV1 | null;
  variants: ScenarioComparisonVariantV1[];
  staleness: ScenarioComparisonStalenessV1 | null;
  calculatedAt: string | null;
}

export interface ScenarioComparisonTableProps {
  comparison: FundScenarioComparisonV1;
}

interface MetricDefinition {
  label: string;
  kind: ScenarioComparisonMetricKind;
}

const METRIC_DEFINITIONS: Record<ScenarioComparisonMetricKey, MetricDefinition> = {
  lpNetIrr: { label: 'Net LP IRR', kind: 'percent' },
  gpNetIrr: { label: 'Net GP IRR', kind: 'percent' },
  totalManagementFees: { label: 'Management Fees', kind: 'money' },
  totalGpCarryDistributed: { label: 'GP Carry', kind: 'money' },
  totalGpFeeIncome: { label: 'GP Fee Income', kind: 'money' },
  finalDpi: { label: 'DPI', kind: 'multiple' },
  finalTvpi: { label: 'TVPI', kind: 'multiple' },
  finalClawbackDue: { label: 'Clawback Due', kind: 'money' },
};

function formatMetricValue(
  metric: ScenarioComparisonMetricKey,
  value: ScenarioComparisonMetricValue
) {
  if (value == null) return 'N/A';

  const kind = METRIC_DEFINITIONS[metric].kind;
  if (kind === 'percent') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (kind === 'money') {
    return formatMoney(value);
  }
  return `${value.toFixed(2)}x`;
}

function formatMetricDelta(
  metric: ScenarioComparisonMetricKey,
  value: ScenarioComparisonMetricValue
) {
  if (value == null || value === 0) return null;

  const kind = METRIC_DEFINITIONS[metric].kind;
  if (kind === 'percent') {
    const sign = value > 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)} pts`;
  }
  if (kind === 'money') {
    return formatMoney(value, { showPositiveSign: true });
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}x`;
}

function formatMoney(value: number, options: { showPositiveSign?: boolean } = {}) {
  const sign = value < 0 ? '-' : options.showPositiveSign && value > 0 ? '+' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  }
  if (absolute >= 1_000) {
    return `${sign}$${(absolute / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${absolute.toFixed(0)}`;
}

function formatStatus(value: ScenarioComparisonStalenessV1 | null) {
  if (!value) return 'Evidence unavailable';
  const state = typeof value === 'string' ? value : value.state;
  return state
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function statusCopy(comparison: FundScenarioComparisonV1) {
  if (comparison.comparisonStatus === 'no_scenario_results') {
    return 'Calculate this scenario set to compare it with the authoritative economics baseline.';
  }
  if (comparison.comparisonStatus === 'baseline_unavailable') {
    return `Authoritative economics baseline is unavailable for source config v${comparison.scenarioSet.sourceConfigVersion}.`;
  }
  return 'Scenario comparison is unavailable.';
}

function driftReasonCopy(reason: ScenarioComparisonDriftReason) {
  switch (reason) {
    case 'missing_baseline':
      return 'Baseline value is unavailable.';
    case 'missing_scenario':
      return 'Scenario value is unavailable.';
    case 'missing_both':
      return 'Baseline and scenario values are unavailable.';
    case 'zero_baseline':
      return 'Baseline value is zero, so percentage drift is unstable.';
    case 'stable':
    default:
      return 'Stable comparison.';
  }
}

function deltaForMetric(variant: ScenarioComparisonVariantV1, metric: ScenarioComparisonMetricKey) {
  return variant.metricDeltas.find((delta) => delta.metric === metric) ?? null;
}

function MetricRows({
  metrics,
  variant,
}: {
  metrics: ScenarioComparisonMetricMap;
  variant?: ScenarioComparisonVariantV1 | undefined;
}) {
  return (
    <div className="divide-y divide-beige-200">
      {SCENARIO_COMPARISON_METRIC_KEYS.map((metric) => {
        const definition = METRIC_DEFINITIONS[metric];
        const delta = variant ? deltaForMetric(variant, metric) : null;
        const formattedDelta = delta ? formatMetricDelta(metric, delta.absoluteDelta) : null;

        return (
          <div key={metric} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
            <div>
              <p className="text-xs uppercase text-charcoal-400 font-poppins">{definition.label}</p>
              {delta && !delta.driftCapable && (
                <p className="mt-1 text-xs text-charcoal-500 font-poppins">
                  {driftReasonCopy(delta.driftReason)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-inter text-base font-semibold tabular-nums text-charcoal">
                {formatMetricValue(metric, metrics[metric])}
              </p>
              {delta && delta.driftCapable && formattedDelta && (
                <p
                  className={cn(
                    'text-xs font-poppins font-medium tabular-nums',
                    delta.absoluteDelta != null && delta.absoluteDelta > 0
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  )}
                >
                  {formattedDelta}
                </p>
              )}
              {delta && !delta.driftCapable && (
                <p className="text-xs font-poppins text-charcoal-400">Drift unavailable</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MetricsCard({
  title,
  badge,
  metrics,
  variant,
}: {
  title: string;
  badge: string;
  metrics: ScenarioComparisonMetricMap;
  variant?: ScenarioComparisonVariantV1 | undefined;
}) {
  return (
    <article className="rounded-md border border-beige-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="font-inter text-base font-semibold text-charcoal">{title}</h4>
        <Badge className="border-0 bg-charcoal text-[10px] text-white">{badge}</Badge>
      </div>
      <MetricRows metrics={metrics} variant={variant} />
    </article>
  );
}

/** Side-by-side scenario comparison against the authoritative economics baseline. */
export function ScenarioComparisonTable({ comparison }: ScenarioComparisonTableProps) {
  const baseline = comparison.baseline;
  const hasComparablePayload =
    comparison.comparisonStatus === 'comparable' &&
    baseline != null &&
    comparison.variants.length > 0;

  return (
    <section className="space-y-4" data-testid="scenario-comparison-table">
      <div className="space-y-1">
        <h3 className="font-inter text-base font-semibold text-charcoal">Scenario Comparison</h3>
        <p className="text-sm text-charcoal-500 font-poppins">
          {comparison.scenarioSet.name} · Source config v
          {comparison.scenarioSet.sourceConfigVersion} · {formatStatus(comparison.staleness)}
        </p>
      </div>

      {!hasComparablePayload && (
        <div className="rounded-md border border-beige-200 bg-beige-50 p-4">
          <p className="text-sm text-charcoal-600 font-poppins">{statusCopy(comparison)}</p>
        </div>
      )}

      {hasComparablePayload && baseline && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricsCard
            title={baseline.label ?? 'Authoritative baseline'}
            badge="BASELINE"
            metrics={baseline.metrics}
          />
          {comparison.variants.map((variant) => (
            <MetricsCard
              key={variant.variantId}
              title={variant.name}
              badge="FEE PROFILE"
              metrics={variant.metrics}
              variant={variant}
            />
          ))}
        </div>
      )}
    </section>
  );
}
