import { Activity } from 'lucide-react';
import HeaderKpis from './HeaderKpis';
import { Badge } from '@/components/ui/badge';
import { HeaderMetricCard } from '@/components/layout/HeaderMetricCard';
import { Separator } from '@/components/ui/separator';
import { useFundContext } from '@/contexts/FundContext';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import { useFlag } from '@/hooks/useUnifiedFlag';
import { buildFundHeaderViewModel, shouldFetchHeaderMetrics } from './fund-header-metrics';

function FundTerm({ termText }: { termText: string | null }) {
  if (!termText) return null;
  return <span>{termText}</span>;
}

export default function DynamicFundHeader() {
  const { currentFund } = useFundContext();
  const useCompactHeader = useFlag('enable_kpi_selectors', { withDependencies: true });
  const shouldFetchMetrics = shouldFetchHeaderMetrics(currentFund, useCompactHeader);

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
  } = useFundMetrics({
    enabled: shouldFetchMetrics,
    skipProjections: true,
    refetchInterval: 30000,
  });

  if (useCompactHeader) {
    return <HeaderKpis />;
  }

  if (!currentFund) {
    return null;
  }

  const viewModel = buildFundHeaderViewModel(
    currentFund,
    metrics,
    metricsLoading,
    metricsError != null
  );

  return (
    <div
      className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm"
      data-testid="dynamic-fund-header"
    >
      <div className="px-3 py-3 sm:px-6">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">
                {currentFund.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                <span className="tabular-nums">Fund Size: {viewModel.fundSizeText}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>Vintage: {viewModel.vintageText}</span>
                <Separator orientation="vertical" className="h-4" />
                <FundTerm termText={viewModel.termText} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              <Activity className="h-3 w-3 mr-1" />
              Active
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
              {viewModel.deploymentBadgeText}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {viewModel.cards.map((card) => (
            <HeaderMetricCard key={card.key} card={card} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{viewModel.lastUpdatedText}</span>
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${viewModel.statusIndicatorClassName}`} />
              <span>{viewModel.statusIndicatorText}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
