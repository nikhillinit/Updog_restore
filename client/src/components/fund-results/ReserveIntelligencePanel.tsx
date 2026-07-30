import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReserveIntelligence } from '@/hooks/useReserveIntelligence';
import type { DynamicReserveIntelligenceRunV1 } from '@shared/contracts/dynamic-reserve-intelligence-v1.contract';
import { DecisionStateBadge, type DecisionState } from './DecisionStateBadge';
import { FinancialEvidenceDrawer } from './FinancialEvidenceDrawer';
import type { FinancialEvidence } from './financial-evidence';

type ReserveRun = DynamicReserveIntelligenceRunV1;
type ReserveCompany = ReserveRun['result']['companies'][number];
type FactsSnapshot = ReserveRun['result']['provenance']['factsSnapshot'];
type CompanyFact = FactsSnapshot['payload']['companyActuals']['facts'][number];

const ANALYTICAL_NOTICE =
  'Analytical only. Derived from the pinned facts snapshot; never written back to the current plan.';

const STAGE_LABELS: Record<ReserveCompany['canonicalStage'], string> = {
  pre_seed: 'Pre-Seed',
  seed: 'Seed',
  series_a: 'Series A',
  series_b: 'Series B',
  series_c: 'Series C',
  series_d: 'Series D+',
  growth: 'Growth',
  late_stage: 'Late Stage',
};

function decisionState(
  status: ReserveCompany['status'] | ReserveRun['result']['actionability']
): DecisionState {
  // Reserve wire states collapse only unavailable/non_actionable into generic not_actionable.
  if (status === 'actionable' || status === 'indicative') {
    return status;
  }
  return 'not_actionable';
}

function formatBaseCurrencyCents(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isSafeInteger(value)) {
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

function formatRatio(value: string | null, suffix = ''): string {
  return value === null ? 'Unavailable' : `${value}${suffix}`;
}

function copyHash(hash: string): void {
  if (!navigator.clipboard) {
    return;
  }
  void navigator.clipboard.writeText(hash).catch(() => undefined);
}

function RecomputeControl() {
  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled aria-describedby="reserve-recompute-reason">
        Recompute from latest accepted facts
      </Button>
      <p id="reserve-recompute-reason" className="text-right text-xs text-presson-textMuted">
        Recompute command is not available in this client-only release.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <CardContent className="space-y-3">
      <p className="font-medium text-pov-charcoal">Loading reserve intelligence</p>
      <p className="text-sm text-presson-textMuted">
        Fetching latest persisted reserve diagnostics.
      </p>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          data-testid="reserve-intelligence-skeleton-row"
          className="h-8 animate-pulse rounded bg-pov-gray motion-reduce:animate-none"
        />
      ))}
    </CardContent>
  );
}

function UnavailableState({
  title,
  reason,
}: {
  title: 'Reserve intelligence unavailable' | 'No reserve intelligence run yet';
  reason: string;
}) {
  return (
    <CardContent>
      <p className="font-medium text-pov-charcoal">{title}</p>
      <p className="mt-1 text-sm text-presson-textMuted">{reason}</p>
    </CardContent>
  );
}

function ErrorState({ contractMismatch }: { contractMismatch: boolean }) {
  return (
    <CardContent role="alert">
      <p className="font-medium text-pov-charcoal">
        {contractMismatch
          ? 'Reserve intelligence contract mismatch'
          : 'Unable to load reserve intelligence'}
      </p>
      <p className="mt-1 text-sm text-presson-textMuted">
        {contractMismatch
          ? 'Latest run did not match the client-safe reserve contract, so diagnostics are hidden.'
          : 'Reserve diagnostics could not be loaded. Existing MOIC rankings remain available.'}
      </p>
    </CardContent>
  );
}

function evidenceFromReserveRun(run: ReserveRun, fact: CompanyFact): FinancialEvidence {
  return {
    source: fact.provenance.core.sourceEngine ?? fact.provenance.core.sourceKind,
    asOfDate: run.result.provenance.factsSnapshot.asOfDate,
    contractVersion: run.result.contractVersion,
    sourceVersion: fact.provenance.core.engineVersion ?? null,
    factsInputHash: fact.inputHash,
    assumptionsHash: fact.provenance.core.assumptionsHash ?? null,
    trustState: fact.provenance.trustState,
    currencyStatus: fact.currencyStatus,
    warnings: fact.warnings,
  };
}

function EffectiveTermsBasis({ snapshot }: { snapshot: FactsSnapshot }) {
  if (
    snapshot.policyVersion !== 'financial-facts-policy/1.1.0' &&
    snapshot.policyVersion !== 'financial-facts-policy/1.2.0'
  ) {
    return (
      <div className="space-y-1 text-xs text-presson-textMuted">
        <p>{snapshot.policyVersion} does not disclose effective-terms refs.</p>
        <p>
          Per-company basis unavailable: companyId to companyIdentityId mapping is not disclosed.
        </p>
      </div>
    );
  }

  const basisCounts = { direct: 0, derived: 0, unavailable: 0 };
  for (const ref of snapshot.payload.valuationRefs) {
    basisCounts[ref.basis] += 1;
  }

  return (
    <div className="space-y-1 text-xs text-presson-textMuted">
      <p>Participation refs: {snapshot.payload.participationTermRefs.length}</p>
      <p>
        Valuation basis: direct {basisCounts.direct}, derived {basisCounts.derived}, unavailable{' '}
        {basisCounts.unavailable}
      </p>
      <p>Per-company basis unavailable: companyId to companyIdentityId mapping is not disclosed.</p>
    </div>
  );
}

function buildUnresolvedFactItems(run: ReserveRun): string[] {
  const snapshot = run.result.provenance.factsSnapshot;
  const items = snapshot.consumerEvaluations
    .filter((evaluation) => evaluation.status === 'blocked')
    .map(
      (evaluation) =>
        `${evaluation.consumer}: ${evaluation.reasons.join(', ') || 'blocked without a reason'}`
    );

  for (const fact of snapshot.payload.companyActuals.facts) {
    items.push(...fact.warnings.map((warning) => `${fact.companyName}: ${warning.message}`));
  }
  items.push(...snapshot.payload.cashFlowSeries.warnings.map((warning) => warning.message));
  items.push(...snapshot.payload.marksSeries.warnings.map((warning) => warning.message));
  for (const period of snapshot.payload.marksSeries.periodNav) {
    items.push(...period.warnings.map((warning) => `${period.periodEnd}: ${warning.message}`));
  }
  items.push(...run.result.fund.disclosedDefaults.map((value) => `Disclosed default: ${value}`));
  return items;
}

function buildSelectionDeviationItems(snapshot: FactsSnapshot): string[] {
  const reserveEvaluation = snapshot.consumerEvaluations.find(
    (evaluation) => evaluation.consumer === 'reserve'
  );
  if (!reserveEvaluation?.reasons.includes('working_value_selection_deviation')) {
    return [];
  }

  const items = ['working_value_selection_deviation'];
  if (
    snapshot.policyVersion !== 'financial-facts-policy/1.1.0' &&
    snapshot.policyVersion !== 'financial-facts-policy/1.2.0'
  ) {
    return items;
  }

  const details = snapshot.consumerEvaluations.find(
    (evaluation) => evaluation.consumer === 'reserve'
  )?.details;
  for (const detail of details ?? []) {
    if (detail.code === 'working_value_selection_deviation') {
      items.push(detail.message ?? detail.code);
    }
  }
  return items;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-beige-200 bg-pov-gray p-3">
      <h3 className="text-sm font-semibold text-pov-charcoal">{title}</h3>
      <div className="mt-2 text-xs text-presson-textMuted">{children}</div>
    </section>
  );
}

function StringList({ items, empty }: { items: readonly string[]; empty: string }) {
  if (items.length === 0) {
    return <p>{empty}</p>;
  }
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function BasisLine({ run }: { run: ReserveRun }) {
  const provenance = run.result.provenance;
  const snapshotHash = provenance.factsSnapshot.snapshotInputHash;

  return (
    <TableRow data-testid="basis-line" className="bg-pov-gray hover:bg-pov-gray">
      <TableCell colSpan={10} className="py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-pov-charcoal">
          <span className="tabular-nums">As of {provenance.asOfDate}</span>
          <span className="tabular-nums">
            Snapshot {provenance.financialFactsSnapshotId}: {snapshotHash.slice(0, 12)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs motion-reduce:transition-none"
            aria-label="Copy full facts snapshot hash"
            onClick={() => copyHash(snapshotHash)}
          >
            Copy full hash
          </Button>
          <DecisionStateBadge state={decisionState(run.result.actionability)} />
          <span>Mode: {provenance.effectiveMode}</span>
          <span className="whitespace-nowrap">{ANALYTICAL_NOTICE}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function DiagnosticsTable({
  run,
  onOpenEvidence,
}: {
  run: ReserveRun;
  onOpenEvidence: (companyId: number, trigger: HTMLButtonElement) => void;
}) {
  const factsByCompanyId = new Map(
    run.result.provenance.factsSnapshot.payload.companyActuals.facts.map((fact) => [
      fact.companyId,
      fact,
    ])
  );

  return (
    <Table aria-label="Reserve intelligence diagnostics">
      <TableHeader>
        <TableRow>
          <TableHead>Rank</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="text-right">Marginal MOIC</TableHead>
          <TableHead className="text-right">Derived allocation</TableHead>
          <TableHead className="text-right">Overlay planned</TableHead>
          <TableHead className="text-right">Delta</TableHead>
          <TableHead className="text-right">Concentration</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Facts snapshot</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <BasisLine run={run} />
        {run.result.companies.map((company) => {
          const fact = factsByCompanyId.get(company.companyId);
          return (
            <TableRow key={company.companyId}>
              <TableCell className="tabular-nums">
                {company.rank === null ? 'Unavailable' : `#${company.rank}`}
              </TableCell>
              <TableCell className="font-medium text-pov-charcoal">{company.name}</TableCell>
              <TableCell>{STAGE_LABELS[company.canonicalStage]}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRatio(company.marginalMoic, 'x')}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBaseCurrencyCents(company.systemAllocatedCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBaseCurrencyCents(company.overlayPlannedCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatBaseCurrencyCents(company.deltaCents)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRatio(company.concentration)}
              </TableCell>
              <TableCell>
                <DecisionStateBadge state={decisionState(company.status)} />
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <span className="block text-xs text-presson-textMuted">
                    {fact === undefined ? 'No facts row disclosed' : `Linked: ${fact.companyName}`}
                  </span>
                  <span className="block text-xs text-presson-textMuted">
                    Participation basis unavailable: companyId to companyIdentityId mapping is not
                    disclosed.
                  </span>
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-pov-charcoal underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal-400 focus-visible:ring-offset-2"
                    onClick={(event) => onOpenEvidence(company.companyId, event.currentTarget)}
                  >
                    Open reserve facts for {company.name}
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow className="bg-pov-gray/60 font-semibold hover:bg-pov-gray/60">
          <TableCell colSpan={4}>Fund totals</TableCell>
          <TableCell className="text-right tabular-nums">
            {formatBaseCurrencyCents(run.result.fund.totalSystemAllocatedCents)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatBaseCurrencyCents(run.result.fund.totalOverlayPlannedCents)}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatBaseCurrencyCents(run.result.fund.totalDeltaCents)}
          </TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      </TableBody>
    </Table>
  );
}

function ReadyState({ run }: { run: ReserveRun }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const snapshot = run.result.provenance.factsSnapshot;
  const selectedCompany = run.result.companies.find(
    (company) => company.companyId === selectedCompanyId
  );
  const selectedFact = snapshot.payload.companyActuals.facts.find(
    (fact) => fact.companyId === selectedCompanyId
  );
  const unresolvedFacts = buildUnresolvedFactItems(run);
  const selectionDeviations = buildSelectionDeviationItems(snapshot);
  const constraintItems = run.result.constraintFindings.map(
    (finding) => `${finding.code}: company ${finding.companyId}`
  );
  const exclusionItems = run.result.fund.excluded.map(
    (entry) => `Company ${entry.companyId}: ${entry.reason}`
  );
  const approvedAllocations = run.result.provenance.marginalNonFactsSources.approvedAllocations.map(
    (allocation) =>
      `${allocation.decisionType}: ${allocation.decisionStatus}; company ${allocation.companyId}; ` +
      `planned ${allocation.finalPlannedReservesCents ?? 'Unavailable'}; ` +
      `version ${allocation.liveAllocationVersion ?? 'Unavailable'}; ` +
      `decided ${allocation.decidedAt ?? 'Unavailable'}`
  );

  return (
    <CardContent className="space-y-4">
      <DiagnosticsTable
        run={run}
        onOpenEvidence={(companyId, trigger) => {
          returnFocusRef.current = trigger;
          setSelectedCompanyId(companyId);
        }}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <DetailSection title="Fund diagnostics">
          <dl className="space-y-1">
            <div>
              <dt className="inline">Follow-on capacity: </dt>
              <dd className="inline tabular-nums">
                {formatBaseCurrencyCents(run.result.fund.followOnCapacityCents)}
              </dd>
            </div>
            <div>
              <dt className="inline">Fail-safe: </dt>
              <dd className="inline">
                {run.result.fund.failSafe ? 'Active' : 'Inactive'}
                {run.result.fund.failSafeReason ? ` (${run.result.fund.failSafeReason})` : ''}
              </dd>
            </div>
            <div>
              <dt className="inline">Overlay supplied: </dt>
              <dd className="inline">
                {run.result.provenance.overlay === null
                  ? 'No'
                  : `Yes, by ${run.result.provenance.overlayProvenance.suppliedBy ?? 'Unavailable'} at ${run.result.provenance.overlayProvenance.suppliedAt}`}
              </dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="Constraints and exclusions">
          <StringList
            items={[...constraintItems, ...exclusionItems]}
            empty="No constraints or exclusions disclosed."
          />
        </DetailSection>

        <DetailSection title="Unresolved facts">
          <StringList items={unresolvedFacts} empty="No unresolved facts disclosed." />
        </DetailSection>

        <DetailSection title="D30 selection deviations">
          <StringList
            items={selectionDeviations}
            empty="No working-value selection deviations disclosed."
          />
        </DetailSection>

        <DetailSection title="Decision state">
          <div className="space-y-2">
            <p>
              Run: <DecisionStateBadge state={decisionState(run.result.actionability)} />
            </p>
            <p>H9 actionability: {run.result.provenance.h9Actionability}</p>
            <StringList
              items={approvedAllocations}
              empty="No approved allocation decisions disclosed."
            />
          </div>
        </DetailSection>

        <DetailSection title="Effective-terms basis (run-level)">
          <p className="mb-2 tabular-nums">{snapshot.policyVersion}</p>
          <EffectiveTermsBasis snapshot={snapshot} />
        </DetailSection>
      </div>

      {selectedCompany !== undefined && selectedFact !== undefined ? (
        <FinancialEvidenceDrawer
          open
          onOpenChange={(open) => {
            if (!open) setSelectedCompanyId(null);
          }}
          entityLabel={`${selectedCompany.name} reserve evidence`}
          evidence={evidenceFromReserveRun(run, selectedFact)}
          decisionState={decisionState(selectedCompany.status)}
          proofSlot={<EffectiveTermsBasis snapshot={snapshot} />}
          returnFocusRef={returnFocusRef}
        />
      ) : null}

      {selectedCompany !== undefined && selectedFact === undefined ? (
        <FinancialEvidenceDrawer
          open
          onOpenChange={(open) => {
            if (!open) setSelectedCompanyId(null);
          }}
          entityLabel={`${selectedCompany.name} reserve evidence`}
          status="empty"
          evidence={null}
          decisionState={decisionState(selectedCompany.status)}
          factsDomainNoun={`${selectedCompany.name} facts row`}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </CardContent>
  );
}

export function ReserveIntelligencePanel({ fundId }: { fundId: number }) {
  const { data, error, isLoading } = useReserveIntelligence(fundId);

  let content: ReactNode;
  if (isLoading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState contractMismatch={error.code === 'CONTRACT_PARSE_ERROR'} />;
  } else if (data?.kind === 'feature-disabled') {
    content = (
      <UnavailableState
        title="Reserve intelligence unavailable"
        reason="Reserve intelligence is disabled by server configuration."
      />
    );
  } else if (data?.kind === 'no-run') {
    content = (
      <UnavailableState
        title="No reserve intelligence run yet"
        reason="Feature is enabled, but this fund has no persisted run."
      />
    );
  } else if (data?.kind === 'ready') {
    content = <ReadyState run={data.run} />;
  } else {
    content = <ErrorState contractMismatch={false} />;
  }

  return (
    <section aria-label="Reserve intelligence">
      <Card className="border-beige-200 bg-pov-white">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <h2 className="text-lg font-inter font-bold leading-none text-pov-charcoal">
              Reserve intelligence
            </h2>
            <CardDescription>
              Derived allocation, overlay, constraint, and evidence diagnostics.
            </CardDescription>
          </div>
          <RecomputeControl />
        </CardHeader>
        {content}
      </Card>
    </section>
  );
}
