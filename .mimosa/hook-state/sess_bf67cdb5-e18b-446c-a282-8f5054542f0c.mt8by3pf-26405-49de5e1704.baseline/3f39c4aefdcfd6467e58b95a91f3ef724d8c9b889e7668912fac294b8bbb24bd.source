import { useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  ANCHOR_RUNG_COPY,
  CLEAR_FILTER_LABEL,
  EMPTY_UNIVERSE_COPY,
  EXITED_ROW_COPY,
  FILTER_EMPTY_COPY,
  filterAttributionRows,
  formatDecimalMillions,
  formatFactsFreshness,
  formatFilterStatus,
  TRUST_STATE_COPY,
  type AttributionRow,
  type TrustFilterKey,
} from '@/lib/dual-forecast-display';
import { TRUST_CHIP_CLASSES } from './TrustStateCounts';

interface NavAttributionTableProps {
  rows: AttributionRow[];
  activeFilter: TrustFilterKey | null;
  onClearFilter: () => void;
  summary: string | null;
  freshness: { asOfDate: string; inputHash: string } | null;
}

function TrustStateCell({ row }: { row: AttributionRow }) {
  const key: TrustFilterKey = row.trustState ?? 'NO_FACTS';
  const copy = TRUST_STATE_COPY[key];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex cursor-help items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30',
            TRUST_CHIP_CLASSES[key]
          )}
        >
          {copy.label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{copy.description}</TooltipContent>
    </Tooltip>
  );
}

function AnchorRungCell({ row }: { row: AttributionRow }) {
  if (row.anchor == null) {
    return (
      <span className="text-xs text-presson-textMuted">
        {row.inNavUniverse ? '—' : EXITED_ROW_COPY}
      </span>
    );
  }

  const copy = ANCHOR_RUNG_COPY[row.anchor];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help text-sm text-pov-charcoal underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
        >
          {copy.label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{copy.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function WarningsCell({ row }: { row: AttributionRow }) {
  if (row.warnings.length === 0) {
    return <span className="text-xs text-presson-textMuted">—</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help text-sm tabular-nums text-pov-charcoal underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
        >
          {row.warnings.length} {row.warnings.length === 1 ? 'warning' : 'warnings'}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <ul className="list-none space-y-1">
          {row.warnings.map((warning) => (
            <li key={warning.code}>{warning.message}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function NavAttributionTable({
  rows,
  activeFilter,
  onClearFilter,
  summary,
  freshness,
}: NavAttributionTableProps) {
  const summaryId = useId();
  const visibleRows = filterAttributionRows(rows, activeFilter);
  const isFilteredEmpty = activeFilter !== null && visibleRows.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>NAV Attribution</CardTitle>
        <CardDescription>
          How each company anchors the blended NAV — trust state, valuation source, and
          contribution.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary ? (
          <p id={summaryId} className="mb-3 text-sm text-charcoal-600">
            {summary}
          </p>
        ) : null}

        {activeFilter !== null ? (
          <p className="mb-3 text-sm text-charcoal-600">
            {formatFilterStatus(visibleRows.length, rows.length)}
            {' — '}
            <button
              type="button"
              onClick={onClearFilter}
              className="font-medium text-pov-charcoal underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
            >
              {CLEAR_FILTER_LABEL}
            </button>
          </p>
        ) : null}

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-charcoal-600">{EMPTY_UNIVERSE_COPY}</p>
        ) : isFilteredEmpty ? (
          <p className="py-6 text-center text-sm text-charcoal-600">
            {FILTER_EMPTY_COPY}
            {' — '}
            <button
              type="button"
              onClick={onClearFilter}
              className="font-medium text-pov-charcoal underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
            >
              {CLEAR_FILTER_LABEL}
            </button>
          </p>
        ) : (
          <TooltipProvider delayDuration={150}>
            {/* Desktop: full 5-column table */}
            <div className="hidden sm:block">
              <Table aria-describedby={summary ? summaryId : undefined}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Trust</TableHead>
                    <TableHead>Anchor</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                    <TableHead>Warnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.companyId}>
                      <TableCell className="font-medium text-pov-charcoal">
                        {row.companyName}
                      </TableCell>
                      <TableCell>
                        <TrustStateCell row={row} />
                      </TableCell>
                      <TableCell>
                        <AnchorRungCell row={row} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimalMillions(row.contribution)}
                      </TableCell>
                      <TableCell>
                        <WarningsCell row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* DR3 mobile: dense stacked rows — all disclosure visible without panning */}
            <ul className="divide-y divide-beige-200 sm:hidden" aria-label="NAV attribution">
              {visibleRows.map((row) => {
                const trustKey: TrustFilterKey = row.trustState ?? 'NO_FACTS';

                return (
                  <li key={row.companyId} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-pov-charcoal">{row.companyName}</span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          TRUST_CHIP_CLASSES[trustKey]
                        )}
                      >
                        {TRUST_STATE_COPY[trustKey].label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm tabular-nums text-pov-charcoal">
                      {formatDecimalMillions(row.contribution)}
                      {' · '}
                      {row.anchor != null
                        ? ANCHOR_RUNG_COPY[row.anchor].label
                        : row.inNavUniverse
                          ? '—'
                          : EXITED_ROW_COPY}
                    </p>
                    {row.warnings.length > 0 ? (
                      <p className="mt-1 text-xs text-charcoal-600">
                        {row.warnings.map((warning) => warning.message).join(' · ')}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </TooltipProvider>
        )}

        {freshness ? (
          <p className="mt-3 font-mono text-xs text-presson-textMuted">
            {formatFactsFreshness(freshness.asOfDate, freshness.inputHash)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
