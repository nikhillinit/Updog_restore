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
      className={`flex-shrink-0 px-3 py-1 rounded-md text-sm font-medium transition-all ${getButtonClassName(
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
    <span className={`text-lg font-bold sm:text-xl ${selected.colorClassName} live-pulse-kpi`}>
      {selected.displayValue}
    </span>
  );
}

function SelectedKpiPanel({ viewModel }: { viewModel: CompactHeaderViewModel }) {
  const Icon = COMPACT_ICON_COMPONENTS[viewModel.selected.icon] ?? DollarSign;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm sm:ml-4 sm:px-4">
      <Icon className={`h-5 w-5 flex-shrink-0 ${viewModel.selected.colorClassName}`} />
      <span className="truncate text-sm text-slate-600">{viewModel.selected.label}:</span>
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
    currentFund.size,
    metrics?.actual,
    selectedKPI,
    isLoading,
    error != null
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 border-b bg-gradient-to-r from-slate-50 to-white px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
        {viewModel.items.map((item) => (
          <CompactKpiButton key={item.key} item={item} onSelect={setSelectedKPI} />
        ))}
      </div>

      <SelectedKpiPanel viewModel={viewModel} />

      <div className="min-w-0 truncate text-xs text-slate-600 sm:ml-auto sm:text-sm">
        {viewModel.fundName}
      </div>
    </div>
  );
}
