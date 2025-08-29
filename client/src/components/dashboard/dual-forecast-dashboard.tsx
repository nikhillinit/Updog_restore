/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Target, PieChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DualForecastData {
  fund: any;
  portfolioCompanies: any[];
  metrics: any;
  summary: any;
}

export default function DualForecastDashboard() {
  const { data: dashboardData, isLoading, error } = useQuery<DualForecastData>({
    queryKey: ['/api/dashboard-summary/1'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: _fundMetrics } = useQuery({
    queryKey: ['/api/fund-metrics/1'],
    refetchInterval: 60000, // Refresh every minute
  });

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
  const baseValue = parseFloat(currentMetrics?.totalValue || '0');
  const currentIRR = parseFloat(currentMetrics?.irr || '0');

  // Generate forecast scenarios
  const generateForecastData = () => {
    const months = Array.from({ length: 24 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    return months.map((month, i) => {
      const growthFactor = Math.pow(1 + currentIRR / 12, i);
      const conservativeGrowth = Math.pow(1.15, i / 12); // 15% annual
      const aggressiveGrowth = Math.pow(1.35, i / 12); // 35% annual
      
      return {
        month,
        conservative: Math.round(baseValue * conservativeGrowth / 1000000), // In millions
        realistic: Math.round(baseValue * growthFactor / 1000000),
        aggressive: Math.round(baseValue * aggressiveGrowth / 1000000),
        deployed: Math.round((parseFloat(dashboardData.fund.deployedCapital) + i * 2000000) / 1000000)
      };
    });
  };

  const forecastData = generateForecastData();

  // Portfolio allocation data from real API
  const portfolioData = dashboardData.portfolioCompanies.map(company => ({
    name: company.name,
    value: Math.round(parseFloat(company.currentValuation) / 1000000),
    investment: Math.round(parseFloat(company.investmentAmount) / 1000000),
    sector: company.sector,
    stage: company.stage
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
                <p className="text-2xl font-bold">${(baseValue / 1000000).toFixed(1)}M</p>
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
                <p className="text-2xl font-bold">{dashboardData.summary.deploymentRate.toFixed(0)}%</p>
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
              <Badge variant="outline" className="text-xs">Live Data</Badge>
            </CardTitle>
            <CardDescription>
              24-month value projection based on current {(currentIRR * 100).toFixed(1)}% IRR
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => [`$${value}M`, '']} />
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
              Live Portfolio Allocation
              <Badge variant="outline" className="text-xs">Real-time</Badge>
            </CardTitle>
            <CardDescription>
              Current valuation vs investment by company
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={portfolioData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip 
                  formatter={(value, name) => [`$${value}M`, name === 'value' ? 'Current Value' : 'Investment']}
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
            Projected deployment schedule based on current pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis label={{ value: 'Deployed ($M)', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value) => [`$${value}M`, 'Deployed Capital']} />
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
