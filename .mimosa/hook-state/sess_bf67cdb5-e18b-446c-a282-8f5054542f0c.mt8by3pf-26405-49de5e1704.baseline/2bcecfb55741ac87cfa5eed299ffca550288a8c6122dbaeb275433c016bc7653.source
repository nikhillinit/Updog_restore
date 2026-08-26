/**
 * Pure formatting and lifecycle status helpers for the fund model results
 * route.
 *
 * Extracted unchanged from client/src/pages/fund-model-results.tsx.
 *
 * @module client/pages/fund-model-results/formatters
 */

import type { FundStateReadV1 } from '@shared/contracts/fund-state-read-v1.contract';
import type { MetricDelta } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { LifecycleStatus } from './types';

export function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function percentPoints(value: number) {
  return `${value}%`;
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatNullablePercent(value: number | null) {
  return value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

export function formatMultiple(value: number) {
  return `${value.toFixed(2)}x`;
}

export function formatDateOrFallback(value: string | null, fallback = 'Not available') {
  return value ? new Date(value).toLocaleDateString() : fallback;
}

export function formatLifecycleStatus(status: FundStateReadV1['calculationState']['status']) {
  switch (status) {
    case 'not_requested':
      return 'Not requested';
    case 'submitted':
      return 'Submitted';
    case 'calculating':
      return 'Calculating';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function formatHistoryRunStatus(status: LifecycleStatus | null) {
  if (!status) return 'Not started';
  return formatLifecycleStatus(status);
}

export function historyBadgeClasses(status: LifecycleStatus | null) {
  switch (status) {
    case 'ready':
      return 'bg-success-light text-success-dark border-success/30';
    case 'failed':
      return 'bg-error-light text-error-dark border-error/30';
    case 'submitted':
    case 'calculating':
      return 'bg-warning-light text-warning-dark border-warning/30';
    default:
      return 'bg-beige-100 text-charcoal-600 border-beige-200';
  }
}

export function formatComparisonMetricValue(metric: MetricDelta['metric'], value: number | null) {
  if (value == null) return 'Not available';

  switch (metric) {
    case 'fundSize':
      return `$${(value / 1_000_000).toFixed(0)}M`;
    case 'reserveRatio':
    case 'avgConfidence':
      return `${(value * 100).toFixed(1)}%`;
    case 'yearsToFullDeploy':
      return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} yrs`;
    default:
      return String(value);
  }
}

export function formatComparisonDelta(delta: MetricDelta) {
  if (delta.absoluteDelta == null) return 'No delta available';

  const sign = delta.absoluteDelta > 0 ? '+' : delta.absoluteDelta < 0 ? '-' : '';
  const magnitude = formatComparisonMetricValue(delta.metric, Math.abs(delta.absoluteDelta));

  if (delta.percentageDelta == null) {
    return `${sign}${magnitude}`;
  }

  const percentSign = delta.percentageDelta > 0 ? '+' : '';
  return `${sign}${magnitude} (${percentSign}${delta.percentageDelta.toFixed(1)}%)`;
}

export function formatDriftCapabilityReason(delta: MetricDelta) {
  switch (delta.driftReason) {
    case 'missing_both':
      return 'Current and previous values are unavailable.';
    case 'missing_current':
      return 'Current value is unavailable.';
    case 'missing_previous':
      return 'Previous value is unavailable.';
    case 'zero_previous':
      return 'Previous value is zero, so percentage drift is unstable.';
    case 'stable':
    default:
      return 'Drift is stable.';
  }
}

export function hasStaleEvidence(lifecycle: FundStateReadV1) {
  const publishedVersion = lifecycle.configState.publishedVersion;
  const calculationVersion = lifecycle.calculationState.configVersion;
  return (
    publishedVersion != null && calculationVersion != null && calculationVersion < publishedVersion
  );
}

export function diagnosticAlertClasses(tone: 'neutral' | 'warning' | 'danger' | 'success') {
  switch (tone) {
    case 'danger':
      return 'border-error/30 bg-error-light';
    case 'warning':
      return 'border-warning/30 bg-warning-light';
    case 'success':
      return 'border-success/30 bg-success-light';
    default:
      return 'border-beige-200 bg-beige-50';
  }
}
