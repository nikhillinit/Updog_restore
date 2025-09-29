/**
 * IntelligentSkeleton Components
 *
 * Contextual loading skeletons that preview content structure and relationships
 * before data loads, providing better UX than generic loading states.
 */

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  DollarSign,
  Target,
  Calculator
} from 'lucide-react';

export interface SkeletonVariant {
  type: 'dashboard' | 'chart' | 'table' | 'metrics' | 'insights' | 'portfolio' | 'analysis';
  rows?: number;
  columns?: number;
  showHeaders?: boolean;
  showActions?: boolean;
  complexity?: 'simple' | 'medium' | 'complex';
}

interface IntelligentSkeletonProps {
  variant: SkeletonVariant;
  className?: string;
  animated?: boolean;
  preview?: {
    title?: string;
    subtitle?: string;
    dataType?: string;
  };
}

// Dashboard Overview Skeleton
function DashboardSkeleton({ animated = true, preview }: { animated?: boolean; preview?: any }) {
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className={cn("h-8 w-64", animated && "animate-pulse")} />
            <Skeleton className={cn("h-4 w-96", animated && "animate-pulse")} />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className={cn("h-10 w-32", animated && "animate-pulse")} />
            <Skeleton className={cn("h-10 w-10", animated && "animate-pulse")} />
          </div>
        </div>

        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className={cn("h-6 w-16", animated && "animate-pulse")} />
          <span className="text-gray-300">/</span>
          <Skeleton className={cn("h-6 w-24", animated && "animate-pulse")} />
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { icon: DollarSign, label: 'Fund Size' },
          { icon: TrendingUp, label: 'Portfolio IRR' },
          { icon: Target, label: 'MOIC' },
          { icon: PieChart, label: 'Allocation' }
        ].map((metric, index) => (
          <Card key={index} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <metric.icon className="h-5 w-5 text-gray-300" />
                <Skeleton className={cn("h-4 w-8", animated && "animate-pulse")} />
              </div>
              <div className="space-y-2">
                <Skeleton className={cn("h-8 w-20", animated && "animate-pulse")} />
                <Skeleton className={cn("h-3 w-16", animated && "animate-pulse")} />
              </div>
            </CardContent>
            {/* Shimmer effect */}
            {animated && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
            )}
          </Card>
        ))}
      </div>

      {/* Chart placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton animated={animated} chartType="line" />
        <ChartSkeleton animated={animated} chartType="pie" />
      </div>
    </div>
  );
}

// Chart Skeleton with type-specific layouts
function ChartSkeleton({
  animated = true,
  chartType = 'bar',
  height = 'h-64'
}: {
  animated?: boolean;
  chartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'area';
  height?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className={cn("h-5 w-32", animated && "animate-pulse")} />
            <Skeleton className={cn("h-3 w-48", animated && "animate-pulse")} />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className={cn("h-8 w-8", animated && "animate-pulse")} />
            <Skeleton className={cn("h-8 w-8", animated && "animate-pulse")} />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className={cn("relative", height, "bg-gray-50 rounded-lg p-4")}>
          {/* Chart-specific skeleton patterns */}
          {chartType === 'bar' && <BarChartPattern animated={animated} />}
          {chartType === 'line' && <LineChartPattern animated={animated} />}
          {chartType === 'pie' && <PieChartPattern animated={animated} />}
          {chartType === 'scatter' && <ScatterChartPattern animated={animated} />}
          {chartType === 'area' && <AreaChartPattern animated={animated} />}

          {/* Loading indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-400">
              <BarChart3 className="h-6 w-6" />
              <span className="text-sm font-medium">Loading chart data...</span>
            </div>
          </div>
        </div>

        {/* Legend skeleton */}
        <div className="flex items-center justify-center gap-4 mt-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className={cn("h-3 w-3 rounded-full", animated && "animate-pulse")} />
              <Skeleton className={cn("h-3 w-16", animated && "animate-pulse")} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Chart Pattern Components
function BarChartPattern({ animated }: { animated: boolean }) {
  const bars = [0.7, 0.4, 0.9, 0.3, 0.6, 0.8, 0.2, 0.5];

  return (
    <div className="flex items-end justify-around h-full gap-2">
      {bars.map((height, index) => (
        <div
          key={index}
          className={cn(
            "bg-gray-300 rounded-t-sm transition-all duration-1000",
            animated && "animate-pulse"
          )}
          style={{
            height: `${height * 100}%`,
            width: '12%',
            animationDelay: `${index * 0.1}s`
          }}
        />
      ))}
    </div>
  );
}

function LineChartPattern({ animated }: { animated: boolean }) {
  return (
    <div className="relative h-full">
      {/* Grid lines */}
      <div className="absolute inset-0">
        {[0, 25, 50, 75, 100].map(percent => (
          <div
            key={percent}
            className="absolute w-full border-b border-gray-200"
            style={{ top: `${percent}%` }}
          />
        ))}
      </div>

      {/* Line path skeleton */}
      <svg className="w-full h-full" viewBox="0 0 300 100">
        <path
          d="M0,80 Q75,20 150,40 T300,30"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className={cn("text-gray-300", animated && "animate-pulse")}
          strokeDasharray="5,5"
        />
        {/* Data points */}
        {[0, 75, 150, 225, 300].map((x, index) => (
          <circle
            key={index}
            cx={x}
            cy={[80, 20, 40, 35, 30][index]}
            r="4"
            className={cn("fill-gray-300", animated && "animate-pulse")}
            style={{ animationDelay: `${index * 0.2}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

function PieChartPattern({ animated }: { animated: boolean }) {
  const segments = [30, 25, 20, 15, 10]; // percentages
  let cumulativeAngle = 0;

  return (
    <div className="flex items-center justify-center h-full">
      <svg className="w-32 h-32" viewBox="0 0 100 100">
        {segments.map((percent, index) => {
          const angle = (percent / 100) * 360;
          const startAngle = cumulativeAngle;
          const endAngle = cumulativeAngle + angle;

          // Calculate arc path
          const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
          const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
          const x2 = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
          const y2 = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);

          const largeArcFlag = angle > 180 ? 1 : 0;

          const pathData = [
            `M 50 50`,
            `L ${x1} ${y1}`,
            `A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');

          cumulativeAngle += angle;

          return (
            <path
              key={index}
              d={pathData}
              className={cn(
                "fill-gray-300 stroke-white stroke-2",
                animated && "animate-pulse"
              )}
              style={{
                opacity: 0.3 + (index * 0.15),
                animationDelay: `${index * 0.1}s`
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

function ScatterChartPattern({ animated }: { animated: boolean }) {
  const points = Array.from({ length: 20 }, (_, i) => ({
    x: Math.random() * 90 + 5,
    y: Math.random() * 90 + 5,
    size: Math.random() * 4 + 2
  }));

  return (
    <div className="relative h-full">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={point.size}
            className={cn("fill-gray-300", animated && "animate-pulse")}
            style={{ animationDelay: `${index * 0.05}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

function AreaChartPattern({ animated }: { animated: boolean }) {
  return (
    <div className="relative h-full">
      <svg className="w-full h-full" viewBox="0 0 300 100">
        <defs>
          <linearGradient id="areaSkeleton" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path
          d="M0,80 Q75,20 150,40 T300,30 L300,100 L0,100 Z"
          fill="url(#areaSkeleton)"
          className={cn("text-gray-300", animated && "animate-pulse")}
        />
        <path
          d="M0,80 Q75,20 150,40 T300,30"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          className={cn("text-gray-400", animated && "animate-pulse")}
        />
      </svg>
    </div>
  );
}

// Table Skeleton
function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeaders = true,
  animated = true
}: {
  rows?: number;
  columns?: number;
  showHeaders?: boolean;
  animated?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Table header skeleton */}
          {showHeaders && (
            <div className="flex items-center justify-between">
              <Skeleton className={cn("h-6 w-32", animated && "animate-pulse")} />
              <div className="flex items-center gap-2">
                <Skeleton className={cn("h-8 w-24", animated && "animate-pulse")} />
                <Skeleton className={cn("h-8 w-8", animated && "animate-pulse")} />
              </div>
            </div>
          )}

          {/* Column headers */}
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton
                key={index}
                className={cn("h-4 w-full", animated && "animate-pulse")}
                style={{ animationDelay: `${index * 0.1}s` }}
              />
            ))}
          </div>

          {/* Data rows */}
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
              >
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <Skeleton
                    key={colIndex}
                    className={cn(
                      "h-4",
                      colIndex === 0 ? "w-3/4" : colIndex === columns - 1 ? "w-1/2" : "w-full",
                      animated && "animate-pulse"
                    )}
                    style={{ animationDelay: `${(rowIndex * columns + colIndex) * 0.05}s` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Insights Skeleton
function InsightsSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(index => (
        <Card key={index} className="relative overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className={cn("h-10 w-10 rounded-lg", animated && "animate-pulse")} />
                <div className="space-y-2">
                  <Skeleton className={cn("h-5 w-40", animated && "animate-pulse")} />
                  <div className="flex items-center gap-2">
                    <Skeleton className={cn("h-4 w-16", animated && "animate-pulse")} />
                    <Skeleton className={cn("h-4 w-20", animated && "animate-pulse")} />
                  </div>
                </div>
              </div>
              <Skeleton className={cn("h-8 w-16", animated && "animate-pulse")} />
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-3">
              <Skeleton className={cn("h-4 w-full", animated && "animate-pulse")} />
              <Skeleton className={cn("h-4 w-5/6", animated && "animate-pulse")} />
              <Skeleton className={cn("h-4 w-4/6", animated && "animate-pulse")} />

              {/* Metrics skeleton */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Skeleton className={cn("h-3 w-20", animated && "animate-pulse")} />
                <Skeleton className={cn("h-3 w-12", animated && "animate-pulse")} />
              </div>
            </div>
          </CardContent>

          {animated && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"
              style={{ animationDelay: `${index * 0.3}s` }}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

// Main IntelligentSkeleton component
export function IntelligentSkeleton({
  variant,
  className,
  animated = true,
  preview
}: IntelligentSkeletonProps) {
  const skeletonComponents = {
    dashboard: <DashboardSkeleton animated={animated} preview={preview} />,
    chart: (
      <ChartSkeleton
        animated={animated}
        chartType={variant.type as any}
        height={variant.complexity === 'complex' ? 'h-80' : 'h-64'}
      />
    ),
    table: (
      <TableSkeleton
        rows={variant.rows || 5}
        columns={variant.columns || 4}
        showHeaders={variant.showHeaders}
        animated={animated}
      />
    ),
    metrics: <DashboardSkeleton animated={animated} preview={preview} />,
    insights: <InsightsSkeleton animated={animated} />,
    portfolio: <DashboardSkeleton animated={animated} preview={preview} />,
    analysis: <InsightsSkeleton animated={animated} />
  };

  return (
    <div className={cn("space-y-4", className)}>
      {preview && (
        <div className="text-center p-4 bg-slate-50 rounded-lg border border-dashed">
          <div className="flex items-center justify-center gap-2 text-slate-600">
            <Calculator className="h-5 w-5" />
            <span className="text-sm font-medium">
              {preview.title && `Loading ${preview.title}`}
              {preview.dataType && ` • ${preview.dataType}`}
            </span>
          </div>
          {preview.subtitle && (
            <p className="text-xs text-slate-500 mt-1">{preview.subtitle}</p>
          )}
        </div>
      )}

      {skeletonComponents[variant.type] || (
        <div className="p-8 text-center text-gray-500">
          <BarChart3 className="h-8 w-8 mx-auto mb-2" />
          <p>Loading content...</p>
        </div>
      )}
    </div>
  );
}

// Convenience components
export const DashboardSkeleton_Component = (props: Omit<IntelligentSkeletonProps, 'variant'>) => (
  <IntelligentSkeleton variant={{ type: 'dashboard' }} {...props} />
);

export const ChartSkeleton_Component = (props: Omit<IntelligentSkeletonProps, 'variant'> & { chartType?: string }) => (
  <IntelligentSkeleton variant={{ type: 'chart' as any }} {...props} />
);

export const MetricsSkeleton = (props: Omit<IntelligentSkeletonProps, 'variant'>) => (
  <IntelligentSkeleton variant={{ type: 'metrics' }} {...props} />
);

export const InsightsSkeleton_Component = (props: Omit<IntelligentSkeletonProps, 'variant'>) => (
  <IntelligentSkeleton variant={{ type: 'insights' }} {...props} />
);

export default IntelligentSkeleton;