/**
 * Shared formatting helpers for the sensitivity component family.
 *
 * Pure functions only -- no React, no hooks, no JSX. Extracted verbatim from
 * the original inline helpers in OneWayPanel.tsx so other sensitivity panels
 * (tornado, two-way, scenario) can reuse the same rendering without drift.
 */

import type {
  SensitivityMetricDefinition,
  SensitivityVariableDefinition,
} from '@shared/contracts/sensitivity-variables-v1';

export function formatRatio(value: number): string {
  return value.toFixed(3);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDecimal(value: number): string {
  return value.toFixed(2);
}

export function formatYears(value: number): string {
  return `${value.toFixed(0)} yrs`;
}

export function formatMetricValue(value: number, metric: SensitivityMetricDefinition): string {
  switch (metric.formatter) {
    case 'percent':
      return formatPercent(value);
    case 'ratio':
      return formatDecimal(value);
    case 'currency':
      return `$${value.toLocaleString()}`;
    case 'decimal':
    default:
      return formatDecimal(value);
  }
}

export function formatVariableValue(
  value: number,
  variable: SensitivityVariableDefinition
): string {
  switch (variable.unit) {
    case 'ratio':
      return formatPercent(value);
    case 'years':
      return formatYears(value);
    case 'dollars':
      return `$${value.toLocaleString()}`;
    case 'count':
    default:
      return formatRatio(value);
  }
}
