import type { MetricAvailabilityDetail } from '@shared/types/metrics';

export interface FundHeaderSource {
  size: number;
  vintageYear?: number | null;
  termYears?: number | null;
}

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

export type CompactKpiKey = 'deployed' | 'remaining' | 'nav' | 'tvpi' | 'dpi' | 'netIrr';
export type CompactKpiValueType = 'currency' | 'multiple' | 'percentage';

export interface CompactKpiItemModel {
  key: CompactKpiKey;
  label: string;
  icon: HeaderMetricIcon;
  colorClassName: string;
  description: string;
  isSelected: boolean;
  displayValue: string;
  explanation: string;
}

export type CompactKpiSelectedModel = CompactKpiItemModel;

export interface CompactHeaderViewModel {
  items: CompactKpiItemModel[];
  selected: CompactKpiSelectedModel;
  isLoading: boolean;
  fundName: string;
}

export interface HeaderMetrics {
  totalCommitted: number;
  totalInvested: number | null;
  currentNAV: number | null;
  totalValue: number | null;
  irr: number | null;
  moic: number | null;
  dpi: number | null;
  tvpi: number | null;
  activeInvestments: number | null;
  exited: number;
  avgCheckSize: number | null;
  deploymentRate: number | null;
  remainingDeployableCapital: number | null;
  availability: {
    nav: MetricAvailabilityDetail;
    irr: MetricAvailabilityDetail;
    dpi: MetricAvailabilityDetail;
  };
}

export interface CompactKpiDefinition {
  key: CompactKpiKey;
  label: string;
  icon: HeaderMetricIcon;
  colorClassName: string;
  description: string;
  valueType: CompactKpiValueType;
}
