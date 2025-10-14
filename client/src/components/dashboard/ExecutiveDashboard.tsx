/**
 * ExecutiveDashboard Component
 *
 * Mobile-first executive dashboard optimized for C-level decision makers.
 * Focuses on 3-4 key metrics with AI-powered insights and touch-friendly interactions.
 *
 * Mobile-first design principles:
 * - Progressive enhancement from mobile to desktop
 * - Touch-friendly interactions with proper tap targets (44px minimum)
 * - Swipe navigation for metric cards
 * - Optimized performance for 3G networks
 *
 * Performance targets:
 * - First Contentful Paint: <1.5s on 3G networks
 * - Lighthouse Mobile Score: >90
 * - Bundle impact: <200KB additional payload
 */

import React, { useState, useRef, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFundContext } from '@/contexts/FundContext';
import { AIInsightCard, type PortfolioInsight } from '@/components/ui/ai-insight-card';
import { ProgressiveDisclosureContainer, type DataSection } from '@/components/ui/progressive-disclosure-container';
import {
  DollarSign,
  TrendingUp,
  Target,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Smartphone,
  Activity
} from 'lucide-react';

// Lazy load heavy chart components for better performance
const LazyPerformanceChart = React.lazy(() =>
  import('@/components/charts/performance-optimizer').then(module => ({
    default: module.default
  }))
);

const LazyResponsiveContainer = React.lazy(() =>
  import('@/components/charts/LazyResponsiveContainer').then(module => ({
    default: module.LazyResponsiveContainer
  }))
);

// Executive KPIs - the 4 most critical metrics for C-level
interface ExecutiveKPI {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  severity: 'success' | 'warning' | 'critical' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  priority: number; // 1 = highest
}

interface ExecutiveDashboardProps {
  className?: string;
  onMetricSelect?: (metricId: string) => void;
  enableSwipeNavigation?: boolean;
  compactMode?: boolean;
}

// Touch-optimized metric card with proper tap targets (44px minimum)
function MetricCard({
  metric,
  isActive,
  onClick,
  compactMode = false
}: {
  metric: ExecutiveKPI;
  isActive?: boolean;
  onClick?: () => void;
  compactMode?: boolean;
}) {
  const IconComponent = metric.icon;

  const severityStyles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    critical: 'bg-red-50 border-red-200 text-red-800',
    neutral: 'bg-slate-50 border-slate-200 text-slate-800'
  };

  const trendIcons = {
    up: '↗',
    down: '↘',
    stable: '→'
  };

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    stable: 'text-slate-500'
  };

  return (
    <Card
      className={cn(
        "transition-all duration-300 cursor-pointer touch-manipulation",
        "hover:shadow-lg active:scale-95",
        "min-h-[120px]", // Ensure proper touch target
        isActive && "ring-2 ring-blue-500 ring-offset-2",
        severityStyles[metric.severity]
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
      aria-label={`${metric.title}: ${metric.value} ${metric.change}`}
    >
      <CardContent className={cn(
        "p-4",
        compactMode && "p-3"
      )}>
        <div className="flex items-start justify-between mb-3">
          <div className={cn(
            "p-2 rounded-lg bg-white/50",
            compactMode && "p-1.5"
          )}>
            <IconComponent className={cn(
              "h-5 w-5",
              compactMode && "h-4 w-4"
            )} />
          </div>
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-xs font-mono",
              trendColors[metric.trend]
            )}>
              {trendIcons[metric.trend]}
            </span>
            <span className={cn(
              "text-xs font-semibold",
              metric.trend === 'up' ? 'text-green-600' :
              metric.trend === 'down' ? 'text-red-600' : 'text-slate-500'
            )}>
              {metric.change}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className={cn(
            "font-poppins text-xs text-current/70",
            compactMode && "text-xs"
          )}>
            {metric.title}
          </p>
          <p className={cn(
            "font-inter font-bold text-2xl text-current",
            compactMode && "text-xl"
          )}>
            {metric.value}
          </p>
          <p className={cn(
            "font-mono text-xs text-current/60",
            compactMode && "text-xs"
          )}>
            {metric.subtitle}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Swipeable carousel for mobile metric navigation
function SwipeableMetricCards({
  metrics,
  activeIndex,
  onIndexChange,
  compactMode = false
}: {
  metrics: ExecutiveKPI[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  compactMode?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Handle touch/mouse events for swipe navigation
  const handleStart = (clientX: number) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(clientX);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || !scrollRef.current) return;
    const x = clientX;
    const walk = (x - startX) * 2; // Scroll speed multiplier
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleEnd = () => {
    setIsDragging(false);

    // Snap to nearest card
    if (scrollRef.current) {
      const cardWidth = scrollRef.current.clientWidth / (compactMode ? 2 : 1);
      const newIndex = Math.round(scrollRef.current.scrollLeft / cardWidth);
      const clampedIndex = Math.max(0, Math.min(metrics.length - 1, newIndex));
      onIndexChange(clampedIndex);

      // Smooth scroll to the exact position
      scrollRef.current.scrollTo({
        left: clampedIndex * cardWidth,
        behavior: 'smooth'
      });
    }
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    handleStart(e.touches[0]!.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0]!.clientX);
  };

  // Mouse events for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    handleStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX);
  };

  // Navigation buttons for accessibility
  const goToPrevious = () => {
    const newIndex = Math.max(0, activeIndex - 1);
    onIndexChange(newIndex);
  };

  const goToNext = () => {
    const newIndex = Math.min(metrics.length - 1, activeIndex + 1);
    onIndexChange(newIndex);
  };

  return (
    <div className="relative">
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-inter font-semibold text-lg text-slate-900">
          Key Metrics
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPrevious}
            disabled={activeIndex === 0}
            className="h-8 w-8 p-0"
            aria-label="Previous metric"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {metrics.map((_, index) => (
              <button
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === activeIndex ? "bg-blue-600 w-4" : "bg-slate-300"
                )}
                onClick={() => onIndexChange(index)}
                aria-label={`Go to metric ${index + 1}`}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNext}
            disabled={activeIndex === metrics.length - 1}
            className="h-8 w-8 p-0"
            aria-label="Next metric"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Swipeable Container */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory",
          "touch-pan-x cursor-grab active:cursor-grabbing",
          isDragging && "select-none"
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {metrics.map((metric, index) => (
          <div
            key={metric.id}
            className={cn(
              "flex-shrink-0 snap-start",
              compactMode ? "w-[calc(50%-0.5rem)]" : "w-full"
            )}
          >
            <MetricCard
              metric={metric}
              isActive={index === activeIndex}
              onClick={() => onIndexChange(index)}
              compactMode={compactMode}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Executive Dashboard Component
export function ExecutiveDashboard({
  className,
  onMetricSelect,
  enableSwipeNavigation = true,
  compactMode = false
}: ExecutiveDashboardProps) {
  const { currentFund, isLoading } = useFundContext();
  const [activeMetricIndex, setActiveMetricIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Generate executive KPIs from fund data
  const executiveKPIs: ExecutiveKPI[] = React.useMemo(() => {
    if (!currentFund) return [];

    const deploymentRate = (currentFund.deployedCapital / currentFund.size) * 100;
    const portfolioValue = currentFund.deployedCapital * 2.4; // Mock 2.4x multiple
    const moic = portfolioValue / currentFund.deployedCapital;
    const irr = 28.5; // Mock IRR

    return [
      {
        id: 'portfolio-value',
        title: 'Total Portfolio Value',
        value: `$${(portfolioValue / 1000000).toFixed(1)}M`,
        subtitle: `${moic.toFixed(2)}x MOIC`,
        change: '+15.2%',
        trend: 'up' as const,
        severity: 'success' as const,
        icon: DollarSign as React.ComponentType<{ className?: string }>,
        priority: 1
      },
      {
        id: 'irr',
        title: 'Net IRR',
        value: `${irr.toFixed(1)}%`,
        subtitle: 'vs 22% benchmark',
        change: '+2.8%',
        trend: 'up' as const,
        severity: 'success' as const,
        icon: TrendingUp as React.ComponentType<{ className?: string }>,
        priority: 2
      },
      {
        id: 'deployment',
        title: 'Capital Deployed',
        value: `$${(currentFund.deployedCapital / 1000000).toFixed(1)}M`,
        subtitle: `${deploymentRate.toFixed(0)}% of fund`,
        change: '+8.5%',
        trend: 'up' as const,
        severity: deploymentRate > 70 ? ('warning' as const) : ('neutral' as const),
        icon: Target as React.ComponentType<{ className?: string }>,
        priority: 3
      },
      {
        id: 'portfolio-companies',
        title: 'Active Portfolio',
        value: '24',
        subtitle: '8 exits completed',
        change: '+3',
        trend: 'up' as const,
        severity: 'neutral' as const,
        icon: Users as React.ComponentType<{ className?: string }>,
        priority: 4
      }
    ];
  }, [currentFund]);

  // Generate AI insights for executive view
  const executiveInsights: PortfolioInsight[] = React.useMemo(() => [
    {
      title: "Strong Performance Trajectory",
      insight: "Portfolio is tracking 15% above target with IRR exceeding industry benchmarks by 6.5 percentage points.",
      recommendation: "Consider increasing fund size for next vintage to capitalize on deal flow quality.",
      confidence: 92,
      severity: 'low',
      category: 'opportunity',
      metrics: [
        { label: 'vs Benchmark', value: '+6.5%', trend: 'up' },
        { label: 'Target Progress', value: '115%', trend: 'up' }
      ]
    },
    {
      title: "Optimal Deployment Pace",
      insight: "Current deployment rate aligns with vintage curve projections and market conditions.",
      recommendation: "Maintain disciplined approach while remaining opportunistic for exceptional deals.",
      confidence: 85,
      severity: 'medium',
      category: 'strategy'
    }
  ], []);

  // Progressive disclosure sections for executive view
  const progressiveDisclosureSections: DataSection[] = React.useMemo(() => [
    {
      id: 'performance-overview',
      title: 'Performance Overview',
      priority: 'high',
      complexity: 1,
      category: 'performance',
      executiveContent: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">Top 25%</div>
              <div className="text-sm text-green-600">Industry Ranking</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-700">3.2x</div>
              <div className="text-sm text-blue-600">DPI + RVPI</div>
            </div>
          </div>
          <Suspense fallback={<div className="h-32 bg-slate-100 animate-pulse rounded" />}>
            <LazyPerformanceChart
              data={[
                { month: 'Q1', value: 84 },
                { month: 'Q2', value: 92 },
                { month: 'Q3', value: 107 },
                { month: 'Q4', value: 115 }
              ]}
              height={120}
            />
          </Suspense>
        </div>
      )
    },
    {
      id: 'risk-assessment',
      title: 'Risk Assessment',
      priority: 'high',
      complexity: 1,
      category: 'risk',
      executiveContent: (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Concentration Risk</span>
            <Badge variant="outline" className="text-green-600 border-green-200">Low</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Vintage Risk</span>
            <Badge variant="outline" className="text-yellow-600 border-yellow-200">Medium</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">Sector Risk</span>
            <Badge variant="outline" className="text-green-600 border-green-200">Low</Badge>
          </div>
        </div>
      )
    }
  ], []);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const handleMetricChange = (index: number) => {
    setActiveMetricIndex(index);
    onMetricSelect?.(executiveKPIs[index]?.id || '');
  };

  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-slate-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 max-w-4xl mx-auto", className)}>
      {/* Mobile-First Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-inter font-bold text-xl md:text-2xl text-slate-900">
            Executive Dashboard
          </h1>
          <p className="text-sm text-slate-600 font-poppins">
            {currentFund?.name || 'Demo Fund'} • Real-time insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:flex">
            <Smartphone className="w-3 h-3 mr-1" />
            Mobile Optimized
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 p-0"
            aria-label="Refresh data"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Key Metrics - Swipeable on Mobile */}
      {enableSwipeNavigation ? (
        <SwipeableMetricCards
          metrics={executiveKPIs}
          activeIndex={activeMetricIndex}
          onIndexChange={handleMetricChange}
          compactMode={compactMode}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {executiveKPIs.map((metric, index) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              isActive={index === activeMetricIndex}
              onClick={() => handleMetricChange(index)}
              compactMode={compactMode}
            />
          ))}
        </div>
      )}

      {/* AI Insights - Prominent Position */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-inter font-semibold text-lg text-slate-900">
            AI Insights
          </h2>
          <Button variant="ghost" size="sm" className="text-xs">
            <Activity className="w-3 h-3 mr-1" />
            Live
          </Button>
        </div>
        <AIInsightCard
          insights={executiveInsights}
          variant="compact"
          className="space-y-3"
        />
      </div>

      {/* Progressive Disclosure - Executive Level */}
      <ProgressiveDisclosureContainer
        title="Detailed Analysis"
        subtitle="Drill down for deeper insights"
        sections={progressiveDisclosureSections}
        defaultView="executive"
        showViewIndicator={false}
      />

      {/* Quick Actions Footer */}
      <Card className="border-dashed border-2 border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" className="flex-1 max-w-32">
              View Reports
            </Button>
            <Button variant="outline" size="sm" className="flex-1 max-w-32">
              Schedule Review
            </Button>
            <Button size="sm" className="flex-1 max-w-32">
              Deep Dive
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExecutiveDashboard;