import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useRoute } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFundMoicRankingsV2 } from '@/hooks/use-moic';
import type { FundMoicRankingsResponseV2 } from '@shared/contracts/fund-moic-v2.contract';

type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

type FundMoicRankingV2 = FundMoicRankingsResponseV2['rankings'][number];
type LatestReconciliationV2 = FundMoicRankingsResponseV2['latestReconciliation'];

const ACTIVATION_BLOCKER_LABELS: Record<string, string> = {
  accepted_reconciliation_required: 'Accepted reconciliation required',
  accepted_reconciliation_not_found: 'No accepted reconciliation found',
  current_source_changed: 'Unreconciled source edits',
  exit_probability_source_incomplete: 'Exit probabilities incomplete',
  kill_switch_active: 'Kill switch active',
  reserve_exit_multiple_source_incomplete: 'Reserve exit multiples incomplete',
  shadow_residency_pending: 'Shadow residency period pending',
};

const ROUND_EVIDENCE_WARNING_LABELS: Record<string, string> = {
  ROLE_CLASSIFICATION_AMBIGUOUS: 'Round role classification ambiguous',
  CURRENCY_MISMATCH_BLOCK: 'Currency mismatch (blocking)',
  ROUND_MODEL_OVERRIDE_APPLIED: 'Round model override applied',
  NON_EQUITY_AMOUNT_ONLY: 'Non-equity amounts only',
  EMPTY_FUND: 'No round data for fund',
  ROUND_ADAPTER_FAILED: 'Round evidence unavailable (adapter failed)',
};

function parseFundIdParam(rawValue: string | undefined): FundIdParseResult {
  if (rawValue === undefined) {
    return { status: 'missing', fundId: null };
  }

  const trimmed = rawValue.trim();
  const parsed = Number(trimmed);

  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    return { status: 'invalid', fundId: null };
  }

  return { status: 'valid', fundId: parsed };
}

function formatMoicValue(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(2)}x`;
}

export function formatRankingsSource(
  mode: FundMoicRankingsResponseV2['provenance']['mode']
): string {
  return mode === 'candidate'
    ? 'Showing candidate rankings - values use reconciled round evidence.'
    : 'Showing legacy rankings - baseline values from recorded portfolio data.';
}

export function formatMaterialityStatus(
  status: FundMoicRankingsResponseV2['materiality']['status']
): string {
  if (status === 'recorded') return 'Recorded';
  if (status === 'stale') return 'Stale - rerun required';
  return 'Not run';
}

function formatUnreconciledEdits(hasUnreconciledEdits: boolean): string {
  return hasUnreconciledEdits
    ? 'Source data changed since the last accepted reconciliation'
    : 'None';
}

function formatBlockingCount(count: number, label: string): string {
  return count > 0 ? `${count} blocking (${label})` : '0';
}

function formatMappedCode(code: string, labels: Record<string, string>): string {
  return labels[code] ?? code;
}

function StateCard({
  title,
  description,
  icon = 'warning',
}: {
  title: string;
  description: string;
  icon?: 'loading' | 'info' | 'warning';
}) {
  const Icon = icon === 'loading' ? Loader2 : icon === 'info' ? Info : AlertTriangle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-pov-charcoal">
          <Icon className={`h-5 w-5 ${icon === 'loading' ? 'animate-spin' : ''}`} />
          <span>{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning-dark">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-medium">{message}</p>
    </div>
  );
}

function StatusField({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  const valueClass = tone === 'warning' ? 'text-warning-dark' : 'text-pov-charcoal';

  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-medium ${valueClass}`}>{value}</p>
    </div>
  );
}

function CodeBadge({ code, label }: { code: string; label: string }) {
  const titleProps: { title?: string } = label === code ? {} : { title: code };

  return (
    <Badge
      {...titleProps}
      variant="outline"
      className="border-beige-200 bg-pov-gray text-charcoal-700"
    >
      {label}
    </Badge>
  );
}

function MappedCodeList({
  codes,
  labels,
}: {
  codes: readonly string[];
  labels: Record<string, string>;
}) {
  const uniqueCodes = [...new Set(codes)];

  if (uniqueCodes.length === 0) {
    return <span className="font-medium text-pov-charcoal">None</span>;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {uniqueCodes.map((code) => (
        <CodeBadge key={code} code={code} label={formatMappedCode(code, labels)} />
      ))}
    </div>
  );
}

function LatestReconciliationSummary({ latest }: { latest: LatestReconciliationV2 }) {
  if (!latest) {
    return (
      <div className="md:col-span-4">
        <p className="text-muted-foreground">Latest reconciliation</p>
        <p className="font-medium text-pov-charcoal">No reconciliation recorded</p>
      </div>
    );
  }

  return (
    <div className="md:col-span-4">
      <p className="text-muted-foreground">Latest reconciliation</p>
      <div className="mt-1 grid gap-2 rounded-md border border-beige-200 bg-pov-gray p-3 md:grid-cols-4">
        <p className="font-medium text-pov-charcoal">Run ID: {latest.runId ?? 'Unknown'}</p>
        <p className="font-medium text-pov-charcoal">Created: {latest.createdAt ?? 'Unknown'}</p>
        <p className="font-medium text-pov-charcoal">
          {latest.currentInputMatches ? 'Inputs match' : 'Inputs changed'}
        </p>
        <p className="font-medium text-pov-charcoal">
          {latest.sourceFingerprintMatches ? 'Fingerprint match' : 'Fingerprint changed'}
        </p>
      </div>
    </div>
  );
}

function ProvenanceStrip({ data }: { data: FundMoicRankingsResponseV2 }) {
  const materialityStatus = formatMaterialityStatus(data.materiality.status);
  const exitProbabilityCount =
    data.moicInputSummary.activationBlockingDefaultedExitProbabilityCount;
  const reserveMultipleCount =
    data.moicInputSummary.activationBlockingDefaultedReserveExitMultipleCount;

  return (
    <Card className="border-beige-200 bg-pov-white">
      <CardContent className="space-y-4 p-4 text-sm">
        <div className="rounded-md border border-beige-200 bg-pov-gray p-3">
          <p className="text-muted-foreground">Rankings source</p>
          <p className="font-semibold text-pov-charcoal">
            {formatRankingsSource(data.provenance.mode)}
          </p>
        </div>

        {data.modePreview.killSwitchActive ? (
          <WarningBanner message="Kill switch active. Candidate mode is disabled; legacy rankings are shown." />
        ) : null}

        {data.materiality.status === 'stale' ? (
          <WarningBanner message="Materiality check is stale. Displayed rankings may not reflect current inputs." />
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <StatusField label="Materiality" value={materialityStatus} />
          <StatusField
            label="Mode"
            value={`${data.modePreview.configuredMode} / ${data.modePreview.effectiveMode}`}
          />
          <StatusField label="Residency" value={data.modePreview.residencyStatus} />
          <StatusField
            label="Kill switch"
            value={data.modePreview.killSwitchActive ? 'Active' : 'Inactive'}
          />
          <StatusField
            label="Unreconciled edits"
            value={formatUnreconciledEdits(data.modePreview.unreconciledEditsPresent)}
            tone={data.modePreview.unreconciledEditsPresent ? 'warning' : 'default'}
          />
          <StatusField
            label="Missing probabilities"
            value={formatBlockingCount(exitProbabilityCount, 'defaulted exit probabilities')}
          />
          <StatusField
            label="Missing reserve multiples"
            value={formatBlockingCount(reserveMultipleCount, 'defaulted reserve exit multiples')}
          />
          <div className="md:col-span-2">
            <p className="text-muted-foreground">Activation blockers</p>
            <MappedCodeList codes={data.modePreview.blockers} labels={ACTIVATION_BLOCKER_LABELS} />
          </div>
          <div className="md:col-span-2">
            <p className="text-muted-foreground">Round evidence warnings</p>
            <MappedCodeList
              codes={data.roundEvidenceSummary.warningCodes}
              labels={ROUND_EVIDENCE_WARNING_LABELS}
            />
          </div>
          <LatestReconciliationSummary latest={data.latestReconciliation} />
        </div>
      </CardContent>
    </Card>
  );
}

function RankingsTable({ rankings }: { rankings: FundMoicRankingV2[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>MOIC Rankings</CardTitle>
        <CardDescription>Fund-scoped V2 rankings payload.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Investment</TableHead>
              <TableHead className="text-right">Reserves MOIC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.map((item) => (
              <TableRow key={item.investmentId}>
                <TableCell className="font-semibold text-charcoal-600">#{item.rank}</TableCell>
                <TableCell className="font-medium text-pov-charcoal">
                  {item.investmentName}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums text-pov-charcoal">
                  {formatMoicValue(item.reservesMoic.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function FundModelResultsMoicAnalysisPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/moic-analysis');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const { data, error, isLoading } = useFundMoicRankingsV2(fundIdResult.fundId);
  const hasParsedResponse = fundIdResult.status === 'valid' && !error && data;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">MOIC Analysis</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid' ? `Fund ${fundIdResult.fundId}` : 'Fund-scoped results'}
        </p>
      </header>

      {fundIdResult.status === 'missing' ? (
        <StateCard
          title="Fund ID required"
          description="MOIC rankings are unavailable because the route did not include a fund ID."
          icon="info"
        />
      ) : null}

      {fundIdResult.status === 'invalid' ? (
        <StateCard
          title="Invalid fund ID"
          description="MOIC rankings are unavailable because the fund ID is not a positive integer."
        />
      ) : null}

      {fundIdResult.status === 'valid' && isLoading ? (
        <StateCard
          title="Loading MOIC rankings"
          description="Fetching the fund-scoped MOIC rankings response."
          icon="loading"
        />
      ) : null}

      {fundIdResult.status === 'valid' && error ? (
        <StateCard
          title={
            error.code === 'CONTRACT_PARSE_ERROR'
              ? 'MOIC contract mismatch'
              : 'Unable to load MOIC rankings'
          }
          description={
            error.code === 'CONTRACT_PARSE_ERROR'
              ? 'The response did not match the required V2 contract, so rankings are not shown.'
              : 'The rankings endpoint returned a load error, so rankings are not shown.'
          }
        />
      ) : null}

      {hasParsedResponse && data.rankings.length === 0 ? (
        <>
          <ProvenanceStrip data={data} />
          <StateCard
            title="No rankings available"
            description="The V2 response returned zero reserves MOIC ranking rows for this fund."
            icon="info"
          />
        </>
      ) : null}

      {hasParsedResponse && data.rankings.length > 0 ? (
        <>
          <ProvenanceStrip data={data} />
          <RankingsTable rankings={data.rankings} />
        </>
      ) : null}
    </div>
  );
}
