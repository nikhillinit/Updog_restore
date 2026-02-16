/**
 * PercentileBandTable
 *
 * Table showing predicted vs actual percentile band hit rates.
 */

import type { RenderableDistribution } from '@/types/backtesting-ui';

interface Props {
  distributions: RenderableDistribution[];
}

function HitIndicator({ hit }: { hit: boolean | null }) {
  if (hit === null) {
    return <span className="text-gray-400 text-xs">N/A</span>;
  }
  return hit ? (
    <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
      HIT
    </span>
  ) : (
    <span className="inline-flex items-center text-xs font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
      MISS
    </span>
  );
}

function formatValue(value: number, metric: string): string {
  if (metric === 'irr') return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(2);
}

export function PercentileBandTable({ distributions }: Props) {
  if (distributions.length === 0) {
    return <div className="text-sm text-gray-500 py-4">No percentile data available</div>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Percentile Band Analysis</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600">Metric</th>
            <th className="text-right py-2 px-3 font-medium text-gray-600">P5</th>
            <th className="text-right py-2 px-3 font-medium text-gray-600">P25</th>
            <th className="text-right py-2 px-3 font-medium text-gray-600">Median</th>
            <th className="text-right py-2 px-3 font-medium text-gray-600">P75</th>
            <th className="text-right py-2 px-3 font-medium text-gray-600">P95</th>
            <th className="text-right py-2 px-3 font-medium text-gray-600">Actual</th>
            <th className="text-center py-2 px-3 font-medium text-gray-600">50% CI</th>
            <th className="text-center py-2 px-3 font-medium text-gray-600">90% CI</th>
          </tr>
        </thead>
        <tbody>
          {distributions.map((d) => (
            <tr key={d.metric} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 px-3 font-medium text-gray-800">{d.label}</td>
              <td className="text-right py-2 px-3 text-gray-600 tabular-nums">
                {formatValue(d.distribution.p5, d.metric)}
              </td>
              <td className="text-right py-2 px-3 text-gray-600 tabular-nums">
                {formatValue(d.distribution.p25, d.metric)}
              </td>
              <td className="text-right py-2 px-3 font-medium text-gray-800 tabular-nums">
                {formatValue(d.distribution.median, d.metric)}
              </td>
              <td className="text-right py-2 px-3 text-gray-600 tabular-nums">
                {formatValue(d.distribution.p75, d.metric)}
              </td>
              <td className="text-right py-2 px-3 text-gray-600 tabular-nums">
                {formatValue(d.distribution.p95, d.metric)}
              </td>
              <td className="text-right py-2 px-3 tabular-nums">
                {d.actual.status === 'ready' ? (
                  <span className="font-medium text-gray-800">
                    {formatValue(d.actual.value, d.metric)}
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs">{d.actual.reason}</span>
                )}
              </td>
              <td className="text-center py-2 px-3">
                <HitIndicator hit={d.hitP50} />
              </td>
              <td className="text-center py-2 px-3">
                <HitIndicator hit={d.hitP90} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PercentileBandTable;
