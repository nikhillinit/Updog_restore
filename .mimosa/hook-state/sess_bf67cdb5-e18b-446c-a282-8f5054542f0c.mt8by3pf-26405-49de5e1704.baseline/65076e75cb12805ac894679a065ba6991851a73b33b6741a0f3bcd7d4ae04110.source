/* eslint-disable custom/no-hardcoded-fund-metrics -- Demo dashboard with sample data */

import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Line } from 'recharts/es6/cartesian/Line';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { ComposedChart } from 'recharts/es6/chart/ComposedChart';
import { useState } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { TrendingUp, Building2, Target } from 'lucide-react';
import PortfolioConcentration from './portfolio-concentration';
import { presson } from '@/theme/presson.tokens';
import { colors as brandColors } from '@/lib/brand-tokens';

type DashboardViewType = 'construction' | 'current';
type DashboardTab = 'fund' | 'performance' | 'exits' | 'rounds' | 'lp' | 'insights' | 'visualizer';

const STATUS_SUCCESS = brandColors.success;
const DASHBOARD_CHART_COLORS = {
  text: presson.color.text,
  grid: presson.color.surfaceSubtle,
  positive: presson.color.positive,
  info: presson.color.info,
  warning: presson.color.warning,
  negative: presson.color.negative,
  success: STATUS_SUCCESS,
} as const;
const CATEGORY_SERIES_COLORS = [
  DASHBOARD_CHART_COLORS.text,
  DASHBOARD_CHART_COLORS.positive,
  DASHBOARD_CHART_COLORS.info,
  DASHBOARD_CHART_COLORS.success,
  DASHBOARD_CHART_COLORS.warning,
  DASHBOARD_CHART_COLORS.negative,
] as const;

const formatMillionsTick = (value: number | string): string => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return `$${(numericValue / 1000000).toFixed(0)}M`;
};

export default function Dashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [viewType, setViewType] = useState<DashboardViewType>('construction');
  const [activeTab, setActiveTab] = useState<DashboardTab>('fund');

  if (isLoading || !currentFund) {
    return (
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="animate-pulse space-y-8">
          <div className="h-20 bg-pov-gray rounded-xl"></div>
          <div className="h-96 bg-pov-gray rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Fund metrics calculation
  const committedCapital = currentFund.size || 200000000;
  const investableCapital = committedCapital * 1.026; // 205,311,250
  const _managementFees = committedCapital * 0.15;
  const _fundExpenses = committedCapital * 0.0171;
  const _exitProceedsRecycled = 40000000;
  const reserveRatio = 42.5;
  const projectedInvestments = 90;
  const projectedFundValue = investableCapital * 5.41;
  const grossMultiple = 5.41;
  const tvpi = 4.48;

  const initialCapital = investableCapital * 0.575;
  const followOnCapital = investableCapital * 0.425;

  // Sample data for charts
  const investableCapitalData = [
    { name: 'Pre-Seed', initial: 41062250, followOn: 20531125 },
    { name: 'Seed', initial: 61593375, followOn: 30796688 },
    { name: 'Series A', initial: 82124500, followOn: 41062250 },
    { name: 'Warrants', initial: 0, followOn: 0 },
  ];

  const pacingData = [
    { period: 'Jan 22', cumulative: 15, inPeriod: 3 },
    { period: 'Apr 22', cumulative: 25, inPeriod: 5 },
    { period: 'Jul 22', cumulative: 35, inPeriod: 4 },
    { period: 'Oct 22', cumulative: 45, inPeriod: 6 },
    { period: 'Jan 23', cumulative: 55, inPeriod: 4 },
    { period: 'Apr 23', cumulative: 65, inPeriod: 5 },
    { period: 'Jul 23', cumulative: 75, inPeriod: 3 },
    { period: 'Oct 23', cumulative: 85, inPeriod: 4 },
    { period: 'Jan 24', cumulative: 90, inPeriod: 2 },
  ];

  const capitalCallsData = [
    { period: 'Jan 22', amount: 25000000, cumulative: 25000000 },
    { period: 'Apr 22', amount: 20000000, cumulative: 45000000 },
    { period: 'Jul 22', amount: 30000000, cumulative: 75000000 },
    { period: 'Oct 22', amount: 25000000, cumulative: 100000000 },
    { period: 'Jan 23', amount: 30000000, cumulative: 130000000 },
    { period: 'Apr 23', amount: 25000000, cumulative: 155000000 },
    { period: 'Jul 23', amount: 20000000, cumulative: 175000000 },
    { period: 'Oct 23', amount: 15000000, cumulative: 190000000 },
    { period: 'Jan 24', amount: 10000000, cumulative: 200000000 },
  ];

  const InvestableCapitalSummary = () => (
    <div className="space-y-8">
      {/* Header Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-0 shadow-card">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-inter font-bold text-pov-charcoal">
                ${(investableCapital / 1000000).toFixed(1)}M
              </div>
              <div className="text-charcoal-600 font-medium mt-1">
                {((investableCapital / committedCapital) * 100).toFixed(2)}%
              </div>
              <div className="text-sm text-charcoal-500 mt-2">Investable Capital</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-card">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-inter font-bold text-pov-charcoal">
                  ${(initialCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-charcoal-600 font-medium">
                  {((initialCapital / investableCapital) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-charcoal-500 mt-1">Projected Initial</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-inter font-bold text-pov-charcoal">
                  ${(followOnCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-charcoal-600 font-medium">
                  {((followOnCapital / investableCapital) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-charcoal-500 mt-1">Projected Follow-On</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-card">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-inter font-bold text-pov-charcoal">
                {projectedInvestments}
              </div>
              <div className="text-charcoal-500 font-medium mt-1">Projected</div>
              <div className="text-sm text-charcoal-500 mt-2">Number of Initial Investments</div>
              <div className="flex justify-center space-x-4 mt-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-pov-charcoal">27</div>
                  <div className="text-xs text-charcoal-400">By Entry Round</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-pov-charcoal">26</div>
                  <div className="text-xs text-charcoal-400">By Allocations</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capital Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-white border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-inter text-pov-charcoal">
              Investable Capital Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Committed Capital</span>
                <span className="font-mono text-pov-charcoal">
                  ${(committedCapital / 1000000).toFixed(0)}M
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Cashless Commit</span>
                <span className="font-mono text-presson-negative">($0.8M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Management Fees</span>
                <span className="font-mono text-presson-negative">($30.5M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Fund Expenses</span>
                <span className="font-mono text-presson-negative">($3.4M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-500">Exit Proceeds Recycled</span>
                <span className="font-mono text-presson-positive">$40.0M</span>
              </div>
              <div className="border-t border-charcoal/7 pt-4">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-pov-charcoal">Total Investable</span>
                  <span className="font-mono text-pov-charcoal">
                    ${(investableCapital / 1000000).toFixed(1)}M
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-inter text-pov-charcoal">
              Capital Allocation by Entry Round
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={investableCapitalData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={DASHBOARD_CHART_COLORS.grid} />
                <XAxis dataKey="name" tick={{ fill: DASHBOARD_CHART_COLORS.text }} />
                <YAxis
                  tick={{ fill: DASHBOARD_CHART_COLORS.text }}
                  tickFormatter={formatMillionsTick}
                />
                <Bar
                  dataKey="initial"
                  fill={CATEGORY_SERIES_COLORS[0]}
                  name="Initial Investments"
                />
                <Bar
                  dataKey="followOn"
                  fill={CATEGORY_SERIES_COLORS[1]}
                  name="Follow-On Investments"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const PacingAnalysis = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Initial Investment Pacing</CardTitle>
            <CardDescription>Number of deals by time period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={pacingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Bar dataKey="inPeriod" fill={CATEGORY_SERIES_COLORS[0]} name="In-Period" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke={CATEGORY_SERIES_COLORS[1]}
                  strokeWidth={2}
                  name="Cumulative"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Follow-On Investment Pacing</CardTitle>
            <CardDescription>Monthly deal flow analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pacingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stackId="1"
                  stroke={CATEGORY_SERIES_COLORS[0]}
                  fill={CATEGORY_SERIES_COLORS[1]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const CapitalCalls = () => (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Capital Call Schedule</CardTitle>
          <CardDescription>Deployment projections over fund lifetime</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-2xl font-bold text-presson-info">$199,200,000</div>
            <div className="text-charcoal-600">Total Projected</div>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={capitalCallsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={formatMillionsTick} />
              <Bar dataKey="amount" fill={CATEGORY_SERIES_COLORS[0]} name="In Period" />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke={CATEGORY_SERIES_COLORS[1]}
                strokeWidth={3}
                name="Cumulative"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white font-poppins">
      {/* Fund Header */}
      <div className="bg-pov-gray rounded-lg shadow-card border-0 p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h1 className="text-2xl font-inter font-bold text-pov-charcoal">{currentFund.name}</h1>
            <div className="flex items-center space-x-8 mt-4">
              <div>
                <div className="text-sm text-charcoal-500">Capital</div>
                <div className="grid grid-cols-3 gap-6 mt-2">
                  <div>
                    <div className="text-sm font-medium text-charcoal-500">Committed</div>
                    <div className="text-lg font-bold text-pov-charcoal">
                      ${(committedCapital / 1000000).toFixed(0)}M
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal-500">Investable</div>
                    <div className="text-lg font-bold text-pov-charcoal">
                      ${(investableCapital / 1000000).toFixed(1)}M
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal-500">Reserve Ratio</div>
                    <div className="text-lg font-bold text-pov-charcoal">{reserveRatio}%</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-charcoal-500">Investments</div>
                <div className="text-lg font-bold mt-2 text-pov-charcoal">
                  {projectedInvestments}
                </div>
              </div>
              <div>
                <div className="text-sm text-charcoal-500">Fund Returns</div>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div>
                    <div className="text-sm font-medium text-charcoal-500">
                      Projected Fund Value
                    </div>
                    <div className="text-lg font-bold text-pov-charcoal">
                      ${(projectedFundValue / 1000000).toFixed(0)}M
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal-500">Gross Multiple</div>
                    <div className="text-lg font-bold text-pov-charcoal">{grossMultiple}x</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal-500">TVPI</div>
                    <div className="text-lg font-bold text-pov-charcoal">{tvpi}x</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="view-toggle" className="text-sm font-medium text-pov-charcoal">
                View Actual
              </Label>
              <Switch
                id="view-toggle"
                checked={viewType === 'current'}
                onCheckedChange={(checked: boolean) =>
                  setViewType(checked ? 'current' : 'construction')
                }
              />
            </div>
            <div className="flex space-x-2">
              <Badge
                variant={viewType === 'construction' ? 'default' : 'secondary'}
                className={
                  viewType === 'construction'
                    ? 'bg-pov-charcoal text-pov-white'
                    : 'bg-white text-pov-charcoal border-beige-200'
                }
              >
                Construction Forecast
              </Badge>
              <Badge
                variant={viewType === 'current' ? 'default' : 'secondary'}
                className={
                  viewType === 'current'
                    ? 'bg-pov-charcoal text-pov-white'
                    : 'bg-white text-pov-charcoal border-beige-200'
                }
              >
                Current Forecast
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-beige-200 bg-white text-pov-charcoal hover:bg-pov-gray transition-colors"
            >
              Construction Parameters
            </Button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DashboardTab)}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="fund">Fund</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="exits">Exits</TabsTrigger>
          <TabsTrigger value="rounds">Rounds</TabsTrigger>
          <TabsTrigger value="lp">LP</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="visualizer">Visualizer</TabsTrigger>
        </TabsList>

        <TabsContent value="fund" className="space-y-6">
          <Tabs defaultValue="investable-capital" className="space-y-4">
            <TabsList>
              <TabsTrigger value="investable-capital">Investable Capital</TabsTrigger>
              <TabsTrigger value="pacing-analysis">Pacing Analysis</TabsTrigger>
              <TabsTrigger value="capital-calls">Capital Calls</TabsTrigger>
              <TabsTrigger value="commitments">Commitments</TabsTrigger>
              <TabsTrigger value="recycling">Recycling</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="line-of-credit">Line of Credit</TabsTrigger>
            </TabsList>

            <TabsContent value="investable-capital">
              <InvestableCapitalSummary />
            </TabsContent>

            <TabsContent value="pacing-analysis">
              <PacingAnalysis />
            </TabsContent>

            <TabsContent value="capital-calls">
              <CapitalCalls />
            </TabsContent>

            <TabsContent value="commitments">
              <Card>
                <CardHeader>
                  <CardTitle>Commitment Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-charcoal-500">
                    LP commitment details and analysis coming soon...
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recycling">
              <Card>
                <CardHeader>
                  <CardTitle>Exit Proceeds Recycling</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-charcoal-500">Recycling analysis and management tools...</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="expenses">
              <Card>
                <CardHeader>
                  <CardTitle>Fund Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-charcoal-500">Expense tracking and budget management...</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="line-of-credit">
              <Card>
                <CardHeader>
                  <CardTitle>Line of Credit</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-charcoal-500">Credit facility management and utilization...</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Fund Performance Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-charcoal-500">Performance metrics and analysis coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exits">
          <Card>
            <CardHeader>
              <CardTitle>Exit Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-charcoal-500">Exit performance and distribution analysis...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rounds">
          <Card>
            <CardHeader>
              <CardTitle>Round Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-charcoal-500">Investment round tracking and analysis...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lp">
          <Card>
            <CardHeader>
              <CardTitle>Limited Partner Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-charcoal-500">LP reporting and relationship management...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Portfolio Concentration */}
            <PortfolioConcentration />

            {/* Additional Insights Components */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">Performance Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-pov-gray rounded-lg">
                    <div>
                      <p className="font-medium text-pov-charcoal">Top Performing Sector</p>
                      <p className="text-sm text-charcoal-600">
                        SaaS companies showing 3.2x average MOIC
                      </p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-charcoal-600" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-pov-gray rounded-lg">
                    <div>
                      <p className="font-medium text-pov-charcoal">Geographic Performance</p>
                      <p className="text-sm text-charcoal-600">
                        SF Bay Area leading with 28% portfolio value
                      </p>
                    </div>
                    <Building2 className="h-5 w-5 text-charcoal-600" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-pov-gray rounded-lg">
                    <div>
                      <p className="font-medium text-pov-charcoal">Stage Distribution</p>
                      <p className="text-sm text-charcoal-600">
                        42% concentrated in Seed stage investments
                      </p>
                    </div>
                    <Target className="h-5 w-5 text-charcoal-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="visualizer">
          <Card>
            <CardHeader>
              <CardTitle>Data Visualizer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-charcoal-500">Interactive data visualization tools...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
