/**
 * LP Reporting -- Ledger preview table.
 *
 * Renders the rows returned by the `POST /api/funds/:fundId/imports/ledger/dry-run`
 * preview as a shadcn `<Table>`. The `rows` prop is an `ImportPreviewRow[]`
 * (the shape the locked dry-run contract returns); we deliberately do NOT
 * accept the discriminated `CashFlowEventCreate` union here because the
 * dry-run path is read-only and never produces persisted events in
 * Phase 1b.
 *
 * Money is rendered via `formatDecimalCurrency` -- never via `Number()`,
 * `parseFloat`, or arithmetic on the decimal string.
 *
 * @module client/components/lp-reporting/LedgerTable
 */

import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDecimalCurrency } from '@/lib/format/lp-reporting/decimal';
import type { ImportPreviewRow } from '@shared/contracts/lp-reporting';

const PLACEHOLDER = '--';

export interface LedgerTableProps {
  rows: ImportPreviewRow[];
  emptyState?: ReactNode;
}

export function LedgerTable({ rows, emptyState }: LedgerTableProps) {
  if (rows.length === 0) {
    return (
      <div data-testid="ledger-table-empty" className="rounded-md border border-dashed p-8">
        {emptyState ?? (
          <p className="text-sm text-charcoal/70 font-poppins text-center">
            No ledger rows yet. Submit a single event below to preview it here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="ledger-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Event date</TableHead>
            <TableHead scope="col">Event type</TableHead>
            <TableHead scope="col">Amount</TableHead>
            <TableHead scope="col">Currency</TableHead>
            <TableHead scope="col">Source</TableHead>
            <TableHead scope="col">Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={`${row.rowIndex}-${idx}`} data-row-index={row.rowIndex}>
              <TableCell>{row.eventDate ?? PLACEHOLDER}</TableCell>
              <TableCell>{row.eventType ?? PLACEHOLDER}</TableCell>
              <TableCell data-column="amount">
                {/*
                 * Pass the decimal-string straight through to the formatter.
                 * Do NOT call Number(row.amount) or arithmetic here.
                 */}
                {formatDecimalCurrency(row.amount ?? null)}
              </TableCell>
              <TableCell>USD</TableCell>
              <TableCell>{row.markSource ?? PLACEHOLDER}</TableCell>
              <TableCell>
                {row.confidenceLevel ? (
                  <Badge variant="outline">{row.confidenceLevel}</Badge>
                ) : (
                  PLACEHOLDER
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default LedgerTable;
