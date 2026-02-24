/**
 * ReserveAllocationBreakdown - Engine vs User allocation comparison
 *
 * Horizontal stacked bar chart (inline SVG) comparing engine-recommended
 * allocations against user-specified amounts, with a delta table below.
 *
 * @module client/components/fund-results/ReserveAllocationBreakdown
 */

import React from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface ReserveAllocationBreakdownProps {
  engineAllocations: Array<{
    stage: string;
    engineAmount: number;
    userAmount: number;
  }>;
  totalReserves: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDollars(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

/** Returns divergence percentage between engine and user amounts */
function getDivergence(engine: number, user: number): number {
  if (engine === 0 && user === 0) return 0;
  const base = Math.max(engine, user);
  return (Math.abs(engine - user) / base) * 100;
}

function getDeltaStyle(divergence: number): string {
  if (divergence < 5) return 'text-emerald-600';
  if (divergence <= 15) return 'text-amber-600';
  return 'text-red-600';
}

function getDeltaLabel(divergence: number): string {
  if (divergence < 5) return 'Aligned';
  if (divergence <= 15) return 'Divergent';
  return 'Misaligned';
}

// ============================================================================
// SVG BAR CHART
// ============================================================================

const BAR_HEIGHT = 28;
const BAR_GAP = 12;
const LABEL_WIDTH = 100;
const CHART_WIDTH = 500;

interface BarChartProps {
  allocations: ReserveAllocationBreakdownProps['engineAllocations'];
  totalReserves: number;
}

function StackedBarChart({ allocations, totalReserves }: BarChartProps) {
  const maxAmount = Math.max(
    totalReserves,
    ...allocations.map((a) => Math.max(a.engineAmount, a.userAmount))
  );
  const scale = maxAmount > 0 ? CHART_WIDTH / maxAmount : 0;
  const totalHeight = allocations.length * (BAR_HEIGHT * 2 + BAR_GAP) - BAR_GAP;

  return (
    <svg
      viewBox={`0 0 ${LABEL_WIDTH + CHART_WIDTH + 20} ${totalHeight + 20}`}
      className="w-full max-w-2xl"
      role="img"
      aria-label="Reserve allocation comparison chart"
    >
      {allocations.map((alloc, i) => {
        const yOffset = i * (BAR_HEIGHT * 2 + BAR_GAP);
        const engineWidth = alloc.engineAmount * scale;
        const userWidth = alloc.userAmount * scale;

        return (
          <g key={alloc.stage}>
            {/* Stage label */}
            <text
              x={LABEL_WIDTH - 8}
              y={yOffset + BAR_HEIGHT - 2}
              textAnchor="end"
              className="fill-charcoal text-xs font-poppins"
              style={{ fontSize: 11 }}
            >
              {alloc.stage}
            </text>

            {/* Engine bar (dark) */}
            <rect
              x={LABEL_WIDTH}
              y={yOffset}
              width={Math.max(engineWidth, 2)}
              height={BAR_HEIGHT - 4}
              rx={3}
              className="fill-pov-charcoal"
            />
            <text
              x={LABEL_WIDTH + engineWidth + 6}
              y={yOffset + BAR_HEIGHT / 2}
              className="fill-charcoal-600 text-xs font-poppins"
              style={{ fontSize: 10 }}
              dominantBaseline="central"
            >
              {formatDollars(alloc.engineAmount)}
            </text>

            {/* User bar (beige) */}
            <rect
              x={LABEL_WIDTH}
              y={yOffset + BAR_HEIGHT}
              width={Math.max(userWidth, 2)}
              height={BAR_HEIGHT - 4}
              rx={3}
              className="fill-beige"
            />
            <text
              x={LABEL_WIDTH + userWidth + 6}
              y={yOffset + BAR_HEIGHT + BAR_HEIGHT / 2}
              className="fill-charcoal-600 text-xs font-poppins"
              style={{ fontSize: 10 }}
              dominantBaseline="central"
            >
              {formatDollars(alloc.userAmount)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

/** Visual comparison of engine vs user reserve allocations with delta table */
export function ReserveAllocationBreakdown({
  engineAllocations,
  totalReserves,
}: ReserveAllocationBreakdownProps) {
  return (
    <section aria-label="Reserve allocation breakdown">
      <h2 className="font-inter font-bold text-lg text-charcoal mb-6">
        Reserve Allocation Breakdown
      </h2>

      {/* Chart */}
      <div className="mb-6">
        <StackedBarChart allocations={engineAllocations} totalReserves={totalReserves} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mb-8">
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm bg-pov-charcoal" />
          <span className="font-poppins text-xs text-charcoal-600">Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm bg-beige" />
          <span className="font-poppins text-xs text-charcoal-600">User</span>
        </div>
      </div>

      {/* Delta table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-poppins">
          <thead>
            <tr className="border-b border-beige-200">
              <th className="text-left py-3 px-2 font-inter font-bold text-xs uppercase tracking-wider text-charcoal-500">
                Stage
              </th>
              <th className="text-right py-3 px-2 font-inter font-bold text-xs uppercase tracking-wider text-charcoal-500">
                Engine ($)
              </th>
              <th className="text-right py-3 px-2 font-inter font-bold text-xs uppercase tracking-wider text-charcoal-500">
                User ($)
              </th>
              <th className="text-right py-3 px-2 font-inter font-bold text-xs uppercase tracking-wider text-charcoal-500">
                Delta
              </th>
            </tr>
          </thead>
          <tbody>
            {engineAllocations.map((alloc) => {
              const divergence = getDivergence(alloc.engineAmount, alloc.userAmount);
              return (
                <tr key={alloc.stage} className="border-b border-beige-100 last:border-b-0">
                  <td className="py-3 px-2 text-charcoal">{alloc.stage}</td>
                  <td className="py-3 px-2 text-right tabular-nums text-charcoal-700">
                    {formatDollars(alloc.engineAmount)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums text-charcoal-700">
                    {formatDollars(alloc.userAmount)}
                  </td>
                  <td
                    className={cn(
                      'py-3 px-2 text-right tabular-nums font-medium',
                      getDeltaStyle(divergence)
                    )}
                  >
                    {divergence.toFixed(1)}% {getDeltaLabel(divergence)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-charcoal-200">
              <td className="py-3 px-2 font-inter font-bold text-charcoal">Total</td>
              <td className="py-3 px-2 text-right tabular-nums font-bold text-charcoal">
                {formatDollars(engineAllocations.reduce((sum, a) => sum + a.engineAmount, 0))}
              </td>
              <td className="py-3 px-2 text-right tabular-nums font-bold text-charcoal">
                {formatDollars(engineAllocations.reduce((sum, a) => sum + a.userAmount, 0))}
              </td>
              <td className="py-3 px-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
