import type { Fund } from '@/contexts/FundContext';

export {
  buildCompactHeaderViewModel,
  buildFundHeaderViewModel,
} from '@/lib/fund-header-metric-calculations';
export { formatUnavailableMetric, unavailableMetric } from '@/lib/fund-header-metric-formatters';
export type {
  CompactHeaderViewModel,
  CompactKpiItemModel,
  CompactKpiKey,
  CompactKpiSelectedModel,
  FundHeaderViewModel,
  HeaderMetricCardModel,
  HeaderMetricIcon,
  HeaderMetricTheme,
} from '@/types/fund-header-metrics';

export function shouldFetchHeaderMetrics(currentFund: Fund | null, useCompactHeader: boolean) {
  if (!currentFund) return false;
  if (useCompactHeader) return false;
  return currentFund.id != null;
}

export function shouldFetchCompactMetrics(currentFund: Fund | null) {
  if (!currentFund) return false;
  return currentFund.id != null;
}
