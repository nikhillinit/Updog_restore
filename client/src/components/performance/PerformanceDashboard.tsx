/**
 * PerformanceDashboard Component
 *
 * Comprehensive portfolio performance dashboard with:
 * - Time-series charts (IRR, TVPI, DPI over time)
 * - Breakdown by sector/stage/company
 * - Point-in-time comparisons
 *
 * @module client/components/performance/PerformanceDashboard
 */

import { useState, useMemo } from 'react';
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { Cell } from 'recharts/es6/component/Cell';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Download, RefreshCw, Calendar } from 'lucide-react';
import {
  usePerformanceTimeseries,
  usePerformanceBreakdown,
} from '@/hooks/usePerformanceDashboard';
import type { Granularity, GroupByDimension, MetricTrend } from '@shared/types/performance-api';

// ============================================================================
// HELPERS
// ============================================================================

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(2)}%`;
}

function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(2)}x`;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function getDateRange(timeframe: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];

  let startDate: Date;
  switch (timeframe) {
    case '3m':
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      break;
    case '6m':
      startDate = new Date(now.setMonth(now.getMonth() - 6));
      break;
    case '1y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    case '2y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 2));
      break;
    case 'ytd':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
    default:
      startDate = new Date(now.setFullYear(now.getFullYear() - 5));
  }

  return {
    startDate: startDate.toISOString().split('T')[0] ?? '',
    endDate: new Date().toISOString().split('T')[0] ?? '',
  };
}

function TrendIcon({ trend }: { trend: MetricTrend }) {
  switch (trend) {
    case 'improving':
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    case 'declining':
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    case 'stable':
    default:
      return <Minus className="h-4 w-4 text-gray-500" />;
  }
}

// ============================================================================
// CHART COLORS
// ============================================================================

const CHART_COLORS = {
  irr: '#2563eb', // Blue
  tvpi: '#059669', // Green
  dpi: '#d97706', // Amber
  totalValue: '#7c3aed', // Purple
};

const BREAKDOWN_COLORS = [
  '#292929', // Charcoal
  '#E0D8D1', // Beige
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PerformanceDashboardProps {
  className?: string;
}

export default function PerformanceDashboard({ className }: PerformanceDashboardProps) {
  // State
  const [timeframe, setTimeframe] = useState('1y');
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [groupBy, setGroupBy] = useState<GroupByDimension>('sector');
  const [activeTab, setActiveTab] = useState('timeseries');

  // Calculate date range
  const dateRange = useMemo(() => getDateRange(timeframe), [timeframe]);

  // Fetch data
  const {
    data: timeseriesData,
    isLoading: timeseriesLoading,
    refetch: refetchTimeseries,
  } = usePerformanceTimeseries({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity,
  });

  const {
    data: breakdownData,
    isLoading: breakdownLoading,
    refetch: refetchBreakdown,
  } = usePerformanceBreakdown({
    groupBy,
  });

  const isLoading = timeseriesLoading || breakdownLoading;

  // Transform timeseries data for charts
  const chartData = useMemo(() => {
    if (!timeseriesData?.timeseries) return [];

    return timeseriesData.timeseries.map((point) => ({
      date: point.date,
      irr: point.actual.irr ? point.actual.irr * 100 : null,
      tvpi: point.actual.tvpi || null,
      dpi: point.actual.dpi || null,
      totalValue: point.actual.totalValue || null,
      source: point._source,
    }));
  }, [timeseriesData]);

  // Handle refresh
  const handleRefresh = async () => {
    await Promise.all([refetchTimeseries(), refetchBreakdown()]);
  };

  // Loading state
  if (isLoading && !timeseriesData && !breakdownData) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
          <CardContent className="pt-6">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/3" />
              <div className="h-64 bg-gray-200 rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Controls */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="flex items-center space-x-2 font-inter text-[#292929]">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <span>Portfolio Performance</span>
              </CardTitle>
              <CardDescription className="font-poppins text-[#292929]/70">
                Track IRR, TVPI, and DPI metrics over time
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              {/* Timeframe selector */}
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger className="w-[120px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="6m">6 Months</SelectItem>
                  <SelectItem value="ytd">YTD</SelectItem>
                  <SelectItem value="1y">1 Year</SelectItem>
                  <SelectItem value="2y">2 Years</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>

              {/* Granularity selector */}
              <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh button */}
              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>

              {/* Export button */}
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-[#E0D8D1]">
          <TabsTrigger value="timeseries">Time Series</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        {/* Time Series Tab */}
        <TabsContent value="timeseries" className="space-y-6">
          {/* IRR Chart */}
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader>
              <CardTitle className="font-inter text-lg text-[#292929]">
                Internal Rate of Return (IRR)
              </CardTitle>
              <CardDescription className="font-poppins text-sm text-[#292929]/70">
                Annualized return performance over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value?.toFixed(2)}%`, 'IRR']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="irr"
                      stroke={CHART_COLORS.irr}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* TVPI & DPI Chart */}
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader>
              <CardTitle className="font-inter text-lg text-[#292929]">
                Fund Multiples (TVPI & DPI)
              </CardTitle>
              <CardDescription className="font-poppins text-sm text-[#292929]/70">
                Total Value and Distributions to Paid-In Capital
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${v?.toFixed(1)}x`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value?.toFixed(2)}x`,
                        name.toUpperCase(),
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="tvpi"
                      stroke={CHART_COLORS.tvpi}
                      strokeWidth={2}
                      dot={false}
                      name="TVPI"
                    />
                    <Line
                      type="monotone"
                      dataKey="dpi"
                      stroke={CHART_COLORS.dpi}
                      strokeWidth={2}
                      dot={false}
                      name="DPI"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-6">
          {/* Group By Selector */}
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="font-inter text-lg text-[#292929]">
                    Performance Breakdown
                  </CardTitle>
                  <CardDescription className="font-poppins text-sm text-[#292929]/70">
                    Analyze returns by portfolio dimension
                  </CardDescription>
                </div>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByDimension)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sector">By Sector</SelectItem>
                    <SelectItem value="stage">By Stage</SelectItem>
                    <SelectItem value="company">By Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {breakdownData && (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {breakdownData.totals.companyCount}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Companies</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {formatCurrency(breakdownData.totals.totalDeployed)}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Deployed</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {formatMultiple(breakdownData.totals.averageMOIC)}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Avg MOIC</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {formatPercent(breakdownData.totals.portfolioIRR)}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Portfolio IRR</div>
                    </div>
                  </div>

                  {/* Breakdown Bar Chart */}
                  <div className="h-80 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={breakdownData.breakdown.slice(0, 10)}
                        layout="vertical"
                        margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}x`} />
                        <YAxis dataKey="group" type="category" tick={{ fontSize: 12 }} width={90} />
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(2)}x`, 'MOIC']}
                        />
                        <Bar dataKey="moic" radius={[0, 4, 4, 0]}>
                          {breakdownData.breakdown.slice(0, 10).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Breakdown Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#E0D8D1]">
                          <th className="text-left p-3 font-inter font-bold text-[#292929]">
                            {groupBy === 'sector'
                              ? 'Sector'
                              : groupBy === 'stage'
                                ? 'Stage'
                                : 'Company'}
                          </th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">
                            Companies
                          </th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">
                            Deployed
                          </th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">
                            Current Value
                          </th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">
                            MOIC
                          </th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">
                            IRR
                          </th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">
                            % of Portfolio
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdownData.breakdown.map((row, index) => (
                          <tr
                            key={row.group}
                            className="border-b border-[#E0D8D1] hover:bg-[#E0D8D1]/20 transition-colors"
                          >
                            <td className="p-3 font-poppins font-medium text-[#292929]">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{
                                    backgroundColor:
                                      BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
                                  }}
                                />
                                {row.group}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono text-[#292929]">
                              {row.companyCount}
                            </td>
                            <td className="p-3 text-right font-mono text-[#292929]">
                              {formatCurrency(row.totalDeployed)}
                            </td>
                            <td className="p-3 text-right font-mono text-[#292929]">
                              {formatCurrency(row.currentValue)}
                            </td>
                            <td className="p-3 text-right">
                              <Badge
                                variant={row.moic >= 2 ? 'default' : row.moic >= 1 ? 'secondary' : 'outline'}
                              >
                                {formatMultiple(row.moic)}
                              </Badge>
                            </td>
                            <td className="p-3 text-right font-mono text-[#292929]">
                              {formatPercent(row.irr)}
                            </td>
                            <td className="p-3 text-right font-mono text-[#292929]">
                              {row.percentOfPortfolio.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Metadata */}
      {timeseriesData?.meta && (
        <div className="text-xs text-[#292929]/50 font-poppins flex justify-between">
          <span>
            Data range: {timeseriesData.meta.startDate} to {timeseriesData.meta.endDate}
          </span>
          <span>
            {timeseriesData.meta.dataPoints} data points | Computed in{' '}
            {timeseriesData.meta.computeTimeMs}ms
          </span>
        </div>
      )}
    </div>
  );
}
