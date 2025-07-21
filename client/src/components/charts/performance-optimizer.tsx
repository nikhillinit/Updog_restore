import { memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PerformanceOptimizerProps {
  data: any[];
  height?: number;
}

const PerformanceOptimizer = memo(function PerformanceOptimizer({ 
  data, 
  height = 300 
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