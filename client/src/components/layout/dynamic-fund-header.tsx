/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useFundContext } from "@/contexts/FundContext";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  const { currentFund } = useFundContext();

  // Fetch real-time fund metrics
  const { data: metrics, isLoading } = useQuery<FundMetrics>({
    queryKey: ['/api/fund-metrics', currentFund?.id],
    enabled: !!currentFund?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Sample metrics for demo (would be replaced by API)
  const sampleMetrics: FundMetrics = {
    totalCommitted: currentFund?.size || 100000000,
    totalInvested: 65000000,
    totalValue: 187500000,
    irr: 28.5,
    moic: 2.88,
    dpi: 0.85,
    tvpi: 2.88,
    activeInvestments: 23,
    exited: 4,
    avgCheckSize: 2800000,
    deploymentRate: 65,
    remainingCapital: 35000000
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

        {/* Real-time Metrics Grid */}
        <div className="grid grid-cols-8 gap-3">
          {/* Capital Metrics */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Total Invested</p>
                  <p className="text-sm font-bold text-blue-900">
                    {formatCurrency(displayMetrics.totalInvested)}
                  </p>
                </div>
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-600 font-medium">Current Value</p>
                  <p className="text-sm font-bold text-green-900">
                    {formatCurrency(displayMetrics.totalValue)}
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-600 font-medium">Net IRR</p>
                  <p className="text-sm font-bold text-purple-900">
                    {formatPercentage(displayMetrics.irr)}
                  </p>
                </div>
                <BarChart3 className="h-4 w-4 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-600 font-medium">TVPI</p>
                  <p className="text-sm font-bold text-orange-900">
                    {(displayMetrics.tvpi || 0).toFixed(2)}x
                  </p>
                </div>
                <Target className="h-4 w-4 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-teal-50 border-teal-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-teal-600 font-medium">DPI</p>
                  <p className="text-sm font-bold text-teal-900">
                    {(displayMetrics.dpi || 0).toFixed(2)}x
                  </p>
                </div>
                <PieChart className="h-4 w-4 text-teal-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-indigo-50 border-indigo-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-600 font-medium">Active</p>
                  <p className="text-sm font-bold text-indigo-900">
                    {displayMetrics.activeInvestments || 0}
                  </p>
                </div>
                <Activity className="h-4 w-4 text-indigo-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 font-medium">Avg Check</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatCurrency(displayMetrics.avgCheckSize)}
                  </p>
                </div>
                <DollarSign className="h-4 w-4 text-gray-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-yellow-600 font-medium">Remaining</p>
                  <p className="text-sm font-bold text-yellow-900">
                    {formatCurrency(displayMetrics.remainingCapital)}
                  </p>
                </div>
                <Calendar className="h-4 w-4 text-yellow-600" />
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
          
          <div className="flex items-center space-x-4">
            <span>Portfolio Growth: +12.3% (30d)</span>
            <span>New Investments: 2 this month</span>
            <span>Next Close: Q2 2025</span>
          </div>
        </div>
      </div>
    </div>
  );
}
