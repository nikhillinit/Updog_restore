import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Target, PieChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DashboardSummary } from '@/types/fund';
import { useFundContext } from '@/contexts/FundContext';
import { useDualForecast } from '@/hooks/useDualForecast';

const MILLION = 1_000_000;

interface PortfolioChartPoint {
  name: string;
  value: number;
  investment: number;
  sector: string;
  stage: string;
}

interface ForecastChartPoint {
  label: string;
  constructionNav: number;
  currentNav: number;
  constructionCalledCapital: number;
  currentCalledCapital: number;
  constructionDistributions: number;
  currentDistributions: number;
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

function toMillions(value: number): number {
  return Math.round(value / MILLION);
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

  const {
    data: dualForecast,
    isLoading: isForecastLoading,
    error: forecastError,
  } = useDualForecast(fundId, {
    enabled: fundId != null && !isDemoMode,
    refetchInterval: 60000,
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

  if (isLoading || isForecastLoading) {
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

  if (error || forecastError || !dashboardData || !dualForecast) {
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
  const forecastData: ForecastChartPoint[] = dualForecast.series.map((point) => ({
    label: point.label,
    constructionNav: toMillions(point.construction.nav),
    currentNav: toMillions(point.current.nav),
    constructionCalledCapital: toMillions(point.construction.calledCapital),
    currentCalledCapital: toMillions(point.current.calledCapital),
    constructionDistributions: toMillions(point.construction.distributions),
    currentDistributions: toMillions(point.current.distributions),
  }));

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
                Construction Plan
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Current Forecast
              </Badge>
            </CardTitle>
            <CardDescription>
              Quarterly NAV comparison from the published plan and current forecast.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis label={{ value: 'NAV ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip
                  formatter={(value: ValueType | undefined) => [formatMillionValue(value), '']}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="constructionNav"
                  stroke="#0f766e"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  name="Construction Plan"
                />
                <Line
                  type="monotone"
                  dataKey="currentNav"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  name="Current Forecast"
                />
              </LineChart>
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
          <CardDescription>Cumulative called capital by quarter.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis label={{ value: 'Called ($M)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                formatter={(value: ValueType | undefined) => [
                  formatMillionValue(value),
                  'Called Capital',
                ]}
              />
              <Line
                type="monotone"
                dataKey="constructionCalledCapital"
                stroke="#0f766e"
                strokeWidth={3}
                dot={{ r: 4 }}
                name="Construction Plan"
              />
              <Line
                type="monotone"
                dataKey="currentCalledCapital"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 4 }}
                name="Current Forecast"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
