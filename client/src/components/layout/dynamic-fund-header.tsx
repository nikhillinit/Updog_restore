 
 
 
 
 
import { FLAGS } from '@/core/flags/featureFlags';
import HeaderKpis from './HeaderKpis';
import { useFundContext } from "@/contexts/FundContext";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDPI } from '@/lib/format-metrics';
import {
  TrendingUp,
  Target,
  DollarSign,
  Calendar,
  BarChart3,
  PieChart,
  Activity
} from "lucide-react";

interface FundMetrics {
  totalCommitted: number;
  totalInvested: number;
  totalValue: number;
  irr: number;
  moic: number;
  dpi: number;
  tvpi: number;
  activeInvestments: number;
  exited: number;
  avgCheckSize: number;
  deploymentRate: number;
  remainingCapital: number;
}

export default function DynamicFundHeader() {
  // Call all hooks BEFORE any conditional returns
  const { currentFund } = useFundContext();

  // Fetch real-time fund metrics from calculated-metrics endpoint
  const { data: metrics, isLoading } = useQuery<FundMetrics>({
    queryKey: ['/api/funds', currentFund?.id, 'calculated-metrics'],
    enabled: !!currentFund?.id && !FLAGS.ENABLE_SELECTOR_KPIS, // Only fetch if not using compact header
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // If KPI selector flag is enabled, use new compact header
  if (FLAGS.ENABLE_SELECTOR_KPIS) {
    return <HeaderKpis />;
  }

  // Default metrics for new fund (no investments yet)
  const sampleMetrics: FundMetrics = {
    totalCommitted: currentFund?.size || 0,
    totalInvested: 0,
    totalValue: 0,
    irr: 0,
    moic: 0,
    dpi: 0,
    tvpi: 0,
    activeInvestments: 0,
    exited: 0,
    avgCheckSize: 0,
    deploymentRate: 0,
    remainingCapital: currentFund?.size || 0
  };

  // Ensure all values are properly defined
  const safeMetrics: FundMetrics = {
    totalCommitted: (metrics?.totalCommitted ?? sampleMetrics.totalCommitted) || 0,
    totalInvested: (metrics?.totalInvested ?? sampleMetrics.totalInvested) || 0,
    totalValue: (metrics?.totalValue ?? sampleMetrics.totalValue) || 0,
    irr: (metrics?.irr ?? sampleMetrics.irr) || 0,
    moic: (metrics?.moic ?? sampleMetrics.moic) || 0,
    dpi: (metrics?.dpi ?? sampleMetrics.dpi) || 0,
    tvpi: (metrics?.tvpi ?? sampleMetrics.tvpi) || 0,
    activeInvestments: (metrics?.activeInvestments ?? sampleMetrics.activeInvestments) || 0,
    exited: (metrics?.exited ?? sampleMetrics.exited) || 0,
    avgCheckSize: (metrics?.avgCheckSize ?? sampleMetrics.avgCheckSize) || 0,
    deploymentRate: (metrics?.deploymentRate ?? sampleMetrics.deploymentRate) || 0,
    remainingCapital: (metrics?.remainingCapital ?? sampleMetrics.remainingCapital) || 0
  };

  const displayMetrics = safeMetrics;

  const formatCurrency = (value: number | undefined) => {
    if (!value && value !== 0) return '$0';
    const num = Number(value);
    if (isNaN(num)) return '$0';
    
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
  };

  const formatPercentage = (value: number | undefined) => {
    if (!value && value !== 0) return '0.0%';
    const num = Number(value);
    if (isNaN(num)) return '0.0%';
    return `${num.toFixed(1)}%`;
  };

  if (!currentFund) {
    return null;
  }

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
              {(displayMetrics.deploymentRate || 0).toFixed(0)}% Deployed
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
                    {formatCurrency(displayMetrics.totalInvested)}
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
                    {formatCurrency(displayMetrics.totalValue)}
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
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatPercentage(displayMetrics.irr)}
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
                    {(displayMetrics.tvpi || 0).toFixed(2)}x
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
                  <p className="text-sm font-bold text-charcoal-900">
                    {formatDPI(displayMetrics.dpi)}
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
                    {displayMetrics.activeInvestments || 0}
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
                    {formatCurrency(displayMetrics.avgCheckSize)}
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
                    {formatCurrency(displayMetrics.remainingCapital)}
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
            <span>Last updated: {new Date().toLocaleTimeString()}</span>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Real-time data</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
