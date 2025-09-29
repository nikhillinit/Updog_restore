/**
 * MobileOptimizedCharts Component
 *
 * Lightweight chart components optimized for mobile rendering with:
 * - Progressive enhancement (simple on mobile, detailed on desktop)
 * - Intersection Observer for lazy loading
 * - Bundle size optimization (<50KB per chart)
 * - Touch-friendly interactions
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import { cn } from '@/lib/utils';

// Types for chart data
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  metadata?: Record<string, any>;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  trend?: 'up' | 'down' | 'stable';
}

// Intersection Observer hook for lazy loading
function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  threshold = 0.1
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry!.isIntersecting);
      },
      { threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, threshold]);

  return isVisible;
}

// Lightweight SVG-based line chart optimized for mobile
interface MobileLineChartProps {
  data: TimeSeriesPoint[];
  height?: number;
  width?: number;
  color?: string;
  showPoints?: boolean;
  animateOnLoad?: boolean;
  className?: string;
}

export const MobileLineChart = memo(function MobileLineChart({
  data,
  height = 120,
  width = 300,
  color = '#3b82f6',
  showPoints = false,
  animateOnLoad = true,
  className
}: MobileLineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const isVisible = useIntersectionObserver(chartRef);
  const [animationComplete, setAnimationComplete] = useState(!animateOnLoad);

  useEffect(() => {
    if (isVisible && animateOnLoad) {
      const timer = setTimeout(() => setAnimationComplete(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isVisible, animateOnLoad]);

  if (data.length === 0) {
    return (
      <div
        ref={chartRef}
        className={cn("bg-slate-100 rounded animate-pulse", className)}
        style={{ height, width }}
      />
    );
  }

  const padding = 10;
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);

  // Calculate scales
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const valueRange = maxValue - minValue || 1;

  // Generate path
  const pathData = data.map((point, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div ref={chartRef} className={cn("touch-manipulation", className)}>
      {isVisible && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
        >
          {/* Grid lines for mobile readability */}
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="0.5"
                opacity="0.5"
              />
            </pattern>
          </defs>

          <rect
            width={chartWidth}
            height={chartHeight}
            x={padding}
            y={padding}
            fill="url(#grid)"
          />

          {/* Main line */}
          <path
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: animationComplete ? 'unset' : '0',
              transition: animateOnLoad ? 'stroke-dasharray 1s ease-in-out' : 'none',
            } as React.CSSProperties}
          />

          {/* Data points */}
          {showPoints && animationComplete && data.map((point, index) => {
            const x = padding + (index / (data.length - 1)) * chartWidth;
            const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;

            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="3"
                fill={color}
                stroke="white"
                strokeWidth="2"
                className="opacity-0 animate-fadeIn"
                style={{ animationDelay: `${index * 100}ms` }}
              />
            );
          })}

          {/* Touch-friendly hover areas */}
          {data.map((point, index) => {
            const x = padding + (index / (data.length - 1)) * chartWidth;
            const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;

            return (
              <circle
                key={`touch-${index}`}
                cx={x}
                cy={y}
                r="20"
                fill="transparent"
                className="cursor-pointer"
                onClick={() => {
                  // Trigger haptic feedback on supported devices
                  if ('vibrate' in navigator) {
                    navigator.vibrate(50);
                  }
                  console.log('Point clicked:', point);
                }}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
});

// Lightweight donut chart for mobile
interface MobileDonutChartProps {
  data: ChartDataPoint[];
  size?: number;
  strokeWidth?: number;
  showLabels?: boolean;
  className?: string;
  centerContent?: React.ReactNode;
}

export const MobileDonutChart = memo(function MobileDonutChart({
  data,
  size = 120,
  strokeWidth = 12,
  showLabels = false,
  className,
  centerContent
}: MobileDonutChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const isVisible = useIntersectionObserver(chartRef);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div
        ref={chartRef}
        className={cn("bg-slate-100 rounded-full animate-pulse", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const center = size / 2;
  const radius = (size / 2) - (strokeWidth / 2);
  const circumference = 2 * Math.PI * radius;

  let cumulativePercentage = 0;

  return (
    <div ref={chartRef} className={cn("relative touch-manipulation", className)}>
      {isVisible && (
        <>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {data.map((item, index) => {
              const percentage = (item.value / total) * 100;
              const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((cumulativePercentage / 100) * circumference);

              const segment = (
                <circle
                  key={index}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={item.color || `hsl(${index * 137.508}, 50%, 50%)`}
                  strokeWidth={selectedSegment === index ? strokeWidth + 2 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-300 cursor-pointer"
                  style={{
                    transform: 'rotate(-90deg)',
                    transformOrigin: `${center}px ${center}px`,
                  }}
                  onClick={() => {
                    setSelectedSegment(selectedSegment === index ? null : index);
                    if ('vibrate' in navigator) {
                      navigator.vibrate(50);
                    }
                  }}
                />
              );

              cumulativePercentage += percentage;
              return segment;
            })}
          </svg>

          {/* Center content */}
          {centerContent && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                {centerContent}
              </div>
            </div>
          )}

          {/* Mobile-optimized legend */}
          {showLabels && (
            <div className="mt-4 space-y-2">
              {data.map((item, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded transition-colors cursor-pointer",
                    selectedSegment === index ? "bg-slate-100" : "hover:bg-slate-50"
                  )}
                  onClick={() => setSelectedSegment(selectedSegment === index ? null : index)}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color || `hsl(${index * 137.508}, 50%, 50%)` }}
                  />
                  <span className="font-poppins text-sm text-slate-700 flex-grow">
                    {item.label}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {((item.value / total) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

// Lightweight bar chart for mobile
interface MobileBarChartProps {
  data: ChartDataPoint[];
  height?: number;
  color?: string;
  showValues?: boolean;
  horizontal?: boolean;
  className?: string;
}

export const MobileBarChart = memo(function MobileBarChart({
  data,
  height = 200,
  color = '#3b82f6',
  showValues = false,
  horizontal = false,
  className
}: MobileBarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const isVisible = useIntersectionObserver(chartRef);
  const [animatedBars, setAnimatedBars] = useState<boolean[]>([]);

  useEffect(() => {
    if (isVisible) {
      // Stagger animation for each bar
      data.forEach((_, index) => {
        setTimeout(() => {
          setAnimatedBars(prev => {
            const newState = [...prev];
            newState[index] = true;
            return newState;
          });
        }, index * 100);
      });
    }
  }, [isVisible, data.length]);

  if (data.length === 0) {
    return (
      <div
        ref={chartRef}
        className={cn("bg-slate-100 rounded animate-pulse", className)}
        style={{ height }}
      />
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div ref={chartRef} className={cn("space-y-3", className)}>
      {isVisible && data.map((item, index) => {
        const percentage = (item.value / maxValue) * 100;
        const isAnimated = animatedBars[index];

        return (
          <div key={index} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-poppins text-sm text-slate-700 truncate">
                {item.label}
              </span>
              {showValues && (
                <span className="font-mono text-xs text-slate-500 ml-2">
                  {item.value}
                </span>
              )}
            </div>
            <div className="bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  backgroundColor: item.color || color,
                  width: isAnimated ? `${percentage}%` : '0%'
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

// Mini sparkline chart for tight spaces
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
  className?: string;
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 80,
  height = 24,
  color = '#3b82f6',
  trend,
  className
}: SparklineProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const pathData = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
    >
      <path
        d={pathData}
        fill="none"
        stroke={trendColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* Current value point */}
      <circle
        cx={width}
        cy={height - ((data[data.length - 1]! - min) / range) * height}
        r="2"
        fill={trendColor}
      />
    </svg>
  );
});

// Chart loading skeleton
export function ChartSkeleton({
  height = 200,
  type = 'line',
  className
}: {
  height?: number;
  type?: 'line' | 'bar' | 'donut';
  className?: string;
}) {
  return (
    <div className={cn("animate-pulse", className)} style={{ height }}>
      {type === 'line' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/6"></div>
          </div>
          <div className="h-32 bg-slate-200 rounded"></div>
          <div className="flex justify-between">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-3 bg-slate-200 rounded w-8"></div>
            ))}
          </div>
        </div>
      )}

      {type === 'bar' && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-slate-200 rounded w-1/3"></div>
              <div className="h-2 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
      )}

      {type === 'donut' && (
        <div className="flex flex-col items-center space-y-4">
          <div className="w-32 h-32 bg-slate-200 rounded-full"></div>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-slate-200 rounded-full"></div>
                <div className="h-3 bg-slate-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default {
  MobileLineChart,
  MobileDonutChart,
  MobileBarChart,
  Sparkline,
  ChartSkeleton
};