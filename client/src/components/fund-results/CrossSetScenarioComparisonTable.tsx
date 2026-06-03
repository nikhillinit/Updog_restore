/**
 * CrossSetScenarioComparisonTable - ADR-022 cross-set scenario comparison.
 *
 * Compares multiple calculated fee-profile scenario SETS side-by-side: one column
 * per fee-profile variant, grouped under its scenario set. Every delta stays scoped
 * to that set's own pinned authoritative baseline (the server-provided metricDeltas);
 * this component never computes a cross-set delta.
 *
 * @module client/components/fund-results/CrossSetScenarioComparisonTable
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  SCENARIO_COMPARISON_METRIC_KEYS,
  type FundScenarioComparisonV1,
  type ScenarioComparisonMetricDeltaV1,
  type ScenarioComparisonMetricKey,
  type ScenarioComparisonMetricMap,
  type ScenarioComparisonMetricValue,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type { ScenarioEvidenceStateV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  scenarioCalculatedTimestamp,
  scenarioStateClasses,
} from '@/components/results/scenario-evidence';
import {
  comparisonEvidenceState,
  comparisonPublishedConfigVersion,
} from './scenario-comparison-evidence';

export type ScenarioComparisonMetricKind = 'percent' | 'money' | 'multiple';
type MetricDirection = 'higher_better' | 'lower_better' | 'neutral';

interface MetricDefinition {
  label: string;
  kind: ScenarioComparisonMetricKind;
  direction: MetricDirection;
}

export const CROSS_SET_METRIC_DEFINITIONS = {
  lpNetIrr: { label: 'Net LP IRR', kind: 'percent', direction: 'higher_better' },
  gpNetIrr: { label: 'Net GP IRR', kind: 'percent', direction: 'higher_better' },
  totalManagementFees: { label: 'Management Fees', kind: 'money', direction: 'lower_better' },
  totalGpCarryDistributed: { label: 'GP Carry', kind: 'money', direction: 'neutral' },
  totalGpFeeIncome: { label: 'GP Fee Income', kind: 'money', direction: 'neutral' },
  finalDpi: { label: 'DPI', kind: 'multiple', direction: 'higher_better' },
  finalTvpi: { label: 'TVPI', kind: 'multiple', direction: 'higher_better' },
  finalClawbackDue: { label: 'Clawback Due', kind: 'money', direction: 'lower_better' },
} satisfies Record<ScenarioComparisonMetricKey, MetricDefinition>;

/** Above this many variant columns, the table switches to horizontal scroll. */
export const CROSS_SET_VARIANT_COLUMN_SOFT_LIMIT = 8;

// These tables currently render only fee-profile variants; keying the badge by
// overrideType prevents future non-fee-profile sets from being mislabeled silently.
const VARIANT_OVERRIDE_TYPE_BADGE_LABELS: Record<
  FundScenarioComparisonV1['variants'][number]['overrideType'],
  string
> = {
  fee_profile: 'FEE PROFILE',
};

export interface CrossSetScenarioComparisonTableProps {
  comparisons: FundScenarioComparisonV1[];
}

interface VariantColumn {
  key: string;
  scenarioSetId: string;
  scenarioSetName: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  variantName: string;
  overrideType: FundScenarioComparisonV1['variants'][number]['overrideType'];
  metrics: ScenarioComparisonMetricMap;
  metricDeltas: ScenarioComparisonMetricDeltaV1[];
  evidenceState: ScenarioEvidenceStateV1;
  calculatedAt: string | null;
  publishedConfigVersion: number | null;
}

interface ScenarioSetGroup {
  scenarioSetId: string;
  scenarioSetName: string;
  sourceConfigVersion: number;
  evidenceState: ScenarioEvidenceStateV1;
  calculatedAt: string | null;
  publishedConfigVersion: number | null;
  columns: VariantColumn[];
}

export function isComparableFeeProfileComparison(comparison: FundScenarioComparisonV1): boolean {
  return (
    comparison.comparisonStatus === 'comparable' &&
    comparison.baseline != null &&
    comparison.variants.length > 0
  );
}

function toVariantColumns(comparisons: FundScenarioComparisonV1[]): VariantColumn[] {
  const columns: VariantColumn[] = [];
  for (const comparison of comparisons) {
    if (!isComparableFeeProfileComparison(comparison)) continue;
    const evidenceState = comparisonEvidenceState(comparison);
    const publishedConfigVersion = comparisonPublishedConfigVersion(comparison);
    for (const variant of comparison.variants) {
      columns.push({
        key: `${comparison.scenarioSet.scenarioSetId}:${variant.variantId}`,
        scenarioSetId: comparison.scenarioSet.scenarioSetId,
        scenarioSetName: comparison.scenarioSet.name,
        sourceConfigId: comparison.scenarioSet.sourceConfigId,
        sourceConfigVersion: comparison.scenarioSet.sourceConfigVersion,
        variantName: variant.name,
        overrideType: variant.overrideType,
        metrics: variant.metrics,
        metricDeltas: variant.metricDeltas,
        evidenceState,
        calculatedAt: comparison.calculatedAt,
        publishedConfigVersion,
      });
    }
  }
  return columns;
}

function groupColumns(columns: VariantColumn[]): ScenarioSetGroup[] {
  const groups: ScenarioSetGroup[] = [];
  for (const column of columns) {
    let group = groups.find((candidate) => candidate.scenarioSetId === column.scenarioSetId);
    if (!group) {
      group = {
        scenarioSetId: column.scenarioSetId,
        scenarioSetName: column.scenarioSetName,
        sourceConfigVersion: column.sourceConfigVersion,
        evidenceState: column.evidenceState,
        calculatedAt: column.calculatedAt,
        publishedConfigVersion: column.publishedConfigVersion,
        columns: [],
      };
      groups.push(group);
    }
    group.columns.push(column);
  }
  return groups;
}

function hasMixedSourceConfigs(columns: VariantColumn[]): boolean {
  const first = columns[0];
  if (!first) return false;
  return columns.some(
    (column) =>
      column.sourceConfigId !== first.sourceConfigId ||
      column.sourceConfigVersion !== first.sourceConfigVersion
  );
}

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(0)}K`;
  return `${sign}$${absolute.toFixed(0)}`;
}

function formatValue(
  metric: ScenarioComparisonMetricKey,
  value: ScenarioComparisonMetricValue
): string {
  if (value == null) return 'N/A';
  const kind = CROSS_SET_METRIC_DEFINITIONS[metric].kind;
  if (kind === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (kind === 'money') return formatMoney(value);
  return `${value.toFixed(2)}x`;
}

function formatMagnitude(metric: ScenarioComparisonMetricKey, absoluteValue: number): string {
  const kind = CROSS_SET_METRIC_DEFINITIONS[metric].kind;
  if (kind === 'percent') return `${(absoluteValue * 100).toFixed(1)} pts`;
  if (kind === 'money') return formatMoney(absoluteValue);
  return `${absoluteValue.toFixed(2)}x`;
}

function deltaForMetric(column: VariantColumn, metric: ScenarioComparisonMetricKey) {
  return column.metricDeltas.find((delta) => delta.metric === metric) ?? null;
}

export function scenarioDeltaCopy(
  metric: ScenarioComparisonMetricKey,
  delta: ScenarioComparisonMetricDeltaV1
): string {
  if (!delta.driftCapable) {
    switch (delta.driftReason) {
      case 'missing_baseline':
        return 'Baseline unavailable';
      case 'missing_scenario':
        return 'Scenario value unavailable';
      case 'missing_both':
        return 'Baseline and scenario unavailable';
      case 'zero_baseline':
        return 'Baseline is zero; percentage delta unavailable';
      default:
        return 'Delta unavailable';
    }
  }
  const absolute = delta.absoluteDelta;
  if (absolute == null) return 'Delta unavailable';
  if (absolute === 0) return 'No change';
  const magnitude = formatMagnitude(metric, Math.abs(absolute));
  return absolute > 0 ? `Higher by +${magnitude}` : `Lower by -${magnitude}`;
}

/** Cross-set side-by-side comparison of fee-profile scenario variants. */
export function CrossSetScenarioComparisonTable({
  comparisons,
}: CrossSetScenarioComparisonTableProps) {
  const columns = toVariantColumns(comparisons);

  if (columns.length === 0) {
    return (
      <section className="space-y-4" data-testid="cross-set-scenario-comparison-table">
        <div className="rounded-md border border-beige-200 bg-beige-50 p-4">
          <div className="flex gap-3">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 flex-none text-charcoal-400"
            />
            <div className="space-y-1">
              <p className="text-sm text-charcoal-600 font-poppins">
                No comparable fee-profile scenario variants to compare.
              </p>
              <p className="text-xs text-charcoal-500 font-poppins">
                Calculate a scenario set to compare.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const groups = groupColumns(columns);
  const mixedSourceConfigs = hasMixedSourceConfigs(columns);
  const isWide = columns.length > CROSS_SET_VARIANT_COLUMN_SOFT_LIMIT;

  return (
    <section className="space-y-3" data-testid="cross-set-scenario-comparison-table">
      <div className="space-y-1">
        <h3 className="font-inter text-base font-semibold text-charcoal">Scenario Comparison</h3>
        <p className="text-sm text-charcoal-500 font-poppins">
          Showing {columns.length} fee-profile {columns.length === 1 ? 'variant' : 'variants'}{' '}
          across {groups.length} scenario {groups.length === 1 ? 'set' : 'sets'}.
        </p>
        <p className="text-xs text-charcoal-400 font-poppins">
          Direction labels show arithmetic movement. They do not imply a universal good/bad judgment
          across LP and GP perspectives.
        </p>
      </div>

      {mixedSourceConfigs && (
        <div
          className="rounded-md border border-beige-200 bg-beige-50 p-3"
          data-testid="cross-set-source-config-warning"
        >
          <p className="text-xs text-charcoal-600 font-poppins">
            Scenario sets use different source configs. Values are shown side-by-side, but each
            delta is calculated against that set's own pinned authoritative baseline.
          </p>
        </div>
      )}

      <div
        data-testid="cross-set-comparison-scroll"
        className={cn('rounded-md border border-beige-200 bg-white', isWide && 'overflow-x-auto')}
      >
        <table className={cn('border-collapse', isWide ? 'w-max min-w-full' : 'w-full')}>
          <thead>
            <tr className="border-b border-beige-200">
              <th
                className={cn(
                  'p-3 text-left text-xs uppercase text-charcoal-400 font-poppins',
                  isWide && 'sticky left-0 bg-white'
                )}
              >
                Metric
              </th>
              {groups.map((group) => (
                <th
                  key={group.scenarioSetId}
                  colSpan={group.columns.length}
                  className="p-3 text-left text-xs uppercase text-charcoal-400 font-poppins"
                >
                  <span className="align-middle">{group.scenarioSetName}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-2 align-middle font-poppins uppercase',
                      scenarioStateClasses(group.evidenceState)
                    )}
                  >
                    {group.evidenceState}
                  </Badge>
                  <span className="ml-2 normal-case text-charcoal-400">
                    Source config v{group.sourceConfigVersion}
                  </span>
                  {group.publishedConfigVersion != null && (
                    <span className="ml-2 normal-case text-charcoal-400">
                      Published config v{group.publishedConfigVersion}
                    </span>
                  )}
                  {group.calculatedAt && (
                    <span className="ml-2 normal-case text-charcoal-400">
                      {scenarioCalculatedTimestamp(group.calculatedAt)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
            <tr className="border-b border-beige-200">
              <th className={cn('p-3', isWide && 'sticky left-0 bg-white')} aria-hidden="true" />
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'p-3 text-right text-xs text-charcoal-500 font-poppins',
                    isWide && 'whitespace-nowrap'
                  )}
                >
                  <span className="align-middle">{column.variantName}</span>
                  <Badge className="ml-2 border-0 bg-charcoal text-[10px] text-white">
                    {VARIANT_OVERRIDE_TYPE_BADGE_LABELS[column.overrideType]}
                  </Badge>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-beige-200">
            {SCENARIO_COMPARISON_METRIC_KEYS.map((metric) => (
              <tr key={metric}>
                <td
                  className={cn(
                    'p-3 text-xs uppercase text-charcoal-400 font-poppins',
                    isWide && 'sticky left-0 bg-white whitespace-nowrap'
                  )}
                >
                  {CROSS_SET_METRIC_DEFINITIONS[metric].label}
                </td>
                {columns.map((column) => {
                  const delta = deltaForMetric(column, metric);
                  return (
                    <td
                      key={column.key}
                      className={cn('p-3 text-right', isWide && 'whitespace-nowrap')}
                    >
                      <p className="font-inter text-base font-semibold tabular-nums text-charcoal">
                        {formatValue(metric, column.metrics[metric])}
                      </p>
                      {delta && (
                        <p className="text-xs font-poppins text-charcoal-500">
                          {scenarioDeltaCopy(metric, delta)}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
