import type { Fund } from '@/contexts/FundContext';
import { formatDPI } from '@/lib/format-metrics';
import type {
  ActualMetrics,
  MetricAvailabilityDetail,
  UnifiedFundMetrics,
} from '@shared/types/metrics';

export type HeaderMetricIcon =
  | 'activity'
  | 'bar-chart'
  | 'calendar'
  | 'dollar'
  | 'pie-chart'
  | 'target'
  | 'trending-up';

export type HeaderMetricTheme = 'white' | 'beige';

export interface HeaderMetricCardModel {
  key: string;
  title: string;
  displayValue: string;
  titleText?: string | undefined;
  theme: HeaderMetricTheme;
  icon: HeaderMetricIcon;
}

export interface FundHeaderViewModel {
  fundSizeText: string;
  vintageText: string;
  termText: string | null;
  deploymentBadgeText: string;
  lastUpdatedText: string;
  statusIndicatorClassName: string;
  statusIndicatorText: string;
  cards: HeaderMetricCardModel[];
}

export type CompactKpiKey = 'dpi' | 'tvpi' | 'nav';

export interface CompactKpiItemModel {
  key: CompactKpiKey;
  label: string;
  icon: HeaderMetricIcon;
  colorClassName: string;
  description: string;
  isSelected: boolean;
}

export interface CompactKpiSelectedModel extends CompactKpiItemModel {
  displayValue: string;
}

export interface CompactHeaderViewModel {
  items: CompactKpiItemModel[];
  selected: CompactKpiSelectedModel;
  isLoading: boolean;
  fundName: string;
}

interface HeaderMetrics {
  totalCommitted: number;
  totalInvested: number | null;
  totalValue: number | null;
  irr: number | null;
  moic: number | null;
  dpi: number | null;
  tvpi: number | null;
  activeInvestments: number | null;
  exited: number;
  avgCheckSize: number | null;
  deploymentRate: number | null;
  remainingCapital: number | null;
  availability: {
    irr: MetricAvailabilityDetail;
    dpi: MetricAvailabilityDetail;
  };
}

interface CompactKpiDefinition {
  key: CompactKpiKey;
  label: string;
  icon: HeaderMetricIcon;
  colorClassName: string;
  description: string;
  isCurrency: boolean;
}

const COMPACT_KPI_KEYS: CompactKpiKey[] = ['dpi', 'tvpi', 'nav'];

const COMPACT_KPI_DEFINITIONS: Record<CompactKpiKey, CompactKpiDefinition> = {
  dpi: {
    key: 'dpi',
    label: 'DPI',
    icon: 'dollar',
    colorClassName: 'text-green-600',
    description: 'Distributions to Paid-In',
    isCurrency: false,
  },
  tvpi: {
    key: 'tvpi',
    label: 'TVPI',
    icon: 'trending-up',
    colorClassName: 'text-blue-600',
    description: 'Total Value to Paid-In',
    isCurrency: false,
  },
  nav: {
    key: 'nav',
    label: 'NAV',
    icon: 'target',
    colorClassName: 'text-purple-600',
    description: 'Net Asset Value',
    isCurrency: true,
  },
};

export function shouldFetchHeaderMetrics(currentFund: Fund | null, useCompactHeader: boolean) {
  if (!currentFund) return false;
  if (useCompactHeader) return false;
  return currentFund.id != null;
}

export function shouldFetchCompactMetrics(currentFund: Fund | null) {
  if (!currentFund) return false;
  return currentFund.id != null;
}

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

export function buildFundHeaderViewModel(
  fund: Fund,
  metrics: UnifiedFundMetrics | undefined,
  metricsLoading: boolean,
  metricsError: boolean
): FundHeaderViewModel {
  const displayMetrics = toHeaderMetrics(fund.size, metrics);
  const metricUnavailable = isMetricsUnavailable(metricsLoading, metricsError, metrics);
  const metricDisplayUnavailable = isMetricDisplayUnavailable(metricsLoading, metricUnavailable);

  return {
    fundSizeText: formatCurrency(fund.size),
    vintageText: formatVintage(fund.vintageYear),
    termText: formatTerm(fund.termYears),
    deploymentBadgeText: getDeploymentBadgeText(
      metricsLoading,
      metricUnavailable,
      displayMetrics.deploymentRate
    ),
    lastUpdatedText: getLastUpdatedText(metricsLoading, metricUnavailable, metrics?.lastUpdated),
    statusIndicatorClassName: getStatusIndicatorClassName(metricUnavailable),
    statusIndicatorText: getStatusIndicatorText(metricsLoading, metricUnavailable),
    cards: buildHeaderMetricCards(displayMetrics, metricDisplayUnavailable),
  };
}

export function buildCompactHeaderViewModel(
  fundName: string,
  actual: ActualMetrics | undefined,
  selectedKpi: CompactKpiKey,
  isLoading: boolean,
  hasError: boolean
): CompactHeaderViewModel {
  return {
    items: COMPACT_KPI_KEYS.map((key) => buildCompactKpiItem(key, selectedKpi)),
    selected: buildSelectedCompactKpi(selectedKpi, actual, hasError),
    isLoading,
    fundName,
  };
}

function toHeaderMetrics(currentFundSize: number, metrics: UnifiedFundMetrics | undefined) {
  const actual = metrics?.actual;
  if (!actual) return emptyHeaderMetrics(currentFundSize);
  return actualHeaderMetrics(currentFundSize, actual);
}

function emptyHeaderMetrics(currentFundSize: number): HeaderMetrics {
  return {
    totalCommitted: currentFundSize,
    totalInvested: null,
    totalValue: null,
    irr: null,
    moic: null,
    dpi: null,
    tvpi: null,
    activeInvestments: null,
    exited: 0,
    avgCheckSize: null,
    deploymentRate: null,
    remainingCapital: null,
    availability: {
      irr: unavailableMetric('cashflows', 'Metrics unavailable'),
      dpi: unavailableMetric('distributions', 'Metrics unavailable'),
    },
  };
}

function actualHeaderMetrics(currentFundSize: number, actual: ActualMetrics): HeaderMetrics {
  const totalInvested = nullableNumber(actual.totalDeployed);
  const totalValue = getTotalValue(actual);

  return {
    totalCommitted: numberWithFallback(actual.totalCommitted, currentFundSize),
    totalInvested,
    totalValue,
    irr: nullableNumber(actual.irr),
    moic: calculateMoic(totalInvested, totalValue),
    dpi: nullableNumber(actual.dpi),
    tvpi: getTvpi(actual),
    activeInvestments: nullableNumber(actual.activeCompanies),
    exited: numberWithFallback(actual.exitedCompanies, 0),
    avgCheckSize: nullableNumber(actual.averageCheckSize),
    deploymentRate: nullableNumber(actual.deploymentRate),
    remainingCapital: nullableNumber(actual.totalUncalled),
    availability: {
      irr: getIrrAvailability(actual),
      dpi: getDpiAvailability(actual),
    },
  };
}

function getIrrAvailability(actual: ActualMetrics): MetricAvailabilityDetail {
  if (actual.availability?.irr) return actual.availability.irr;
  if (actual.irr == null) {
    return unavailableMetric(
      'cashflows',
      'Insufficient cash-flow history',
      'insufficient_dated_cashflows'
    );
  }
  return { status: 'available', source: 'cashflows' };
}

function getDpiAvailability(actual: ActualMetrics): MetricAvailabilityDetail {
  if (actual.availability?.dpi) return actual.availability.dpi;
  if (actual.dpi == null) {
    return unavailableMetric(
      'distributions',
      'No distributions recorded',
      'no_distributions_recorded'
    );
  }
  return { status: 'available', source: 'distributions' };
}

function getCompactDpiAvailability(actual: ActualMetrics): MetricAvailabilityDetail | undefined {
  if (actual.availability?.dpi) return actual.availability.dpi;
  if (actual.dpi == null) {
    return unavailableMetric(
      'distributions',
      'No distributions recorded',
      'no_distributions_recorded'
    );
  }
  return undefined;
}

function getTotalValue(actual: ActualMetrics) {
  const totalValue = nullableNumber(actual.totalValue);
  if (totalValue != null) return totalValue;
  return nullableNumber(actual.currentNAV);
}

function getTvpi(actual: ActualMetrics) {
  if (actual.totalCalled == null) return null;
  if (actual.totalCalled <= 0) return null;
  return nullableNumber(actual.tvpi);
}

function calculateMoic(totalInvested: number | null, totalValue: number | null) {
  if (totalInvested == null) return null;
  if (totalInvested <= 0) return null;
  if (totalValue == null) return null;
  return totalValue / totalInvested;
}

function nullableNumber(value: number | null | undefined) {
  return value ?? null;
}

function numberWithFallback(value: number | null | undefined, fallback: number) {
  return value ?? fallback;
}

function isMetricsUnavailable(
  metricsLoading: boolean,
  metricsError: boolean,
  metrics: UnifiedFundMetrics | undefined
) {
  if (metricsError) return true;
  if (metricsLoading) return false;
  return metrics?.actual == null;
}

function isMetricDisplayUnavailable(metricsLoading: boolean, metricUnavailable: boolean) {
  return metricsLoading || metricUnavailable;
}

function buildHeaderMetricCards(
  metrics: HeaderMetrics,
  metricDisplayUnavailable: boolean
): HeaderMetricCardModel[] {
  return [
    {
      key: 'totalInvested',
      title: 'Total Invested',
      displayValue: formatMetricCurrency(metrics.totalInvested, metricDisplayUnavailable),
      theme: 'white',
      icon: 'dollar',
    },
    {
      key: 'totalValue',
      title: 'Current Value',
      displayValue: formatMetricCurrency(metrics.totalValue, metricDisplayUnavailable),
      theme: 'beige',
      icon: 'trending-up',
    },
    {
      key: 'irr',
      title: 'Net IRR',
      displayValue: formatPerformanceMetric(
        metrics.irr,
        metrics.availability.irr,
        formatPercentage,
        metricDisplayUnavailable
      ),
      titleText: metrics.availability.irr.message,
      theme: 'white',
      icon: 'bar-chart',
    },
    {
      key: 'tvpi',
      title: 'TVPI',
      displayValue: formatMetricMultiple(metrics.tvpi, metricDisplayUnavailable),
      theme: 'beige',
      icon: 'target',
    },
    {
      key: 'dpi',
      title: 'DPI',
      displayValue: formatPerformanceMetric(
        metrics.dpi,
        metrics.availability.dpi,
        formatDPI,
        metricDisplayUnavailable
      ),
      titleText: metrics.availability.dpi.message,
      theme: 'white',
      icon: 'pie-chart',
    },
    {
      key: 'activeInvestments',
      title: 'Active',
      displayValue: formatMetricCount(metrics.activeInvestments, metricDisplayUnavailable),
      theme: 'beige',
      icon: 'activity',
    },
    {
      key: 'avgCheckSize',
      title: 'Avg Check',
      displayValue: formatMetricCurrency(metrics.avgCheckSize, metricDisplayUnavailable),
      theme: 'white',
      icon: 'dollar',
    },
    {
      key: 'remainingCapital',
      title: 'Remaining',
      displayValue: formatMetricCurrency(metrics.remainingCapital, metricDisplayUnavailable),
      theme: 'beige',
      icon: 'calendar',
    },
  ];
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '$0';

  const num = Number(value);
  if (Number.isNaN(num)) return '$0';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function formatMetricCurrency(value: number | null | undefined, metricDisplayUnavailable: boolean) {
  if (metricDisplayUnavailable) return 'N/A';
  if (value == null) return 'N/A';
  return formatCurrency(value);
}

function formatMetricCount(value: number | null | undefined, metricDisplayUnavailable: boolean) {
  if (metricDisplayUnavailable) return 'N/A';
  if (value == null) return 'N/A';
  return value.toLocaleString();
}

function formatMetricMultiple(value: number | null | undefined, metricDisplayUnavailable: boolean) {
  if (metricDisplayUnavailable) return 'N/A';
  if (value == null) return 'N/A';
  return `${value.toFixed(2)}x`;
}

function formatPerformanceMetric(
  value: number | null | undefined,
  availability: MetricAvailabilityDetail,
  formatter: (_value: number) => string,
  metricDisplayUnavailable: boolean
) {
  if (metricDisplayUnavailable) return 'N/A';
  if (isAvailableMetricValue(value, availability)) return formatter(value);
  return formatUnavailableMetric(availability);
}

function isAvailableMetricValue(
  value: number | null | undefined,
  availability: MetricAvailabilityDetail
): value is number {
  return value != null && availability.status === 'available';
}

function formatPercentage(value: number | null | undefined) {
  if (value == null) return 'N/A';

  const num = Number(value);
  if (Number.isNaN(num)) return 'N/A';

  const percent = Math.abs(num) <= 1 ? num * 100 : num;
  return `${percent.toFixed(1)}%`;
}

function formatVintage(vintageYear: number | null | undefined) {
  if (vintageYear == null) return 'N/A';
  return String(vintageYear);
}

function formatTerm(termYears: number | null | undefined) {
  if (!termYears) return null;
  return `Term: ${termYears} years`;
}

function getDeploymentBadgeText(
  metricsLoading: boolean,
  metricUnavailable: boolean,
  deploymentRate: number | null
) {
  if (metricsLoading) return 'Metrics loading';
  if (metricUnavailable) return 'Metrics unavailable';
  return `${formatDeploymentRate(deploymentRate)}% Deployed`;
}

function formatDeploymentRate(deploymentRate: number | null) {
  if (deploymentRate == null) return 'N/A';
  return deploymentRate.toFixed(0);
}

function getLastUpdatedText(
  metricsLoading: boolean,
  metricUnavailable: boolean,
  lastUpdated: string | undefined
) {
  if (metricsLoading) return 'Loading metrics';
  if (metricUnavailable) return 'Metrics source unavailable';
  return `Last updated: ${formatLastUpdated(lastUpdated)}`;
}

function formatLastUpdated(lastUpdated: string | undefined) {
  if (lastUpdated) return new Date(lastUpdated).toLocaleTimeString();
  return new Date().toLocaleTimeString();
}

function getStatusIndicatorClassName(metricUnavailable: boolean) {
  if (metricUnavailable) return 'bg-red-500';
  return 'bg-green-500 animate-pulse';
}

function getStatusIndicatorText(metricsLoading: boolean, metricUnavailable: boolean) {
  if (metricsLoading) return 'Metrics loading';
  if (metricUnavailable) return 'Metrics unavailable';
  return 'Live metrics';
}

function buildCompactKpiItem(key: CompactKpiKey, selectedKpi: CompactKpiKey): CompactKpiItemModel {
  const definition = COMPACT_KPI_DEFINITIONS[key];
  return {
    key,
    label: definition.label,
    icon: definition.icon,
    colorClassName: definition.colorClassName,
    description: definition.description,
    isSelected: key === selectedKpi,
  };
}

function buildSelectedCompactKpi(
  selectedKpi: CompactKpiKey,
  actual: ActualMetrics | undefined,
  hasError: boolean
): CompactKpiSelectedModel {
  const item = buildCompactKpiItem(selectedKpi, selectedKpi);
  const definition = COMPACT_KPI_DEFINITIONS[selectedKpi];
  const value = getCompactKpiValue(actual, selectedKpi);
  const availability = getCompactKpiAvailability(actual, selectedKpi);

  return {
    ...item,
    displayValue: formatCompactKpiDisplayValue(
      value,
      definition.isCurrency,
      availability,
      hasError
    ),
  };
}

function getCompactKpiValue(actual: ActualMetrics | undefined, selectedKpi: CompactKpiKey) {
  if (!actual) return null;

  switch (selectedKpi) {
    case 'dpi':
      return nullableNumber(actual.dpi);
    case 'tvpi':
      return getTvpi(actual);
    case 'nav':
      return nullableNumber(actual.currentNAV);
  }
}

function getCompactKpiAvailability(actual: ActualMetrics | undefined, selectedKpi: CompactKpiKey) {
  if (!actual) return undefined;
  if (selectedKpi !== 'dpi') return undefined;
  return getCompactDpiAvailability(actual);
}

function formatCompactKpiDisplayValue(
  value: number | null,
  isCurrency: boolean,
  availability: MetricAvailabilityDetail | undefined,
  hasError: boolean
) {
  if (hasError) return formatUnavailableMetric(availability);
  if (value == null) return formatUnavailableMetric(availability);
  if (isCurrency) return `$${(value / 1_000_000).toFixed(1)}M`;
  return value.toFixed(2);
}
