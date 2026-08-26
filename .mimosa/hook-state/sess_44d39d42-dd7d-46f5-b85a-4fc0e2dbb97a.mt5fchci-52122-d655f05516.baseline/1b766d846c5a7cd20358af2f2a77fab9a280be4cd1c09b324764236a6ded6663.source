"use client"

import * as React from 'react';

// Re-export everything from chart-core (non-Recharts components)
export {
  ChartContainer,
  ChartSkeleton,
  useChart,
  getPayloadConfigFromPayload,
  type ChartConfig,
  type ChartContextProps
} from './chart-core';

// Lazy load the recharts bundle
const RechartsKit = React.lazy(() => import('./recharts-bundle'));
type LazyChartProps = Record<string, unknown>;

// Create lazy proxy components that won't trigger eager loading
export const ChartTooltip = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartTooltip" />
  </React.Suspense>
);

export const ChartTooltipContent = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartTooltipContent" />
  </React.Suspense>
);

export const ChartLegend = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartLegend" />
  </React.Suspense>
);

export const ChartLegendContent = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartLegendContent" />
  </React.Suspense>
);

export const ResponsiveContainer = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ResponsiveContainer" />
  </React.Suspense>
);

export const Tooltip = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="Tooltip" />
  </React.Suspense>
);

export const Legend = (props: LazyChartProps) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="Legend" />
  </React.Suspense>
);
