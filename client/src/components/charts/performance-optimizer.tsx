import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { memo } from 'react';

interface PerformanceDataPoint {
  month: string;
  value: number;
}

interface PerformanceOptimizerProps {
  data: PerformanceDataPoint[];
  height?: number;
}

const PerformanceOptimizer = memo(function PerformanceOptimizer({
  data,
  height = 300,
}: PerformanceOptimizerProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false} // Remove dots for better performance
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export default PerformanceOptimizer;
