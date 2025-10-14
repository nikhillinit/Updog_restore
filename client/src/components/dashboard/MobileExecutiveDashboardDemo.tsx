/**
 * MobileExecutiveDashboardDemo Component
 *
 * Complete integration demonstration of Agent 2's mobile-first executive dashboard
 * with Agent 1's AI-enhanced components. Showcases:
 * - ExecutiveDashboard with mobile-first design
 * - SwipeableMetricCards with touch navigation
 * - MobileOptimizedCharts for performance
 * - ResponsiveLayout system
 * - Integration with AIInsightCard and ProgressiveDisclosure
 * - Performance optimization for mobile networks
 */

import React, { useState, Suspense } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFundContext } from '@/contexts/FundContext';

// Agent 2 Components (Mobile-First Executive Dashboard)
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';
import { SwipeableMetricCards, type MetricCardData } from '@/components/ui/SwipeableMetricCards';
import {
  MobileLineChart,
  MobileDonutChart,
  MobileBarChart,
  Sparkline,
  ChartSkeleton
} from '@/components/charts/MobileOptimizedCharts';
import {
  ResponsiveGrid,
  ResponsiveContainer,
  ResponsiveStack,
  ResponsiveFlex,
  ResponsiveLayoutDebugger,
  useResponsiveBreakpoint,
  type ResponsiveContentItem
} from '@/components/layout/ResponsiveLayout';

// Agent 1 Components (AI-Enhanced)
import { AIInsightCard, type PortfolioInsight } from '@/components/ui/ai-insight-card';
import {
  ProgressiveDisclosureContainer,
  type DataSection
} from '@/components/ui/progressive-disclosure-container';

// Icons
import {
  DollarSign,
  TrendingUp,
  Target,
  Users,
  Activity,
  Brain,
  Smartphone,
  BarChart3,
  Zap,
  Eye
} from 'lucide-react';

interface MobileExecutiveDashboardDemoProps {
  className?: string;
  enableDebugger?: boolean;
  performanceMode?: 'standard' | 'optimized' | 'ultra';
}

export function MobileExecutiveDashboardDemo({
  className,
  enableDebugger = false,
  performanceMode = 'optimized'
}: MobileExecutiveDashboardDemoProps) {
  const { currentFund, isLoading } = useFundContext();
  const { viewport, isMobile, isTablet, dimensions } = useResponsiveBreakpoint();
  const [activeDemo, setActiveDemo] = useState<'executive' | 'charts' | 'ai-integration'>('executive');

  // Generate demo data based on fund context
  const demoMetrics: MetricCardData[] = React.useMemo(() => {
    if (!currentFund) return [];

    const portfolioValue = currentFund.deployedCapital * 2.4;
    const moic = portfolioValue / currentFund.deployedCapital;
    const deploymentRate = (currentFund.deployedCapital / currentFund.size) * 100;

    return [
      {
        id: 'portfolio-value',
        title: 'Portfolio Value',
        value: `$${(portfolioValue / 1000000).toFixed(1)}M`,
        subtitle: `${moic.toFixed(2)}x MOIC`,
        change: '+15.2%',
        trend: 'up' as const,
        severity: 'success' as const,
        icon: DollarSign as React.ComponentType<{ className?: string }>
      },
      {
        id: 'net-irr',
        title: 'Net IRR',
        value: '28.5%',
        subtitle: 'vs 22% benchmark',
        change: '+2.8%',
        trend: 'up' as const,
        severity: 'success' as const,
        icon: TrendingUp as React.ComponentType<{ className?: string }>
      },
      {
        id: 'deployment',
        title: 'Deployed',
        value: `${deploymentRate.toFixed(0)}%`,
        subtitle: `$${(currentFund.deployedCapital / 1000000).toFixed(1)}M of fund`,
        change: '+8.5%',
        trend: 'up' as const,
        severity: deploymentRate > 70 ? ('warning' as const) : ('neutral' as const),
        icon: Target as React.ComponentType<{ className?: string }>
      },
      {
        id: 'portfolio-count',
        title: 'Portfolio',
        value: '24',
        subtitle: '8 exits completed',
        change: '+3',
        trend: 'up' as const,
        severity: 'neutral' as const,
        icon: Users as React.ComponentType<{ className?: string }>
      }
    ];
  }, [currentFund]);

  // Sample chart data
  const performanceData = [
    { timestamp: 'Q1 23', value: 100 },
    { timestamp: 'Q2 23', value: 116 },
    { timestamp: 'Q3 23', value: 142 },
    { timestamp: 'Q4 23', value: 162 },
    { timestamp: 'Q1 24', value: 192 }
  ];

  const sectorData = [
    { label: 'FinTech', value: 35, color: '#3b82f6' },
    { label: 'HealthTech', value: 28, color: '#10b981' },
    { label: 'Enterprise SaaS', value: 22, color: '#f59e0b' },
    { label: 'Consumer', value: 15, color: '#ef4444' }
  ];

  const riskData = [
    { label: 'Concentration Risk', value: 25 },
    { label: 'Vintage Risk', value: 60 },
    { label: 'Sector Risk', value: 35 },
    { label: 'Stage Risk', value: 45 }
  ];

  // AI Insights for demo
  const aiInsights: PortfolioInsight[] = [
    {
      title: "Exceptional Performance Trajectory",
      insight: "Your portfolio is performing 15% above target with top-quartile IRR. The power law distribution is working in your favor with 3 potential unicorns in the pipeline.",
      recommendation: "Consider increasing check sizes for follow-on rounds in top performers. Current deployment pace is optimal for market conditions.",
      confidence: 94,
      severity: 'low',
      category: 'opportunity',
      metrics: [
        { label: 'vs Target', value: '+15%', trend: 'up' },
        { label: 'Industry Rank', value: 'Top 10%', trend: 'up' }
      ]
    },
    {
      title: "Optimal Capital Deployment",
      insight: "Your 68% deployment rate aligns perfectly with vintage curve projections. The Series A Chasm impact is minimal in your portfolio.",
      recommendation: "Maintain current pacing while building reserves for promising companies entering growth stages.",
      confidence: 88,
      severity: 'medium',
      category: 'strategy'
    }
  ];

  // Progressive disclosure sections
  const progressiveSections: DataSection[] = [
    {
      id: 'performance-metrics',
      title: 'Performance Metrics',
      priority: 'high',
      complexity: 1,
      category: 'performance',
      executiveContent: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-700">Top 5%</div>
              <div className="text-sm text-green-600">Benchmark Rank</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-700">3.4x</div>
              <div className="text-sm text-blue-600">Total Multiple</div>
            </div>
          </div>
          <MobileLineChart
            data={performanceData}
            height={120}
            color="#10b981"
            showPoints={true}
          />
        </div>
      ),
      strategicContent: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Portfolio Performance</h4>
              <MobileLineChart
                data={performanceData}
                height={160}
                color="#3b82f6"
                showPoints={true}
              />
            </div>
            <div>
              <h4 className="font-semibold mb-3">Sector Allocation</h4>
              <MobileDonutChart
                data={sectorData}
                size={160}
                showLabels={false}
                centerContent={
                  <div>
                    <div className="text-xl font-bold">4</div>
                    <div className="text-xs text-slate-600">Sectors</div>
                  </div>
                }
              />
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Risk Assessment</h4>
            <MobileBarChart
              data={riskData}
              height={120}
              color="#f59e0b"
              showValues={true}
            />
          </div>
        </div>
      )
    },
    {
      id: 'ai-insights',
      title: 'AI-Powered Insights',
      priority: 'high',
      complexity: 1,
      category: 'scenarios',
      executiveContent: (
        <AIInsightCard
          insights={aiInsights}
          variant="compact"
        />
      )
    }
  ];

  // Responsive content configuration
  const responsiveContent: ResponsiveContentItem[] = [
    {
      id: 'metrics-swipeable',
      priority: 'critical',
      component: (
        <Card>
          <CardHeader>
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Key Metrics (Swipeable)
            </h3>
          </CardHeader>
          <CardContent>
            <SwipeableMetricCards
              metrics={demoMetrics}
              enableSwipeNavigation={true}
              compactMode={isMobile}
              cardsPerView={isMobile ? 1 : 2}
            />
          </CardContent>
        </Card>
      ),
      span: { mobile: 1, tablet: 2, desktop: 2 }
    },
    {
      id: 'ai-insights-card',
      priority: 'critical',
      component: (
        <Card>
          <CardHeader>
            <h3 className="font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Insights
            </h3>
          </CardHeader>
          <CardContent>
            <AIInsightCard
              insights={aiInsights}
              variant={isMobile ? 'compact' : 'default'}
            />
          </CardContent>
        </Card>
      ),
      span: { mobile: 1, tablet: 2, desktop: 2 }
    },
    {
      id: 'performance-charts',
      priority: 'important',
      mobileComponent: (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-sm">Performance</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Portfolio Growth</span>
                <Sparkline data={[100, 116, 142, 162, 192]} trend="up" />
              </div>
              <MobileLineChart
                data={performanceData}
                height={100}
                color="#10b981"
              />
            </div>
          </CardContent>
        </Card>
      ),
      component: (
        <Card>
          <CardHeader>
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Performance Charts
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="font-medium mb-2">Portfolio Growth</h4>
                <MobileLineChart
                  data={performanceData}
                  height={isTablet ? 140 : 180}
                  color="#10b981"
                  showPoints={true}
                />
              </div>
              <div>
                <h4 className="font-medium mb-2">Sector Breakdown</h4>
                <MobileDonutChart
                  data={sectorData}
                  size={isTablet ? 120 : 160}
                  showLabels={true}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ),
      span: { mobile: 1, tablet: 1, desktop: 1 }
    },
    {
      id: 'progressive-disclosure',
      priority: 'nice-to-have',
      component: (
        <Card>
          <CardHeader>
            <h3 className="font-semibold flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Progressive Analysis
            </h3>
          </CardHeader>
          <CardContent>
            <ProgressiveDisclosureContainer
              title=""
              sections={progressiveSections}
              defaultView="executive"
              showViewIndicator={!isMobile}
            />
          </CardContent>
        </Card>
      ),
      span: { mobile: 1, tablet: 2, desktop: 2 }
    }
  ];

  if (isLoading) {
    return (
      <ResponsiveContainer {...(className ? { className } : {})}>
        <ResponsiveStack spacing="md">
          <ChartSkeleton height={120} type="line" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartSkeleton height={160} type="bar" />
            <ChartSkeleton height={160} type="donut" />
          </div>
        </ResponsiveStack>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer
      maxWidth="2xl"
      padding="md"
      className={cn("space-y-6", className)}
    >
      {/* Header with viewport info */}
      <div className="space-y-4">
        <ResponsiveFlex
          direction="row-mobile-col"
          justify="between"
          align="center"
          gap="md"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-inter">
              Mobile Executive Dashboard
            </h1>
            <p className="text-slate-600 font-poppins">
              {currentFund?.name || 'Demo Fund'} • Agent 2 Integration Demo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Smartphone className="w-3 h-3 mr-1" />
              {viewport.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              {performanceMode.toUpperCase()}
            </Badge>
          </div>
        </ResponsiveFlex>

        {/* Demo Mode Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { id: 'executive', label: 'Executive Dashboard', icon: DollarSign },
            { id: 'charts', label: 'Mobile Charts', icon: BarChart3 },
            { id: 'ai-integration', label: 'AI Integration', icon: Brain }
          ].map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={activeDemo === id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveDemo(id as any)}
              className="whitespace-nowrap"
            >
              <Icon className="w-4 h-4 mr-2" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Demo Content */}
      <Suspense fallback={<ChartSkeleton height={400} type="line" />}>
        {activeDemo === 'executive' && (
          <ExecutiveDashboard
            enableSwipeNavigation={true}
            compactMode={isMobile}
            onMetricSelect={(metricId) => console.log('Selected metric:', metricId)}
          />
        )}

        {activeDemo === 'charts' && (
          <ResponsiveGrid
            items={responsiveContent.filter(item =>
              ['metrics-swipeable', 'performance-charts'].includes(item.id)
            )}
            gap="md"
          />
        )}

        {activeDemo === 'ai-integration' && (
          <ResponsiveGrid
            items={responsiveContent}
            gap="md"
          />
        )}
      </Suspense>

      {/* Performance Stats */}
      <Card className="border-dashed border-2 border-slate-200 bg-slate-50">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-sm font-medium text-slate-600">Bundle Size</div>
              <div className="text-lg font-bold text-green-600">
                {performanceMode === 'ultra' ? '<150KB' : '<200KB'}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">FCP Target</div>
              <div className="text-lg font-bold text-blue-600">&lt;1.5s</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Touch Targets</div>
              <div className="text-lg font-bold text-purple-600">≥44px</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-600">Lighthouse</div>
              <div className="text-lg font-bold text-orange-600">&gt;90</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Debug Info */}
      <ResponsiveLayoutDebugger enabled={enableDebugger} />
    </ResponsiveContainer>
  );
}

export default MobileExecutiveDashboardDemo;