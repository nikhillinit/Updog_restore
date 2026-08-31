/**
 * Fund Model Results -- Internal Analysis (PLAN_61 Task 18, Wave G).
 *
 * Fund-scoped internal periodic analysis: revisable quarterly drafts and the
 * immutable reference snapshots they harden into. Validates the route fund id
 * with the existing /^\d+$/ idiom and verifies FundContext resolved to the SAME
 * fund, so another fund's analysis can never render here.
 *
 * These are INTERNAL reference snapshots on one coherent facts basis -- never
 * closes, restatements, or approved reports. The page therefore has no approval,
 * recipient, send, or export affordance, and it renders the mixed-basis warning
 * on EVERY load of a reference that was saved with one (R34-d), derived from the
 * persisted flag rather than transient save state.
 *
 * Route: /fund-model-results/:fundId/internal-analysis
 *
 * @module client/pages/fund-model-results-internal-analysis
 */

import { useRoute } from 'wouter';
import { AlertTriangle, Info } from 'lucide-react';

import type { AnalysisReferenceV1 } from '@shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import type { NarrativeAnchor } from '@shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import { QuarterlyReviewPanel } from '@/components/internal-analysis/QuarterlyReviewPanel';
import { InternalNarrativePanel } from '@/components/fund-results/InternalNarrativePanel';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFundContext } from '@/contexts/FundContext';
import { FundWorkspaceProvider } from '@/contexts/FundWorkspaceContext';
import { WorkspaceContextRail } from '@/components/fund-results/WorkspaceContextRail';
import { useAuthSession } from '@/lib/auth-session';
import { useInternalAnalysis } from '@/hooks/useInternalAnalysis';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';

type FundIdParseResult =
  | { status: 'missing'; fundId: null }
  | { status: 'invalid'; fundId: null }
  | { status: 'valid'; fundId: number };

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

function BasisRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-presson-textMuted">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums text-pov-charcoal">{value}</dd>
    </div>
  );
}

export function ReferenceCard({ reference }: { reference: AnalysisReferenceV1 }) {
  return (
    <section
      aria-label={`Analysis reference ${reference.period.periodStart} to ${reference.period.periodEnd}`}
      data-testid={`analysis-reference-${reference.referenceId}`}
      className="rounded-lg border border-beige-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-pov-charcoal">
          <span className="tabular-nums">{reference.period.periodStart}</span> to{' '}
          <span className="tabular-nums">{reference.period.periodEnd}</span>
        </h3>
        <p className="text-xs text-presson-textMuted">
          {reference.period.periodKind === 'quarterly' ? 'Quarterly' : 'Manual period'}
          {reference.supersedesReferenceId === null
            ? null
            : ` - corrects reference ${reference.supersedesReferenceId}`}
        </p>
      </div>

      {/* R34-d: derived from the persisted flag, so it renders on every load. */}
      {reference.mixedBasisAtSave ? (
        <p
          role="alert"
          data-testid={`analysis-reference-${reference.referenceId}-mixed-basis`}
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-pov-charcoal"
        >
          Saved on a mixed facts basis: at least one pinned component was not built from facts
          snapshot {reference.basis.financialFactsSnapshotId}. Treat the figures as indicative.
        </p>
      ) : null}

      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <BasisRow label="Facts snapshot" value={String(reference.basis.financialFactsSnapshotId)} />
        <BasisRow label="Knowledge cutoff" value={reference.basis.knowledgeCutoff} />
        <BasisRow
          label="Forecast run"
          value={
            reference.basis.forecastFundSnapshotId === null
              ? 'Not pinned'
              : String(reference.basis.forecastFundSnapshotId)
          }
        />
        <BasisRow
          label="Reserves / economics"
          value={
            reference.basis.reserveReferenceId === null &&
            reference.basis.economicsReferenceId === null
              ? 'Not attached'
              : `${reference.basis.reserveReferenceId ?? '-'} / ${reference.basis.economicsReferenceId ?? '-'}`
          }
        />
      </dl>
    </section>
  );
}

function InternalAnalysisContent({ fundId }: { fundId: number }) {
  const { drafts, references, isLoading, error } = useInternalAnalysis(fundId);
  const authSession = useAuthSession();
  const openDrafts = drafts.filter((draft) => draft.savedAt === null);
  // Anchor the narrative to the terminal reference, else the latest open draft.
  const firstReference = references[0];
  const firstOpenDraft = openDrafts[0];
  const narrativeAnchor: NarrativeAnchor | null = firstReference
    ? { kind: 'analysis_reference', id: firstReference.referenceId }
    : firstOpenDraft
      ? { kind: 'analysis_draft', id: firstOpenDraft.draftId }
      : null;

  return (
    <section aria-labelledby="internal-analysis-heading" className="space-y-5">
      <div>
        <h2 id="internal-analysis-heading" className="text-lg font-semibold text-pov-charcoal">
          Periodic reference snapshots
        </h2>
        <p className="mt-1 text-sm text-presson-textMuted">
          Internal reference snapshots on one coherent facts basis. These are not closes,
          restatements, or approved reports.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-presson-textMuted">Loading internal analysis...</p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-pov-charcoal"
        >
          {error.message}
        </p>
      ) : null}

      {!isLoading && !error ? (
        <>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-pov-charcoal">Open drafts</h3>
            {openDrafts.length === 0 ? (
              <p className="text-sm text-presson-textMuted">
                No open draft. A quarterly draft is created on the first UTC day after quarter-end.
              </p>
            ) : (
              <ul className="space-y-1">
                {openDrafts.map((draft) => (
                  <li
                    key={draft.draftId}
                    data-testid={`analysis-draft-${draft.draftId}`}
                    className="text-sm text-pov-charcoal"
                  >
                    <span className="tabular-nums">{draft.period.periodStart}</span> to{' '}
                    <span className="tabular-nums">{draft.period.periodEnd}</span>
                    <span className="ml-2 text-xs text-presson-textMuted">
                      revision {draft.version}, facts snapshot{' '}
                      {draft.basis.financialFactsSnapshotId}
                    </span>
                    <QuarterlyReviewPanel
                      fundId={fundId}
                      draftId={draft.draftId}
                      userRole={authSession.data?.user.role}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-pov-charcoal">Saved references</h3>
            {references.length === 0 ? (
              <p className="text-sm text-presson-textMuted">
                No reference has been saved for this fund yet.
              </p>
            ) : (
              references.map((reference) => (
                <ReferenceCard key={reference.referenceId} reference={reference} />
              ))
            )}
          </div>

          <InternalNarrativePanel fundId={fundId} anchor={narrativeAnchor} />
        </>
      ) : null}
    </section>
  );
}

export default function FundModelResultsInternalAnalysisPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/internal-analysis');
  const fundIdResult = parseFundIdParam(params?.fundId);
  const routeFundId = fundIdResult.fundId;
  const { currentFund, fundId: contextFundId, isLoading } = useFundContext();

  const fundScopeMatches = fundIdResult.status === 'valid' && contextFundId === routeFundId;
  const scopedFundName = fundScopeMatches ? currentFund?.name : undefined;
  const routeFundLabel =
    fundIdResult.status === 'valid' ? (scopedFundName ?? `Fund ${routeFundId}`) : 'No fund';

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-pov-charcoal">Internal Analysis</h1>
        <p className="text-muted-foreground">
          {fundIdResult.status === 'valid' ? routeFundLabel : 'Fund-scoped internal analysis'}
        </p>
      </header>

      {/* Reference snapshots are pinned to recorded facts: static "Basis: Current"
          indicator (D-E). This destination is intentionally NOT in the six-link
          workspace row (D-F.5 chrome budget); Wave H can promote it. */}
      <FundWorkspaceProvider fundId={fundScopeMatches ? routeFundId : null}>
        <WorkspaceNav
          fundId={fundScopeMatches ? String(routeFundId) : null}
          fundLabel={routeFundLabel}
          active="summary"
          indicator={<WorkspaceBasisIndicator mode="current" />}
        />
        <WorkspaceContextRail>
          <div className="space-y-6">
            {fundIdResult.status === 'missing' ? (
              <StateCard
                title="Fund ID required"
                description="Internal analysis is unavailable because the route did not include a fund ID."
                icon="info"
              />
            ) : null}

            {fundIdResult.status === 'invalid' ? (
              <StateCard
                title="Invalid fund ID"
                description="Internal analysis is unavailable because the fund ID is not a positive integer."
              />
            ) : null}

            {fundScopeMatches ? (
              <InternalAnalysisContent fundId={routeFundId as number} />
            ) : fundIdResult.status === 'valid' ? (
              <StateCard
                title={isLoading ? 'Resolving fund scope' : 'Fund not available'}
                description={
                  isLoading
                    ? 'Internal analysis loads once the fund context matches this route.'
                    : `Fund ${routeFundId} is not available in your workspace scope, so internal analysis is withheld.`
                }
                icon={isLoading ? 'info' : 'warning'}
              />
            ) : null}
          </div>
        </WorkspaceContextRail>
      </FundWorkspaceProvider>
    </div>
  );
}
