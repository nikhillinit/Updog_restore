/**
 * Nivo Allocation Pie Chart
 *
 * Uses BrandChartThemeProvider for consistent chart styling.
 * Migration: Replaced hardcoded COLORS with getChartColor() from chart-theme.
 */
import React from 'react';
import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartColor } from '@/lib/chart-theme';

interface AllocationData {
  id: string;
  label: string;
  value: number;
  color?: string;
}

interface NivoAllocationPieProps {
  title: string;
  data: AllocationData[];
  height?: number;
}

// Removed hardcoded COLORS - now using getChartColor() from chart-theme

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]!;
    const total = payload[0]!.payload.total || 0;
    const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : '0';
    return (
      <div className="bg-white p-2 border border-gray-200 rounded shadow-lg">
        <p className="font-semibold">{data.name}</p>
        <p className="text-sm">
          ${(data.value / 1000000).toFixed(1)}M ({percentage}%)
        </p>
      </div>
    );
  }
  return null;
};

export default function NivoAllocationPie({ 
  title, 
  data, 
  height = 400 
}: NivoAllocationPieProps) {
  // Transform data for Recharts
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = data.map((item, index) => ({
    name: item.label,
    value: item.value,
    total: total,
    fill: item.color || getChartColor(index)
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(props: any) => {
                const name = props.name || '';
                const value = props.value || 0;
                const safeTotal = total || 1;
                const percentage = ((value / safeTotal) * 100).toFixed(1);
                return `${name}: ${percentage}%`;
              }}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry: any, index: any) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}