/**
 * ScenarioComparisonTable - ADR-022 scenario-set comparison cards.
 *
 * Renders one calculated fee-profile scenario set against the authoritative
 * economics baseline for that set's source configuration version.
 *
 * Delta subtitles reuse the cross-set table's direction-aware copy
 * (`scenarioDeltaCopy`) so the two surfaces never drift apart. The single-set
 * view additionally surfaces the backend percentage delta as an unsigned
 * magnitude (direction is already carried by the "Higher/Lower by" wording).
 *
 * @module client/components/fund-results/ScenarioComparisonTable
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  SCENARIO_COMPARISON_METRIC_KEYS,
  type FundScenarioComparisonV1,
  type ScenarioComparisonMetricDeltaV1,
  type ScenarioComparisonMetricKey,
  type ScenarioComparisonMetricValue,
  type ScenarioComparisonStalenessV1,
  type ScenarioComparisonUnavailableReasonV1,
  type ScenarioComparisonVariantV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import { scenarioDeltaCopy } from './CrossSetScenarioComparisonTable';

export { SCENARIO_COMPARISON_METRIC_KEYS };
export type { FundScenarioComparisonV1 };

export type ScenarioComparisonMetricKind = 'percent' | 'money' | 'multiple';

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

function formatMoney(value: number) {
  const sign = value < 0 ? '-' : '';
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

const SCENARIO_COMPARISON_UNAVAILABLE_COPY: Record<ScenarioComparisonUnavailableReasonV1, string> =
  {
    ECONOMICS_DISABLED: 'Scenario comparison unavailable because economics is disabled.',
    ECONOMICS_ASSUMPTIONS_MISSING:
      'Scenario comparison unavailable because economics assumptions are missing.',
    BASELINE_ECONOMICS_SNAPSHOT_MISSING:
      'Scenario calculated; comparison unavailable because baseline economics is missing.',
    BASELINE_ECONOMICS_SNAPSHOT_STALE:
      'Scenario calculated; comparison stale because baseline economics belongs to an older config.',
    VARIANT_ECONOMICS_FAILED:
      'Scenario calculated; comparison unavailable because variant economics failed.',
    SOURCE_CONFIG_STALE_UNPINNED:
      'Scenario comparison unavailable because the source config is stale.',
    UNSUPPORTED_OVERRIDE_TYPE: 'Scenario comparison unavailable for this override type.',
  };

function statusCopy(comparison: FundScenarioComparisonV1) {
  if (comparison.unavailableReason) {
    return SCENARIO_COMPARISON_UNAVAILABLE_COPY[comparison.unavailableReason];
  }
  if (comparison.comparisonStatus === 'no_scenario_results') {
    return 'Calculate this scenario set to compare it with the authoritative economics baseline.';
  }
  if (comparison.comparisonStatus === 'baseline_unavailable') {
    return `Authoritative economics baseline is unavailable for source config v${comparison.scenarioSet.sourceConfigVersion}.`;
  }
  if (comparison.comparisonStatus === 'unsupported_override_type') {
    return 'Scenario comparison is not supported for reserve-allocation scenario sets yet.';
  }
  return 'Scenario comparison is unavailable.';
}

function deltaForMetric(variant: ScenarioComparisonVariantV1, metric: ScenarioComparisonMetricKey) {
  return variant.metricDeltas.find((delta) => delta.metric === metric) ?? null;
}

function MetricDeltaText({
  metric,
  delta,
}: {
  metric: ScenarioComparisonMetricKey;
  delta: ScenarioComparisonMetricDeltaV1 | null;
}) {
  if (!delta) return null;

  const copy = scenarioDeltaCopy(metric, delta);
  const percent =
    delta.driftCapable &&
    delta.absoluteDelta != null &&
    delta.absoluteDelta !== 0 &&
    delta.percentageDelta != null &&
    delta.percentageDelta !== 0
      ? `${Math.abs(delta.percentageDelta).toFixed(1)}%`
      : null;

  return (
    <p className="text-xs font-poppins text-charcoal-500">
      {copy}
      {percent && <span className="text-charcoal-400"> · {percent}</span>}
    </p>
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
    <section className="space-y-3" data-testid="scenario-comparison-table">
      <div className="space-y-1">
        <h3 className="font-inter text-base font-semibold text-charcoal">Scenario Comparison</h3>
        <p className="text-sm text-charcoal-500 font-poppins">
          {comparison.scenarioSet.name} · Source config v
          {comparison.scenarioSet.sourceConfigVersion} · {formatStatus(comparison.staleness)}
        </p>
        {hasComparablePayload && (
          <p className="text-xs text-charcoal-400 font-poppins">
            Direction labels show arithmetic movement. They do not imply a universal good/bad
            judgment across LP and GP perspectives.
          </p>
        )}
      </div>

      {!hasComparablePayload && (
        <div className="rounded-md border border-beige-200 bg-beige-50 p-4">
          <p className="text-sm text-charcoal-600 font-poppins">{statusCopy(comparison)}</p>
        </div>
      )}

      {hasComparablePayload && baseline && (
        <div className="overflow-x-auto rounded-md border border-beige-200 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-beige-200">
                <th className="p-3 text-left text-xs uppercase text-charcoal-400 font-poppins">
                  Metric
                </th>
                <th className="p-3 text-right text-xs uppercase text-charcoal-400 font-poppins">
                  {baseline.label ?? 'Authoritative baseline'}
                </th>
                {comparison.variants.map((variant) => (
                  <th
                    key={variant.variantId}
                    className="p-3 text-right text-xs uppercase text-charcoal-400 font-poppins"
                  >
                    <span className="align-middle">{variant.name}</span>
                    <Badge className="ml-2 border-0 bg-charcoal text-[10px] text-white">
                      FEE PROFILE
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-200">
              {SCENARIO_COMPARISON_METRIC_KEYS.map((metric) => (
                <tr key={metric}>
                  <td className="p-3 text-xs uppercase text-charcoal-400 font-poppins">
                    {METRIC_DEFINITIONS[metric].label}
                  </td>
                  <td className="p-3 text-right">
                    <p className="font-inter text-base font-semibold tabular-nums text-charcoal">
                      {formatMetricValue(metric, baseline.metrics[metric])}
                    </p>
                  </td>
                  {comparison.variants.map((variant) => (
                    <td key={variant.variantId} className="p-3 text-right">
                      <p className="font-inter text-base font-semibold tabular-nums text-charcoal">
                        {formatMetricValue(metric, variant.metrics[metric])}
                      </p>
                      <MetricDeltaText metric={metric} delta={deltaForMetric(variant, metric)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
