/**
 * LP Performance Page
 *
 * Performance analytics with timeseries charts and benchmark comparisons.
 *
 * @module client/pages/lp/performance
 */

import { useState, useMemo } from 'react';
import { useLPContext } from '@/contexts/LPContext';
import { useLPPerformance, useLPHoldings } from '@/hooks/useLPPerformance';
import PerformanceMetricsCard from '@/components/lp/PerformanceMetricsCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Download, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';

// ============================================================================
// COMPONENT
// ============================================================================

export default function LPPerformance() {
  const { lpProfile, selectedFundId, setSelectedFundId } = useLPContext();
  const [granularity, setGranularity] = useState<'monthly' | 'quarterly' | 'annual'>('quarterly');
  const [activeTab, setActiveTab] = useState('timeseries');

  // Use first active fund if none selected
  const activeFundId = selectedFundId || lpProfile?.commitments.find((c) => c.status === 'active')?.fundId;

  const {
    data: performanceData,
    isLoading: perfLoading,
    refetch: refetchPerf,
  } = useLPPerformance({
    fundId: activeFundId || 0,
    granularity,
    includeBenchmarks: true,
    enabled: !!activeFundId,
  });

  const {
    data: holdingsData,
    isLoading: holdingsLoading,
    refetch: refetchHoldings,
  } = useLPHoldings({
    fundId: activeFundId || 0,
    enabled: !!activeFundId,
  });

  const isLoading = perfLoading || holdingsLoading;

  // Transform data for charts
  const chartData = useMemo(() => {
    if (!performanceData?.timeseries) return [];

    return performanceData.timeseries.map((point) => ({
      date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      irr: point.irr * 100,
      tvpi: point.tvpi,
      dpi: point.dpi,
      nav: point.nav,
    }));
  }, [performanceData]);

  const handleRefresh = async () => {
    await Promise.all([refetchPerf(), refetchHoldings()]);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  if (!activeFundId) {
    return (
      <div className="p-8 text-center">
        <p className="text-[#292929]/70 font-poppins">Please select a fund to view performance</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-inter text-[#292929]">Performance Analytics</h1>
          <p className="text-[#292929]/70 font-poppins mt-1">
            Track performance metrics and benchmark comparisons
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Fund Selector */}
          {lpProfile && lpProfile.commitments.length > 1 && (
            <Select
              value={selectedFundId?.toString() || ''}
              onValueChange={(v) => setSelectedFundId(parseInt(v))}
            >
              <SelectTrigger className="w-[250px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lpProfile.commitments
                  .filter((c) => c.status === 'active')
                  .map((c) => (
                    <SelectItem key={c.fundId} value={c.fundId.toString()}>
                      {c.fundName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {/* Granularity */}
          <Select value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Performance Metrics */}
      {performanceData && performanceData.timeseries.length > 0 && (
        <PerformanceMetricsCard
          irr={performanceData.timeseries[performanceData.timeseries.length - 1]?.irr || 0}
          tvpi={performanceData.timeseries[performanceData.timeseries.length - 1]?.tvpi || 0}
          dpi={performanceData.timeseries[performanceData.timeseries.length - 1]?.dpi || 0}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-[#E0D8D1]">
          <TabsTrigger value="timeseries">Performance Over Time</TabsTrigger>
          <TabsTrigger value="holdings">Portfolio Holdings</TabsTrigger>
        </TabsList>

        {/* Timeseries Tab */}
        <TabsContent value="timeseries" className="space-y-6">
          {/* IRR Chart */}
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader>
              <CardTitle className="font-inter text-lg text-[#292929]">IRR Performance</CardTitle>
              <CardDescription className="font-poppins text-sm text-[#292929]/70">
                Internal rate of return over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => value !== undefined ? `${Number(value).toFixed(2)}%` : ''} />
                    <Line type="monotone" dataKey="irr" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Multiples Chart */}
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader>
              <CardTitle className="font-inter text-lg text-[#292929]">TVPI & DPI</CardTitle>
              <CardDescription className="font-poppins text-sm text-[#292929]/70">
                Fund multiples over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}x`} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => value !== undefined ? `${Number(value).toFixed(2)}x` : ''} />
                    <Legend />
                    <Line type="monotone" dataKey="tvpi" stroke="#059669" strokeWidth={2} name="TVPI" />
                    <Line type="monotone" dataKey="dpi" stroke="#d97706" strokeWidth={2} name="DPI" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Holdings Tab */}
        <TabsContent value="holdings" className="space-y-6">
          <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="font-inter text-lg text-[#292929]">Portfolio Holdings</CardTitle>
                  <CardDescription className="font-poppins text-sm text-[#292929]/70">
                    Your pro-rata share of fund investments
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {holdingsData && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {holdingsData.summary.totalCompanies}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Companies</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {formatCurrency(holdingsData.summary.totalDeployed)}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Deployed</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {formatCurrency(holdingsData.summary.totalCurrentValue)}
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Current Value</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold font-inter text-[#292929]">
                        {holdingsData.summary.averageMOIC.toFixed(2)}x
                      </div>
                      <div className="text-sm font-poppins text-[#292929]/70">Avg MOIC</div>
                    </div>
                  </div>

                  {/* Holdings Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#E0D8D1]">
                          <th className="text-left p-3 font-inter font-bold text-[#292929]">Company</th>
                          <th className="text-left p-3 font-inter font-bold text-[#292929]">Sector</th>
                          <th className="text-left p-3 font-inter font-bold text-[#292929]">Stage</th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">Your Share</th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">Current Value</th>
                          <th className="text-right p-3 font-inter font-bold text-[#292929]">MOIC</th>
                          <th className="text-center p-3 font-inter font-bold text-[#292929]">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdingsData.holdings.map((holding) => (
                          <tr key={holding.companyId} className="border-b border-[#E0D8D1] hover:bg-[#E0D8D1]/20">
                            <td className="p-3 font-poppins font-medium text-[#292929]">
                              {holding.companyName}
                            </td>
                            <td className="p-3 font-poppins text-sm text-[#292929]/70">{holding.sector}</td>
                            <td className="p-3 font-poppins text-sm text-[#292929]/70">{holding.stage}</td>
                            <td className="p-3 text-right font-mono text-sm">{formatCurrency(holding.lpProRataShare)}</td>
                            <td className="p-3 text-right font-mono text-sm">{formatCurrency(holding.currentValue)}</td>
                            <td className="p-3 text-right">
                              <Badge variant={holding.moic >= 2 ? 'default' : holding.moic >= 1 ? 'secondary' : 'outline'}>
                                {holding.moic.toFixed(2)}x
                              </Badge>
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={holding.status === 'active' ? 'default' : 'outline'}>
                                {holding.status}
                              </Badge>
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
    </div>
  );
}
