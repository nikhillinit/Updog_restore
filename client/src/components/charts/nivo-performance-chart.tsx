import React, { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PerformanceData {
  id: string;
  data: Array<{
    x: string;
    y: number;
  }>;
}

interface NivoPerformanceChartProps {
  title: string;
  data: PerformanceData[];
  height?: number;
}

const NivoPerformanceChart = memo(function NivoPerformanceChart({
  title,
  data,
  height = 400,
}: NivoPerformanceChartProps) {
  const colors = useMemo(() => ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'], []);
  const chartRows = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();

    data.forEach((series) => {
      series.data.forEach((point) => {
        const existing = rows.get(point.x) ?? { period: point.x };
        existing[series.id] = point.y;
        rows.set(point.x, existing);
      });
    });

    return Array.from(rows.values());
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 20, right: 110, bottom: 50, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#e5e7eb' }}
                label={{ value: 'Time Period', position: 'insideBottom', offset: -10 }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value: number) => `$${(value / 1000000).toFixed(1)}M`}
                label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={(value, name) => [
                  `$${(Number(value) / 1000000).toFixed(2)}M`,
                  String(name),
                ]}
              />
              <Legend verticalAlign="bottom" align="right" />
              {data.map((series, index) => (
                <Line
                  key={series.id}
                  type="monotone"
                  dataKey={series.id}
                  name={series.id}
                  stroke={colors[index % colors.length] ?? colors[0]!}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

export default NivoPerformanceChart;
