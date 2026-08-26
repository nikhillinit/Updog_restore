import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Area } from 'recharts/es6/cartesian/Area';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import ChartContainer from './chart-container';
import { createDynamicFormatter } from '@/lib/chart-formatters';
import { getChartColor } from '@/lib/brand-tokens';
import { presson } from '@/theme/presson.tokens';

interface PerformanceData {
  date: string;
  irr: number;
  multiple: number;
  dpi: number;
  tvpi: number;
}

interface EnhancedPerformanceChartProps {
  data: PerformanceData[];
  title?: string;
  height?: number;
}

const formatTooltipValue = createDynamicFormatter((value, name) => {
  if (typeof value !== 'number') {
    return ['', name ?? 'Value'];
  }

  switch (name) {
    case 'IRR':
      return [`${(value * 100).toFixed(1)}%`, 'Internal Rate of Return'];
    case 'Multiple':
      return [`${value.toFixed(2)}x`, 'Cash-on-Cash Multiple'];
    case 'DPI':
      return [`${value.toFixed(2)}x`, 'Distributions to Paid-In'];
    case 'TVPI':
      return [`${value.toFixed(2)}x`, 'Total Value to Paid-In'];
    default:
      return [value.toFixed(2), name ?? 'Value'];
  }
});

export default function EnhancedPerformanceChart({
  data,
  title = 'Fund Performance Metrics',
  height = 400,
}: EnhancedPerformanceChartProps) {
  if (!data || data.length === 0) {
    return (
      <ChartContainer
        title={title}
        description="Track IRR, multiple, DPI, and TVPI performance over time"
        height={height}
      >
        <div className="flex items-center justify-center h-full text-charcoal-500">
          No performance data available
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title={title}
      description="Track IRR, multiple, DPI, and TVPI performance over time"
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={presson.color.surfaceSubtle} />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: presson.color.text }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: presson.color.text }}
          />
          <Tooltip
            formatter={formatTooltipValue}
            labelStyle={{ color: presson.color.text, fontWeight: 'bold' }}
            contentStyle={{
              backgroundColor: presson.color.surface,
              border: `1px solid ${presson.color.borderSubtle}`,
              borderRadius: '8px',
              boxShadow: presson.shadow.card,
            }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="line" />
          <Area
            type="monotone"
            dataKey="irr"
            stroke={getChartColor(0)}
            fill={getChartColor(0)}
            fillOpacity={0.1}
            strokeWidth={2}
            name="IRR"
          />
          <Area
            type="monotone"
            dataKey="multiple"
            stroke={getChartColor(1)}
            fill={getChartColor(1)}
            fillOpacity={0.1}
            strokeWidth={2}
            name="Multiple"
          />
          <Line
            type="monotone"
            dataKey="dpi"
            stroke={getChartColor(2)}
            strokeWidth={2}
            name="DPI"
            dot={{ r: 4, fill: getChartColor(2) }}
            activeDot={{ r: 6, fill: getChartColor(2) }}
          />
          <Line
            type="monotone"
            dataKey="tvpi"
            stroke={getChartColor(3)}
            strokeWidth={2}
            name="TVPI"
            dot={{ r: 4, fill: getChartColor(3) }}
            activeDot={{ r: 6, fill: getChartColor(3) }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
