import { HeaderMetricCard } from '@/components/layout/HeaderMetricCard';
import { useFundContext } from '@/contexts/FundContext';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import { buildCompactHeaderViewModel, shouldFetchCompactMetrics } from './fund-header-metrics';
import type { HeaderMetricCardView } from './HeaderMetricCard';

function compactItemToHeaderCard(
  item: ReturnType<typeof buildCompactHeaderViewModel>['items'][number],
  isLoading: boolean
): HeaderMetricCardView {
  return {
    key: item.key,
    title: item.label,
    displayValue: isLoading ? 'Loading' : item.displayValue,
    titleText: item.explanation,
    theme: item.key === 'tvpi' ? 'beige' : 'white',
    icon: item.icon,
  };
}

export default function HeaderKpis() {
  const { currentFund } = useFundContext();
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
    'dpi',
    isLoading,
    error != null
  );

  return (
    <div
      className="flex min-w-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
      data-testid="header-kpis"
    >
      <div
        className="grid max-w-full grid-cols-6 gap-3 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0"
        aria-label="Selected fund KPI summary"
      >
        {viewModel.items.map((item) => (
          <HeaderMetricCard
            key={item.key}
            card={compactItemToHeaderCard(item, viewModel.isLoading)}
            testId={`compact-kpi-${item.key}`}
          />
        ))}
      </div>

      <div className="min-w-0 truncate text-xs text-slate-600 sm:ml-auto sm:text-sm">
        {viewModel.fundName}
      </div>
    </div>
  );
}
