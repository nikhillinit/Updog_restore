import { useEffect, useRef, useState } from 'react';

import {
  POSTGRES_INT_MAX,
  type QuarterlyReviewCategory,
  type QuarterlyReviewCurrentBasisResponse,
  type QuarterlyReviewItemMutation,
} from '@shared/contracts/internal-analysis/quarterly-review-v1.contract';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { QuarterlyReviewClientError } from '@/hooks/useQuarterlyReview';
import { useQuarterlyReview, useQuarterlyReviewCommands } from '@/hooks/useQuarterlyReview';

const CATEGORY_LABELS: Record<QuarterlyReviewCategory, string> = {
  cases_probabilities: 'Cases & probabilities',
  kpis: 'KPIs',
  valuation_fmv: 'Valuation & FMV',
  reserve_plan: 'Reserve strategy',
  qualitative_risks: 'Risks & mitigations',
};

const CHANGE_LABELS: Record<QuarterlyReviewCategory, string> = {
  cases_probabilities: 'Open scenario workspace',
  kpis: 'Open company KPIs',
  valuation_fmv: 'Open company valuation',
  reserve_plan: 'Open reserve planning',
  qualitative_risks: 'Open internal analysis',
};

type UserRole = string | null | undefined;
type QuarterlyReviewCompany = QuarterlyReviewCurrentBasisResponse['companies'][number];
type QuarterlyReviewItem = QuarterlyReviewCompany['items'][number];

function canWrite(role: UserRole): boolean {
  return role === 'partner' || role === 'admin' || role === 'analyst';
}

function canWaive(role: UserRole): boolean {
  return role === 'partner' || role === 'admin';
}

function changePath(
  category: QuarterlyReviewCategory,
  fundId: number,
  portfolioCompanyId: number
): string {
  switch (category) {
    case 'cases_probabilities':
      return `/fund-model-results/${fundId}/scenarios`;
    case 'kpis':
    case 'valuation_fmv':
      return `/portfolio/company/${portfolioCompanyId}`;
    case 'reserve_plan':
      return `/portfolio?tab=reserve-planning&fundId=${fundId}`;
    case 'qualitative_risks':
      return `/fund-model-results/${fundId}/internal-analysis`;
  }
}

function ItemEditor({
  fundId,
  company,
  item,
  disabled,
  onSubmit,
}: {
  fundId: number;
  company: QuarterlyReviewCompany;
  item: QuarterlyReviewItem;
  disabled: boolean;
  onSubmit: (input: {
    companyId: number;
    category: QuarterlyReviewCategory;
    etag: string;
    input: QuarterlyReviewItemMutation;
  }) => void;
}) {
  const [state, setState] = useState<'changed' | 'reviewed_no_change' | null>(
    item.state === 'pending' ? null : item.state
  );
  const [note, setNote] = useState(item.note ?? '');
  const [followUpTaskId, setFollowUpTaskId] = useState(
    item.followUp?.target.id ? String(item.followUp.target.id) : ''
  );
  const path = changePath(item.category, fundId, company.portfolioCompanyId);
  const parsedTaskId = followUpTaskId === '' ? undefined : Number(followUpTaskId);
  const validTask =
    parsedTaskId === undefined ||
    (Number.isInteger(parsedTaskId) && parsedTaskId > 0 && parsedTaskId <= POSTGRES_INT_MAX);
  const canSubmit = state !== null && note.trim().length > 0 && validTask && !disabled;

  const submit = () => {
    if (!canSubmit || state === null) return;
    const input: QuarterlyReviewItemMutation =
      state === 'changed'
        ? {
            state,
            note,
            changeReference: { kind: 'internal_route', path, label: CHANGE_LABELS[item.category] },
            ...(parsedTaskId === undefined ? {} : { followUpTaskId: parsedTaskId }),
          }
        : { state, note };
    onSubmit({
      companyId: company.id,
      category: item.category,
      etag: item.etag,
      input,
    });
  };

  const fieldId = `quarterly-review-${company.id}-${item.category}`;
  return (
    <fieldset className="space-y-3 rounded-md border border-beige-200 p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-pov-charcoal">
        {CATEGORY_LABELS[item.category]}
      </legend>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={state === 'changed' ? 'default' : 'outline'}
          onClick={() => setState('changed')}
        >
          Changed
        </Button>
        <Button
          type="button"
          size="sm"
          variant={state === 'reviewed_no_change' ? 'default' : 'outline'}
          onClick={() => setState('reviewed_no_change')}
        >
          Reviewed — no change
        </Button>
      </div>
      <div>
        <Label htmlFor={`${fieldId}-note`}>Review note (required)</Label>
        <Textarea
          id={`${fieldId}-note`}
          aria-label={`${CATEGORY_LABELS[item.category]} review note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor={`${fieldId}-link`}>Internal change link (required when changed)</Label>
        <Input
          id={`${fieldId}-link`}
          aria-label={`${CATEGORY_LABELS[item.category]} internal change link`}
          value={path}
          readOnly
        />
      </div>
      <div>
        <Label htmlFor={`${fieldId}-follow-up`}>Optional follow-up task</Label>
        <Input
          id={`${fieldId}-follow-up`}
          aria-label={`${CATEGORY_LABELS[item.category]} optional follow-up task`}
          type="number"
          inputMode="numeric"
          min={1}
          max={POSTGRES_INT_MAX}
          step={1}
          value={followUpTaskId}
          onChange={(event) => setFollowUpTaskId(event.target.value)}
        />
      </div>
      <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
        Save review item
      </Button>
    </fieldset>
  );
}

function CompanyReview({
  fundId,
  company,
  role,
  disabled,
  commands,
}: {
  fundId: number;
  company: QuarterlyReviewCompany;
  role: UserRole;
  disabled: boolean;
  commands: ReturnType<typeof useQuarterlyReviewCommands>;
}) {
  const [waiverReason, setWaiverReason] = useState('');

  return (
    <article className="space-y-4 rounded-lg border border-beige-200 bg-white p-4">
      <div>
        <h4 className="font-semibold text-pov-charcoal">{company.companyName}</h4>
        {company.waivedAt ? (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <p>Waived by actor {company.waivedBy ?? 'unknown'}</p>
            <p>{company.waiverReason}</p>
          </div>
        ) : null}
      </div>

      {company.waivedAt === null ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {company.items.map((item) => (
              <ItemEditor
                key={`${item.id}:${item.etag}`}
                fundId={fundId}
                company={company}
                item={item}
                disabled={disabled || commands.updateItem.isPending}
                onSubmit={(variables) =>
                  commands.updateItem.mutate({
                    ...variables,
                    idempotencyKey: crypto.randomUUID(),
                  })
                }
              />
            ))}
          </div>
          {canWaive(role) ? (
            <div className="flex flex-col gap-2 border-t border-beige-200 pt-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor={`quarterly-review-${company.id}-waiver`}>Waiver reason</Label>
                <Input
                  id={`quarterly-review-${company.id}-waiver`}
                  value={waiverReason}
                  onChange={(event) => setWaiverReason(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={
                  disabled || waiverReason.trim().length === 0 || commands.waiveCompany.isPending
                }
                onClick={() =>
                  commands.waiveCompany.mutate({
                    companyId: company.id,
                    etag: company.etag,
                    idempotencyKey: crypto.randomUUID(),
                    input: { reason: waiverReason },
                  })
                }
              >
                Waive company review
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export function QuarterlyReviewPanel({
  fundId,
  draftId,
  userRole,
}: {
  fundId: number;
  draftId: number;
  userRole: UserRole;
}) {
  const review = useQuarterlyReview(fundId, draftId);
  const commands = useQuarterlyReviewCommands(fundId, draftId);
  const error = review.error;
  const corruption =
    error?.code === 'QUARTERLY_REVIEW_ROSTER_CORRUPT'
      ? (error as QuarterlyReviewClientError)
      : null;
  const missingRoster = review.data?.requiresRefresh === true;
  const recoveryEtag = corruption?.etag ?? review.data?.draftEtag ?? null;
  const recoveryAllowed = canWrite(userRole) && recoveryEtag !== null;
  const finalizeError = commands.finalize.error;
  const mixedBasisRejected = finalizeError?.code === 'MIXED_FACTS_BASIS';
  const [acknowledgeMixedBasis, setAcknowledgeMixedBasis] = useState(false);
  const incompleteDetails =
    finalizeError?.code === 'QUARTERLY_REVIEW_INCOMPLETE' &&
    finalizeError.details &&
    'companies' in finalizeError.details
      ? finalizeError.details
      : null;
  const incompleteAlertRef = useRef<HTMLDivElement>(null);
  const mixedBasisAlertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (incompleteDetails) incompleteAlertRef.current?.focus();
  }, [incompleteDetails]);

  useEffect(() => {
    if (mixedBasisRejected) mixedBasisAlertRef.current?.focus();
  }, [mixedBasisRejected]);

  if (review.isLoading) {
    return <p className="text-sm text-presson-textMuted">Loading quarterly review...</p>;
  }

  if (corruption || missingRoster) {
    const details = corruption?.details;
    const expected =
      details && 'expectedCompanyCount' in details ? details.expectedCompanyCount : 0;
    const actual = details && 'actualCompanyCount' in details ? details.actualCompanyCount : 0;
    return (
      <section className="rounded-lg border border-red-300 bg-red-50 p-4">
        <p role="alert" className="text-sm text-pov-charcoal">
          {corruption
            ? `Roster integrity check failed: expected ${expected} companies, found ${actual}.`
            : 'Quarterly review roster is missing and must be refreshed before review can continue.'}
        </p>
        {recoveryAllowed ? (
          <Button
            type="button"
            className="mt-3"
            disabled={commands.refresh.isPending}
            onClick={() =>
              commands.refresh.mutate({
                etag: recoveryEtag,
                idempotencyKey: crypto.randomUUID(),
              })
            }
          >
            Refresh quarterly review
          </Button>
        ) : null}
      </section>
    );
  }

  if (error) {
    return <p role="alert">{error.message}</p>;
  }

  if (!review.data) return null;

  const totalItems = review.data.completion.companyCount * 5;
  const completedItems = totalItems - review.data.completion.pendingItemCount;
  const actionsDisabled = !canWrite(userRole);

  return (
    <section
      aria-label={`Quarterly review for draft ${draftId}`}
      className="mt-3 space-y-4 rounded-lg border border-beige-200 bg-pov-gray p-4"
    >
      {incompleteDetails ? (
        <div
          ref={incompleteAlertRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-pov-charcoal"
        >
          <p>Finalization paused. Complete current review items:</p>
          <ul className="mt-1 list-disc pl-5">
            {incompleteDetails.companies.map((pendingCompany) => {
              const company = review.data.companies.find(
                (candidate) => candidate.id === pendingCompany.companyId
              );
              return (
                <li key={pendingCompany.companyId}>
                  {company?.companyName ?? `Company ${pendingCompany.companyId}`}:{' '}
                  {pendingCompany.pendingCategories
                    .map((category) => CATEGORY_LABELS[category])
                    .join(', ')}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {mixedBasisRejected ? (
        <div
          ref={mixedBasisAlertRef}
          role="alert"
          tabIndex={-1}
          className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-pov-charcoal"
        >
          <p>
            Finalization paused because pinned components use a mixed facts basis. Saving this
            reference will preserve that warning on future loads.
          </p>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`quarterly-review-${draftId}-mixed-basis-acknowledgement`}
              checked={acknowledgeMixedBasis}
              onCheckedChange={(checked) => setAcknowledgeMixedBasis(checked === true)}
            />
            <Label htmlFor={`quarterly-review-${draftId}-mixed-basis-acknowledgement`}>
              I acknowledge this reference uses a mixed facts basis
            </Label>
          </div>
          <Button
            type="button"
            disabled={
              actionsDisabled ||
              !review.data.canFinalize ||
              !acknowledgeMixedBasis ||
              commands.finalize.isPending
            }
            onClick={() =>
              commands.finalize.mutate({
                etag: review.data.draftEtag,
                idempotencyKey: crypto.randomUUID(),
                acknowledgeMixedBasis: true,
              })
            }
          >
            Finalize mixed-basis reference
          </Button>
        </div>
      ) : null}
      {finalizeError && !incompleteDetails && !mixedBasisRejected ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-pov-charcoal"
        >
          Finalization failed. {finalizeError.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-pov-charcoal">Quarterly company review</h3>
          <p className="text-sm text-presson-textMuted">
            {completedItems} of {totalItems} items complete
          </p>
          <p className="text-xs text-presson-textMuted">
            {review.data.completion.completedCompanyCount} of {review.data.completion.companyCount}{' '}
            companies complete
          </p>
        </div>
        {!mixedBasisRejected ? (
          <Button
            type="button"
            disabled={actionsDisabled || !review.data.canFinalize || commands.finalize.isPending}
            onClick={() =>
              commands.finalize.mutate({
                etag: review.data.draftEtag,
                idempotencyKey: crypto.randomUUID(),
                acknowledgeMixedBasis: false,
              })
            }
          >
            Finalize reference
          </Button>
        ) : null}
      </div>

      {review.data.capabilities.operatingDecision.availability === 'unavailable' ? (
        <p className="text-xs text-presson-textMuted">
          Operating decision links are unavailable until the operating-decision dependency lands.
        </p>
      ) : null}

      <div className="space-y-4">
        {review.data.companies.map((company) => (
          <CompanyReview
            key={`${company.id}:${company.etag}`}
            fundId={fundId}
            company={company}
            role={userRole}
            disabled={actionsDisabled}
            commands={commands}
          />
        ))}
      </div>
    </section>
  );
}
