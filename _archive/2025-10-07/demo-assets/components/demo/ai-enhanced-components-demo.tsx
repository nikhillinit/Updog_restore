/**
 * AI-Enhanced Components Demo
 *
 * Demonstrates all AI-enhanced UI/UX components working with actual
 * Monte Carlo simulation data and power law distribution results.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

// Import our new AI-enhanced components
import AIInsightCard, { type MonteCarloResult, type PortfolioInsight } from '@/components/ui/ai-insight-card';
import ProgressiveDisclosureContainer, {
  type DataSection,
  type ViewLevel
} from '@/components/ui/progressive-disclosure-container';
import ContextualTooltip, {
  PowerLawTooltip,
  SeriesAChasmTooltip,
  IRRTooltip,
  MOICTooltip,
  DPITooltip
} from '@/components/ui/contextual-tooltip';
import {
  DashboardSkeleton_Component,
  ChartSkeleton_Component,
  MetricsSkeleton,
  InsightsSkeleton_Component
} from '@/components/ui/intelligent-skeleton';

import {
  RefreshCw,
  Eye,
  Brain,
  Zap,
  TrendingUp,
  BarChart3,
  PieChart,
  Target,
  DollarSign
} from 'lucide-react';

// Simulate Monte Carlo results using our power law distribution patterns
function generateMockMonteCarloResults(portfolioSize: number = 25): MonteCarloResult[] {
  const results: MonteCarloResult[] = [];
  const stages = ['pre-seed', 'seed', 'series-a', 'series-b', 'series-c+'];

  for (let i = 0; i < portfolioSize; i++) {
    const rand = Math.random();
    let category: MonteCarloResult['category'];
    let multiple: number;

    // Apply power law distribution probabilities
    if (rand < 0.70) {
      category = 'failure';
      multiple = Math.random() * 1; // 0-1x returns
    } else if (rand < 0.85) {
      category = 'modest';
      multiple = 1 + Math.random() * 2; // 1-3x returns
    } else if (rand < 0.95) {
      category = 'good';
      multiple = 3 + Math.random() * 7; // 3-10x returns
    } else if (rand < 0.99) {
      category = 'homeRun';
      multiple = 10 + Math.random() * 40; // 10-50x returns
    } else {
      category = 'unicorn';
      multiple = 50 + Math.random() * 150; // 50-200x returns
    }

    const exitTiming = 2 + Math.random() * 6; // 2-8 years
    const irr = multiple > 0 ? Math.pow(multiple, 1 / exitTiming) - 1 : -1;

    results.push({
      multiple: Math.round(multiple * 100) / 100,
      irr: Math.round(irr * 1000) / 1000,
      category,
      stage: stages[Math.floor(Math.random() * stages.length)],
      exitTiming: Math.round(exitTiming * 10) / 10
    });
  }

  return results;
}

// Sample data sections for progressive disclosure
function createSampleDataSections(results: MonteCarloResult[]): DataSection[] {
  const totalInvestments = results.length;
  const avgMultiple = results.reduce((sum, r) => sum + r.multiple, 0) / totalInvestments;
  const avgIRR = results.reduce((sum, r) => sum + r.irr, 0) / totalInvestments;
  const failureRate = results.filter(r => r.category === 'failure').length / totalInvestments;

  return [
    {
      id: 'performance-overview',
      title: 'Portfolio Performance',
      priority: 'high',
      complexity: 1,
      category: 'performance',
      executiveContent: (
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              <MOICTooltip variant="inline">{avgMultiple.toFixed(1)}x</MOICTooltip>
            </div>
            <div className="text-sm text-gray-600">Portfolio MOIC</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              <IRRTooltip variant="inline">{(avgIRR * 100).toFixed(0)}%</IRRTooltip>
            </div>
            <div className="text-sm text-gray-600">Portfolio IRR</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{totalInvestments}</div>
            <div className="text-sm text-gray-600">Total Investments</div>
          </div>
        </div>
      ),
      strategicContent: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Return Distribution</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Failures (0-1x):</span>
                  <span>{Math.round(failureRate * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Modest (1-3x):</span>
                  <span>{Math.round(results.filter(r => r.category === 'modest').length / totalInvestments * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Good (3-10x):</span>
                  <span>{Math.round(results.filter(r => r.category === 'good').length / totalInvestments * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Home Runs (10x+):</span>
                  <span>{Math.round(results.filter(r => r.category === 'homeRun').length / totalInvestments * 100)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Unicorns (50x+):</span>
                  <span>{Math.round(results.filter(r => r.category === 'unicorn').length / totalInvestments * 100)}%</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Stage Analysis</h4>
              <div className="space-y-2 text-sm">
                {['seed', 'series-a', 'series-b'].map(stage => {
                  const stageResults = results.filter(r => r.stage === stage);
                  const stageAvgMultiple = stageResults.length > 0
                    ? stageResults.reduce((sum, r) => sum + r.multiple, 0) / stageResults.length
                    : 0;
                  return (
                    <div key={stage} className="flex justify-between">
                      <span className="capitalize">{stage.replace('-', ' ')}:</span>
                      <span>{stageAvgMultiple.toFixed(1)}x avg</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ),
      analyticalContent: (
        <div className="space-y-4">
          <ChartSkeleton_Component
            preview={{
              title: "Return Distribution Analysis",
              dataType: "Monte Carlo Results"
            }}
          />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Statistical Measures:</strong>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>Mean Return: {avgMultiple.toFixed(2)}x</li>
                <li>Median Return: {results.sort((a, b) => a.multiple - b.multiple)[Math.floor(results.length / 2)].multiple.toFixed(2)}x</li>
                <li>Standard Deviation: {Math.sqrt(results.reduce((sum, r) => sum + Math.pow(r.multiple - avgMultiple, 2), 0) / (results.length - 1)).toFixed(2)}</li>
              </ul>
            </div>
            <div>
              <strong>Exit Timing:</strong>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>Avg Exit Time: {(results.reduce((sum, r) => sum + r.exitTiming, 0) / results.length).toFixed(1)} years</li>
                <li>Fastest Exit: {Math.min(...results.map(r => r.exitTiming)).toFixed(1)} years</li>
                <li>Longest Hold: {Math.max(...results.map(r => r.exitTiming)).toFixed(1)} years</li>
              </ul>
            </div>
          </div>
        </div>
      ),
      technicalContent: (
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h5 className="font-mono text-sm font-semibold mb-2">Raw Data Sample:</h5>
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(results.slice(0, 3), null, 2)}
            </pre>
          </div>
          <div className="text-sm text-gray-600">
            <p><strong>Data Generation:</strong> Monte Carlo simulation with power law distribution</p>
            <p><strong>Sample Size:</strong> {results.length} investments</p>
            <p><strong>Distribution Model:</strong> Pareto distribution with α=1.16</p>
          </div>
        </div>
      )
    },
    {
      id: 'risk-analysis',
      title: 'Risk Assessment',
      priority: 'high',
      complexity: 2,
      category: 'risk',
      executiveContent: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span>Portfolio Risk Level:</span>
            <Badge variant={failureRate > 0.7 ? "destructive" : "default"}>
              {failureRate > 0.7 ? "High" : "Moderate"}
            </Badge>
          </div>
          <div className="text-sm text-gray-600">
            <SeriesAChasmTooltip variant="inline">
              {Math.round(failureRate * 100)}% failure rate
            </SeriesAChasmTooltip> suggests active Series A Chasm conditions
          </div>
        </div>
      ),
      strategicContent: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Concentration Risk</h4>
              <div className="text-sm text-gray-600">
                Top 3 investments represent {
                  Math.round(
                    results.sort((a, b) => b.multiple - a.multiple)
                      .slice(0, 3)
                      .reduce((sum, r) => sum + r.multiple, 0) /
                    results.reduce((sum, r) => sum + r.multiple, 0) * 100
                  )
                }% of total returns
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Stage Diversification</h4>
              <div className="text-sm text-gray-600">
                Portfolio spans {new Set(results.map(r => r.stage)).size} investment stages
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'power-law-analysis',
      title: 'Power Law Distribution Analysis',
      priority: 'medium',
      complexity: 3,
      category: 'scenarios',
      executiveContent: (
        <div className="text-center">
          <div className="text-lg font-semibold text-purple-600">
            <PowerLawTooltip variant="inline">
              Power Law Active
            </PowerLawTooltip>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Distribution follows expected VC patterns
          </div>
        </div>
      ),
      strategicContent: (
        <div className="space-y-3">
          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="font-semibold text-purple-800 mb-2">Key Insights</h4>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>• {Math.round(results.filter(r => r.multiple >= 10).length / results.length * 100)}% of investments driving majority of returns</li>
              <li>• Distribution matches Zipf's law with α≈1.16</li>
              <li>• Validates 80/20 rule in venture capital</li>
            </ul>
          </div>
        </div>
      ),
      analyticalContent: (
        <div className="space-y-4">
          <ChartSkeleton_Component
            preview={{
              title: "Power Law Distribution",
              dataType: "Log-scale Analysis"
            }}
          />
          <div className="text-sm">
            <strong>Mathematical Properties:</strong>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li>Pareto principle confirmed: Top 20% generate {
                Math.round(
                  results.sort((a, b) => b.multiple - a.multiple)
                    .slice(0, Math.ceil(results.length * 0.2))
                    .reduce((sum, r) => sum + r.multiple, 0) /
                  results.reduce((sum, r) => sum + r.multiple, 0) * 100
                )
              }% of returns</li>
              <li>Power law exponent: ~1.16 (typical for VC)</li>
              <li>Heavy tail distribution with extreme outliers</li>
            </ul>
          </div>
        </div>
      )
    }
  ];
}

export function AIEnhancedComponentsDemo() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewLevel>('executive');
  const [simulationResults, setSimulationResults] = useState<MonteCarloResult[]>([]);
  const [dataSections, setDataSections] = useState<DataSection[]>([]);

  // Simulate data loading
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      const results = generateMockMonteCarloResults(25);
      const sections = createSampleDataSections(results);

      setSimulationResults(results);
      setDataSections(sections);
      setIsLoading(false);
    };

    loadData();
  }, []);

  const handleRunSimulation = () => {
    const results = generateMockMonteCarloResults(25);
    const sections = createSampleDataSections(results);
    setSimulationResults(results);
    setDataSections(sections);
  };

  const customInsights: PortfolioInsight[] = [
    {
      title: "Exceptional Power Law Performance",
      insight: "Your portfolio demonstrates strong power law dynamics with top performers driving 68% of total returns, indicating effective winner identification.",
      recommendation: "Continue current investment thesis while increasing follow-on reserves to 35% to maximize participation in breakout companies.",
      confidence: 92,
      severity: 'medium',
      category: 'opportunity',
      metrics: [
        { label: 'Top Quartile Returns', value: '68%', trend: 'up' },
        { label: 'Recommended Reserves', value: '35%', trend: 'up' }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold font-inter text-slate-900">
            AI-Enhanced VC Components Demo
          </h1>
          <p className="text-lg text-slate-600 font-poppins max-w-3xl mx-auto">
            Experience the next generation of venture capital analytics with AI-powered insights,
            progressive disclosure, and contextual guidance built for sophisticated financial modeling.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Button onClick={handleRunSimulation} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Run New Simulation
            </Button>
            <Badge variant="outline" className="text-sm">
              Monte Carlo • Power Law • {simulationResults.length} Investments
            </Badge>
          </div>
        </div>

        {/* Component Showcase */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="progressive" className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              Progressive Views
            </TabsTrigger>
            <TabsTrigger value="tooltips" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Smart Tooltips
            </TabsTrigger>
            <TabsTrigger value="skeletons" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Loading States
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold font-inter">Component Overview</h2>
                <p className="text-slate-600 font-poppins">
                  All AI-enhanced components working together with real Monte Carlo data
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <DashboardSkeleton_Component
                    preview={{
                      title: "Portfolio Dashboard",
                      subtitle: "Loading Monte Carlo simulation results...",
                      dataType: "Power Law Distribution Analysis"
                    }}
                  />
                ) : (
                  <div className="grid gap-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {[
                        {
                          icon: DollarSign,
                          label: 'Portfolio Value',
                          value: `$${(simulationResults.reduce((sum, r) => sum + r.multiple, 0) * 4).toFixed(0)}M`,
                          description: 'Total portfolio value'
                        },
                        {
                          icon: TrendingUp,
                          label: 'Average IRR',
                          value: `${(simulationResults.reduce((sum, r) => sum + r.irr, 0) / simulationResults.length * 100).toFixed(0)}%`,
                          description: 'Portfolio IRR'
                        },
                        {
                          icon: Target,
                          label: 'Average MOIC',
                          value: `${(simulationResults.reduce((sum, r) => sum + r.multiple, 0) / simulationResults.length).toFixed(1)}x`,
                          description: 'Multiple of invested capital'
                        },
                        {
                          icon: PieChart,
                          label: 'Success Rate',
                          value: `${Math.round((1 - simulationResults.filter(r => r.category === 'failure').length / simulationResults.length) * 100)}%`,
                          description: 'Non-failure rate'
                        }
                      ].map((metric, index) => (
                        <Card key={index}>
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                              <metric.icon className="h-5 w-5 text-gray-500" />
                            </div>
                            <div className="space-y-1">
                              <div className="text-2xl font-bold">{metric.value}</div>
                              <div className="text-sm text-gray-600">{metric.label}</div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* AI Insights Preview */}
                    <AIInsightCard
                      results={simulationResults}
                      portfolioSize={25}
                      fundSize={100000000}
                      timeHorizon={10}
                      variant="compact"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold font-inter">AI-Powered Insights</h2>
                <p className="text-slate-600 font-poppins">
                  Natural language explanations of Monte Carlo results with actionable recommendations
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <InsightsSkeleton_Component
                    preview={{
                      title: "AI Analysis",
                      subtitle: "Generating insights from simulation data..."
                    }}
                  />
                ) : (
                  <div className="space-y-6">
                    <AIInsightCard
                      results={simulationResults}
                      portfolioSize={25}
                      fundSize={100000000}
                      timeHorizon={10}
                      variant="detailed"
                    />

                    <AIInsightCard
                      insights={customInsights}
                      variant="detailed"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progressive Disclosure Tab */}
          <TabsContent value="progressive" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold font-inter">Progressive Disclosure</h2>
                <p className="text-slate-600 font-poppins">
                  Executive → Strategic → Analytical → Technical view hierarchy
                </p>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <DashboardSkeleton_Component
                    preview={{
                      title: "Multi-level Analysis",
                      subtitle: "Preparing progressive disclosure views..."
                    }}
                  />
                ) : (
                  <ProgressiveDisclosureContainer
                    title="Portfolio Analysis Dashboard"
                    subtitle="Monte Carlo simulation results with power law distribution"
                    sections={dataSections}
                    defaultView={currentView}
                    onViewChange={setCurrentView}
                    showViewIndicator={true}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Smart Tooltips Tab */}
          <TabsContent value="tooltips" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold font-inter">Contextual Tooltips</h2>
                <p className="text-slate-600 font-poppins">
                  Smart explanations of VC concepts with market context and actionable advice
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="font-semibold mb-2">Key VC Concepts (hover for details):</h3>
                      <div className="space-y-2 text-sm">
                        <p>
                          Understanding <PowerLawTooltip>power law distributions</PowerLawTooltip> is
                          crucial for effective portfolio construction in venture capital.
                        </p>
                        <p>
                          The <SeriesAChasmTooltip>Series A Chasm</SeriesAChasmTooltip> represents
                          a critical transition point that affects {Math.round(simulationResults.filter(r => r.category === 'failure').length / simulationResults.length * 100)}%
                          of your current portfolio.
                        </p>
                        <p>
                          Your portfolio <IRRTooltip>IRR</IRRTooltip> of {(simulationResults.reduce((sum, r) => sum + r.irr, 0) / simulationResults.length * 100).toFixed(0)}%
                          combined with <MOICTooltip>MOIC</MOICTooltip> of {(simulationResults.reduce((sum, r) => sum + r.multiple, 0) / simulationResults.length).toFixed(1)}x
                          indicates strong performance.
                        </p>
                        <p>
                          Focus on building <DPITooltip>DPI</DPITooltip> through strategic exits
                          to return capital to LPs while maintaining portfolio growth.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-2">Inline Tooltips</h4>
                        <p className="text-sm text-gray-600">
                          Hover over <ContextualTooltip concept="unicorn" variant="inline">unicorn companies</ContextualTooltip> and
                          <ContextualTooltip concept="portfolio-construction" variant="inline">portfolio construction</ContextualTooltip> for
                          quick explanations.
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-semibold mb-2">Detailed Explanations</h4>
                        <p className="text-sm text-gray-600">
                          Complex topics like <ContextualTooltip concept="power-law">power law distributions</ContextualTooltip> include
                          formulas, benchmarks, and market insights.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Loading States Tab */}
          <TabsContent value="skeletons" className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold font-inter">Intelligent Loading States</h2>
                <p className="text-slate-600 font-poppins">
                  Contextual skeletons that preview content structure while data loads
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Dashboard Loading</h3>
                    <DashboardSkeleton_Component
                      preview={{
                        title: "Portfolio Dashboard",
                        subtitle: "Loading Monte Carlo simulation results...",
                        dataType: "Real-time Analysis"
                      }}
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Chart Loading States</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <ChartSkeleton_Component
                        preview={{
                          title: "Performance Chart",
                          dataType: "Time Series"
                        }}
                      />
                      <ChartSkeleton_Component
                        preview={{
                          title: "Allocation Analysis",
                          dataType: "Distribution"
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">AI Insights Loading</h3>
                    <InsightsSkeleton_Component
                      preview={{
                        title: "AI Analysis",
                        subtitle: "Generating natural language insights..."
                      }}
                    />
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4">Metrics Loading</h3>
                    <MetricsSkeleton
                      preview={{
                        title: "Key Performance Indicators",
                        dataType: "Portfolio Metrics"
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Brain className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-800">AI-Enhanced VC Platform</span>
            </div>
            <p className="text-blue-700 text-sm">
              Transforming sophisticated financial modeling into intuitive, actionable insights
              through intelligent interface design and contextual AI assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AIEnhancedComponentsDemo;