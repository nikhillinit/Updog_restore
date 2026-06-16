import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { StressScenarioProofPanel } from './StressScenarioProofPanel';
import { CashEventsPanel } from './CashEventsPanel';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Target,
  Activity,
  RefreshCw,
  Download,
  Zap,
} from 'lucide-react';
import {
  useLiquidityAnalytics,
  useLiquidityAlerts,
  useLiquidityMetrics,
} from '@/hooks/useLiquidityAnalytics';
import { useFundContext } from '@/contexts/FundContext';
import { isDemoMode } from '@/core/demo/persona';
import { useWorkPanelUrlState } from '@/components/work-panel/useWorkPanelUrlState';
import { presson } from '@/theme/presson.tokens';
import { colors as brandColors, getChartColor } from '@/lib/brand-tokens';
import { getImpactBadgeClass, getImpactTextClass } from '@/lib/display/impact-semantics';
import { useFlag } from '@/shared/useFlags';
import { toStressScenarioViewModel } from './stress-test-view-model';

const STATUS_SUCCESS = brandColors.success;
const CASHFLOW_CHART_COLORS = {
  positive: presson.color.positive,
  negative: presson.color.negative,
  warning: presson.color.warning,
  info: presson.color.info,
  text: presson.color.text,
  success: STATUS_SUCCESS,
} as const;

interface CashflowDashboardProps {
  fundId: string;
  className?: string;
}

export default function CashflowDashboard({ fundId, className = '' }: CashflowDashboardProps) {
  const [timeframe, setTimeframe] = useState('12m');
  const [activeView, setActiveView] = useState('overview');

  // Get fund data from context
  const { currentFund } = useFundContext();
  const fundSize = currentFund?.size ? currentFund.size / 1000000 : 100; // Convert to millions, default to $100M

  // Use liquidity analytics hook
  const analytics = useLiquidityAnalytics({
    fundId,
    fundSize: fundSize * 1000000, // Convert to actual dollar amount
    autoRefresh: true,
    refreshIntervalMs: 30000, // 30 seconds
    defaultForecastMonths: timeframe === '6m' ? 6 : timeframe === '12m' ? 12 : 24,
    enableRealTimeAlerts: true,
    allowDemoFallback: isDemoMode(),
  });

  // Use additional hooks
  const { alerts } = useLiquidityAlerts(
    analytics.liquidityForecast
      ? {
          fundId,
          asOfDate: new Date(),
          bankAccounts: [],
          totalCash: analytics.liquidityForecast.openingCash,
          totalCommitted: analytics.liquidityForecast.openingCommitted,
          totalDeployed: fundSize * 1000000 - analytics.liquidityForecast.openingCommitted,
          availableLiquidity: analytics.liquidityForecast.openingCash,
          pendingInflows:
            analytics.liquidityForecast.plannedCapitalCalls +
            analytics.liquidityForecast.expectedDistributions,
          pendingOutflows:
            analytics.liquidityForecast.plannedInvestments +
            analytics.liquidityForecast.plannedExpenses,
          netPending:
            analytics.liquidityForecast.plannedCapitalCalls +
            analytics.liquidityForecast.expectedDistributions -
            (analytics.liquidityForecast.plannedInvestments +
              analytics.liquidityForecast.plannedExpenses),
          dryPowder: analytics.liquidityForecast.openingCash * 0.8,
          reserveRequirement: fundSize * 1000000 * 0.15,
          availableInvestment: analytics.liquidityForecast.openingCash * 0.8,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null,
    analytics.liquidityForecast
  );

  const liquidityMetrics = useLiquidityMetrics(analytics.cashFlowAnalysis);
  const workPanelEnabled = useFlag('enable_work_panel');
  const workPanel = useWorkPanelUrlState();
  const cashEventEnabled = useFlag('enable_cash_event_object');

  // Generate chart data
  const cashFlowChartData = useMemo(() => {
    if (!analytics.cashFlowAnalysis) return [];

    return analytics.cashFlowAnalysis.byMonth.map((month) => ({
      month: month.month,
      inflows: month.totalInflow / 1000000, // Convert to millions
      outflows: month.totalOutflow / 1000000,
      netFlow: month.netFlow / 1000000,
    }));
  }, [analytics.cashFlowAnalysis]);

  const liquidityForecastData = useMemo(() => {
    if (!analytics.liquidityForecast) return [];

    const months = parseInt(timeframe.replace('m', ''));
    const data = [];
    const startDate = new Date();

    for (let i = 0; i <= months; i++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + i);

      // Simple linear projection for demonstration
      const cashDecline =
        (analytics.liquidityForecast.openingCash - analytics.liquidityForecast.projectedCash) /
        months;
      const projectedCash = analytics.liquidityForecast.openingCash - cashDecline * i;

      data.push({
        month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        cash: Math.max(0, projectedCash / 1000000),
        committed:
          (analytics.liquidityForecast.openingCommitted -
            (analytics.liquidityForecast.plannedCapitalCalls * i) / months) /
          1000000,
      });
    }

    return data;
  }, [analytics.liquidityForecast, timeframe]);

  const forecastMax = useMemo(() => {
    const values = liquidityForecastData
      .flatMap((d) => [d.cash, d.committed])
      .filter((n) => Number.isFinite(n));
    const max = Math.max(0, ...values);
    return max === 0 ? 1 : Math.ceil(max * 1.1);
  }, [liquidityForecastData]);

  const stressBaselineCash = analytics.stressTestResult?.currentPosition.totalCash ?? 0;

  const expenseBreakdownData = useMemo(() => {
    if (!analytics.cashFlowAnalysis) return [];

    const expenses = Object.entries(analytics.cashFlowAnalysis.byType)
      .filter(([_type, amount]) => amount < 0)
      .map(([type, amount]) => ({
        type: type.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        amount: Math.abs(amount / 1000000),
        color: getColorForExpenseType(type),
      }));

    return expenses;
  }, [analytics.cashFlowAnalysis]);

  const formatCurrencyShort = (value: number) => {
    if (value >= 1) return `$${value.toFixed(1)}M`;
    return `$${(value * 1000).toFixed(0)}K`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Cashflow & Liquidity Management</h2>
          <p className="text-muted-foreground">
            Real-time liquidity monitoring and cash flow forecasting
          </p>
        </div>
        <div className="flex items-center gap-3">
          {analytics.isDemoData && (
            <Badge className="border-beige-200 bg-pov-gray text-charcoal-700">Demo data</Badge>
          )}
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6m">6 Months</SelectItem>
              <SelectItem value="12m">12 Months</SelectItem>
              <SelectItem value="24m">24 Months</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={analytics.refreshAll}
            disabled={analytics.isLoadingAnalysis || analytics.isLoadingForecast}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${analytics.isLoadingAnalysis || analytics.isLoadingForecast ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const data = await analytics.exportData();
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `cashflow-analysis-${fundId}-${new Date().toISOString().split('T')[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Export cashflow
          </Button>
          {cashEventEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => workPanel.openPanel({ panel: 'cash-events' })}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Cash events
            </Button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.type === 'error' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{alert.title}:</strong> {alert.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Available Cash"
          value={
            analytics.liquidityForecast?.openingCash
              ? formatCurrencyShort(analytics.liquidityForecast.openingCash / 1000000)
              : '--'
          }
          {...(analytics.cashFlowAnalysis?.summary.netCashFlow
            ? {
                change: `${analytics.cashFlowAnalysis.summary.netCashFlow > 0 ? '+' : ''}${formatCurrencyShort(analytics.cashFlowAnalysis.summary.netCashFlow / 1000000)} this month`,
              }
            : {})}
          {...(analytics.cashFlowAnalysis?.patterns.netFlowTrend
            ? { trend: analytics.cashFlowAnalysis.patterns.netFlowTrend }
            : {})}
          icon={DollarSign as React.ComponentType<{ className?: string }>}
          loading={analytics.isLoadingAnalysis}
        />

        <MetricCard
          title="Liquidity Ratio"
          value={
            analytics.liquidityForecast?.liquidityRatio
              ? analytics.liquidityForecast.liquidityRatio.toFixed(2)
              : '--'
          }
          {...(analytics.liquidityForecast?.liquidityRatio
            ? {
                change: `${analytics.liquidityForecast.liquidityRatio >= 1.5 ? 'Healthy' : 'Low'}`,
              }
            : {})}
          trend={
            analytics.liquidityForecast?.liquidityRatio &&
            analytics.liquidityForecast.liquidityRatio >= 1.5
              ? 'stable'
              : 'decreasing'
          }
          icon={Target as React.ComponentType<{ className?: string }>}
          loading={analytics.isLoadingForecast}
        />

        <MetricCard
          title="Burn Rate"
          value={
            analytics.liquidityForecast?.burnRate
              ? `${formatCurrencyShort(analytics.liquidityForecast.burnRate / 1000000)}/mo`
              : '--'
          }
          {...(liquidityMetrics?.deploymentRate
            ? {
                change: `${(liquidityMetrics.deploymentRate * 100).toFixed(1)}% deployment rate`,
              }
            : {})}
          {...(analytics.cashFlowAnalysis?.patterns.outflowTrend
            ? { trend: analytics.cashFlowAnalysis.patterns.outflowTrend }
            : {})}
          icon={Activity as React.ComponentType<{ className?: string }>}
          loading={analytics.isLoadingAnalysis}
        />

        <MetricCard
          title="Cash Runway"
          value={
            analytics.liquidityForecast?.runwayMonths
              ? `${analytics.liquidityForecast.runwayMonths.toFixed(1)}mo`
              : '--'
          }
          {...(analytics.liquidityForecast?.runwayMonths
            ? {
                change: `${analytics.liquidityForecast.runwayMonths >= 12 ? 'Excellent' : analytics.liquidityForecast.runwayMonths >= 6 ? 'Good' : 'Critical'}`,
              }
            : {})}
          trend={
            analytics.liquidityForecast?.runwayMonths &&
            analytics.liquidityForecast.runwayMonths >= 12
              ? 'increasing'
              : analytics.liquidityForecast?.runwayMonths &&
                  analytics.liquidityForecast.runwayMonths >= 6
                ? 'stable'
                : 'decreasing'
          }
          icon={Clock as React.ComponentType<{ className?: string }>}
          loading={analytics.isLoadingForecast}
        />
      </div>

      {/* Charts Section */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="stress-test">Stress Test</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Cash Flow Trends</CardTitle>
                <CardDescription>Monthly inflows vs outflows over time</CardDescription>
              </CardHeader>
              <CardContent>
                {cashFlowChartData.length === 0 ? (
                  <div className="flex h-[300px] items-center justify-center text-sm text-charcoal-500">
                    No cash flow data available.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={cashFlowChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrencyShort(Number(value))} />
                      <Tooltip
                        formatter={(value) =>
                          value !== undefined ? formatCurrencyShort(Number(value)) : ''
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="inflows"
                        stackId="1"
                        stroke={CASHFLOW_CHART_COLORS.positive}
                        fill={CASHFLOW_CHART_COLORS.positive}
                        fillOpacity={0.6}
                      />
                      <Area
                        type="monotone"
                        dataKey="outflows"
                        stackId="2"
                        stroke={CASHFLOW_CHART_COLORS.negative}
                        fill={CASHFLOW_CHART_COLORS.negative}
                        fillOpacity={0.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Net Cash Flow</CardTitle>
                <CardDescription>Monthly net cash position</CardDescription>
              </CardHeader>
              <CardContent>
                {cashFlowChartData.length === 0 ? (
                  <div className="flex h-[300px] items-center justify-center text-sm text-charcoal-500">
                    No cash flow data available.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={cashFlowChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => formatCurrencyShort(Number(value))} />
                      <Tooltip
                        formatter={(value) =>
                          value !== undefined ? formatCurrencyShort(Number(value)) : ''
                        }
                      />
                      {/* charcoal accent per DESIGN.md (net-flow is non-semantic; no blue) */}
                      <Bar dataKey="netFlow" fill={CASHFLOW_CHART_COLORS.text} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Liquidity Forecast</CardTitle>
              <CardDescription>
                Projected cash and committed capital over {timeframe}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {liquidityForecastData.length === 0 ? (
                <div className="flex h-[400px] items-center justify-center text-sm text-charcoal-500">
                  No forecast data available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={liquidityForecastData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis
                      domain={[0, forecastMax]}
                      tickFormatter={(value) => formatCurrencyShort(Number(value))}
                    />
                    <Tooltip
                      formatter={(value) =>
                        value !== undefined ? formatCurrencyShort(Number(value)) : ''
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="cash"
                      stroke={CASHFLOW_CHART_COLORS.info}
                      strokeWidth={3}
                      name="Available Cash"
                    />
                    <Line
                      type="monotone"
                      dataKey="committed"
                      stroke={CASHFLOW_CHART_COLORS.text}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Undrawn Commitments"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Scenario Analysis */}
          {analytics.liquidityForecast?.scenarios && (
            <Card>
              <CardHeader>
                <CardTitle>Scenario Analysis</CardTitle>
                <CardDescription>
                  Different liquidity scenarios and their probabilities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.liquidityForecast.scenarios.map((scenario, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{scenario.name}</h4>
                        <p className="text-sm text-muted-foreground">{scenario.notes}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrencyShort(scenario.projectedCash / 1000000)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {(scenario.probability * 100).toFixed(0)}% probability
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>Fund operating expenses by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={expenseBreakdownData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill={CASHFLOW_CHART_COLORS.text}
                      dataKey="amount"
                    >
                      {expenseBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        value !== undefined ? formatCurrencyShort(Number(value)) : ''
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cash Velocity Metrics</CardTitle>
                <CardDescription>Operational efficiency indicators</CardDescription>
              </CardHeader>
              <CardContent>
                {liquidityMetrics ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Cash Efficiency</span>
                      <span className="text-sm">{liquidityMetrics.cashEfficiency.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Deployment Rate</span>
                      <span className="text-sm">
                        {(liquidityMetrics.deploymentRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Avg Cycle Time</span>
                      <span className="text-sm">
                        {liquidityMetrics.avgCycleTime.toFixed(0)} days
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Cash Flow Volatility</span>
                      <span className="text-sm">
                        {formatCurrencyShort(liquidityMetrics.cashFlowVolatility / 1000000)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    No velocity data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stress Test Tab */}
        <TabsContent value="stress-test" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Liquidity Stress Test</CardTitle>
              <CardDescription>Impact of adverse scenarios on fund liquidity</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.stressTestResult ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-success-dark">
                        {
                          analytics.stressTestResult.scenarios.filter((s) => s.endingCash > 0)
                            .length
                        }
                      </div>
                      <div className="text-sm text-muted-foreground">Scenarios Pass</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-error-dark">
                        {
                          analytics.stressTestResult.scenarios.filter((s) => s.endingCash <= 0)
                            .length
                        }
                      </div>
                      <div className="text-sm text-muted-foreground">Scenarios Fail</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div
                        className={`text-2xl font-bold ${
                          analytics.stressTestResult.riskLevel === 'low'
                            ? 'text-success-dark'
                            : analytics.stressTestResult.riskLevel === 'medium'
                              ? 'text-warning-dark'
                              : 'text-error-dark'
                        }`}
                      >
                        {analytics.stressTestResult.riskLevel.toUpperCase()}
                      </div>
                      <div className="text-sm text-muted-foreground">Risk Level</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Stress Test Scenarios</h4>
                    {analytics.stressTestResult.scenarios.map((scenario, index) => {
                      const vm = toStressScenarioViewModel(scenario, stressBaselineCash);
                      const DirectionIcon =
                        vm.impactDirection === 'unfavorable'
                          ? TrendingDown
                          : vm.impactDirection === 'favorable'
                            ? TrendingUp
                            : Activity;
                      const signedImpact = `${vm.liquidityImpact >= 0 ? '+' : '-'}${formatCurrencyShort(
                        Math.abs(vm.liquidityImpact) / 1000000
                      )}`;
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex-1">
                            <h5 className="font-medium">{vm.name}</h5>
                            <p className="text-sm text-muted-foreground">{vm.description}</p>
                          </div>
                          <div className="text-right">
                            <div
                              className={`font-medium ${getImpactTextClass({ direction: vm.impactDirection, severity: vm.impactSeverity })}`}
                            >
                              {formatCurrencyShort(vm.endingCash / 1000000)}
                            </div>
                            <div className="flex items-center justify-end gap-1 text-xs text-charcoal-600">
                              <DirectionIcon className="h-3 w-3" aria-hidden="true" />
                              <span>{signedImpact} vs current</span>
                            </div>
                            <Badge className={getImpactBadgeClass(vm.impactSeverity)}>
                              {vm.impactSeverity} impact
                            </Badge>
                            {workPanelEnabled && (
                              <div className="mt-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 text-xs text-charcoal-600 hover:text-charcoal-900"
                                  onClick={() =>
                                    workPanel.openPanel({
                                      panel: 'scenario',
                                      object: String(index),
                                      tab: 'proof',
                                    })
                                  }
                                >
                                  View proof
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {analytics.stressTestResult.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Recommendations</h4>
                      <ul className="space-y-1">
                        {analytics.stressTestResult.recommendations.map((rec, index) => (
                          <li
                            key={index}
                            className="text-sm text-muted-foreground flex items-start gap-2"
                          >
                            <ArrowUpRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Button
                    onClick={() => analytics.runStressTest()}
                    disabled={analytics.isLoadingStressTest}
                  >
                    {analytics.isLoadingStressTest ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Running Stress Test...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Run Stress Test
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {workPanelEnabled && (
        <StressScenarioProofPanel
          scenarios={analytics.stressTestResult?.scenarios ?? []}
          baselineCash={stressBaselineCash}
          state={workPanel.state}
          onClose={workPanel.closePanel}
        />
      )}
      {cashEventEnabled && (
        <CashEventsPanel fundId={fundId} state={workPanel.state} onClose={workPanel.closePanel} />
      )}
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  trend?: 'increasing' | 'decreasing' | 'stable';
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}

function MetricCard({ title, value, change, trend, icon: Icon, loading }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          {trend && (
            <div
              className={`p-1 rounded ${
                trend === 'increasing'
                  ? 'bg-success/10 text-success-dark'
                  : trend === 'decreasing'
                    ? 'bg-error/10 text-error-dark'
                    : 'bg-pov-gray text-charcoal-600'
              }`}
            >
              {trend === 'increasing' ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend === 'decreasing' ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Activity className="h-3 w-3" />
              )}
            </div>
          )}
        </div>
        <div className="mt-3">
          {loading ? (
            <div className="animate-pulse">
              <div className="h-8 bg-pov-gray rounded w-24"></div>
              <div className="h-4 bg-pov-gray rounded w-32 mt-2"></div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold">{value}</div>
              {change && <div className="text-sm text-muted-foreground mt-1">{change}</div>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Expense types are NEUTRAL categories (all cash movements, not gain/loss), so they
// use the monochrome brand categorical palette — avoids implying financial direction.
const EXPENSE_TYPE_ORDER = [
  'expense',
  'management_fee',
  'investment',
  'follow_on',
  'bridge_loan',
  'other',
];
function getColorForExpenseType(type: string): string {
  const idx = EXPENSE_TYPE_ORDER.indexOf(type);
  return getChartColor(idx >= 0 ? idx : EXPENSE_TYPE_ORDER.length, true);
}
