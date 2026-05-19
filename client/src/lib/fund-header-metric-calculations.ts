import type {
  ActualMetrics,
  MetricAvailabilityDetail,
  UnifiedFundMetrics,
} from '@shared/types/metrics';
import type {
  CompactHeaderViewModel,
  CompactKpiDefinition,
  CompactKpiItemModel,
  CompactKpiKey,
  FundHeaderSource,
  FundHeaderViewModel,
  HeaderMetricCardModel,
  HeaderMetrics,
} from '@/types/fund-header-metrics';
import {
  formatCompactKpiDisplayValue,
  formatCurrency,
  formatDPI,
  formatDeploymentRate,
  formatLastUpdated,
  formatMetricCount,
  formatMetricCurrency,
  formatMetricMultiple,
  formatPercentage,
  formatPerformanceMetric,
  formatTerm,
  formatVintage,
  unavailableMetric,
} from '@/lib/fund-header-metric-formatters';

const COMPACT_KPI_KEYS: CompactKpiKey[] = ['deployed', 'remaining', 'nav', 'tvpi', 'dpi', 'netIrr'];

const COMPACT_KPI_DEFINITIONS: Record<CompactKpiKey, CompactKpiDefinition> = {
  deployed: {
    key: 'deployed',
    label: 'Deployed',
    icon: 'activity',
    colorClassName: 'text-slate-700',
    description: 'Capital deployed as a percentage of fund size',
    valueType: 'percentage',
  },
  remaining: {
    key: 'remaining',
    label: 'Remaining',
    icon: 'calendar',
    colorClassName: 'text-slate-700',
    description: 'Remaining deployable capital',
    valueType: 'currency',
  },
  nav: {
    key: 'nav',
    label: 'NAV',
    icon: 'target',
    colorClassName: 'text-slate-700',
    description: 'Net Asset Value',
    valueType: 'currency',
  },
  tvpi: {
    key: 'tvpi',
    label: 'TVPI',
    icon: 'trending-up',
    colorClassName: 'text-slate-700',
    description: 'Total Value to Paid-In',
    valueType: 'multiple',
  },
  dpi: {
    key: 'dpi',
    label: 'DPI',
    icon: 'dollar',
    colorClassName: 'text-slate-700',
    description: 'Distributions to Paid-In',
    valueType: 'multiple',
  },
  netIrr: {
    key: 'netIrr',
    label: 'Net IRR',
    icon: 'bar-chart',
    colorClassName: 'text-slate-700',
    description: 'Net internal rate of return',
    valueType: 'percentage',
  },
};

export function buildFundHeaderViewModel(
  fund: FundHeaderSource,
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
  currentFundSize: number,
  actual: ActualMetrics | undefined,
  selectedKpi: CompactKpiKey,
  isLoading: boolean,
  hasError: boolean
): CompactHeaderViewModel {
  const displayMetrics = actual
    ? actualHeaderMetrics(currentFundSize, actual)
    : emptyHeaderMetrics(currentFundSize);

  return {
    items: COMPACT_KPI_KEYS.map((key) =>
      buildCompactKpiItem(key, selectedKpi, displayMetrics, hasError)
    ),
    selected: buildCompactKpiItem(selectedKpi, selectedKpi, displayMetrics, hasError),
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
    currentNAV: null,
    totalValue: null,
    irr: null,
    moic: null,
    dpi: null,
    tvpi: null,
    activeInvestments: null,
    exited: 0,
    avgCheckSize: null,
    deploymentRate: null,
    remainingDeployableCapital: null,
    availability: {
      irr: unavailableMetric('cashflows', 'Metrics unavailable'),
      dpi: unavailableMetric('distributions', 'Metrics unavailable'),
    },
  };
}

function actualHeaderMetrics(currentFundSize: number, actual: ActualMetrics): HeaderMetrics {
  const totalCommitted = numberWithFallback(actual.totalCommitted, currentFundSize);
  const totalInvested = nullableNumber(actual.totalDeployed);
  const currentNAV = nullableNumber(actual.currentNAV);
  const totalValue = getTotalValue(actual);

  return {
    totalCommitted,
    totalInvested,
    currentNAV,
    totalValue,
    irr: nullableNumber(actual.irr),
    moic: calculateMoic(totalInvested, totalValue),
    dpi: nullableNumber(actual.dpi),
    tvpi: getTvpi(actual),
    activeInvestments: nullableNumber(actual.activeCompanies),
    exited: numberWithFallback(actual.exitedCompanies, 0),
    avgCheckSize: nullableNumber(actual.averageCheckSize),
    deploymentRate: nullableNumber(actual.deploymentRate),
    remainingDeployableCapital: calculateRemainingDeployableCapital(totalCommitted, totalInvested),
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

function calculateRemainingDeployableCapital(totalCommitted: number, totalInvested: number | null) {
  if (totalInvested == null) return null;
  return totalCommitted - totalInvested;
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
      key: 'deployed',
      title: 'Deployed',
      displayValue: metricDisplayUnavailable ? 'N/A' : formatPercentage(metrics.deploymentRate),
      theme: 'white',
      icon: 'activity',
    },
    {
      key: 'totalInvested',
      title: 'Total Invested',
      displayValue: formatMetricCurrency(metrics.totalInvested, metricDisplayUnavailable),
      theme: 'beige',
      icon: 'dollar',
    },
    {
      key: 'totalValue',
      title: 'Current Value',
      displayValue: formatMetricCurrency(metrics.totalValue, metricDisplayUnavailable),
      theme: 'white',
      icon: 'target',
    },
    {
      key: 'activeInvestments',
      title: 'Active',
      displayValue: formatMetricCount(metrics.activeInvestments, metricDisplayUnavailable),
      theme: 'beige',
      icon: 'activity',
    },
    {
      key: 'remainingCapital',
      title: 'Remaining',
      displayValue: formatMetricCurrency(
        metrics.remainingDeployableCapital,
        metricDisplayUnavailable
      ),
      theme: 'white',
      icon: 'calendar',
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
      key: 'irr',
      title: 'Net IRR',
      displayValue: formatPerformanceMetric(
        metrics.irr,
        metrics.availability.irr,
        formatPercentage,
        metricDisplayUnavailable
      ),
      titleText: metrics.availability.irr.message,
      theme: 'beige',
      icon: 'bar-chart',
    },
  ];
}

function getDeploymentBadgeText(
  metricsLoading: boolean,
  metricUnavailable: boolean,
  deploymentRate: number | null
) {
  if (metricsLoading) return 'Metrics loading';
  if (metricUnavailable) return 'Metrics unavailable';
  if (deploymentRate === 0) return 'Awaiting deployment';
  return `${formatDeploymentRate(deploymentRate)}% Deployed`;
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

function getStatusIndicatorClassName(metricUnavailable: boolean) {
  if (metricUnavailable) return 'bg-red-500';
  return 'bg-green-500 animate-pulse';
}

function getStatusIndicatorText(metricsLoading: boolean, metricUnavailable: boolean) {
  if (metricsLoading) return 'Metrics loading';
  if (metricUnavailable) return 'Metrics unavailable';
  return 'Live metrics';
}

function buildCompactKpiItem(
  key: CompactKpiKey,
  selectedKpi: CompactKpiKey,
  metrics: HeaderMetrics,
  hasError: boolean
): CompactKpiItemModel {
  const definition = COMPACT_KPI_DEFINITIONS[key];
  const value = getCompactKpiValue(metrics, key);
  const availability = getCompactKpiAvailability(metrics, key);

  return {
    key,
    label: definition.label,
    icon: definition.icon,
    colorClassName: definition.colorClassName,
    description: definition.description,
    isSelected: key === selectedKpi,
    displayValue: formatCompactKpiDisplayValue(value, definition.valueType, availability, hasError),
    explanation: getCompactKpiExplanation(key, value, availability, hasError),
  };
}

function getCompactKpiExplanation(
  selectedKpi: CompactKpiKey,
  value: number | null,
  availability: MetricAvailabilityDetail | undefined,
  hasError: boolean
) {
  if (hasError) {
    return 'Metrics unavailable because the live metrics source is unavailable.';
  }
  if (availability?.status === 'unavailable') {
    if (availability.reason === 'no_distributions_recorded') {
      return 'DPI is unavailable because no distributions have been recorded.';
    }
    if (availability.reason === 'insufficient_dated_cashflows') {
      return 'This metric needs more dated cash-flow history.';
    }
    return availability.message ?? COMPACT_KPI_DEFINITIONS[selectedKpi].description;
  }
  if (value !== null) return COMPACT_KPI_DEFINITIONS[selectedKpi].description;
  if (selectedKpi === 'tvpi') {
    return 'TVPI is unavailable until paid-in capital is available.';
  }
  if (selectedKpi === 'nav') {
    return 'NAV is unavailable until current NAV has been recorded.';
  }
  if (selectedKpi === 'remaining') {
    return 'Remaining capital is unavailable until deployed capital is available.';
  }
  if (selectedKpi === 'deployed') {
    return 'Deployment percentage is unavailable until deployment data is available.';
  }
  return COMPACT_KPI_DEFINITIONS[selectedKpi].description;
}

function getCompactKpiValue(metrics: HeaderMetrics, selectedKpi: CompactKpiKey) {
  switch (selectedKpi) {
    case 'deployed':
      return metrics.deploymentRate;
    case 'remaining':
      return metrics.remainingDeployableCapital;
    case 'nav':
      return metrics.currentNAV;
    case 'tvpi':
      return metrics.tvpi;
    case 'dpi':
      return metrics.dpi;
    case 'netIrr':
      return metrics.irr;
  }
}

function getCompactKpiAvailability(metrics: HeaderMetrics, selectedKpi: CompactKpiKey) {
  if (selectedKpi === 'dpi') return metrics.availability.dpi;
  if (selectedKpi === 'netIrr') return metrics.availability.irr;
  return undefined;
}
