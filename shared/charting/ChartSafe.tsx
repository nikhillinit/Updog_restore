/**
 * Chart Safe Wrapper
 * Normalizes chart component props for type safety
 * Provides unified interface for all chart types
 */

import React from 'react';
import {
  LineChart,
  AreaChart,
  BarChart,
  ScatterChart,
  PieChart,
  ResponsiveContainer
} from 'recharts';

// Flexible dimension type that accepts numbers or numeric strings
type FlexibleDimension = number | `${number}` | `${number}%` | `${number}px`;

/**
 * Safely converts flexible dimension values to numbers
 * Handles percentages, px values, and numeric strings
 */
function toNum(value?: FlexibleDimension): number | undefined {
  if (value == null) return undefined;
  
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  
  if (typeof value === 'string') {
    const numericValue = parseFloat(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }
  
  return undefined;
}

/**
 * Higher-order component to normalize chart props
 * Wraps any chart component to handle flexible dimension types
 */
export function withChartSafe<T extends { height?: FlexibleDimension; width?: FlexibleDimension }>(
  Component: React.ComponentType<T>
) {
  return React.forwardRef<Element, T>(((props: T, ref: React.ForwardedRef<Element>) => {
    const { height, width, ...restProps } = props;

    const normalizedProps = {
      ...restProps,
      height: toNum(height),
      width: toNum(width)
    };

    return <Component ref={ref} {...(normalizedProps as T)} />;
  }) as unknown as React.ForwardRefRenderFunction<Element, T>);
}

// Export pre-wrapped safe chart components
export const SafeLineChart = withChartSafe(LineChart);
export const SafeAreaChart = withChartSafe(AreaChart);
export const SafeBarChart = withChartSafe(BarChart);
export const SafeScatterChart = withChartSafe(ScatterChart);
export const SafePieChart = withChartSafe(PieChart);
export const SafeResponsiveContainer = withChartSafe(ResponsiveContainer);

// Re-export the dimension normalizer for custom use
export { toNum, type FlexibleDimension };