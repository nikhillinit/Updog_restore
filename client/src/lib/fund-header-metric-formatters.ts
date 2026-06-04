import type { MetricAvailabilityDetail } from '@shared/types/metrics';
import type { CompactKpiValueType } from '@/types/fund-header-metrics';
import { formatDPI } from '@/lib/format-metrics';

export function unavailableMetric(
  source: MetricAvailabilityDetail['source'],
  message = 'Metric unavailable',
  reason = 'source_unavailable'
): MetricAvailabilityDetail {
  return {
    status: 'unavailable',
    source,
    reason,
    message,
  };
}

export function formatUnavailableMetric(availability: MetricAvailabilityDetail | undefined) {
  if (!availability) return 'N/A';
  if (availability.reason === 'no_distributions_recorded') return 'No distributions';
  if (availability.reason === 'insufficient_dated_cashflows') return 'Needs history';
  return availability.message ?? 'Unavailable';
}

export function formatCurrency(value: number | null | undefined) {
  if (value == null) return '$0';

  const num = Number(value);
  if (Number.isNaN(num)) return '$0';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

export function formatMetricCurrency(
  value: number | null | undefined,
  metricDisplayUnavailable: boolean
) {
  if (metricDisplayUnavailable) return 'N/A';
  if (value == null) return 'N/A';
  return formatCurrency(value);
}

export function formatMetricCount(
  value: number | null | undefined,
  metricDisplayUnavailable: boolean
) {
  if (metricDisplayUnavailable) return 'N/A';
  if (value == null) return 'N/A';
  return value.toLocaleString();
}

export function formatMetricMultiple(
  value: number | null | undefined,
  metricDisplayUnavailable: boolean
) {
  if (metricDisplayUnavailable) return 'N/A';
  if (value == null) return 'N/A';
  return `${value.toFixed(2)}x`;
}

export function formatPerformanceMetric(
  value: number | null | undefined,
  availability: MetricAvailabilityDetail,
  formatter: (_value: number) => string,
  metricDisplayUnavailable: boolean
) {
  if (metricDisplayUnavailable) return 'N/A';
  if (isAvailableMetricValue(value, availability)) return formatter(value);
  return formatUnavailableMetric(availability);
}

export function formatPercentage(value: number | null | undefined) {
  if (value == null) return 'N/A';

  const num = Number(value);
  if (Number.isNaN(num)) return 'N/A';

  const percent = Math.abs(num) <= 1 ? num * 100 : num;
  return `${percent.toFixed(1)}%`;
}

export function formatVintage(vintageYear: number | null | undefined) {
  if (vintageYear == null) return 'N/A';
  return String(vintageYear);
}

export function formatTerm(termYears: number | null | undefined) {
  if (!termYears) return null;
  return `Term: ${termYears} years`;
}

export function formatDeploymentRate(deploymentRate: number | null) {
  if (deploymentRate == null) return 'N/A';
  return deploymentRate.toFixed(0);
}

export function formatLastUpdated(lastUpdated: string | undefined) {
  if (lastUpdated) return new Date(lastUpdated).toLocaleTimeString();
  return new Date().toLocaleTimeString();
}

export function formatCompactKpiDisplayValue(
  value: number | null,
  valueType: CompactKpiValueType,
  availability: MetricAvailabilityDetail | undefined,
  hasError: boolean
) {
  if (hasError) return formatUnavailableMetric(availability);
  if (value == null) return formatUnavailableMetric(availability);
  if (valueType === 'currency') return `$${(value / 1_000_000).toFixed(1)}M`;
  if (valueType === 'percentage') return formatPercentage(value);
  return `${value.toFixed(2)}x`;
}

function isAvailableMetricValue(
  value: number | null | undefined,
  availability: MetricAvailabilityDetail
): value is number {
  return value != null && availability.status === 'available';
}

export { formatDPI };
