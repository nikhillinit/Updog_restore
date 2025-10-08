/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCents } from '@/lib/units';
import {
  formatDelta,
  getDeltaColorClass,
  formatPercentChange,
} from '@/lib/reallocation-utils';
import type { ReallocationTotals } from '@/types/reallocation';
import { ArrowRight } from 'lucide-react';

interface TotalsSummaryProps {
  totals: ReallocationTotals;
}

export function TotalsSummary({ totals }: TotalsSummaryProps) {
  const deltaColorClass = getDeltaColorClass(totals.delta_cents);
  const isDeltaZero = totals.delta_cents === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Allocation Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Before and After */}
        <div className="flex items-center justify-between rounded-md border bg-gray-50 p-4">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-500 uppercase">
              Current Total
            </span>
            <span className="text-xl font-bold">
              {formatCents(totals.total_allocated_before)}
            </span>
          </div>

          <div className="flex items-center justify-center px-4">
            <ArrowRight className="h-6 w-6 text-gray-400" />
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-500 uppercase">
              New Total
            </span>
            <span className="text-xl font-bold">
              {formatCents(totals.total_allocated_after)}
            </span>
          </div>
        </div>

        {/* Net Change */}
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Net Change
            </span>
            <div className="flex flex-col items-end">
              <span
                className={`text-2xl font-bold ${isDeltaZero ? 'text-gray-500' : deltaColorClass}`}
              >
                {formatDelta(totals.delta_cents, { showSign: true })}
              </span>
              <span
                className={`text-sm ${isDeltaZero ? 'text-gray-500' : deltaColorClass}`}
              >
                {formatPercentChange(totals.delta_pct)}
              </span>
            </div>
          </div>
        </div>

        {/* Info Message */}
        {isDeltaZero && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
            <p className="text-xs text-blue-700">
              Total allocation remains the same, but individual company
              allocations have changed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
