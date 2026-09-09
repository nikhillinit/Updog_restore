import type {
  ActualMetricsV2,
  ActualsPublishReceipt,
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
  receipt: ActualsPublishReceipt;
  latestReference?: FinancialFactsLatestReferenceV1;
  metrics?: ActualMetricsV2;
  isLoading?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

const reasonDescriptions: Record<string, string> = {
  SOURCE_NOT_SUPPLIED: 'The required source evidence has not been supplied.',
  COVERAGE_PARTIAL: 'The ledger does not establish complete inception-to-cutoff coverage.',
  SCOPE_UNPROVEN: 'The source scope has not been established.',
  COMMITTED_CAPITAL_UNAVAILABLE: 'Committed capital is not available from the supplied evidence.',
  CALL_NOTICE_NOT_IMPORTED: 'Call notices have not been imported.',
  DEPLOYMENT_CATEGORY_PARTIAL: 'Deployment categories are incomplete.',
  VALUATION_NOT_SUPPLIED: 'Valuation evidence has not been supplied.',
  VALUATION_COVERAGE_PARTIAL: 'Valuation evidence does not cover the full portfolio roster.',
  RECALL_LIFECYCLE_UNAVAILABLE: 'The recall lifecycle is not available.',
  NAV_UNAVAILABLE: 'Fund NAV is unavailable; portfolio marks alone do not establish it.',
  PAID_IN_ZERO: 'The ratio cannot be calculated with zero paid-in capital.',
  SETTLED_PAID_IN_UNAVAILABLE: 'Settled paid-in capital is unavailable.',
  unsupported_payload_policy: 'This consumer does not support this facts policy.',
  ledger_coverage_partial: 'The ledger does not establish complete inception-to-cutoff coverage.',
  position_valuation_incomplete: 'Valuation evidence does not cover the full portfolio roster.',
  investment_lineage_unresolved: 'Investment ownership or conversion lineage is unresolved.',
  period_nav_unavailable: 'Period NAV is unavailable; portfolio marks alone do not establish it.',
  company_monetary_facts_unavailable: 'Required company investment amounts are unavailable.',
};

function reasonText(code: string): string {
  const description = Object.prototype.hasOwnProperty.call(reasonDescriptions, code)
    ? reasonDescriptions[code]
    : undefined;
  return `${code}: ${description ?? 'No further explanation is available for this reason.'}`;
}

function valueText(row: ReadbackRow, currency: string): string {
  if (row.governed.availability !== 'available' || row.governed.value === null) {
    const reasons =
      row.governed.reasonCodes.map(reasonText).join('; ') || reasonText('VALUE_UNAVAILABLE');
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
      <h3 className="font-semibold text-presson-text">Publication receipt metrics</h3>
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
        Receipt basis {receipt.basisRef.schemaId} · snapshot {receipt.basisRef.snapshotId} · hash{' '}
        {receipt.basisRef.snapshotInputHash}
      </p>
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
                  className="min-w-0 break-words tabular-nums"
                  data-testid={`actuals-metric-${row.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  {valueText(row, metrics.currency)}
                </TableCell>
                <TableCell className="break-all text-xs text-charcoal/70">
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
          ? ` — ${metrics.actionability.reasonCodes.map(reasonText).join('; ')}`
          : ''}
      </p>
      <section className="min-w-0 space-y-2" aria-label="Current-head consumer availability">
        <h3 className="font-semibold text-presson-text">Current-head consumer availability</h3>
        {latestReference?.head ? (
          <>
            <p className="break-words text-sm text-presson-textMuted">
              {latestReference.head.snapshotId !== receipt.facts.snapshotId ||
              latestReference.head.snapshotInputHash !== receipt.facts.snapshotInputHash
                ? 'Current head differs from this publication receipt. '
                : ''}
              These evaluations belong to the current head. Metrics above belong to receipt snapshot{' '}
              {receipt.facts.snapshotId}.
            </p>
            <p
              className="break-all text-xs text-presson-textMuted"
              data-testid="actuals-latest-reference-line"
            >
              Current head snapshot {latestReference.head.snapshotId} · as of{' '}
              {latestReference.head.asOfDate} · known through {latestReference.head.knowledgeCutoff}
              {' · '}Policy {latestReference.head.policyVersion} · Payload{' '}
              {latestReference.head.payloadSchemaId}
            </p>
            <p
              className="break-all font-mono text-xs text-presson-textMuted"
              data-testid="actuals-current-basis-line"
            >
              {latestReference.head.basisRef ? (
                <>
                  Current-head basis {latestReference.head.basisRef.schemaId} · fund{' '}
                  {latestReference.head.basisRef.fundId} · snapshot{' '}
                  {latestReference.head.basisRef.snapshotId} · hash{' '}
                  {latestReference.head.basisRef.snapshotInputHash} · source hash{' '}
                  {latestReference.head.basisRef.sourceFactsInputHash} · policy{' '}
                  {latestReference.head.basisRef.policyVersion} · as of{' '}
                  {latestReference.head.basisRef.asOfDate} · known through{' '}
                  {latestReference.head.basisRef.knowledgeCutoff}
                </>
              ) : (
                'Current-head basis unavailable.'
              )}
            </p>
            {latestReference.head.consumerEvaluations?.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {latestReference.head.consumerEvaluations.map((evaluation) => (
                  <li key={evaluation.consumer} className="min-w-0 break-words">
                    <span className="capitalize">{evaluation.consumer.replaceAll('_', ' ')}</span>
                    {' — '}
                    <Badge variant="outline">
                      {evaluation.status === 'accepted' ? 'Accepted' : 'Blocked'}
                    </Badge>
                    <p className="break-words text-presson-textMuted">
                      {evaluation.reasons.map(reasonText).join('; ') || 'No reasons reported.'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-presson-textMuted">
                Consumer evaluations unavailable for this head.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-presson-textMuted">
            Current head and consumer evaluations unavailable.
          </p>
        )}
      </section>
    </section>
  );
}

export default ActualMetricsReadback;
