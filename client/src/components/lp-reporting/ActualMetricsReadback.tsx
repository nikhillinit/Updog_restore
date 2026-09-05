import type {
  ActualMetricsV2,
  ActualsPublishReceiptV1,
  FinancialFactsLatestReferenceV1,
} from '@shared/contracts/lp-reporting';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDecimalCurrency, formatDecimalRatio } from '@/lib/format/lp-reporting/decimal';

interface GovernedValue {
  availability: string;
  value: string | null;
  reasonCodes: string[];
  sourceRefs: string[];
}

interface ReadbackRow {
  label: string;
  governed: GovernedValue;
  kind: 'money' | 'ratio';
}

export interface ActualMetricsReadbackProps {
  receipt: ActualsPublishReceiptV1;
  latestReference?: FinancialFactsLatestReferenceV1;
  metrics?: ActualMetricsV2;
  isLoading?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

function valueText(row: ReadbackRow, currency: string): string {
  if (row.governed.availability !== 'available' || row.governed.value === null) {
    const reasons = row.governed.reasonCodes.join(', ') || 'VALUE_UNAVAILABLE';
    return `Unavailable — ${reasons}`;
  }
  return row.kind === 'money'
    ? formatDecimalCurrency(row.governed.value, currency)
    : formatDecimalRatio(row.governed.value);
}

export function ActualMetricsReadback({
  receipt,
  latestReference,
  metrics,
  isLoading = false,
  errorCode,
  errorMessage,
}: ActualMetricsReadbackProps) {
  if (errorCode || errorMessage) {
    return (
      <Alert variant="destructive" role="alert" data-testid="actuals-metrics-error">
        <AlertTitle>{errorCode ?? 'METRICS_READBACK_FAILED'}</AlertTitle>
        <AlertDescription>{errorMessage ?? 'Metrics readback failed.'}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || metrics === undefined) {
    return (
      <p className="text-sm text-charcoal/70" aria-live="polite">
        Loading published metrics…
      </p>
    );
  }

  if (
    metrics.snapshotStatus !== 'resolved' ||
    metrics.financialFactsSnapshotId !== receipt.facts.snapshotId ||
    metrics.snapshotInputHash !== receipt.facts.snapshotInputHash
  ) {
    return (
      <Alert variant="destructive" role="alert" data-testid="actuals-metrics-identity-mismatch">
        <AlertTitle>METRICS_RECEIPT_IDENTITY_MISMATCH</AlertTitle>
        <AlertDescription>
          Metrics snapshot identity does not match publication receipt. Values are withheld.
        </AlertDescription>
      </Alert>
    );
  }

  const moneyRows: ReadbackRow[] = [
    { label: 'Committed', governed: metrics.capital.committed, kind: 'money' },
    { label: 'Called issued', governed: metrics.capital.calledIssued, kind: 'money' },
    { label: 'Paid in', governed: metrics.capital.paidIn, kind: 'money' },
    { label: 'Deployed', governed: metrics.capital.deployed, kind: 'money' },
    { label: 'Outstanding calls', governed: metrics.capital.outstandingCalls, kind: 'money' },
    { label: 'Remaining callable', governed: metrics.capital.remainingCallable, kind: 'money' },
    { label: 'Unfunded', governed: metrics.capital.unfunded, kind: 'money' },
    { label: 'Management fees paid', governed: metrics.expenses.managementFeesPaid, kind: 'money' },
    { label: 'Other expenses paid', governed: metrics.expenses.otherExpensesPaid, kind: 'money' },
    { label: 'Portfolio FMV', governed: metrics.value.portfolioFmv, kind: 'money' },
    { label: 'NAV', governed: metrics.value.nav, kind: 'money' },
    {
      label: 'Realized fund proceeds',
      governed: metrics.value.realizedFundProceeds,
      kind: 'money',
    },
    {
      label: 'Distributions to partners',
      governed: metrics.value.distributionsToPartners,
      kind: 'money',
    },
  ];
  const ratioRows: ReadbackRow[] = [
    { label: 'DPI', governed: metrics.performance.dpi, kind: 'ratio' },
    { label: 'RVPI', governed: metrics.performance.rvpi, kind: 'ratio' },
    { label: 'TVPI', governed: metrics.performance.tvpi, kind: 'ratio' },
  ];
  const rows = [...moneyRows, ...ratioRows].sort((left, right) => {
    const leftAvailable = left.governed.availability === 'available' ? 0 : 1;
    const rightAvailable = right.governed.availability === 'available' ? 0 : 1;
    return leftAvailable - rightAvailable;
  });

  return (
    <section className="space-y-4" aria-label="Published actuals readback">
      <div className="flex flex-wrap gap-2 text-xs text-charcoal/70">
        <Badge variant="outline" className="whitespace-normal break-all text-left">
          Snapshot {receipt.facts.snapshotId}
        </Badge>
        <Badge variant="outline" className="whitespace-normal break-all text-left">
          Policy {receipt.facts.policyVersion}
        </Badge>
        <Badge variant="outline" className="whitespace-normal break-all text-left">
          Payload {receipt.facts.payloadSchemaId}
        </Badge>
        <Badge variant="outline" className="whitespace-normal break-all text-left">
          As of {receipt.asOfDate}
        </Badge>
      </div>
      <p className="break-all font-mono text-xs text-charcoal/70" data-testid="actuals-basis-line">
        Basis {receipt.basisRef.schemaId} · snapshot {receipt.basisRef.snapshotId} · hash{' '}
        {receipt.basisRef.snapshotInputHash}
      </p>
      {latestReference?.head ? (
        <p className="text-xs text-charcoal/70" data-testid="actuals-latest-reference-line">
          Current head snapshot {latestReference.head.snapshotId} · {latestReference.head.asOfDate}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Metric</TableHead>
              <TableHead scope="col">Server value</TableHead>
              <TableHead scope="col">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label} data-availability={row.governed.availability}>
                <TableCell>{row.label}</TableCell>
                <TableCell
                  className="tabular-nums"
                  data-testid={`actuals-metric-${row.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  {valueText(row, metrics.currency)}
                </TableCell>
                <TableCell className="text-xs text-charcoal/70">
                  {row.governed.sourceRefs.join(', ') || 'No source reference'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-charcoal/70">
        Reporting status: {metrics.actionability.status}
        {metrics.actionability.reasonCodes.length > 0
          ? ` — ${metrics.actionability.reasonCodes.join(', ')}`
          : ''}
      </p>
    </section>
  );
}

export default ActualMetricsReadback;
