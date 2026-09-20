import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ALLOCATION_MODEL_LIMITATION } from '@/components/scenarios/CreateAllocationScenarioModal';
import type { FundScenarioSetPolicy } from '@/lib/fund-scenario-policy';
import type {
  FundScenarioCalculationStatusV1,
  FundScenarioOverrideTypeV1,
  FundScenarioSetSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export type ReserveCommandNotice = { message: string; canRetry: boolean };

const OVERRIDE_TYPE_LABELS: Record<FundScenarioOverrideTypeV1, string> = {
  fee_profile: 'Fee profile',
  reserve_allocation: 'Reserve allocation',
  allocation: 'Allocation',
  sector_profile: 'Sector profile',
  methodology: 'Methodology',
};

function scenarioStatusLabel(status: FundScenarioCalculationStatusV1['status'] | undefined) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'calculating':
      return 'Calculating';
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'not_requested':
      return 'Not requested';
    default:
      return 'Loading';
  }
}

function scenarioStatusTone(status: FundScenarioCalculationStatusV1['status'] | undefined) {
  if (status === 'succeeded') return 'bg-success/10 text-success-dark';
  if (status === 'failed') return 'bg-error/10 text-error-dark';
  if (status === 'queued' || status === 'calculating')
    return 'bg-presson-info/10 text-presson-info';
  return 'bg-beige-100 text-charcoal-600';
}

function ScenarioSetActionCard({
  summary,
  policy,
  notice,
  pendingScenarioSetId,
  isHighlighted,
  onCalculate,
}: {
  summary: FundScenarioSetSummaryV1;
  policy: FundScenarioSetPolicy;
  notice: ReserveCommandNotice | null;
  pendingScenarioSetId: string | null;
  isHighlighted?: boolean;
  onCalculate: (policy: FundScenarioSetPolicy) => void;
}) {
  const isPending = pendingScenarioSetId === summary.id;
  const { detail, status, overrideType } = policy;
  const disabled = !detail || isPending;
  const disabledTitle = !detail && !isPending ? 'Loading scenario details…' : undefined;

  return (
    <article
      className={cn(
        'rounded-md border border-beige-200 bg-white p-4',
        isHighlighted && 'ring-2 ring-charcoal'
      )}
      data-testid={`scenario-workspace-set-${summary.id}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="font-inter text-base font-semibold text-charcoal">{summary.name}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 font-poppins text-sm text-charcoal-500">
              <span>
                {summary.variantCount === 1 ? '1 variant' : `${summary.variantCount} variants`}
              </span>
              <span aria-hidden="true" className="text-charcoal-300">
                ·
              </span>
              <span>
                Source config {summary.sourceConfigId} · v{summary.sourceConfigVersion}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={scenarioStatusTone(status?.status)}>
              {scenarioStatusLabel(status?.status)}
            </Badge>
            {overrideType && <Badge variant="outline">{OVERRIDE_TYPE_LABELS[overrideType]}</Badge>}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label={policy.actionLabel}
          disabled={disabled}
          title={disabledTitle}
          onClick={() => detail && onCalculate(policy)}
        >
          {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
          {isPending ? 'Submitting' : policy.actionText}
        </Button>
      </div>
      {overrideType === 'allocation' && (
        <p className="mt-3 text-sm font-poppins text-presson-textMuted" role="note">
          {ALLOCATION_MODEL_LIMITATION}
        </p>
      )}
      {status?.lastError && (
        <p className="mt-3 text-sm text-error-dark font-poppins">{status.lastError}</p>
      )}
      {notice && (
        <p
          className="mt-3 flex flex-wrap items-center gap-2 text-sm text-error-dark font-poppins"
          data-testid={`reserve-command-notice-${summary.id}`}
        >
          <span>{notice.message}</span>
          {notice.canRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => detail && onCalculate(policy)}
            >
              Retry
            </Button>
          )}
        </p>
      )}
    </article>
  );
}

export function ScenarioActionList({
  scenarioSets,
  policyById,
  noticeById,
  pendingScenarioSetId,
  highlightedScenarioSetId,
  onCalculate,
}: {
  scenarioSets: FundScenarioSetSummaryV1[];
  policyById: Map<string, FundScenarioSetPolicy>;
  noticeById: Record<string, ReserveCommandNotice>;
  pendingScenarioSetId: string | null;
  highlightedScenarioSetId?: string | null;
  onCalculate: (policy: FundScenarioSetPolicy) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-charcoal">Scenario Sets</h2>
        <p className="mt-1 text-sm text-charcoal-500 font-poppins">
          Latest scenario sets for the published fund configuration.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {scenarioSets.map((summary) => (
          <ScenarioSetActionCard
            key={summary.id}
            summary={summary}
            policy={policyById.get(summary.id)!}
            notice={noticeById[summary.id] ?? null}
            pendingScenarioSetId={pendingScenarioSetId}
            isHighlighted={summary.id === highlightedScenarioSetId}
            onCalculate={onCalculate}
          />
        ))}
      </div>
    </section>
  );
}
