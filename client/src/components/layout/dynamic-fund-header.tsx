import { useFlag } from '@/hooks/useUnifiedFlag';
import HeaderKpis from './HeaderKpis';
import { useFundContext } from '@/contexts/FundContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatDPI } from '@/lib/format-metrics';
import { useFundMetrics } from '@/hooks/useFundMetrics';
import type { MetricAvailabilityDetail } from '@shared/types/metrics';
import {
  TrendingUp,
  Target,
  DollarSign,
  Calendar,
  BarChart3,
  PieChart,
  Activity,
} from 'lucide-react';

interface FundMetrics {
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

function unavailableMetric(
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

function toHeaderMetrics(
  currentFundSize: number,
  metrics: ReturnType<typeof useFundMetrics>['data']
): FundMetrics {
  const actual = metrics?.actual;
  if (!actual) {
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

  const totalCommitted = actual.totalCommitted ?? currentFundSize;
  const totalInvested = actual.totalDeployed ?? null;
  const totalValue = actual.totalValue ?? actual.currentNAV ?? null;

  return {
    totalCommitted,
    totalInvested,
    totalValue,
    irr: actual.irr ?? null,
    moic:
      totalInvested != null && totalInvested > 0 && totalValue != null
        ? totalValue / totalInvested
        : null,
    dpi: actual.dpi ?? null,
    tvpi: actual.totalCalled != null && actual.totalCalled > 0 ? actual.tvpi : null,
    activeInvestments: actual.activeCompanies ?? null,
    exited: actual.exitedCompanies ?? 0,
    avgCheckSize: actual.averageCheckSize ?? null,
    deploymentRate: actual.deploymentRate ?? null,
    remainingCapital: actual.totalUncalled ?? null,
    availability: {
      irr:
        actual.availability?.irr ??
        (actual.irr == null
          ? unavailableMetric(
              'cashflows',
              'Insufficient cash-flow history',
              'insufficient_dated_cashflows'
            )
          : { status: 'available', source: 'cashflows' }),
      dpi:
        actual.availability?.dpi ??
        (actual.dpi == null
          ? unavailableMetric(
              'distributions',
              'No distributions recorded',
              'no_distributions_recorded'
            )
          : { status: 'available', source: 'distributions' }),
    },
  };
}

export default function DynamicFundHeader() {
  // Call all hooks BEFORE any conditional returns
  const { currentFund } = useFundContext();
  const useCompactHeader = useFlag('enable_kpi_selectors', { withDependencies: true });

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
  } = useFundMetrics({
    enabled: !!currentFund?.id && !useCompactHeader,
    skipProjections: true,
    refetchInterval: 30000,
  });
  const metricUnavailable = metricsError != null || (!metricsLoading && metrics?.actual == null);
  const metricDisplayUnavailable = metricsLoading || metricUnavailable;

  // If KPI selector flag is enabled, use new compact header
  if (useCompactHeader) {
    return <HeaderKpis />;
  }

  const formatCurrency = (value: number | undefined) => {
    if (!value && value !== 0) return '$0';
    const num = Number(value);
    if (isNaN(num)) return '$0';

    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
  };

  const formatMetricCurrency = (value: number | null | undefined) =>
    metricDisplayUnavailable || value == null ? 'N/A' : formatCurrency(value);

  const formatMetricCount = (value: number | null | undefined) =>
    metricDisplayUnavailable || value == null ? 'N/A' : value.toLocaleString();

  const formatMetricMultiple = (value: number | null | undefined) =>
    metricDisplayUnavailable || value == null ? 'N/A' : `${value.toFixed(2)}x`;

  const formatNullablePerformanceMetric = (
    value: number | null | undefined,
    availability: MetricAvailabilityDetail,
    formatter: (_value: number) => string
  ) => {
    if (metricDisplayUnavailable) return 'N/A';
    if (value != null && availability.status === 'available') return formatter(value);
    if (availability.reason === 'insufficient_dated_cashflows') return 'Needs history';
    if (availability.reason === 'no_distributions_recorded') return 'No distributions';
    return availability.message ?? 'Unavailable';
  };

  const formatPercentage = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    const num = Number(value);
    if (isNaN(num)) return 'N/A';
    const percent = Math.abs(num) <= 1 ? num * 100 : num;
    return `${percent.toFixed(1)}%`;
  };

  if (!currentFund) {
    return null;
  }

  const displayMetrics = toHeaderMetrics(currentFund.size || 0, metrics);

  return (
    <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6 py-3">
        {/* Fund Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{currentFund.name}</h1>
              <div className="flex items-center space-x-3 text-sm text-gray-600">
                <span>Fund Size: {formatCurrency(currentFund.size)}</span>
                <Separator orientation="vertical" className="h-4" />
                <span>Vintage: {currentFund.vintageYear}</span>
                <Separator orientation="vertical" className="h-4" />
                {currentFund.termYears && <span>Term: {currentFund.termYears} years</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              <Activity className="h-3 w-3 mr-1" />
              Active
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
              {metricsLoading
                ? 'Metrics loading'
                : metricUnavailable
                  ? 'Metrics unavailable'
                  : `${displayMetrics.deploymentRate?.toFixed(0) ?? 'N/A'}% Deployed`}
            </Badge>
          </div>
        </div>

        {/* Real-time Metrics Grid - Professional Monochrome Design */}
        <div className="grid grid-cols-8 gap-3">
          {/* Capital Metrics - Using POV Brand Colors */}
          <Card className="bg-white border-charcoal-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-600 font-medium">Total Invested</p>
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatMetricCurrency(displayMetrics.totalInvested)}
                  </p>
                </div>
                <DollarSign className="h-4 w-4 text-charcoal-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-beige-50 border-beige-300 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-700 font-medium">Current Value</p>
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatMetricCurrency(displayMetrics.totalValue)}
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-charcoal-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-600 font-medium">Net IRR</p>
                  <p
                    className="text-sm font-bold text-charcoal-900 leading-tight"
                    title={displayMetrics.availability.irr.message}
                  >
                    {formatNullablePerformanceMetric(
                      displayMetrics.irr,
                      displayMetrics.availability.irr,
                      formatPercentage
                    )}
                  </p>
                </div>
                <BarChart3 className="h-4 w-4 text-charcoal-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-beige-50 border-beige-300 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-700 font-medium">TVPI</p>
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatMetricMultiple(displayMetrics.tvpi)}
                  </p>
                </div>
                <Target className="h-4 w-4 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-charcoal-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-600 font-medium">DPI</p>
                  <p
                    className="text-sm font-bold text-charcoal-900 leading-tight"
                    title={displayMetrics.availability.dpi.message}
                  >
                    {formatNullablePerformanceMetric(
                      displayMetrics.dpi,
                      displayMetrics.availability.dpi,
                      formatDPI
                    )}
                  </p>
                </div>
                <PieChart className="h-4 w-4 text-charcoal-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-beige-50 border-beige-300 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-700 font-medium">Active</p>
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatMetricCount(displayMetrics.activeInvestments)}
                  </p>
                </div>
                <Activity className="h-4 w-4 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-charcoal-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-600 font-medium">Avg Check</p>
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatMetricCurrency(displayMetrics.avgCheckSize)}
                  </p>
                </div>
                <DollarSign className="h-4 w-4 text-charcoal-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-beige-50 border-beige-300 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-charcoal-700 font-medium">Remaining</p>
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatMetricCurrency(displayMetrics.remainingCapital)}
                  </p>
                </div>
                <Calendar className="h-4 w-4 text-charcoal-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Real-time Status Indicators */}
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <span>
              {metricsLoading
                ? 'Loading metrics'
                : metricUnavailable
                  ? 'Metrics source unavailable'
                  : `Last updated: ${
                      metrics?.lastUpdated
                        ? new Date(metrics.lastUpdated).toLocaleTimeString()
                        : new Date().toLocaleTimeString()
                    }`}
            </span>
            <div className="flex items-center space-x-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  metricUnavailable ? 'bg-red-500' : 'bg-green-500 animate-pulse'
                }`}
              ></div>
              <span>
                {metricsLoading
                  ? 'Metrics loading'
                  : metricUnavailable
                    ? 'Metrics unavailable'
                    : 'Live metrics'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
