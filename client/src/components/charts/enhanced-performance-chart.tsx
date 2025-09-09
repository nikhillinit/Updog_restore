/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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

const formatTooltipValue = (value: any, name: string) => {
  if (typeof value !== 'number') return [value, name];
  
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
      return [value.toFixed(2), name];
  }
};

export default function EnhancedPerformanceChart({ 
  data, 
  title = "Fund Performance Metrics", 
  height = 400 
}: EnhancedPerformanceChartProps) {
  if (!data || data.length === 0) {
    return (
      <ChartContainer 
        title={title} 
        description="Track IRR, multiple, DPI, and TVPI performance over time"
        height={height}
      >
        <div className="flex items-center justify-center h-full text-gray-500">
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
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="date" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#666' }}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#666' }}
          />
          <Tooltip 
            formatter={formatTooltipValue}
            labelStyle={{ color: '#333', fontWeight: 'bold' }}
            contentStyle={{ 
              backgroundColor: '#fff', 
              border: '1px solid #e0e0e0', 
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          <Area
            type="monotone"
            dataKey="irr"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.1}
            strokeWidth={2}
            name="IRR"
          />
          <Area
            type="monotone"
            dataKey="multiple"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.1}
            strokeWidth={2}
            name="Multiple"
          />
          <Line
            type="monotone"
            dataKey="dpi"
            stroke="#f59e0b"
            strokeWidth={2}
            name="DPI"
            dot={{ r: 4, fill: '#f59e0b' }}
            activeDot={{ r: 6, fill: '#f59e0b' }}
          />
          <Line
            type="monotone"
            dataKey="tvpi"
            stroke="#ef4444"
            strokeWidth={2}
            name="TVPI"
            dot={{ r: 4, fill: '#ef4444' }}
            activeDot={{ r: 6, fill: '#ef4444' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
