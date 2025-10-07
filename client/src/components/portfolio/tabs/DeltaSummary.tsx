/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCents } from '@/lib/units';
import {
  getDeltaIcon,
  getDeltaColorClass,
  formatPercentChange,
  sortDeltasByMagnitude,
} from '@/lib/reallocation-utils';
import type { ReallocationDelta } from '@/types/reallocation';

interface DeltaSummaryProps {
  deltas: ReallocationDelta[];
  sortByMagnitude?: boolean;
}

export function DeltaSummary({
  deltas,
  sortByMagnitude = true,
}: DeltaSummaryProps) {
  const displayDeltas = sortByMagnitude
    ? sortDeltasByMagnitude(deltas)
    : deltas;

  // Filter out unchanged items for cleaner display
  const changedDeltas = displayDeltas.filter(
    (delta) => delta.status !== 'unchanged'
  );

  if (changedDeltas.length === 0) {
    return (
      <div className="rounded-md border bg-gray-50 p-6 text-center text-gray-500">
        No allocation changes detected
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead className="text-right">From</TableHead>
            <TableHead className="text-right">To</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changedDeltas.map((delta) => {
            const deltaIcon = getDeltaIcon(delta.status);
            const deltaColorClass = getDeltaColorClass(delta.delta_cents);

            return (
              <TableRow key={delta.company_id}>
                <TableCell className="font-medium">
                  {delta.company_name}
                </TableCell>
                <TableCell className="text-right text-gray-600">
                  {formatCents(delta.from_cents)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCents(delta.to_cents)}
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className={`flex items-center justify-end gap-1 font-medium ${deltaColorClass}`}
                  >
                    <span>{deltaIcon}</span>
                    <span>{formatCents(Math.abs(delta.delta_cents))}</span>
                  </div>
                </TableCell>
                <TableCell className={`text-right ${deltaColorClass}`}>
                  {formatPercentChange(delta.delta_pct)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {changedDeltas.length !== deltas.length && (
        <div className="border-t bg-gray-50 p-3 text-center text-xs text-gray-500">
          {deltas.length - changedDeltas.length} company(ies) unchanged
        </div>
      )}
    </div>
  );
}
