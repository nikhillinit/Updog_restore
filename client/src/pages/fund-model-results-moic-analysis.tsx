import { Fragment, useState } from 'react';
import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { useRoute } from 'wouter';
import { MoicBasisDisclosure, MoicRankabilityBadge } from '@/components/moic/MoicBasisDisclosure';
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
import { usePortfolioCompanies } from '@/hooks/use-fund-data';
import { useFundMoicRankingsV2 } from '@/hooks/use-moic';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';
import type { FundMoicRankingsResponseV2 } from '@shared/contracts/fund-moic-v2.contract';

type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

type FundMoicRankingV2 = FundMoicRankingsResponseV2['rankings'][number];
type LatestReconciliationV2 = FundMoicRankingsResponseV2['latestReconciliation'];
type ActualsProvenanceSummaryV2 = FundMoicRankingsResponseV2['actualsProvenanceSummary'];

interface PortfolioCompanyReserves {
  id: number;
  plannedReservesCents: number;
  deployedReservesCents: number;
}

const MOIC_METRIC_LABEL = 'Expected MOIC on planned reserves — assumption-based';

const RANKABILITY_GROUPS = [
  { key: 'actionable', label: 'Actionable' },
  { key: 'indicative', label: 'Indicative' },
  { key: 'not_actionable', label: 'Not actionable' },
] as const;

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

function formatBaseCurrencyCents(value: number | undefined): string {
  if (value === undefined || !Number.isSafeInteger(value)) {
    return 'Unavailable';
  }

  const signedCents = BigInt(value);
  const magnitudeInCents = signedCents < 0n ? -signedCents : signedCents;
  const wholeUnits = magnitudeInCents / 100n;
  const cents = (magnitudeInCents % 100n).toString().padStart(2, '0');
  const sign = signedCents < 0n ? '-' : '';
  const groupedWholeUnits = wholeUnits.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${sign}${groupedWholeUnits}.${cents}`;
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

function formatFactsInputHash(summary: ActualsProvenanceSummaryV2): string {
  return summary.factsInputHash ?? 'unavailable';
}

function formatFactsTrust(summary: ActualsProvenanceSummaryV2): string {
  const counts = summary.trustStateCounts;
  return [
    `LIVE ${counts.LIVE}`,
    `PARTIAL ${counts.PARTIAL}`,
    `UNAVAILABLE ${counts.UNAVAILABLE}`,
    `FAILED ${counts.FAILED}`,
  ].join(', ');
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
  icon?: 'info' | 'warning';
}) {
  const Icon = icon === 'info' ? Info : AlertTriangle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-pov-charcoal">
          <Icon className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function RankingsLoadingSkeleton() {
  return (
    <Card aria-label="Loading MOIC rankings">
      <CardHeader>
        <CardTitle className="text-pov-charcoal">Loading MOIC rankings</CardTitle>
        <CardDescription>Fetching the fund-scoped MOIC rankings response.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="grid grid-cols-[3rem_1fr_auto] items-center gap-4 border-b border-beige-200 py-3 last:border-b-0"
          >
            <span className="h-4 animate-pulse bg-pov-gray motion-reduce:animate-none" />
            <span className="h-4 animate-pulse bg-pov-gray motion-reduce:animate-none" />
            <span
              data-testid="moic-loading-number"
              className="animate-pulse tabular-nums text-transparent motion-reduce:animate-none"
            >
              00.00x
            </span>
          </div>
        ))}
      </CardContent>
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
  const actualsSummary = data.actualsProvenanceSummary;

  return (
    <Card className="border-beige-200 bg-pov-white">
      <CardContent className="space-y-4 p-4 text-sm">
        <div className="rounded-md border border-beige-200 bg-pov-gray p-3">
          <p className="text-muted-foreground">Rankings source</p>
          <p className="font-semibold text-pov-charcoal">
            {formatRankingsSource(data.provenance.mode)}
          </p>
        </div>

        <div className="grid gap-3 rounded-md border border-beige-200 bg-pov-gray p-3 md:grid-cols-4">
          <StatusField
            label="Facts status"
            value={actualsSummary.factsStatus}
            tone={actualsSummary.factsStatus === 'failed' ? 'warning' : 'default'}
          />
          <StatusField label="Facts input hash" value={formatFactsInputHash(actualsSummary)} />
          <StatusField
            label="Facts trust"
            value={formatFactsTrust(actualsSummary)}
            tone={actualsSummary.trustStateCounts.FAILED > 0 ? 'warning' : 'default'}
          />
          <StatusField
            label="Defaulted economic inputs"
            value={String(actualsSummary.defaultedEconomicInputCount)}
          />
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

function rankingGroup(item: FundMoicRankingV2): (typeof RANKABILITY_GROUPS)[number]['key'] {
  return item.factsBasis?.rankability ?? 'not_actionable';
}

function RankingsTable({
  rankings,
  portfolioCompanies,
}: {
  rankings: FundMoicRankingV2[];
  portfolioCompanies: PortfolioCompanyReserves[];
}) {
  const [expandedInvestmentId, setExpandedInvestmentId] = useState<string | null>(null);
  const reservesByInvestmentId = new Map(
    portfolioCompanies.map((company) => [String(company.id), company])
  );
  const groupedRankings = RANKABILITY_GROUPS.map((group) => ({
    ...group,
    rankings: rankings
      .filter((item) => rankingGroup(item) === group.key)
      .sort((left, right) => left.rank - right.rank),
  })).filter((group) => group.rankings.length > 0);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-inter font-bold leading-none tracking-tight text-charcoal">
          {MOIC_METRIC_LABEL}
        </h2>
        <CardDescription>
          Companies are grouped by decision use; overall MOIC rank is retained while display order
          is trust-first. Reserve columns show current portfolio values.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Overall MOIC rank</TableHead>
              <TableHead>Investment</TableHead>
              <TableHead>Rankability</TableHead>
              <TableHead className="text-right">Current planned reserves (base currency)</TableHead>
              <TableHead className="text-right">
                Current deployed reserves (base currency)
              </TableHead>
              <TableHead className="text-right">Expected MOIC</TableHead>
            </TableRow>
          </TableHeader>
          {groupedRankings.map((group) => (
            <TableBody key={group.key}>
              <TableRow className="bg-pov-gray/60 hover:bg-pov-gray/60">
                <TableHead
                  scope="rowgroup"
                  colSpan={6}
                  className="h-auto py-2 text-xs font-semibold uppercase text-charcoal-500"
                >
                  {group.label}
                </TableHead>
              </TableRow>
              {group.key === 'actionable' ? (
                /* Planned<->marginal cross-reference adjacent to the Actionable
                   group header (D-C gated affordance): disabled with reason
                   until marginal analysis activates. */
                <TableRow className="bg-pov-gray/40 hover:bg-pov-gray/40">
                  <TableCell
                    colSpan={6}
                    className="py-1.5 text-xs text-presson-textMuted"
                    data-testid="moic-planned-marginal-crossref"
                  >
                    Rankings above reflect planned reserves.{' '}
                    <span aria-disabled="true">Marginal analysis not yet activated.</span>
                  </TableCell>
                </TableRow>
              ) : null}
              {group.rankings.map((item) => {
                const isExpanded = expandedInvestmentId === item.investmentId;
                const disclosureId = `moic-basis-${item.investmentId}`;
                const reserveData = reservesByInvestmentId.get(item.investmentId);

                return (
                  <Fragment key={item.investmentId}>
                    <TableRow>
                      <TableCell className="font-semibold text-charcoal-600">
                        #{item.rank}
                      </TableCell>
                      <TableCell className="font-medium text-pov-charcoal">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={disclosureId}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} facts basis for ${item.investmentName}`}
                          onClick={() =>
                            setExpandedInvestmentId(isExpanded ? null : item.investmentId)
                          }
                          className="inline-flex min-h-10 items-center gap-2 text-left text-pov-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2"
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-90' : ''}`}
                          />
                          {item.investmentName}
                        </button>
                      </TableCell>
                      <TableCell>
                        <MoicRankabilityBadge basis={item.factsBasis} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-pov-charcoal">
                        {formatBaseCurrencyCents(reserveData?.plannedReservesCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-pov-charcoal">
                        {formatBaseCurrencyCents(reserveData?.deployedReservesCents)}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-pov-charcoal">
                        {formatMoicValue(item.reservesMoic.value)}
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow id={disclosureId}>
                        <TableCell colSpan={6} className="p-0">
                          <MoicBasisDisclosure
                            basis={item.factsBasis}
                            investmentName={item.investmentName}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          ))}
        </Table>
      </CardContent>
    </Card>
  );
}

export default function FundModelResultsMoicAnalysisPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/moic-analysis');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const { data, error, isLoading } = useFundMoicRankingsV2(fundIdResult.fundId);
  const { portfolioCompanies } = usePortfolioCompanies(fundIdResult.fundId ?? undefined);
  const hasParsedResponse = fundIdResult.status === 'valid' && !error && data;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">MOIC Analysis</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid' ? `Fund ${fundIdResult.fundId}` : 'Fund-scoped results'}
        </p>
      </header>

      {/* Workspace row (D-F.2). Planned MOIC is construction-planning by nature:
          static indicator only, no basis control (D-E). */}
      <WorkspaceNav
        fundId={fundIdResult.status === 'valid' ? String(fundIdResult.fundId) : null}
        fundLabel={fundIdResult.status === 'valid' ? `Fund ${fundIdResult.fundId}` : 'No fund'}
        active="reserves"
        indicator={<WorkspaceBasisIndicator mode="construction" />}
      />

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

      {fundIdResult.status === 'valid' && isLoading ? <RankingsLoadingSkeleton /> : null}

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
            title="No rankings disclosed"
            description={`As of ${data.generatedAt.slice(0, 10)}. The V2 response returned zero reserves MOIC ranking rows for this fund.`}
            icon="info"
          />
        </>
      ) : null}

      {hasParsedResponse && data.rankings.length > 0 ? (
        <>
          <ProvenanceStrip data={data} />
          <RankingsTable rankings={data.rankings} portfolioCompanies={portfolioCompanies} />
        </>
      ) : null}
    </div>
  );
}
