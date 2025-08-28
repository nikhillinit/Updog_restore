/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

// Re-export everything from chart-core (which lazy loads recharts)
export {
  ChartContainer,
  ChartSkeleton,
  useChart,
  getPayloadConfigFromPayload,
  type ChartConfig,
  type ChartContextProps
} from './chart-core';

// For backwards compatibility, also export these 
// They will be loaded from recharts-bundle when ChartContainer renders
export {
  ChartTooltip,
  ChartTooltipContent, 
  ChartLegend,
  ChartLegendContent,
  ResponsiveContainer,
  Tooltip,
  Legend
} from './recharts-bundle';