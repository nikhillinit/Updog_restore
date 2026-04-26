import type { LucideIcon } from 'lucide-react';
import { DollarSign, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useFundContext } from '@/contexts/FundContext';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import {
  buildCompactHeaderViewModel,
  shouldFetchCompactMetrics,
  type CompactHeaderViewModel,
  type CompactKpiItemModel,
  type CompactKpiKey,
  type CompactKpiSelectedModel,
  type HeaderMetricIcon,
} from './fund-header-metrics';

const COMPACT_ICON_COMPONENTS: Partial<Record<HeaderMetricIcon, LucideIcon>> = {
  dollar: DollarSign,
  target: Target,
  'trending-up': TrendingUp,
};

function getButtonClassName(isSelected: boolean) {
  if (isSelected) return 'bg-slate-900 text-white shadow-sm';
  return 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200';
}

function CompactKpiButton({
  item,
  onSelect,
}: {
  item: CompactKpiItemModel;
  onSelect: (_key: CompactKpiKey) => void;
}) {
  return (
    <button
      key={item.key}
      onClick={() => onSelect(item.key)}
      className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${getButtonClassName(
        item.isSelected
      )}`}
      title={item.description}
    >
      {item.label}
    </button>
  );
}

function CompactKpiDisplay({
  selected,
  isLoading,
}: {
  selected: CompactKpiSelectedModel;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-7 w-24" />;

  return (
    <span className={`text-xl font-bold ${selected.colorClassName} live-pulse-kpi`}>
      {selected.displayValue}
    </span>
  );
}

function SelectedKpiPanel({ viewModel }: { viewModel: CompactHeaderViewModel }) {
  const Icon = COMPACT_ICON_COMPONENTS[viewModel.selected.icon] ?? DollarSign;

  return (
    <div className="flex items-center gap-2 ml-4 px-4 py-2 bg-white rounded-lg shadow-sm border border-slate-200">
      <Icon className={`h-5 w-5 ${viewModel.selected.colorClassName}`} />
      <span className="text-sm text-slate-600">{viewModel.selected.label}:</span>
      <CompactKpiDisplay selected={viewModel.selected} isLoading={viewModel.isLoading} />
    </div>
  );
}

export default function HeaderKpis() {
  const { currentFund } = useFundContext();
  const [selectedKPI, setSelectedKPI] = useState<CompactKpiKey>('dpi');
  const shouldFetchMetrics = shouldFetchCompactMetrics(currentFund);

  const {
    data: metrics,
    isLoading,
    error,
  } = useFundMetrics({
    enabled: shouldFetchMetrics,
    skipProjections: true,
    refetchInterval: 15000,
  });

  if (!currentFund) {
    return null;
  }

  const viewModel = buildCompactHeaderViewModel(
    currentFund.name,
    metrics?.actual,
    selectedKPI,
    isLoading,
    error != null
  );

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-gradient-to-r from-slate-50 to-white border-b">
      <div className="flex gap-2">
        {viewModel.items.map((item) => (
          <CompactKpiButton key={item.key} item={item} onSelect={setSelectedKPI} />
        ))}
      </div>

      <SelectedKpiPanel viewModel={viewModel} />

      <div className="ml-auto text-sm text-slate-600">{viewModel.fundName}</div>
    </div>
  );
}
