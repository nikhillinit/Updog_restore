/**
 * LP Reporting -- Valuation marks preview table.
 *
 * Renders rows from `POST /api/funds/:fundId/imports/valuation-marks/dry-run`
 * (an `ImportPreviewRow[]`). Mirrors `LedgerTable` plus two valuation-only
 * affordances driven by design 8.6:
 *
 *   1. Future-dated marks (`row.asOfDate > pageAsOfDate`) are visually
 *      distinguished and carry an aria-label so screen readers know the
 *      row is excluded from current as-of NAV.
 *   2. Confidence renders as a `<Badge>` with tone:
 *      high -> default (success), medium -> secondary (warning),
 *      low  -> outline (muted). Imported marks default to `low`.
 *
 * Money is rendered via `formatDecimalCurrency`; never `Number()`,
 * `parseFloat`, or arithmetic on `row.fairValue`.
 *
 * @module client/components/lp-reporting/ValuationMarksTable
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
import { cn } from '@/lib/utils';
import type { ImportPreviewRow } from '@shared/contracts/lp-reporting';

const PLACEHOLDER = '--';

export interface ValuationMarksTableProps {
  rows: ImportPreviewRow[];
  /** Page-level as-of date in YYYY-MM-DD; rows with `asOfDate` strictly
   *  later than this are flagged future-dated. */
  asOfDate: string;
  emptyState?: ReactNode;
}

type ConfidenceTone = 'default' | 'secondary' | 'outline';

interface ConfidenceBadgeMeta {
  variant: ConfidenceTone;
  testId: string;
}

function confidenceMeta(level: string): ConfidenceBadgeMeta {
  const normalized = level.toLowerCase();
  if (normalized === 'high') {
    return { variant: 'default', testId: 'confidence-badge-high' };
  }
  if (normalized === 'medium') {
    return { variant: 'secondary', testId: 'confidence-badge-medium' };
  }
  // Treat low (and any unknown) as muted -- imports default to low.
  return { variant: 'outline', testId: 'confidence-badge-low' };
}

export function ValuationMarksTable({ rows, asOfDate, emptyState }: ValuationMarksTableProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="valuation-marks-table-empty"
        className="rounded-md border border-dashed p-8"
      >
        {emptyState ?? (
          <p className="text-sm text-charcoal/70 font-poppins text-center">
            No valuation marks yet. Submit a single mark below to preview it here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-testid="valuation-marks-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Mark date</TableHead>
            <TableHead scope="col">Company</TableHead>
            <TableHead scope="col">NAV</TableHead>
            <TableHead scope="col">Currency</TableHead>
            <TableHead scope="col">Confidence</TableHead>
            <TableHead scope="col">Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => {
            // Both strings are ISO YYYY-MM-DD; lexical compare is correct.
            const rowMarkDate = row.asOfDate ?? '';
            const isFutureDated = rowMarkDate !== '' && rowMarkDate > asOfDate;
            const confidence = row.confidenceLevel ?? 'low';
            const meta = confidenceMeta(confidence);

            const rowProps = isFutureDated
              ? {
                  'data-future-dated': 'true' as const,
                  'aria-label': 'Future-dated mark; excluded from current NAV',
                }
              : {};

            return (
              <TableRow
                key={`${row.rowIndex}-${idx}`}
                data-row-index={row.rowIndex}
                className={cn(
                  isFutureDated && 'bg-muted/40 border-l-4 border-l-muted-foreground/40'
                )}
                {...rowProps}
              >
                <TableCell className={cn(isFutureDated && 'text-charcoal/60')}>
                  <div className="flex flex-col gap-1">
                    <span>{rowMarkDate || PLACEHOLDER}</span>
                    {isFutureDated ? (
                      <Badge
                        variant="outline"
                        data-testid="future-dated-badge"
                        className="w-fit text-xs"
                      >
                        Future-dated
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{row.companyId ?? PLACEHOLDER}</TableCell>
                <TableCell data-column="fair-value">
                  {/*
                   * Pass the decimal-string straight through to the formatter.
                   * Do NOT call Number(row.fairValue) or arithmetic here.
                   */}
                  {formatDecimalCurrency(row.fairValue ?? null)}
                </TableCell>
                <TableCell>USD</TableCell>
                <TableCell>
                  <Badge variant={meta.variant} data-testid={meta.testId}>
                    {confidence}
                  </Badge>
                </TableCell>
                <TableCell>{row.markSource ?? PLACEHOLDER}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default ValuationMarksTable;
