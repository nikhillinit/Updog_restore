import type { CurrentPlanVersionV1 } from '@shared/contracts/current-plan-version-v1.contract';
import { Button } from '@/components/ui/button';
import { useCurrentPlanVersions } from '@/hooks/useCurrentPlanVersions';
import { cn } from '@/lib/utils';
import {
  diagnosticAlertClasses,
  formatDateOrFallback,
} from '@/pages/fund-model-results/formatters';

export interface CurrentPlanAcceptancePanelProps {
  fundId: number | null;
}

function formatMoneyString(value: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatRatioAsPercent(value: string): string {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <dt className="text-sm font-medium text-charcoal-500">{label}</dt>
      <dd className="text-sm text-charcoal sm:text-right">{value}</dd>
    </div>
  );
}

function HeadPlanReview({ headVersion }: { headVersion: CurrentPlanVersionV1 }) {
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-beige-100 font-poppins">
        <ReviewRow
          label="Source configuration"
          value={`Config #${headVersion.sourceConfigId} v${headVersion.sourceConfigVersion}`}
        />
        <ReviewRow
          label="Facts provenance"
          value={`Facts snapshot: ${headVersion.sourceFactsSnapshotId}`}
        />
        <ReviewRow
          label="Assumptions hash"
          value={`${headVersion.assumptionsHash.slice(0, 12)}…`}
        />
        <ReviewRow label="Plan version" value={`Plan version ${headVersion.version}`} />
        <ReviewRow
          label="Derived"
          value={`Derived ${formatDateOrFallback(headVersion.createdAt)}`}
        />
        <ReviewRow
          label="Deployable capital"
          value={formatMoneyString(headVersion.deployableCapitalUsd)}
        />
      </dl>

      <div className="rounded-md border border-beige-200 bg-beige-50 p-4 font-poppins">
        <p className="text-xs font-medium uppercase tracking-wide text-charcoal-500">
          Compiled annual fee drag
        </p>
        <p className="mt-1 text-2xl font-semibold text-charcoal">
          {formatRatioAsPercent(headVersion.pacingAssumptions.annualFeeDragPct)}
        </p>
      </div>

      <dl className="grid gap-3 font-poppins sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-beige-200 p-3">
          <dt className="text-xs text-charcoal-500">Deployment quarters</dt>
          <dd className="mt-1 font-medium text-charcoal">
            {headVersion.pacingAssumptions.deploymentQuarters}
          </dd>
        </div>
        <div className="rounded-md border border-beige-200 p-3">
          <dt className="text-xs text-charcoal-500">Allocations</dt>
          <dd className="mt-1 font-medium text-charcoal">{headVersion.allocations.length}</dd>
        </div>
        <div className="rounded-md border border-beige-200 p-3">
          <dt className="text-xs text-charcoal-500">Portfolio stages</dt>
          <dd className="mt-1 font-medium text-charcoal">
            {headVersion.cohortAssumptions.stageDistribution.length}
          </dd>
        </div>
        <div className="rounded-md border border-beige-200 p-3">
          <dt className="text-xs text-charcoal-500">Exit assumptions</dt>
          <dd className="mt-1 font-medium text-charcoal">
            {headVersion.cohortAssumptions.exitAssumptions.length}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CurrentPlanAcceptanceContent({ fundId }: { fundId: number }) {
  const { headVersion, isLoading, error, mint } = useCurrentPlanVersions(fundId);

  return (
    <section
      aria-labelledby="current-plan-review-heading"
      className={cn('rounded-lg border border-beige-200 bg-white p-6', 'space-y-5')}
    >
      <div>
        <h2 id="current-plan-review-heading" className="font-inter text-lg font-bold text-charcoal">
          Current Plan Review
        </h2>
        <p className="mt-1 text-sm text-charcoal-500 font-poppins">
          Review the assumptions and source evidence compiled into the current plan.
        </p>
      </div>

      {isLoading && <p className="text-sm text-charcoal-500 font-poppins">Loading current plan…</p>}
      {error && (
        <p
          role="alert"
          className={cn(
            'rounded-md border p-3 text-sm font-poppins text-charcoal',
            diagnosticAlertClasses('danger')
          )}
        >
          {error.message}
        </p>
      )}
      {mint.error && (
        <p
          role="alert"
          className={cn(
            'rounded-md border p-3 text-sm font-poppins text-charcoal',
            diagnosticAlertClasses('danger')
          )}
        >
          {mint.error.message}
        </p>
      )}
      {!isLoading && !error && headVersion === null && (
        <div className="space-y-3 font-poppins">
          <p className="text-sm text-charcoal-500">
            No current plan has been derived from the published configuration yet.
          </p>
          <Button type="button" onClick={() => mint.mutate()} disabled={mint.isPending}>
            {mint.isPending ? 'Deriving…' : 'Derive initial plan'}
          </Button>
        </div>
      )}
      {!isLoading && !error && headVersion && (
        <div className="space-y-5">
          <HeadPlanReview headVersion={headVersion} />
          <div className="flex justify-end">
            <Button type="button" onClick={() => mint.mutate()} disabled={mint.isPending}>
              {mint.isPending ? 'Working…' : 'Accept & mint new plan version'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function CurrentPlanAcceptancePanel({ fundId }: CurrentPlanAcceptancePanelProps) {
  return fundId == null ? null : <CurrentPlanAcceptanceContent fundId={fundId} />;
}
