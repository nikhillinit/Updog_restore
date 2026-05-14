import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Target, PieChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DashboardSummary } from '@/types/fund';
import { useFundContext } from '@/contexts/FundContext';

const MILLION = 1_000_000;

interface ForecastPoint {
  month: string;
  conservative: number;
  realistic: number;
  aggressive: number;
  deployed: number;
}

interface PortfolioChartPoint {
  name: string;
  value: number;
  investment: number;
  sector: string;
  stage: string;
}

function parseNumericValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatMillionValue(value: ValueType | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `$${parsed}M` : `${value}`;
  }

  return '';
}

function formatSeriesName(name: NameType | undefined): string {
  return name === 'value' ? 'Current Value' : 'Investment';
}

export default function DualForecastDashboard() {
  const { currentFund, isLoading: isFundLoading, needsSetup, isDemoMode } = useFundContext();
  const fundId = currentFund?.id ?? null;

  const {
    data: dashboardData,
    isLoading,
    error,
  } = useQuery<DashboardSummary>({
    queryKey: [`/api/dashboard-summary/${fundId}`],
    enabled: fundId != null && !isDemoMode,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: _fundMetrics } = useQuery({
    queryKey: [`/api/fund-metrics/${fundId}`],
    enabled: fundId != null && !isDemoMode,
    refetchInterval: 60000, // Refresh every minute
  });

  if (isFundLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="font-medium">Loading active fund context…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isDemoMode) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="font-medium">Forecasting unavailable in demo mode</p>
            <p className="text-muted-foreground mt-2">
              Load live fund data before using the deterministic forecast surface.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (needsSetup || fundId == null) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="font-medium">Select or create a fund to view forecasting data</p>
            <p className="text-muted-foreground mt-2">
              Forecasting stays unavailable until an active fund context exists.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-3/4"></div>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-red-600 font-medium">Unable to load forecast data</p>
            <p className="text-muted-foreground mt-2">Please check API connectivity</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform real data for forecasting charts
  const currentMetrics = dashboardData.metrics;
  const baseValue = parseNumericValue(currentMetrics?.totalValue);
  const currentIRR = parseNumericValue(currentMetrics?.irr);
  const deployedCapital = parseNumericValue(dashboardData.fund.deployedCapital);

  // Generate forecast scenarios
  const generateForecastData = (): ForecastPoint[] => {
    const months = Array.from({ length: 24 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() + index);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return months.map((month, index) => {
      const growthFactor = Math.pow(1 + currentIRR / 12, index);
      const conservativeGrowth = Math.pow(1.15, index / 12); // 15% annual
      const aggressiveGrowth = Math.pow(1.35, index / 12); // 35% annual

      return {
        month,
        conservative: Math.round((baseValue * conservativeGrowth) / MILLION), // In millions
        realistic: Math.round((baseValue * growthFactor) / MILLION),
        aggressive: Math.round((baseValue * aggressiveGrowth) / MILLION),
        deployed: Math.round((deployedCapital + index * 2_000_000) / MILLION),
      };
    });
  };

  const forecastData = generateForecastData();

  // Portfolio allocation data from real API
  const portfolioData: PortfolioChartPoint[] = dashboardData.portfolioCompanies.map((company) => ({
    name: company.name,
    value: Math.round(parseNumericValue(company.currentValuation) / MILLION),
    investment: Math.round(parseNumericValue(company.investmentAmount) / MILLION),
    sector: company.sector,
    stage: company.stage,
  }));

  return (
    <div className="space-y-6">
      {/* Live Metrics Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current AUM</p>
                <p className="text-2xl font-bold">${(baseValue / MILLION).toFixed(1)}M</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">IRR</p>
                <p className="text-2xl font-bold">{(currentIRR * 100).toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Portfolio Cos</p>
                <p className="text-2xl font-bold">{dashboardData.portfolioCompanies.length}</p>
              </div>
              <PieChart className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Deployment</p>
                <p className="text-2xl font-bold">
                  {dashboardData.summary.deploymentRate.toFixed(0)}%
                </p>
              </div>
              <Target className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dual Forecast Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Value Projection Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Fund Value Forecast
              <Badge variant="outline" className="text-xs">
                Projected scenario
              </Badge>
            </CardTitle>
            <CardDescription>
              24-month projection derived from current API IRR of {(currentIRR * 100).toFixed(1)}%.
              Projection, not actuals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  formatter={(value: ValueType | undefined) => [formatMillionValue(value), '']}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="conservative"
                  stackId="1"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                  name="Conservative (15%)"
                />
                <Area
                  type="monotone"
                  dataKey="realistic"
                  stackId="2"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.5}
                  name={`Realistic (${(currentIRR * 100).toFixed(1)}%)`}
                />
                <Area
                  type="monotone"
                  dataKey="aggressive"
                  stackId="3"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.3}
                  name="Aggressive (35%)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Portfolio Allocation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Portfolio Allocation
              <Badge variant="outline" className="text-xs">
                API actuals
              </Badge>
            </CardTitle>
            <CardDescription>Current API valuation vs invested capital by company</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={portfolioData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  formatter={(value: ValueType | undefined, name: NameType | undefined) => [
                    formatMillionValue(value),
                    formatSeriesName(name),
                  ]}
                />
                <Legend />
                <Bar dataKey="investment" fill="#94a3b8" name="Investment" />
                <Bar dataKey="value" fill="#3b82f6" name="Current Value" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Deployment Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Capital Deployment Forecast</CardTitle>
          <CardDescription>
            Scenario projection from current deployed capital plus a flat monthly deployment
            assumption.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis label={{ value: 'Deployed ($M)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                formatter={(value: ValueType | undefined) => [
                  formatMillionValue(value),
                  'Deployed Capital',
                ]}
              />
              <Line
                type="monotone"
                dataKey="deployed"
                stroke="#ef4444"
                strokeWidth={3}
                dot={{ r: 4 }}
                name="Cumulative Deployment"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
