import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { useRoute } from 'wouter';

import type {
  DecisionStatus,
  DecisionV1,
} from '@shared/contracts/operating-objects/decision.contract';
import {
  TaskPatchSchema,
  type TaskResponse,
} from '@shared/contracts/operating-objects/task.contract';
import {
  TaskEvidenceLinkCreateRequestSchema,
  type TaskEvidenceTarget,
} from '@shared/contracts/operating-objects/task-evidence-link.contract';
import { WorkspaceContextRail } from '@/components/fund-results/WorkspaceContextRail';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useFundContext } from '@/contexts/FundContext';
import { FundWorkspaceProvider } from '@/contexts/FundWorkspaceContext';
import {
  useCreateDecision,
  useCreateDecisionEvidenceLink,
  useDecisionEvidenceLinks,
  useDecisions,
  useRecordDecisionOutcome,
  useSupersedeDecision,
  useTransitionDecision,
} from '@/hooks/useDecisions';
import {
  useCreateTask,
  useCreateTaskEvidenceLink,
  useTaskEvidenceLinks,
  useTasks,
  useUpdateTask,
} from '@/hooks/useTasks';
import { ApiError } from '@/lib/queryClient';
import { parseFundIdParam } from '@/pages/fund-model-results-analysis';
import { WorkspaceBasisIndicator, WorkspaceNav } from '@/pages/fund-model-results/workspace-nav';

type DerivedDecisionStatus = DecisionStatus | 'superseded';
type EvidenceTargetKind = TaskEvidenceTarget['kind'];

interface EvidenceLinkItem {
  linkId: number;
  target: TaskEvidenceTarget;
  createdAt: string;
}

const DECISION_STATUS_STYLES: Record<DerivedDecisionStatus, string> = {
  proposed: 'border-presson-info/30 bg-presson-info/10 text-presson-info',
  accepted: 'border-presson-positive/30 bg-presson-positive/10 text-presson-positive',
  rejected: 'border-presson-negative/30 bg-presson-negative/10 text-presson-negative',
  deferred: 'border-presson-warning/30 bg-presson-warning/10 text-presson-warning',
  superseded: 'border-presson-borderSubtle bg-presson-surfaceSubtle text-presson-textMuted',
};

const TASK_STATUS_STYLES: Record<TaskResponse['status'], string> = {
  open: 'border-presson-info/30 bg-presson-info/10 text-presson-info',
  in_progress: 'border-presson-warning/30 bg-presson-warning/10 text-presson-warning',
  done: 'border-presson-positive/30 bg-presson-positive/10 text-presson-positive',
};

function formatDate(value: string): string {
  const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(normalized));
}

function positiveInteger(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function errorMessage(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof ApiError && error.status === 412) {
    return 'Decision changed since it was loaded. Review refreshed row and retry action.';
  }
  return error.message;
}

function ErrorNotice({ error }: { error: Error | null }) {
  const message = errorMessage(error);
  return message ? (
    <p
      role="alert"
      className="rounded-md border border-presson-negative/30 bg-presson-negative/10 p-3 text-sm text-presson-negative"
    >
      {message}
    </p>
  ) : null;
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
    <Card className="border-presson-borderSubtle bg-presson-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-presson-text">
          <Icon className="h-5 w-5" />
          <span>{title}</span>
        </CardTitle>
        <CardDescription className="text-presson-textMuted">{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function StatusBadge({ status }: { status: DerivedDecisionStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${DECISION_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function DisabledAction({
  label,
  reason,
  testId,
}: {
  label: string;
  reason: string;
  testId?: string;
}) {
  const reasonId = testId ? `${testId}-reason` : undefined;
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        disabled
        aria-describedby={reasonId}
        data-testid={testId}
        className="border-presson-borderSubtle text-presson-text"
      >
        {label}
      </Button>
      <p id={reasonId} className="text-xs text-presson-textMuted">
        {reason}
      </p>
    </div>
  );
}

function EvidenceList({ links }: { links: readonly EvidenceLinkItem[] }) {
  if (links.length === 0) {
    return <p className="text-sm text-presson-textMuted">No evidence links recorded.</p>;
  }

  return (
    <ul className="space-y-2">
      {links.map((link) => (
        <li
          key={link.linkId}
          className="rounded-md border border-presson-borderSubtle bg-presson-surfaceSubtle p-3"
        >
          <p className="text-sm font-medium text-presson-text">
            {link.target.kind === 'analysis_reference'
              ? `Analysis reference #${link.target.id}`
              : `Internal economics run #${link.target.id}`}
          </p>
          <p className="mt-1 text-xs text-presson-textMuted">Linked {formatDate(link.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

function DecisionCreateForm({ fundId }: { fundId: number }) {
  const createDecision = useCreateDecision(fundId);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const recommendation = String(data.get('recommendation') ?? '').trim();
    if (!title || !recommendation) {
      setValidationError('Title and recommendation are required.');
      return;
    }

    setValidationError(null);
    createDecision.mutate({ fundId, title, recommendation }, { onSuccess: () => form.reset() });
  };

  return (
    <Card className="border-presson-borderSubtle bg-presson-surfaceSubtle shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base text-presson-text">Create decision</CardTitle>
        <CardDescription className="text-presson-textMuted">
          Record recommendation for review. Creation does not change financial state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-decision-title" className="text-presson-text">
              Title
            </Label>
            <Input
              id="new-decision-title"
              name="title"
              maxLength={200}
              required
              className="border-presson-borderSubtle text-presson-text"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-decision-recommendation" className="text-presson-text">
              Recommendation
            </Label>
            <Textarea
              id="new-decision-recommendation"
              name="recommendation"
              required
              className="border-presson-borderSubtle text-presson-text"
            />
          </div>
          {validationError ? (
            <p role="alert" className="text-sm text-presson-negative">
              {validationError}
            </p>
          ) : null}
          <ErrorNotice error={createDecision.error} />
          <Button
            type="submit"
            disabled={createDecision.isPending}
            className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
          >
            {createDecision.isPending ? 'Creating decision...' : 'Create decision'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DecisionCard({
  decision,
  fundId,
  superseded,
}: {
  decision: DecisionV1;
  fundId: number;
  superseded: boolean;
}) {
  const derivedStatus: DerivedDecisionStatus = superseded ? 'superseded' : decision.status;
  const transitionDecision = useTransitionDecision(fundId);
  const recordOutcome = useRecordDecisionOutcome(fundId);
  const supersedeDecision = useSupersedeDecision(fundId);
  const createEvidenceLink = useCreateDecisionEvidenceLink(fundId);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [deferValidationError, setDeferValidationError] = useState<string | null>(null);
  const [outcomeValidationError, setOutcomeValidationError] = useState<string | null>(null);
  const [supersedeValidationError, setSupersedeValidationError] = useState<string | null>(null);
  const [evidenceValidationError, setEvidenceValidationError] = useState<string | null>(null);
  const evidenceQuery = useDecisionEvidenceLinks(fundId, decision.decisionId, {
    enabled: evidenceOpen,
  });

  const transitionTo = (status: 'accepted' | 'rejected') => {
    transitionDecision.mutate({
      decisionId: decision.decisionId,
      etag: decision.etag,
      input: { status },
    });
  };

  const handleDefer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const followUpOwnerId = positiveInteger(data.get('followUpOwnerId'));
    const followUpDate = String(data.get('followUpDate') ?? '').trim();
    if (followUpOwnerId === undefined || !followUpDate) {
      setDeferValidationError('Deferred decisions require follow-up owner and date.');
      return;
    }

    setDeferValidationError(null);
    transitionDecision.mutate({
      decisionId: decision.decisionId,
      etag: decision.etag,
      input: { status: 'deferred', followUpOwnerId, followUpDate },
    });
  };

  const handleOutcome = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const outcome = String(new FormData(form).get('outcome') ?? '').trim();
    if (!outcome) {
      setOutcomeValidationError('Outcome is required.');
      return;
    }

    setOutcomeValidationError(null);
    recordOutcome.mutate(
      {
        decisionId: decision.decisionId,
        etag: decision.etag,
        input: { outcome },
      },
      { onSuccess: () => form.reset() }
    );
  };

  const handleSupersede = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const recommendation = String(data.get('recommendation') ?? '').trim();
    if (!title || !recommendation) {
      setSupersedeValidationError('Successor title and recommendation are required.');
      return;
    }

    setSupersedeValidationError(null);
    supersedeDecision.mutate(
      {
        decisionId: decision.decisionId,
        input: { fundId, title, recommendation },
      },
      { onSuccess: () => form.reset() }
    );
  };

  const handleEvidenceCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const kind = String(data.get('kind')) as EvidenceTargetKind;
    const targetId = positiveInteger(data.get('targetId'));
    if (targetId === undefined) {
      setEvidenceValidationError('Evidence target ID must be a positive integer.');
      return;
    }

    const target: TaskEvidenceTarget =
      kind === 'analysis_reference'
        ? { kind: 'analysis_reference', id: targetId }
        : { kind: 'internal_economics_run', id: targetId };
    setEvidenceValidationError(null);
    createEvidenceLink.mutate(
      { decisionId: decision.decisionId, input: { target } },
      { onSuccess: () => form.reset() }
    );
  };

  const outcomeEligible =
    !superseded &&
    (decision.status === 'accepted' || decision.status === 'rejected') &&
    decision.outcome === null;
  const supersedeEligible = !superseded && decision.status !== 'proposed';
  const lifecycleEligible =
    !superseded && (decision.status === 'proposed' || decision.status === 'deferred');

  return (
    <article
      data-testid={`decision-row-${decision.decisionId}`}
      className="rounded-lg border border-presson-borderSubtle bg-presson-surface p-4 shadow-presson-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div data-testid={`decision-status-${decision.decisionId}`}>
            <StatusBadge status={derivedStatus} />
          </div>
          <h3 className="mt-2 text-lg font-semibold text-presson-text">{decision.title}</h3>
          {decision.supersedesDecisionId !== null ? (
            <p className="mt-1 text-xs text-presson-textMuted">
              Supersedes decision #{decision.supersedesDecisionId}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-presson-textMuted">Updated {formatDate(decision.updatedAt)}</p>
      </div>

      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-presson-textMuted">
            Recommendation
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-presson-text">
            {decision.recommendation}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-presson-textMuted">
            Outcome
          </dt>
          <dd className="mt-1 text-sm text-presson-text">
            {decision.outcome !== null ? (
              <span className="whitespace-pre-wrap">{decision.outcome}</span>
            ) : decision.status === 'accepted' || decision.status === 'rejected' ? (
              <span
                data-testid={`decision-outcome-missing-${decision.decisionId}`}
                className="inline-flex rounded-md border border-presson-warning/30 bg-presson-warning/10 px-2 py-1 text-xs font-semibold text-presson-warning"
              >
                outcome-missing
              </span>
            ) : (
              <span className="text-presson-textMuted">Not recorded</span>
            )}
          </dd>
        </div>
        {decision.followUpOwnerId !== null || decision.followUpDate !== null ? (
          <>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-presson-textMuted">
                Follow-up owner
              </dt>
              <dd className="mt-1 text-sm text-presson-text">
                {decision.followUpOwnerId === null
                  ? 'Not assigned'
                  : `User #${decision.followUpOwnerId}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-presson-textMuted">
                Follow-up date
              </dt>
              <dd className="mt-1 text-sm text-presson-text">
                {decision.followUpDate === null
                  ? 'Not scheduled'
                  : formatDate(decision.followUpDate)}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className="mt-5 grid gap-4 border-t border-presson-borderSubtle pt-4 lg:grid-cols-2">
        <section aria-label={`Decision ${decision.decisionId} lifecycle`} className="space-y-3">
          <h4 className="text-sm font-semibold text-presson-text">Lifecycle</h4>
          {lifecycleEligible ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={transitionDecision.isPending}
                  onClick={() => transitionTo('accepted')}
                  className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
                >
                  {decision.status === 'deferred' ? 'Accept after follow-up' : 'Accept decision'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={transitionDecision.isPending}
                  onClick={() => transitionTo('rejected')}
                  className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
                >
                  {decision.status === 'deferred' ? 'Reject after follow-up' : 'Reject decision'}
                </Button>
              </div>
              <form className="space-y-3" onSubmit={handleDefer}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label
                      htmlFor={`decision-${decision.decisionId}-follow-up-owner`}
                      className="text-xs text-presson-text"
                    >
                      Follow-up owner ID
                    </Label>
                    <Input
                      id={`decision-${decision.decisionId}-follow-up-owner`}
                      name="followUpOwnerId"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={decision.followUpOwnerId ?? undefined}
                      required
                      className="border-presson-borderSubtle text-presson-text"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`decision-${decision.decisionId}-follow-up-date`}
                      className="text-xs text-presson-text"
                    >
                      Follow-up date
                    </Label>
                    <Input
                      id={`decision-${decision.decisionId}-follow-up-date`}
                      name="followUpDate"
                      type="date"
                      defaultValue={decision.followUpDate ?? undefined}
                      required
                      className="border-presson-borderSubtle text-presson-text"
                    />
                  </div>
                </div>
                {deferValidationError ? (
                  <p role="alert" className="text-xs text-presson-negative">
                    {deferValidationError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={transitionDecision.isPending}
                  className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
                >
                  {decision.status === 'deferred' ? 'Update follow-up' : 'Defer with follow-up'}
                </Button>
              </form>
              <ErrorNotice error={transitionDecision.error} />
            </>
          ) : (
            <DisabledAction
              label="Transition decision"
              reason={
                superseded
                  ? 'Historical superseded decisions cannot transition.'
                  : 'Accepted and rejected decisions are terminal; supersede decision instead.'
              }
            />
          )}
        </section>

        <section aria-label={`Decision ${decision.decisionId} outcome`} className="space-y-3">
          <h4 className="text-sm font-semibold text-presson-text">Record outcome</h4>
          {outcomeEligible ? (
            <form className="space-y-3" onSubmit={handleOutcome}>
              <Label htmlFor={`decision-${decision.decisionId}-outcome`} className="sr-only">
                Outcome
              </Label>
              <Textarea
                id={`decision-${decision.decisionId}-outcome`}
                name="outcome"
                required
                placeholder="What happened after decision?"
                className="border-presson-borderSubtle text-presson-text"
              />
              {outcomeValidationError ? (
                <p role="alert" className="text-xs text-presson-negative">
                  {outcomeValidationError}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="outline"
                disabled={recordOutcome.isPending}
                className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
              >
                {recordOutcome.isPending ? 'Recording outcome...' : 'Record outcome'}
              </Button>
              <ErrorNotice error={recordOutcome.error} />
            </form>
          ) : (
            <DisabledAction
              label="Record outcome"
              reason={
                superseded
                  ? 'Historical superseded decision is read-only.'
                  : decision.outcome !== null
                    ? 'Outcome already recorded and immutable.'
                    : 'Accept or reject decision before recording outcome.'
              }
            />
          )}
        </section>

        <section aria-label={`Decision ${decision.decisionId} supersession`} className="space-y-3">
          <h4 className="text-sm font-semibold text-presson-text">Supersede decision</h4>
          {supersedeEligible ? (
            <form className="space-y-3" onSubmit={handleSupersede}>
              <div className="space-y-1">
                <Label
                  htmlFor={`decision-${decision.decisionId}-successor-title`}
                  className="text-xs text-presson-text"
                >
                  Successor title
                </Label>
                <Input
                  id={`decision-${decision.decisionId}-successor-title`}
                  name="title"
                  maxLength={200}
                  required
                  className="border-presson-borderSubtle text-presson-text"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor={`decision-${decision.decisionId}-successor-recommendation`}
                  className="text-xs text-presson-text"
                >
                  Successor recommendation
                </Label>
                <Textarea
                  id={`decision-${decision.decisionId}-successor-recommendation`}
                  name="recommendation"
                  required
                  className="border-presson-borderSubtle text-presson-text"
                />
              </div>
              {supersedeValidationError ? (
                <p role="alert" className="text-xs text-presson-negative">
                  {supersedeValidationError}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="outline"
                disabled={supersedeDecision.isPending}
                className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
              >
                {supersedeDecision.isPending ? 'Creating successor...' : 'Supersede decision'}
              </Button>
              <ErrorNotice error={supersedeDecision.error} />
            </form>
          ) : (
            <DisabledAction
              label="Supersede decision"
              reason={
                superseded
                  ? 'Decision already has successor.'
                  : 'Proposed decisions transition in place before supersession.'
              }
            />
          )}
        </section>

        <section aria-label={`Decision ${decision.decisionId} plan version`} className="space-y-3">
          <h4 className="text-sm font-semibold text-presson-text">Plan version</h4>
          <DisabledAction
            label="Create plan version from decision"
            testId={`decision-plan-version-disabled-${decision.decisionId}`}
            reason={
              derivedStatus === 'accepted'
                ? 'Decision-linked plan-version command is not mounted on live surface.'
                : 'Only active accepted decision can cite plan-version command.'
            }
          />
        </section>
      </div>

      <details
        className="mt-5 border-t border-presson-borderSubtle pt-4"
        onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
      >
        <summary
          data-testid={`decision-evidence-toggle-${decision.decisionId}`}
          className="cursor-pointer text-sm font-semibold text-presson-text"
        >
          Decision evidence links
        </summary>
        <div className="mt-3 space-y-4">
          {evidenceQuery.isLoading ? (
            <p className="text-sm text-presson-textMuted">Loading decision evidence...</p>
          ) : null}
          <ErrorNotice error={evidenceQuery.error} />
          {!evidenceQuery.isLoading && !evidenceQuery.error ? (
            <EvidenceList links={evidenceQuery.data ?? []} />
          ) : null}

          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
            onSubmit={handleEvidenceCreate}
          >
            <div className="space-y-1">
              <Label
                htmlFor={`decision-${decision.decisionId}-evidence-kind`}
                className="text-xs text-presson-text"
              >
                Evidence type
              </Label>
              <select
                id={`decision-${decision.decisionId}-evidence-kind`}
                name="kind"
                defaultValue="analysis_reference"
                className="h-10 w-full rounded-md border border-presson-borderSubtle bg-presson-surface px-3 text-sm text-presson-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
              >
                <option value="analysis_reference">Analysis reference</option>
                <option value="internal_economics_run">Internal economics run</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor={`decision-${decision.decisionId}-evidence-id`}
                className="text-xs text-presson-text"
              >
                Target ID
              </Label>
              <Input
                id={`decision-${decision.decisionId}-evidence-id`}
                name="targetId"
                type="number"
                min={1}
                step={1}
                required
                className="border-presson-borderSubtle text-presson-text"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={createEvidenceLink.isPending}
              className="self-end border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
            >
              {createEvidenceLink.isPending ? 'Linking...' : 'Link evidence'}
            </Button>
          </form>
          {evidenceValidationError ? (
            <p role="alert" className="text-xs text-presson-negative">
              {evidenceValidationError}
            </p>
          ) : null}
          <ErrorNotice error={createEvidenceLink.error} />
        </div>
      </details>
    </article>
  );
}

function TaskCreateForm({ fundId }: { fundId: number }) {
  const createTask = useCreateTask(String(fundId));
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const ownerValue = String(data.get('ownerId') ?? '').trim();
    const ownerId = ownerValue ? positiveInteger(ownerValue) : undefined;
    const dueDate = String(data.get('dueDate') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!title) {
      setValidationError('Task title is required.');
      return;
    }
    if (ownerValue && ownerId === undefined) {
      setValidationError('Owner ID must be a positive integer.');
      return;
    }

    setValidationError(null);
    createTask.mutate(
      {
        fundId,
        title,
        ...(ownerId === undefined ? {} : { ownerId }),
        ...(dueDate ? { dueDate } : {}),
        ...(description ? { description } : {}),
      },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <Card className="border-presson-borderSubtle bg-presson-surfaceSubtle shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-base text-presson-text">Create task</CardTitle>
        <CardDescription className="text-presson-textMuted">
          Add operational follow-up without changing fund calculations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="new-task-title" className="text-presson-text">
              Title
            </Label>
            <Input
              id="new-task-title"
              name="title"
              maxLength={200}
              required
              className="border-presson-borderSubtle text-presson-text"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-task-owner" className="text-xs text-presson-text">
                Owner ID
              </Label>
              <Input
                id="new-task-owner"
                name="ownerId"
                type="number"
                min={1}
                step={1}
                className="border-presson-borderSubtle text-presson-text"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-task-due-date" className="text-xs text-presson-text">
                Due date
              </Label>
              <Input
                id="new-task-due-date"
                name="dueDate"
                type="date"
                className="border-presson-borderSubtle text-presson-text"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-task-description" className="text-xs text-presson-text">
              Description
            </Label>
            <Textarea
              id="new-task-description"
              name="description"
              maxLength={2000}
              className="border-presson-borderSubtle text-presson-text"
            />
          </div>
          {validationError ? (
            <p role="alert" className="text-sm text-presson-negative">
              {validationError}
            </p>
          ) : null}
          <ErrorNotice error={createTask.error} />
          <Button
            type="submit"
            disabled={createTask.isPending}
            className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
          >
            {createTask.isPending ? 'Creating task...' : 'Create task'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function editableTask(task: TaskResponse) {
  return {
    baseline: task,
    etag: task.etag,
    title: task.title,
    description: task.description ?? '',
    ownerId: task.ownerId?.toString() ?? '',
    dueDate: task.dueDate ?? '',
    status: task.status,
  };
}

function taskDraftChanges(draft: ReturnType<typeof editableTask>) {
  const owner = draft.ownerId.trim();
  const baseline = {
    ...draft.baseline,
    title: draft.baseline.title.trim(),
    description: draft.baseline.description || null,
  };
  const fields = {
    title: draft.title.trim(),
    description: draft.description || null,
    ownerId: owner ? positiveInteger(owner) : null,
    dueDate: draft.dueDate || null,
    status: draft.status,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([field, value]) => value !== baseline[field as keyof typeof fields]
    )
  );
}

function TaskCard({
  task,
  fundId,
  onRefresh,
}: {
  task: TaskResponse;
  fundId: number;
  onRefresh: () => Promise<TaskResponse | undefined>;
}) {
  const updateTask = useUpdateTask(String(fundId));
  const createEvidenceLink = useCreateTaskEvidenceLink(String(fundId));
  const [draft, setDraft] = useState<ReturnType<typeof editableTask> | null>(null);
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [evidenceValidationError, setEvidenceValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidenceQuery = useTaskEvidenceLinks(String(fundId), task.id, { enabled: evidenceOpen });
  const conflict = updateTask.error instanceof ApiError && updateTask.error.status === 412;
  const busy = updateTask.isPending || refreshing;

  useEffect(() => {
    if (editing && !busy) titleInput.current?.focus();
  }, [editing, busy]);
  useEffect(() => {
    if (!editing && !busy && notice === 'Task updated.') editButton.current?.focus();
  }, [editing, busy, notice]);

  const save = (values: ReturnType<typeof editableTask>) => {
    const changes = taskDraftChanges(values);
    if ('ownerId' in changes && changes['ownerId'] === undefined) {
      setValidationError('Owner ID must be a positive integer.');
      return;
    }
    if (Object.keys(changes).length === 0) {
      setValidationError(null);
      setNotice('No changes to save.');
      return;
    }
    const parsed = TaskPatchSchema.safeParse(changes);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Review the task fields.');
      return;
    }
    setValidationError(null);
    setNotice(null);
    updateTask.mutate(
      { taskId: task.id, etag: values.etag, input: parsed.data },
      {
        onSuccess: () => {
          setDraft(null);
          setEditing(false);
          setNotice('Task updated.');
          editButton.current?.focus();
        },
        onError: () => setEditing(true),
      }
    );
  };

  const refreshVersion = async () => {
    setRefreshing(true);
    setValidationError(null);
    try {
      const current = await onRefresh();
      if (!current) throw new Error('Task is no longer available. Your edits are retained.');
      setDraft((values) => {
        if (!values) return values;
        const changes = taskDraftChanges(values);
        const refreshed = editableTask(current);
        return {
          ...refreshed,
          title: 'title' in changes ? values.title : refreshed.title,
          description: 'description' in changes ? values.description : refreshed.description,
          ownerId: 'ownerId' in changes ? values.ownerId : refreshed.ownerId,
          dueDate: 'dueDate' in changes ? values.dueDate : refreshed.dueDate,
          status: 'status' in changes ? values.status : refreshed.status,
        };
      });
      updateTask.reset();
      setNotice('Current task refreshed. Your edits are retained; review the row before saving.');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Task refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleEvidenceCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = TaskEvidenceLinkCreateRequestSchema.safeParse({
      target: { kind: data.get('kind'), id: positiveInteger(data.get('targetId')) },
    });
    if (!parsed.success) {
      setEvidenceValidationError('Choose a supported evidence type and positive target ID.');
      return;
    }
    setEvidenceValidationError(null);
    createEvidenceLink.mutate(
      { taskId: task.id, input: parsed.data },
      {
        onSuccess: () => {
          form.reset();
          setNotice('Task evidence linked.');
        },
      }
    );
  };

  return (
    <article
      data-testid={`task-row-${task.id}`}
      className="rounded-lg border border-presson-borderSubtle bg-presson-surface p-4 shadow-presson-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${TASK_STATUS_STYLES[task.status]}`}
          >
            {task.status.replace('_', ' ')}
          </span>
          <h3 className="mt-2 font-semibold text-presson-text">{task.title}</h3>
        </div>
        {task.dueDate !== null ? (
          <p className="text-xs text-presson-textMuted">Due {formatDate(task.dueDate)}</p>
        ) : null}
      </div>
      {task.description !== null ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-presson-text">{task.description}</p>
      ) : null}
      <p className="mt-3 text-xs text-presson-textMuted">
        {task.ownerId === null ? 'No owner assigned' : `Owner: User #${task.ownerId}`}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          ref={editButton}
          type="button"
          variant="outline"
          aria-expanded={editing}
          aria-controls={`task-${task.id}-editor`}
          disabled={busy}
          onClick={() => {
            setDraft((values) => values ?? editableTask(task));
            setEditing(true);
          }}
          className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
        >
          Edit task
        </Button>
        {task.status !== 'done' && draft === null ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              const values = { ...editableTask(task), status: 'done' as const };
              setDraft(values);
              setEditing(true);
              save(values);
            }}
            className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
          >
            Complete task
          </Button>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="mt-3 text-sm text-presson-textMuted">
          {notice}
        </p>
      ) : null}
      {editing && draft ? (
        <form
          id={`task-${task.id}-editor`}
          aria-label={`Edit task ${task.id}`}
          aria-busy={busy}
          className="mt-4 space-y-3 border-t border-presson-borderSubtle pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && !conflict) save(draft);
          }}
        >
          <fieldset disabled={busy} className="space-y-3">
            <legend className="sr-only">Task fields</legend>
            <div className="space-y-1">
              <Label htmlFor={`task-${task.id}-title`}>Title</Label>
              <Input
                ref={titleInput}
                id={`task-${task.id}-title`}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                maxLength={200}
                required
                className="border-presson-borderSubtle text-presson-text"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`task-${task.id}-description`}>Description</Label>
              <Textarea
                id={`task-${task.id}-description`}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                maxLength={2000}
                className="border-presson-borderSubtle text-presson-text"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`task-${task.id}-owner`}>Owner ID</Label>
                <Input
                  id={`task-${task.id}-owner`}
                  type="number"
                  min={1}
                  step={1}
                  value={draft.ownerId}
                  onChange={(event) => setDraft({ ...draft, ownerId: event.target.value })}
                  className="border-presson-borderSubtle text-presson-text"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`task-${task.id}-due-date`}>Due date</Label>
                <Input
                  id={`task-${task.id}-due-date`}
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                  className="border-presson-borderSubtle text-presson-text"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`task-${task.id}-status`}>Status</Label>
              <select
                id={`task-${task.id}-status`}
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value as TaskResponse['status'] })
                }
                className="h-10 w-full rounded-md border border-presson-borderSubtle bg-presson-surface px-3 text-sm text-presson-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            {validationError ? (
              <p role="alert" className="text-sm text-presson-negative">
                {validationError}
              </p>
            ) : null}
            {conflict ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-presson-negative">
                  Task changed since this edit started. Your edits are retained. Refresh the current
                  task, review it, then save again.
                </p>
                <Button type="button" variant="outline" onClick={() => void refreshVersion()}>
                  Refresh task version
                </Button>
              </div>
            ) : (
              <ErrorNotice error={updateTask.error} />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={conflict}
                className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
              >
                {updateTask.isPending
                  ? 'Saving task...'
                  : refreshing
                    ? 'Refreshing task...'
                    : 'Save task'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  editButton.current?.focus();
                }}
              >
                Close editor
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}

      <details
        className="mt-4 border-t border-presson-borderSubtle pt-3"
        onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
      >
        <summary
          data-testid={`task-evidence-toggle-${task.id}`}
          className="cursor-pointer text-sm font-semibold text-presson-text"
        >
          Task evidence links
        </summary>
        <div className="mt-3 space-y-3">
          {evidenceQuery.isLoading ? (
            <p role="status" className="text-sm text-presson-textMuted">
              Loading task evidence...
            </p>
          ) : null}
          <ErrorNotice error={evidenceQuery.error} />
          {!evidenceQuery.isLoading && !evidenceQuery.error ? (
            <EvidenceList links={evidenceQuery.data ?? []} />
          ) : null}
          <form
            onSubmit={handleEvidenceCreate}
            aria-label={`Task ${task.id} evidence`}
            aria-busy={createEvidenceLink.isPending}
          >
            <fieldset disabled={createEvidenceLink.isPending} className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Attach task evidence</legend>
              <div className="space-y-1">
                <Label htmlFor={`task-${task.id}-evidence-kind`}>Evidence type</Label>
                <select
                  id={`task-${task.id}-evidence-kind`}
                  name="kind"
                  defaultValue="analysis_reference"
                  className="h-10 w-full rounded-md border border-presson-borderSubtle bg-presson-surface px-3 text-sm text-presson-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent/30"
                >
                  <option value="analysis_reference">Analysis reference</option>
                  <option value="internal_economics_run">Internal economics run</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`task-${task.id}-evidence-id`}>Target ID</Label>
                <Input
                  id={`task-${task.id}-evidence-id`}
                  name="targetId"
                  type="number"
                  min={1}
                  step={1}
                  required
                  className="border-presson-borderSubtle text-presson-text"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                className="justify-self-start border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
              >
                {createEvidenceLink.isPending ? 'Linking...' : 'Link evidence'}
              </Button>
            </fieldset>
          </form>
          {evidenceValidationError ? (
            <p role="alert" className="text-sm text-presson-negative">
              {evidenceValidationError}
            </p>
          ) : null}
          <ErrorNotice error={createEvidenceLink.error} />
        </div>
      </details>
    </article>
  );
}

function OperationsContent({ fundId }: { fundId: number }) {
  const decisionsQuery = useDecisions(fundId);
  const tasksQuery = useTasks(String(fundId));
  const decisions = useMemo(() => decisionsQuery.data ?? [], [decisionsQuery.data]);
  const supersededDecisionIds = useMemo(
    () =>
      new Set(
        decisions.flatMap((decision) =>
          decision.supersedesDecisionId === null ? [] : [decision.supersedesDecisionId]
        )
      ),
    [decisions]
  );

  return (
    <section
      aria-labelledby="operations-heading"
      data-testid="operations-workspace"
      className="space-y-6"
    >
      <div className="rounded-lg border border-presson-borderSubtle bg-presson-surfaceSubtle p-4">
        <p className="text-sm font-semibold text-presson-text">Operational records only</p>
        <p className="mt-1 text-sm text-presson-textMuted">
          Decision, task, and evidence actions here do not change forecasts, plans, reserves,
          ledgers, or served fund results.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <section
          aria-labelledby="operations-decisions-heading"
          data-testid="operations-decisions-pane"
          className="space-y-4"
        >
          <div>
            <h2
              id="operations-decisions-heading"
              className="text-xl font-semibold text-presson-text"
            >
              Decisions
            </h2>
            <p className="mt-1 text-sm text-presson-textMuted">
              Track recommendation, lifecycle, follow-up, outcome, and supporting evidence.
            </p>
          </div>
          <DecisionCreateForm fundId={fundId} />
          {decisionsQuery.isLoading ? (
            <p className="text-sm text-presson-textMuted">Loading decisions...</p>
          ) : null}
          <ErrorNotice error={decisionsQuery.error} />
          {!decisionsQuery.isLoading && !decisionsQuery.error && decisions.length === 0 ? (
            <p className="rounded-lg border border-presson-borderSubtle bg-presson-surface p-4 text-sm text-presson-textMuted">
              No decisions recorded.
            </p>
          ) : null}
          <div className="space-y-4">
            {decisions.map((decision) => (
              <DecisionCard
                key={decision.decisionId}
                decision={decision}
                fundId={fundId}
                superseded={supersededDecisionIds.has(decision.decisionId)}
              />
            ))}
          </div>
        </section>

        <section
          aria-labelledby="operations-tasks-heading"
          data-testid="operations-tasks-pane"
          className="space-y-4"
        >
          <div>
            <h2 id="operations-tasks-heading" className="text-xl font-semibold text-presson-text">
              Tasks
            </h2>
            <p className="mt-1 text-sm text-presson-textMuted">
              Assign, update, and complete fund-scoped work with linked evidence.
            </p>
          </div>
          <TaskCreateForm fundId={fundId} />
          {tasksQuery.isLoading ? (
            <p className="text-sm text-presson-textMuted">Loading tasks...</p>
          ) : null}
          <ErrorNotice error={tasksQuery.error} />
          {!tasksQuery.isLoading && !tasksQuery.error && (tasksQuery.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-presson-borderSubtle bg-presson-surface p-4 text-sm text-presson-textMuted">
              No tasks recorded.
            </p>
          ) : null}
          <div className="space-y-4">
            {(tasksQuery.data ?? []).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                fundId={fundId}
                onRefresh={async () => {
                  const refreshed = await tasksQuery.refetch();
                  if (refreshed.error) throw refreshed.error;
                  return refreshed.data?.find((current) => current.id === task.id);
                }}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export default function FundModelResultsOperationsPage() {
  const [, params] = useRoute('/fund-model-results/:fundId/operations');
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
        <h1 id="operations-heading" className="text-3xl font-bold text-presson-text">
          Operations
        </h1>
        <p className="text-presson-textMuted">
          {fundIdResult.status === 'valid' ? routeFundLabel : 'Fund-scoped decisions and tasks'}
        </p>
      </header>

      <FundWorkspaceProvider fundId={fundScopeMatches ? routeFundId : null}>
        <WorkspaceNav
          fundId={fundScopeMatches ? String(routeFundId) : null}
          fundLabel={routeFundLabel}
          active="operations"
          indicator={<WorkspaceBasisIndicator mode="current" />}
        />
        <WorkspaceContextRail>
          <div className="space-y-6">
            {fundIdResult.status === 'missing' ? (
              <StateCard
                title="Fund ID required"
                description="Operations workspace is unavailable because route did not include fund ID."
                icon="info"
              />
            ) : null}
            {fundIdResult.status === 'invalid' ? (
              <StateCard
                title="Invalid fund ID"
                description="Operations workspace is unavailable because fund ID is not positive integer."
              />
            ) : null}
            {fundScopeMatches ? (
              <OperationsContent fundId={routeFundId as number} />
            ) : fundIdResult.status === 'valid' ? (
              <StateCard
                title={isLoading ? 'Resolving fund scope' : 'Fund not available'}
                description={
                  isLoading
                    ? 'Operations workspace loads once fund context matches route.'
                    : `Fund ${routeFundId} is not available in your workspace scope, so operational records are withheld.`
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
