import React from 'react';
import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed', '#ea580c'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const total = payload[0].payload.total || 0;
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
    fill: item.color || COLORS[index % COLORS.length]
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
              label={({ name, value }) => {
                const percentage = value ? ((value / total) * 100).toFixed(1) : '0';
                return `${name}: ${percentage}%`;
              }}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
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