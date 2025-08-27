/**
 * Universal Chart Adapter
 * Provides unified interface for chart library migration
 * Supports progressive migration from Nivo to Recharts
 */

import React from 'react';
import { polymorphicForwardRef, type PolymorphicProps } from './polymorphic';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  ScatterChart, 
  Scatter,
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

// Type definitions for unified chart interface
export interface ChartDataPoint {
  [key: string]: string | number | Date;
}

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  data?: ChartDataPoint[];
}

export interface ChartConfig {
  width?: number | string;
  height?: number | string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  colors?: string[];
  theme?: 'light' | 'dark';
  responsive?: boolean;
  animation?: boolean;
  grid?: boolean;
  legend?: boolean;
  tooltip?: boolean;
}

export interface BaseChartProps {
  data: ChartDataPoint[];
  config?: ChartConfig;
  className?: string;
  style?: React.CSSProperties;
}

export interface LineChartProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  series?: ChartSeries[];
  curve?: 'linear' | 'monotone' | 'step';
}

export interface AreaChartProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  series?: ChartSeries[];
  stacked?: boolean;
  curve?: 'linear' | 'monotone' | 'step';
}

export interface BarChartProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  series?: ChartSeries[];
  stacked?: boolean;
  horizontal?: boolean;
}

export interface ScatterChartProps extends BaseChartProps {
  xKey: string;
  yKey: string;
  sizeKey?: string;
  series?: ChartSeries[];
}

export interface PieChartProps extends BaseChartProps {
  valueKey: string;
  labelKey: string;
  innerRadius?: number;
  outerRadius?: number;
}

// Default theme configuration
const DEFAULT_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1',
  '#d084d0', '#ffb366', '#87ceeb', '#dda0dd', '#98fb98'
];

const DEFAULT_CONFIG: Required<ChartConfig> = {
  width: '100%',
  height: 400,
  margin: { top: 20, right: 30, bottom: 20, left: 20 },
  colors: DEFAULT_COLORS,
  theme: 'light',
  responsive: true,
  animation: true,
  grid: true,
  legend: true,
  tooltip: true
};

// Chart adapter components
export const AdaptedLineChart: React.FC<LineChartProps> = ({
  data,
  xKey,
  yKey,
  series,
  curve = 'monotone',
  config = {},
  className,
  style
}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const renderLines = () => {
    if (series && series.length > 0) {
      return series.map((s, index) => (
        <Line
          key={s.key}
          type={curve}
          dataKey={s.key}
          stroke={s.color || mergedConfig.colors[index % mergedConfig.colors.length]}
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
          name={s.name}
          animationDuration={mergedConfig.animation ? 300 : 0}
        />
      ));
    }
    
    return (
      <Line
        type={curve}
        dataKey={yKey}
        stroke={mergedConfig.colors[0]}
        strokeWidth={2}
        dot={{ r: 4 }}
        activeDot={{ r: 6 }}
        animationDuration={mergedConfig.animation ? 300 : 0}
      />
    );
  };

  const ChartComponent = mergedConfig.responsive ? ResponsiveContainer : 'div';
  const chartProps = mergedConfig.responsive 
    ? { width: '100%', height: mergedConfig.height }
    : { width: mergedConfig.width, height: mergedConfig.height };

  return (
    <ChartComponent {...(mergedConfig.responsive ? {} : { style })}>
      <LineChart
        {...chartProps}
        data={data}
        margin={mergedConfig.margin}
        className={className}
        style={mergedConfig.responsive ? undefined : style}
      >
        {mergedConfig.grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis 
          dataKey={xKey}
          tick={{ fontSize: 12 }}
          tickLine={{ stroke: '#e0e0e0' }}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          tickLine={{ stroke: '#e0e0e0' }}
        />
        {mergedConfig.tooltip && <Tooltip />}
        {mergedConfig.legend && series && series.length > 1 && <Legend />}
        {renderLines()}
      </LineChart>
    </ChartComponent>
  );
};

export const AdaptedAreaChart: React.FC<AreaChartProps> = ({
  data,
  xKey,
  yKey,
  series,
  stacked = false,
  curve = 'monotone',
  config = {},
  className,
  style
}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const renderAreas = () => {
    if (series && series.length > 0) {
      return series.map((s, index) => (
        <Area
          key={s.key}
          type={curve}
          dataKey={s.key}
          stackId={stacked ? '1' : undefined}
          stroke={s.color || mergedConfig.colors[index % mergedConfig.colors.length]}
          fill={s.color || mergedConfig.colors[index % mergedConfig.colors.length]}
          fillOpacity={0.6}
          name={s.name}
        />
      ));
    }
    
    return (
      <Area
        type={curve}
        dataKey={yKey}
        stroke={mergedConfig.colors[0]}
        fill={mergedConfig.colors[0]}
        fillOpacity={0.6}
      />
    );
  };

  const ChartComponent = mergedConfig.responsive ? ResponsiveContainer : 'div';
  const chartProps = mergedConfig.responsive 
    ? { width: '100%', height: mergedConfig.height }
    : { width: mergedConfig.width, height: mergedConfig.height };

  return (
    <ChartComponent {...(mergedConfig.responsive ? {} : { style })}>
      <AreaChart
        {...chartProps}
        data={data}
        margin={mergedConfig.margin}
        className={className}
        style={mergedConfig.responsive ? undefined : style}
      >
        {mergedConfig.grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis dataKey={xKey} />
        <YAxis />
        {mergedConfig.tooltip && <Tooltip />}
        {mergedConfig.legend && series && series.length > 1 && <Legend />}
        {renderAreas()}
      </AreaChart>
    </ChartComponent>
  );
};

export const AdaptedBarChart: React.FC<BarChartProps> = ({
  data,
  xKey,
  yKey,
  series,
  stacked = false,
  horizontal = false,
  config = {},
  className,
  style
}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const renderBars = () => {
    if (series && series.length > 0) {
      return series.map((s, index) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          stackId={stacked ? '1' : undefined}
          fill={s.color || mergedConfig.colors[index % mergedConfig.colors.length]}
          name={s.name}
        />
      ));
    }
    
    return (
      <Bar
        dataKey={yKey}
        fill={mergedConfig.colors[0]}
      />
    );
  };

  const ChartComponent = mergedConfig.responsive ? ResponsiveContainer : 'div';
  const chartProps = mergedConfig.responsive 
    ? { width: '100%', height: mergedConfig.height }
    : { width: mergedConfig.width, height: mergedConfig.height };

  const ChartType = horizontal ? BarChart : BarChart; // Same component, different layout

  return (
    <ChartComponent {...(mergedConfig.responsive ? {} : { style })}>
      <ChartType
        {...chartProps}
        data={data}
        margin={mergedConfig.margin}
        className={className}
        style={mergedConfig.responsive ? undefined : style}
        layout={horizontal ? 'horizontal' : 'vertical'}
      >
        {mergedConfig.grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis 
          dataKey={horizontal ? undefined : xKey}
          type={horizontal ? 'number' : 'category'}
        />
        <YAxis 
          dataKey={horizontal ? yKey : undefined}
          type={horizontal ? 'category' : 'number'}
        />
        {mergedConfig.tooltip && <Tooltip />}
        {mergedConfig.legend && series && series.length > 1 && <Legend />}
        {renderBars()}
      </ChartType>
    </ChartComponent>
  );
};

export const AdaptedScatterChart: React.FC<ScatterChartProps> = ({
  data,
  xKey,
  yKey,
  sizeKey,
  series,
  config = {},
  className,
  style
}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const renderScatters = () => {
    if (series && series.length > 0) {
      return series.map((s, index) => (
        <Scatter
          key={s.key}
          data={s.data || data}
          fill={s.color || mergedConfig.colors[index % mergedConfig.colors.length]}
          name={s.name}
        />
      ));
    }
    
    return (
      <Scatter
        data={data}
        fill={mergedConfig.colors[0]}
      />
    );
  };

  const ChartComponent = mergedConfig.responsive ? ResponsiveContainer : 'div';
  const chartProps = mergedConfig.responsive 
    ? { width: '100%', height: mergedConfig.height }
    : { width: mergedConfig.width, height: mergedConfig.height };

  return (
    <ChartComponent {...(mergedConfig.responsive ? {} : { style })}>
      <ScatterChart
        {...chartProps}
        data={data}
        margin={mergedConfig.margin}
        className={className}
        style={mergedConfig.responsive ? undefined : style}
      >
        {mergedConfig.grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis dataKey={xKey} type="number" />
        <YAxis dataKey={yKey} type="number" />
        {mergedConfig.tooltip && <Tooltip cursor={{ strokeDasharray: '3 3' }} />}
        {mergedConfig.legend && series && series.length > 1 && <Legend />}
        {renderScatters()}
      </ScatterChart>
    </ChartComponent>
  );
};

export const AdaptedPieChart: React.FC<PieChartProps> = ({
  data,
  valueKey,
  labelKey,
  innerRadius = 0,
  outerRadius = 80,
  config = {},
  className,
  style
}) => {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const ChartComponent = mergedConfig.responsive ? ResponsiveContainer : 'div';
  const chartProps = mergedConfig.responsive 
    ? { width: '100%', height: mergedConfig.height }
    : { width: mergedConfig.width, height: mergedConfig.height };

  return (
    <ChartComponent {...(mergedConfig.responsive ? {} : { style })}>
      <PieChart
        {...chartProps}
        className={className}
        style={mergedConfig.responsive ? undefined : style}
      >
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey={valueKey}
          nameKey={labelKey}
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={mergedConfig.colors[index % mergedConfig.colors.length]} 
            />
          ))}
        </Pie>
        {mergedConfig.tooltip && <Tooltip />}
        {mergedConfig.legend && <Legend />}
      </PieChart>
    </ChartComponent>
  );
};

// Migration utilities
export interface MigrationOptions {
  enableFeatureFlag?: boolean;
  fallbackToOriginal?: boolean;
  logMigrationEvents?: boolean;
}

export const createMigrationWrapper = polymorphicForwardRef<'div', {
  LegacyComponent: React.ComponentType<any>;
  AdaptedComponent: React.ComponentType<any>;
  componentName: string;
  options?: MigrationOptions;
}>(function MigrationWrapper<T extends React.ElementType = 'div'>({
  LegacyComponent,
  AdaptedComponent,
  componentName,
  options = {},
  as,
  ...props
}: PolymorphicProps<T, {
  LegacyComponent: React.ComponentType<any>;
  AdaptedComponent: React.ComponentType<any>;
  componentName: string;
  options?: MigrationOptions;
}>, ref) {
  const useAdapted = options.enableFeatureFlag 
    ? (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
        ? (window.localStorage.getItem('use-adapted-charts') === 'true')
        : process.env.NODE_ENV === 'development')
    : true;

  if (options.logMigrationEvents) {
    React.useEffect(() => {
      console.log(`Chart Migration: ${componentName} using ${useAdapted ? 'adapted' : 'legacy'} version`);
    }, [useAdapted, componentName]);
  }

  const Component = as || 'div';

  try {
    if (useAdapted) {
      return <AdaptedComponent {...(props as any)} ref={ref} />;
    }
  } catch (error) {
    if (options.fallbackToOriginal) {
      console.warn(`Chart Migration: ${componentName} adapted version failed, falling back to legacy`, error);
      return <LegacyComponent {...(props as any)} ref={ref} />;
    }
    throw error;
  }

  return <LegacyComponent {...(props as any)} ref={ref} />;
});

// Export unified chart components
export const UnifiedLineChart = AdaptedLineChart;
export const UnifiedAreaChart = AdaptedAreaChart;
export const UnifiedBarChart = AdaptedBarChart;
export const UnifiedScatterChart = AdaptedScatterChart;
export const UnifiedPieChart = AdaptedPieChart;

// Export types for consumers
export type {
  ChartDataPoint,
  ChartSeries,
  ChartConfig,
  BaseChartProps,
  LineChartProps,
  AreaChartProps,
  BarChartProps,
  ScatterChartProps,
  PieChartProps
};