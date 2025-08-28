/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Create lazy proxy components that won't trigger eager loading
export const ChartTooltip = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartTooltip" />
  </React.Suspense>
);

export const ChartTooltipContent = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartTooltipContent" />
  </React.Suspense>
);

export const ChartLegend = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartLegend" />
  </React.Suspense>
);

export const ChartLegendContent = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ChartLegendContent" />
  </React.Suspense>
);

export const ResponsiveContainer = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="ResponsiveContainer" />
  </React.Suspense>
);

export const Tooltip = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="Tooltip" />
  </React.Suspense>
);

export const Legend = (props: React.ComponentProps<any>) => (
  <React.Suspense fallback={null}>
    <RechartsKit {...props} component="Legend" />
  </React.Suspense>
);