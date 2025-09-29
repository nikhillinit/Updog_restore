/**
 * Enhanced Dashboard Integration
 *
 * Shows how to integrate AI-enhanced components into the existing
 * Updog VC platform dashboard structure with real Monte Carlo data.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Import existing components
import { PremiumCard } from '@/components/ui/PremiumCard';
import { DashboardCard } from '@/components/dashboard/DashboardCard';

// Import our new AI-enhanced components
import AIInsightCard, { type MonteCarloResult } from '@/components/ui/ai-insight-card';
import ProgressiveDisclosureContainer, { type DataSection } from '@/components/ui/progressive-disclosure-container';
import {
  PowerLawTooltip,
  SeriesAChasmTooltip,
  IRRTooltip,
  MOICTooltip
} from '@/components/ui/contextual-tooltip';
import {
  DashboardSkeleton_Component,
  MetricsSkeleton
} from '@/components/ui/intelligent-skeleton';

import { cn } from '@/lib/utils';
import {
  TrendingUp,
  DollarSign,
  Target,
  PieChart,
  BarChart3,
  Lightbulb,
  Eye,
  Settings,
  RefreshCw
} from 'lucide-react';

// Integration with existing Monte Carlo service
async function fetchMonteCarloResults(): Promise<MonteCarloResult[]> {
  // This would integrate with the actual Monte Carlo service
  // For demo purposes, we'll simulate the data structure
  const mockResults: MonteCarloResult[] = [];

  for (let i = 0; i < 25; i++) {
    const rand = Math.random();
    let category: MonteCarloResult['category'];
    let multiple: number;

    if (rand < 0.70) {
      category = 'failure';
      multiple = Math.random() * 1;
    } else if (rand < 0.85) {
      category = 'modest';
      multiple = 1 + Math.random() * 2;
    } else if (rand < 0.95) {
      category = 'good';
      multiple = 3 + Math.random() * 7;
    } else if (rand < 0.99) {
      category = 'homeRun';
      multiple = 10 + Math.random() * 40;
    } else {
      category = 'unicorn';
      multiple = 50 + Math.random() * 150;
    }

    const exitTiming = 2 + Math.random() * 6;
    const irr = multiple > 0 ? Math.pow(multiple, 1 / exitTiming) - 1 : -1;

    mockResults.push({
      multiple: Math.round(multiple * 100) / 100,
      irr: Math.round(irr * 1000) / 1000,
      category,
      stage: ['pre-seed', 'seed', 'series-a', 'series-b'][Math.floor(Math.random() * 4)],
      exitTiming: Math.round(exitTiming * 10) / 10
    });
  }

  return mockResults;
}

interface EnhancedDashboardProps {
  fundData?: {
    fundSize: number;
    portfolioSize: number;
    timeHorizon: number;
  };
  className?: string;
}

export function EnhancedDashboardIntegration({
  fundData = {
    fundSize: 100000000, // $100M
    portfolioSize: 25,
    timeHorizon: 10
  },
  className
}: EnhancedDashboardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [monteCarloResults, setMonteCarloResults] = useState<MonteCarloResult[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Load Monte Carlo data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Simulate loading time
        await new Promise(resolve => setTimeout(resolve, 1500));
        const results = await fetchMonteCarloResults();
        setMonteCarloResults(results);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to load Monte Carlo results:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleRefreshData = async () => {
    setIsLoading(true);
    const results = await fetchMonteCarloResults();
    setMonteCarloResults(results);
    setLastUpdate(new Date());
    setIsLoading(false);
  };

  // Calculate key metrics from Monte Carlo results
  const metrics = React.useMemo(() => {
    if (monteCarloResults.length === 0) return null;

    const totalValue = monteCarloResults.reduce((sum, r) => sum + r.multiple, 0);
    const avgMultiple = totalValue / monteCarloResults.length;
    const avgIRR = monteCarloResults.reduce((sum, r) => sum + r.irr, 0) / monteCarloResults.length;
    const failureRate = monteCarloResults.filter(r => r.category === 'failure').length / monteCarloResults.length;
    const unicornCount = monteCarloResults.filter(r => r.category === 'unicorn').length;

    return {
      portfolioValue: (totalValue * 4).toFixed(0), // Assuming $4M average investment
      avgMultiple: avgMultiple.toFixed(1),
      avgIRR: (avgIRR * 100).toFixed(0),
      failureRate: Math.round(failureRate * 100),
      unicornCount,
      successRate: Math.round((1 - failureRate) * 100)
    };
  }, [monteCarloResults]);

  // Create data sections for progressive disclosure
  const dataSections: DataSection[] = React.useMemo(() => {
    if (!metrics) return [];

    return [
      {
        id: 'portfolio-performance',
        title: 'Portfolio Performance Overview',
        priority: 'high',
        complexity: 1,
        category: 'performance',
        executiveContent: (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                <MOICTooltip variant="inline">{metrics.avgMultiple}x</MOICTooltip>
              </div>
              <div className="text-sm text-gray-600">Portfolio MOIC</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                <IRRTooltip variant="inline">{metrics.avgIRR}%</IRRTooltip>
              </div>
              <div className="text-sm text-gray-600">Portfolio IRR</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">${metrics.portfolioValue}M</div>
              <div className="text-sm text-gray-600">Total Value</div>
            </div>
          </div>
        ),
        strategicContent: (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <Card className="p-4">
                <h4 className="font-semibold mb-3">Return Distribution</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Failures:</span>
                    <span className="font-medium">{metrics.failureRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Modest Returns:</span>
                    <span className="font-medium">{Math.round(monteCarloResults.filter(r => r.category === 'modest').length / monteCarloResults.length * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Good Outcomes:</span>
                    <span className="font-medium">{Math.round(monteCarloResults.filter(r => r.category === 'good').length / monteCarloResults.length * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span><PowerLawTooltip variant="inline">Unicorns</PowerLawTooltip>:</span>
                    <span className="font-medium text-purple-600">{metrics.unicornCount}</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <h4 className="font-semibold mb-3">Risk Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Success Rate:</span>
                    <span className="font-medium text-green-600">{metrics.successRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span><SeriesAChasmTooltip variant="inline">Series A Risk</SeriesAChasmTooltip>:</span>
                    <span className="font-medium text-red-600">High</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Portfolio Size:</span>
                    <span className="font-medium">{fundData.portfolioSize} companies</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )
      }
    ];
  }, [metrics, monteCarloResults, fundData.portfolioSize]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-inter text-slate-900">
            Portfolio Dashboard
          </h1>
          <p className="text-slate-600 font-poppins mt-1">
            AI-enhanced analytics powered by <PowerLawTooltip variant="inline">power law modeling</PowerLawTooltip>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Badge>
          <Button
            onClick={handleRefreshData}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards - Enhanced with Tooltips */}
      {isLoading ? (
        <MetricsSkeleton
          preview={{
            title: "Portfolio Metrics",
            subtitle: "Loading Monte Carlo simulation results...",
            dataType: "Real-time Analysis"
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <DashboardCard
            title="Portfolio Value"
            value={`$${metrics?.portfolioValue}M`}
            metric="Total"
            icon={<DollarSign className="h-5 w-5" />}
            change={12.5}
            changeLabel="vs last quarter"
          />
          <DashboardCard
            title="Portfolio IRR"
            value={`${metrics?.avgIRR}%`}
            metric="Annualized"
            icon={<TrendingUp className="h-5 w-5" />}
            change={8.2}
            changeLabel="vs benchmark"
          />
          <DashboardCard
            title="Average MOIC"
            value={`${metrics?.avgMultiple}x`}
            metric="Multiple"
            icon={<Target className="h-5 w-5" />}
            change={15.3}
            changeLabel="vs target"
          />
          <DashboardCard
            title="Success Rate"
            value={`${metrics?.successRate}%`}
            metric="Non-failure"
            icon={<PieChart className="h-5 w-5" />}
            change={-2.1}
            changeLabel="vs last fund"
          />
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="insights" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            AI Insights
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Progressive Analysis
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* AI Insights Tab */}
        <TabsContent value="insights">
          <PremiumCard
            title="AI-Powered Portfolio Insights"
            subtitle="Natural language analysis of your Monte Carlo simulation results"
            variant="highlight"
          >
            {isLoading ? (
              <DashboardSkeleton_Component
                preview={{
                  title: "AI Analysis",
                  subtitle: "Generating insights from simulation data..."
                }}
              />
            ) : (
              <AIInsightCard
                results={monteCarloResults}
                portfolioSize={fundData.portfolioSize}
                fundSize={fundData.fundSize}
                timeHorizon={fundData.timeHorizon}
                variant="detailed"
              />
            )}
          </PremiumCard>
        </TabsContent>

        {/* Progressive Analysis Tab */}
        <TabsContent value="analysis">
          <PremiumCard
            title="Multi-Level Analysis"
            subtitle="From executive overview to technical deep dive"
          >
            {isLoading ? (
              <DashboardSkeleton_Component
                preview={{
                  title: "Progressive Analysis",
                  subtitle: "Preparing multi-level views..."
                }}
              />
            ) : (
              <ProgressiveDisclosureContainer
                title="Portfolio Analysis"
                subtitle={`Monte Carlo simulation • ${monteCarloResults.length} investments • ${fundData.timeHorizon}yr horizon`}
                sections={dataSections}
                defaultView="executive"
                showViewIndicator={true}
              />
            )}
          </PremiumCard>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="grid gap-6">
            <PremiumCard title="Performance Metrics" subtitle="Detailed portfolio performance analysis">
              {isLoading ? (
                <div className="space-y-4">
                  <MetricsSkeleton />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Enhanced performance content with tooltips */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <h3 className="font-semibold">Return Analysis</h3>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span><PowerLawTooltip variant="inline">Power Law Distribution</PowerLawTooltip>:</span>
                            <Badge variant="secondary">Active</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span>Top Quartile Impact:</span>
                            <span className="font-medium">
                              {Math.round(
                                monteCarloResults.sort((a, b) => b.multiple - a.multiple)
                                  .slice(0, Math.ceil(monteCarloResults.length * 0.25))
                                  .reduce((sum, r) => sum + r.multiple, 0) /
                                monteCarloResults.reduce((sum, r) => sum + r.multiple, 0) * 100
                              )}% of returns
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span><SeriesAChasmTooltip variant="inline">Series A Chasm</SeriesAChasmTooltip> Risk:</span>
                            <Badge variant={metrics && metrics.failureRate > 65 ? "destructive" : "secondary"}>
                              {metrics && metrics.failureRate > 65 ? "High" : "Moderate"}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <h3 className="font-semibold">Portfolio Construction</h3>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span>Portfolio Size:</span>
                            <span className="font-medium">{fundData.portfolioSize} companies</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Average Investment:</span>
                            <span className="font-medium">${(fundData.fundSize / fundData.portfolioSize / 1000000).toFixed(1)}M</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Time Horizon:</span>
                            <span className="font-medium">{fundData.timeHorizon} years</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </PremiumCard>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <PremiumCard title="Dashboard Settings" subtitle="Configure your analytics preferences">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h4 className="font-semibold mb-2">AI Insights</h4>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      Show confidence levels
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      Include market context
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      Generate recommendations
                    </label>
                  </div>
                </Card>
                <Card className="p-4">
                  <h4 className="font-semibold mb-2">Progressive Disclosure</h4>
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      Show complexity indicators
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      Auto-advance views
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked />
                      Remember view preferences
                    </label>
                  </div>
                </Card>
              </div>
            </div>
          </PremiumCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EnhancedDashboardIntegration;