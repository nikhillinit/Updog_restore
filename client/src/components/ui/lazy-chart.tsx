import React, { Suspense, lazy } from 'react';

// Lazy load the recharts bundle
const RechartsBundle = lazy(() => import('./recharts-bundle'));

interface LazyChartProps {
  component: string;
  children?: React.ReactNode;
  height?: number;
  [key: string]: unknown;
}

type LazyChartVariantProps = Omit<LazyChartProps, 'component'>;

// Loading fallback for charts
export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div 
      className="animate-pulse bg-gray-100 rounded-lg" 
      style={{ height: `${height}px` }}
    >
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">
          <svg
            className="w-8 h-8 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Wrapper component for lazy-loaded charts
export function LazyChart({ 
  component, 
  height = 300, 
  children, 
  ...props 
}: LazyChartProps) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} />}>
      <RechartsBundle component={component} {...props}>
        {children}
      </RechartsBundle>
    </Suspense>
  );
}

// Export specific lazy-loaded chart components for convenience
export const LazyLineChart = (props: LazyChartVariantProps) => (
  <LazyChart component="LineChart" {...props} />
);

export const LazyBarChart = (props: LazyChartVariantProps) => (
  <LazyChart component="BarChart" {...props} />
);

export const LazyAreaChart = (props: LazyChartVariantProps) => (
  <LazyChart component="AreaChart" {...props} />
);

export const LazyPieChart = (props: LazyChartVariantProps) => (
  <LazyChart component="PieChart" {...props} />
);

export const LazyComposedChart = (props: LazyChartVariantProps) => (
  <LazyChart component="ComposedChart" {...props} />
);

export const LazyRadarChart = (props: LazyChartVariantProps) => (
  <LazyChart component="RadarChart" {...props} />
);

export const LazyRadialBarChart = (props: LazyChartVariantProps) => (
  <LazyChart component="RadialBarChart" {...props} />
);

export const LazyScatterChart = (props: LazyChartVariantProps) => (
  <LazyChart component="ScatterChart" {...props} />
);

export default LazyChart;
