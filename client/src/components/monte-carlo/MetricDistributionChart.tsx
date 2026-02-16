/**
 * MetricDistributionChart
 *
 * Box-and-whisker style chart showing distribution percentiles (p5/p25/median/p75/p95)
 * with actual value overlay when available.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
  ErrorBar,
} from 'recharts';
import type { RenderableDistribution } from '@/types/backtesting-ui';

interface Props {
  distributions: RenderableDistribution[];
}

interface ChartDataPoint {
  metric: string;
  label: string;
  median: number;
  p25: number;
  p75: number;
  p5: number;
  p95: number;
  min: number;
  max: number;
  actual: number | null;
  range: [number, number];
  iqr: [number, number];
}

export function MetricDistributionChart({ distributions }: Props) {
  if (distributions.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500">
        No distribution data available
      </div>
    );
  }

  const data: ChartDataPoint[] = distributions.map((d) => ({
    metric: d.metric,
    label: d.label,
    median: d.distribution.median,
    p25: d.distribution.p25,
    p75: d.distribution.p75,
    p5: d.distribution.p5,
    p95: d.distribution.p95,
    min: d.distribution.min,
    max: d.distribution.max,
    actual: d.actual.status === 'ready' ? d.actual.value : null,
    range: [d.distribution.p5, d.distribution.p95],
    iqr: [d.distribution.p25, d.distribution.p75],
  }));

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Metric Distributions</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" fontSize={11} stroke="#6b7280" />
          <YAxis type="category" dataKey="label" fontSize={12} stroke="#6b7280" width={60} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }} />

          {/* IQR bar (p25-p75) */}
          <Bar dataKey="median" fill="#1e293b" barSize={20} radius={[2, 2, 2, 2]}>
            <ErrorBar dataKey="iqr" width={8} stroke="#1e293b" strokeWidth={2} direction="x" />
            {data.map((entry, index) => (
              <Cell key={index} fill="#1e293b" opacity={0.7} />
            ))}
          </Bar>

          {/* Actual value reference lines */}
          {data.map(
            (entry) =>
              entry.actual !== null && (
                <ReferenceLine
                  key={`actual-${entry.metric}`}
                  x={entry.actual}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{ value: 'Actual', fill: '#ef4444', fontSize: 10, position: 'top' }}
                />
              )
          )}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-gray-800 opacity-70 rounded-sm" />
          Median (IQR)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-red-500" style={{ borderTop: '2px dashed' }} />
          Actual
        </span>
      </div>
    </div>
  );
}

export default MetricDistributionChart;
