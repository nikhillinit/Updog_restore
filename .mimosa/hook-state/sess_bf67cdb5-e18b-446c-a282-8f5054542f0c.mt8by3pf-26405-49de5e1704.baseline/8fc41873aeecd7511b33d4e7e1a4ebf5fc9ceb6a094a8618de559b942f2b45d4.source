/**
 * LP Reporting -- import dry-run preview panel.
 *
 * Renders the `preview` rows of an `ImportDryRunResponse` bucketed
 * into matched / partial / unmatched columns. The contract returns a
 * flat preview array plus per-row `errors` and `warnings`, so we
 * derive bucket membership client-side using the documented flags:
 *
 *   - unmatched: row appears in `errors` OR `excluded === true`
 *   - partial:   row appears in `warnings` (and is not unmatched)
 *   - matched:   everything else
 *
 * Money fields are passed through `formatDecimalCurrency` -- never
 * `Number()`, `parseFloat`, or arithmetic on the decimal string.
 *
 * @module client/components/lp-reporting/ImportPreviewPanel
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { ImportDryRunResponse, ImportPreviewRow } from '@shared/contracts/lp-reporting';
import type { ImportBatchStatusResponse } from '@shared/contracts/financial-observations/reconciliation-api.contract';

const PLACEHOLDER = '--';

type Bucket = 'matched' | 'partial' | 'unmatched';

interface BucketedRows {
  matched: ImportPreviewRow[];
  partial: ImportPreviewRow[];
  unmatched: ImportPreviewRow[];
}

const BUCKET_TITLES: Record<Bucket, string> = {
  matched: 'Matched',
  partial: 'Partial',
  unmatched: 'Unmatched',
};

const BUCKET_DESCRIPTIONS: Record<Bucket, string> = {
  matched: 'Rows that pass dry-run validation cleanly.',
  partial: 'Rows that pass but carry warnings to review.',
  unmatched: 'Rows that fail validation or are excluded from this preview.',
};

export interface ImportPreviewPanelProps {
  response?: ImportDryRunResponse;
  batchStatus?: ImportBatchStatusResponse;
}

function bucketize(response: ImportDryRunResponse): BucketedRows {
  const errorRowSet = new Set<number>();
  for (const error of response.errors) {
    errorRowSet.add(error.row);
  }
  const warningRowSet = new Set<number>();
  for (const warning of response.warnings) {
    warningRowSet.add(warning.row);
  }

  const matched: ImportPreviewRow[] = [];
  const partial: ImportPreviewRow[] = [];
  const unmatched: ImportPreviewRow[] = [];

  for (const row of response.preview) {
    if (errorRowSet.has(row.rowIndex) || row.excluded) {
      unmatched.push(row);
      continue;
    }
    if (warningRowSet.has(row.rowIndex)) {
      partial.push(row);
      continue;
    }
    matched.push(row);
  }

  return { matched, partial, unmatched };
}

interface BucketTableProps {
  bucket: Bucket;
  rows: ImportPreviewRow[];
}

function BucketTable({ bucket, rows }: BucketTableProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid={`import-preview-${bucket}-empty`}
        className="rounded-md border border-dashed p-6"
      >
        <p className="text-sm text-charcoal/70 font-poppins text-center">
          No {bucket} rows in this preview.
        </p>
      </div>
    );
  }

  return (
    <div data-testid={`import-preview-${bucket}-table`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Row</TableHead>
            <TableHead scope="col">Type / Source</TableHead>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col">Amount</TableHead>
            <TableHead scope="col">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={`${bucket}-${row.rowIndex}`}
              data-row-index={row.rowIndex}
              data-bucket={bucket}
            >
              <TableCell>{row.rowIndex}</TableCell>
              <TableCell>{row.eventType ?? row.markSource ?? PLACEHOLDER}</TableCell>
              <TableCell>{row.eventDate ?? row.asOfDate ?? PLACEHOLDER}</TableCell>
              <TableCell data-column="amount">
                {/*
                 * Pass the decimal-string straight through to the formatter.
                 * Do NOT call Number() or arithmetic on row.amount /
                 * row.fairValue.
                 */}
                {formatDecimalCurrency(row.amount ?? row.fairValue ?? null)}
              </TableCell>
              <TableCell>
                {row.duplicate ? <Badge variant="outline">duplicate</Badge> : null}{' '}
                {row.excluded ? <Badge variant="outline">excluded</Badge> : null}{' '}
                {row.excludedReason ? (
                  <span className="text-xs text-charcoal/70">{row.excludedReason}</span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BatchStatusPanel({ batchStatus }: { batchStatus: ImportBatchStatusResponse }) {
  return (
    <Card data-testid="import-preview-batch-status">
      <CardHeader>
        <CardTitle className="text-base">Batch {batchStatus.batchId}</CardTitle>
        <p className="text-xs text-charcoal/70 font-poppins">
          Accepted evidence only. Not calculation-active.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Group</TableHead>
              <TableHead scope="col">Observation</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Cases</TableHead>
              <TableHead scope="col">Accepted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batchStatus.groups.map((group) => (
              <TableRow key={group.dependencyGroupKey}>
                <TableCell>{group.dependencyGroupKey}</TableCell>
                <TableCell>{group.observationId}</TableCell>
                <TableCell>{group.observationStatus}</TableCell>
                <TableCell>
                  {group.caseIds.length === 0 ? '--' : group.caseIds.join(', ')}
                </TableCell>
                <TableCell>{group.accepted ? 'yes' : 'no'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {batchStatus.blockers.length > 0 ? (
          <div className="mt-4 space-y-2" data-testid="import-preview-batch-blockers">
            {batchStatus.blockers.map((blocker) => (
              <Badge key={blocker.caseId} variant="outline">
                Case {blocker.caseId}: {blocker.caseType}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ImportPreviewPanel({ response, batchStatus }: ImportPreviewPanelProps) {
  const buckets = useMemo(
    () => (response ? bucketize(response) : { matched: [], partial: [], unmatched: [] }),
    [response]
  );

  if (batchStatus) {
    return <BatchStatusPanel batchStatus={batchStatus} />;
  }
  if (!response) {
    return null;
  }

  return (
    <div className="space-y-4" data-testid="import-preview-panel">
      {(['matched', 'partial', 'unmatched'] as const).map((bucket) => (
        <Card key={bucket} data-testid={`import-preview-card-${bucket}`}>
          <CardHeader>
            <CardTitle className="text-base">
              {BUCKET_TITLES[bucket]}{' '}
              <span
                className="text-sm text-charcoal/70 font-poppins"
                data-testid={`import-preview-${bucket}-count`}
              >
                ({buckets[bucket].length})
              </span>
            </CardTitle>
            <p className="text-xs text-charcoal/70 font-poppins">{BUCKET_DESCRIPTIONS[bucket]}</p>
          </CardHeader>
          <CardContent>
            <BucketTable bucket={bucket} rows={buckets[bucket]} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default ImportPreviewPanel;
