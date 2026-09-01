import { Fragment, forwardRef, useMemo, useState } from 'react';
import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from 'react';
import { Info, PanelRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { isTeamRole } from '@shared/auth/effective-roles';
import type { CurrentForecastRecomputeFailureCode } from '@shared/schema/current-forecast-recompute-commands';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useFundContext } from '@/contexts/FundContext';
import {
  fetchLatestFinancialFactsSnapshot,
  financialFactsLatestQueryKey,
} from '@/contexts/FundWorkspaceContext';
import { useFundWorkspaceContext } from '@/hooks/useFundWorkspaceContext';
import { useCurrentPlanVersions } from '@/hooks/useCurrentPlanVersions';
import { useDualForecast } from '@/hooks/useDualForecast';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { useAuthSession } from '@/lib/auth-session';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  buildWorkspaceContextRailViewModel,
  type WorkspaceContextRailEvidenceItem,
  type WorkspaceContextRailSectionKey,
  type WorkspaceContextRailSourceStatus,
  type WorkspaceContextRailViewModel,
} from './workspace-context-rail-view-model';

const PRESET_OPTIONS = [
  { value: 'gp', label: 'GP' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'operations', label: 'Operations' },
] as const;

type RecomputeOutcome =
  | { status: 'completed'; shadowReconciliationId: number; replayed: boolean }
  | { status: 'failed'; failureCode: CurrentForecastRecomputeFailureCode; replayed: boolean }
  | { status: 'skipped'; replayed: boolean };

type RecomputeReadback = {
  fundId: number;
  tone: 'success' | 'warning' | 'error';
  message: string;
};

const RECOMPUTE_FAILURE_MESSAGES: Record<CurrentForecastRecomputeFailureCode, string> = {
  execution_timeout: 'Recompute timed out before completion.',
  execution_error: 'Recompute failed during execution.',
  mode_ineligible: 'Current forecast mode is not eligible for manual recompute.',
  stale_pending: 'A stale recompute claim was closed. Try again.',
};

function recomputeReadback(fundId: number, outcome: RecomputeOutcome): RecomputeReadback {
  if (outcome.status === 'completed') {
    return {
      fundId,
      tone: 'success',
      message: `Recompute completed. Reconciliation ${outcome.shadowReconciliationId}.`,
    };
  }

  if (outcome.status === 'skipped') {
    return {
      fundId,
      tone: 'warning',
      message: 'Recompute skipped because the current forecast mode is not eligible.',
    };
  }

  return {
    fundId,
    tone: 'error',
    message: RECOMPUTE_FAILURE_MESSAGES[outcome.failureCode] ?? 'Recompute failed.',
  };
}

function focusClassName(): string {
  return 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent focus-visible:ring-offset-2';
}

function ContextField({
  label,
  value,
  detail,
  disabledReason,
}: {
  label: string;
  value: string;
  detail?: string | null;
  disabledReason?: string | null;
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-presson-textMuted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-presson-text">{value}</dd>
      {detail ? (
        <dd className="mt-1 break-all font-mono text-[11px] text-presson-textMuted">{detail}</dd>
      ) : null}
      {disabledReason ? (
        <dd className="mt-1 text-xs text-presson-textMuted">{disabledReason}</dd>
      ) : null}
    </div>
  );
}

function PresetSelector({
  value,
  onChange,
  idPrefix,
}: {
  value: WorkspaceContextRailViewModel['viewPreset'];
  onChange: (value: WorkspaceContextRailViewModel['viewPreset']) => void;
  idPrefix: string;
}) {
  const movePreset = (current: typeof value, direction: 1 | -1) => {
    const currentIndex = PRESET_OPTIONS.findIndex((option) => option.value === current);
    const nextIndex = (currentIndex + direction + PRESET_OPTIONS.length) % PRESET_OPTIONS.length;
    return PRESET_OPTIONS[nextIndex]!.value;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: typeof value) => {
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowUp'
    ) {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextPreset = movePreset(current, direction);
    onChange(nextPreset);
    window.requestAnimationFrame(() => {
      document.getElementById(`${idPrefix}-workspace-context-preset-${nextPreset}`)?.focus();
    });
  };

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-presson-textMuted">
        View preset
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1" role="radiogroup" aria-label="View preset">
        {PRESET_OPTIONS.map((option) => (
          <button
            key={option.value}
            id={`${idPrefix}-workspace-context-preset-${option.value}`}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={cn(
              'min-h-11 rounded-md border px-2 text-xs font-medium transition-colors motion-reduce:transition-none',
              focusClassName(),
              value === option.value
                ? 'border-presson-accent bg-presson-accent text-presson-accentOn'
                : 'border-presson-borderSubtle bg-presson-surface text-presson-textMuted hover:bg-presson-surfaceSubtle hover:text-presson-text'
            )}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        View preset: {value}
      </p>
    </div>
  );
}

function BasisIdentity({
  model,
  idPrefix,
}: {
  model: WorkspaceContextRailViewModel;
  idPrefix: string;
}) {
  const { basis } = model;
  const statusClass = basis.state === 'held' ? 'text-presson-warning' : 'text-presson-text';

  return (
    <section
      aria-labelledby={`${idPrefix}-basis-heading`}
      data-testid="workspace-context-basis"
      className="space-y-3 border-t border-presson-borderSubtle pt-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`${idPrefix}-basis-heading`} className="text-sm font-semibold text-presson-text">
            Served basis
          </h3>
          <p className={cn('mt-1 text-xs font-medium', statusClass)}>{basis.label}</p>
        </div>
        <Info className="h-4 w-4 shrink-0 text-presson-info" aria-label="Info status" />
      </div>

      {basis.state === 'pending' ? (
        <p data-testid="workspace-context-basis-pending" className="text-xs text-presson-textMuted">
          Loading served basis. Values shown are not yet authoritative.
        </p>
      ) : null}

      {basis.state === 'error' ? (
        <div
          data-testid="workspace-context-basis-error"
          className="rounded-md border border-presson-borderSubtle bg-presson-surfaceSubtle p-3"
        >
          <p className="text-xs font-medium text-presson-text">Served basis could not be loaded</p>
          <p className="mt-1 text-xs text-presson-textMuted">{basis.errorDetail}</p>
        </div>
      ) : null}

      {basis.state === 'pending' || basis.state === 'error' ? null : (
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ContextField label="As of" value={basis.asOfLabel} />
          <ContextField label="Plan" value={basis.planLabel} detail={basis.currentPlanVersionId} />
        </dl>
      )}

      {basis.servedHashes.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-presson-textMuted">
            Served result identity
          </p>
          <dl className="mt-2 space-y-2">
            {basis.servedHashes.map((hash) => (
              <div key={hash.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-presson-textMuted">{hash.label}</dt>
                <dd
                  className="font-mono text-xs text-presson-text"
                  title={hash.fullHash ?? undefined}
                >
                  {hash.shortHash ?? 'Not returned'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {basis.state === 'unavailable' ? (
        <div className="rounded-md border border-presson-borderSubtle bg-presson-surfaceSubtle p-3">
          <p className="text-xs font-medium text-presson-text">Basis unavailable</p>
          <ul className="mt-1 space-y-1 text-xs text-presson-textMuted">
            {basis.unavailableReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {basis.heldDisclosure ? (
        <div
          role="status"
          className="rounded-md border border-presson-borderSubtle bg-presson-surfaceSubtle p-3"
        >
          <p className="text-xs font-medium text-presson-text">{basis.heldDisclosure.headline}</p>
          <p className="mt-1 text-xs text-presson-textMuted">{basis.heldDisclosure.body}</p>
          <p className="mt-2 text-xs text-presson-text">{basis.heldDisclosure.reason}</p>
          <p className="mt-1 font-mono text-[11px] text-presson-textMuted">
            {basis.heldDisclosure.age}
          </p>
          <p className="mt-2 text-xs text-presson-textMuted">{basis.heldDisclosure.escalation}</p>
        </div>
      ) : null}
    </section>
  );
}

function DisabledBridge({
  model,
  idPrefix,
}: {
  model: WorkspaceContextRailViewModel;
  idPrefix: string;
}) {
  const reasonId = `${idPrefix}-bridge-reason`;

  return (
    <section
      aria-labelledby={`${idPrefix}-bridge-heading`}
      aria-disabled="true"
      aria-describedby={reasonId}
      data-testid="workspace-context-bridge"
      className="border-t border-presson-borderSubtle pt-4 opacity-75"
    >
      <h3 id={`${idPrefix}-bridge-heading`} className="text-sm font-semibold text-presson-text">
        Current Forecast V2 bridge
      </h3>
      <p className="mt-1 text-xs text-presson-textMuted">Bridge amounts unavailable.</p>
      <p id={reasonId} className="mt-2 text-xs text-presson-textMuted">
        {model.bridge.disabledReason}.
      </p>
    </section>
  );
}

function RecomputeControl({
  model,
  idPrefix,
  busy,
  readback,
  onRecompute,
}: {
  model: WorkspaceContextRailViewModel;
  idPrefix: string;
  busy: boolean;
  readback: RecomputeReadback | null;
  onRecompute: () => void;
}) {
  const reasonId = `${idPrefix}-recompute-reason`;
  const resultId = `${idPrefix}-recompute-result`;
  const disabled = !model.recompute.enabled || busy;
  const readbackClass =
    readback?.tone === 'success'
      ? 'text-presson-positive'
      : readback?.tone === 'error'
        ? 'text-presson-negative'
        : 'text-presson-warning';

  return (
    <section
      aria-labelledby={`${idPrefix}-recompute-heading`}
      data-testid="workspace-context-recompute"
      className="border-t border-presson-borderSubtle pt-4"
    >
      <h3 id={`${idPrefix}-recompute-heading`} className="text-sm font-semibold text-presson-text">
        Next action
      </h3>
      <button
        type="button"
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={
          model.recompute.disabledReason ? reasonId : readback ? resultId : undefined
        }
        onClick={onRecompute}
        className={cn(
          'mt-2 min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors motion-reduce:transition-none',
          disabled
            ? 'border-presson-borderSubtle bg-presson-surface text-presson-textMuted opacity-70'
            : 'border-presson-accent bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90',
          focusClassName()
        )}
      >
        {busy
          ? 'Recomputing from latest accepted facts...'
          : 'Recompute from latest accepted facts'}
      </button>
      {model.recompute.disabledReason ? (
        <p id={reasonId} className="mt-2 text-xs text-presson-textMuted">
          {model.recompute.disabledReason}.
        </p>
      ) : null}
      {readback ? (
        <p
          id={resultId}
          role="status"
          aria-live="polite"
          className={cn('mt-2 text-xs', readbackClass)}
        >
          {readback.message}
        </p>
      ) : null}
    </section>
  );
}

function EvidenceItem({
  item,
  idPrefix,
}: {
  item: WorkspaceContextRailEvidenceItem;
  idPrefix: string;
}) {
  const reasonId = `${idPrefix}-evidence-${item.kind}-reason`;

  return (
    <li className="space-y-1">
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby={reasonId}
        data-testid={`workspace-context-evidence-${item.kind}`}
        className={cn(
          'min-h-11 w-full rounded-md border border-presson-borderSubtle bg-presson-surface px-3 py-2 text-left opacity-70',
          focusClassName()
        )}
      >
        <span className="block text-xs font-medium text-presson-text">{item.label}</span>
        <span className="mt-1 block text-xs text-presson-textMuted">{item.detail}</span>
      </button>
      <p id={reasonId} className="px-1 text-xs text-presson-textMuted">
        {item.disabledReason}.
      </p>
    </li>
  );
}

function RailContent({
  model,
  idPrefix,
  onViewPresetChange,
  recomputeBusy,
  recomputeReadback,
  onRecompute,
}: {
  model: WorkspaceContextRailViewModel;
  idPrefix: string;
  onViewPresetChange: (value: WorkspaceContextRailViewModel['viewPreset']) => void;
  recomputeBusy: boolean;
  recomputeReadback: RecomputeReadback | null;
  onRecompute: () => void;
}) {
  // Presets are presentation-only: the section keys below render in the
  // model's per-preset order (emphasis/ordering, never queries or actions).
  const sections: Record<WorkspaceContextRailSectionKey, ReactNode> = {
    identity: (
      <section
        aria-labelledby={`${idPrefix}-identity-heading`}
        data-testid="workspace-context-identity"
        className="space-y-3 border-t border-presson-borderSubtle pt-4"
      >
        <h3 id={`${idPrefix}-identity-heading`} className="text-sm font-semibold text-presson-text">
          Current context
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ContextField
            label="Fund"
            value={model.fundLabel}
            detail={model.fundId > 0 ? String(model.fundId) : null}
          />
          <ContextField
            label="Vehicle"
            value={model.vehicle.label}
            detail={model.vehicle.id}
            disabledReason={model.vehicle.disabledReason}
          />
          <ContextField label="As of" value={model.context.asOfLabel} />
          <ContextField
            label="Plan"
            value={model.context.planLabel}
            detail={model.context.planDetail}
          />
        </dl>
      </section>
    ),
    basis: <BasisIdentity model={model} idPrefix={idPrefix} />,
    freshness: (
      <section
        aria-labelledby={`${idPrefix}-facts-heading`}
        data-testid="workspace-context-freshness"
        className="border-t border-presson-borderSubtle pt-4"
      >
        <h3 id={`${idPrefix}-facts-heading`} className="text-sm font-semibold text-presson-text">
          Accepted facts freshness
        </h3>
        {model.factsState === 'ready' && model.factsFreshness ? (
          <p
            className="mt-2 font-mono text-xs text-presson-textMuted"
            title={model.factsFreshness.inputHash}
          >
            {model.factsFreshness.label}
          </p>
        ) : model.factsState === 'pending' ? (
          <p
            data-testid="workspace-context-facts-pending"
            className="mt-2 text-xs text-presson-textMuted"
          >
            Loading accepted facts. Values shown are not yet authoritative.
          </p>
        ) : model.factsState === 'error' ? (
          <p
            data-testid="workspace-context-facts-error"
            className="mt-2 text-xs text-presson-textMuted"
          >
            Accepted facts could not be loaded.
          </p>
        ) : (
          <p className="mt-2 text-xs text-presson-textMuted">Accepted facts unavailable.</p>
        )}
      </section>
    ),
    bridge: <DisabledBridge model={model} idPrefix={idPrefix} />,
    recompute: (
      <RecomputeControl
        model={model}
        idPrefix={idPrefix}
        busy={recomputeBusy}
        readback={recomputeReadback}
        onRecompute={onRecompute}
      />
    ),
    evidence: (
      <section
        aria-labelledby={`${idPrefix}-evidence-heading`}
        data-testid="workspace-context-evidence"
        className="border-t border-presson-borderSubtle pt-4"
      >
        <h3 id={`${idPrefix}-evidence-heading`} className="text-sm font-semibold text-presson-text">
          Evidence
        </h3>
        <ul className="mt-2 space-y-3">
          {model.evidence.map((item) => (
            <EvidenceItem key={item.kind} item={item} idPrefix={idPrefix} />
          ))}
        </ul>
      </section>
    ),
  };

  return (
    <div className="space-y-5 font-poppins" data-testid={`workspace-context-content-${idPrefix}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-presson-textMuted">
            Workspace context
          </p>
          <h2 className="mt-1 text-base font-semibold text-presson-text">{model.fundLabel}</h2>
        </div>
        <span className="rounded-md border border-presson-borderSubtle px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-presson-textMuted">
          {model.viewPreset}
        </span>
      </div>

      <PresetSelector value={model.viewPreset} onChange={onViewPresetChange} idPrefix={idPrefix} />

      {model.sectionOrder.map((key) => (
        <Fragment key={key}>{sections[key]}</Fragment>
      ))}
    </div>
  );
}

// forwardRef + props spread are load-bearing: Radix `SheetTrigger asChild`
// injects its ref and onClick via Slot; without them the sheet cannot open.
const ContextTrigger = forwardRef<
  HTMLButtonElement,
  { compact?: boolean } & ComponentPropsWithoutRef<'button'>
>(function ContextTrigger({ compact = false, className, ...props }, ref) {
  return (
    <button
      type="button"
      aria-label="Review context"
      data-testid={compact ? 'workspace-context-trigger-compact' : 'workspace-context-trigger'}
      {...props}
      ref={ref}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-presson-borderSubtle bg-presson-surface px-3 text-sm font-medium text-presson-text transition-colors hover:bg-presson-surfaceSubtle motion-reduce:transition-none',
        focusClassName(),
        compact && 'min-w-11 px-0',
        className
      )}
    >
      {compact ? (
        <Info className="h-4 w-4" aria-hidden="true" />
      ) : (
        <PanelRight className="h-4 w-4" aria-hidden="true" />
      )}
      {compact ? <span className="sr-only">Review context</span> : <span>Review context</span>}
    </button>
  );
});

export function WorkspaceContextRail({ children }: { children?: ReactNode }) {
  const workspaceContext = useFundWorkspaceContext();
  const { currentFund } = useFundContext();
  const fundId = workspaceContext.fundId > 0 ? workspaceContext.fundId : null;
  const [open, setOpen] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<RecomputeReadback | null>(null);
  const [writeDeniedFundId, setWriteDeniedFundId] = useState<number | null>(null);
  const recomputeIdempotencyKey = useIdempotencyKey();
  const authSession = useAuthSession(fundId != null);
  const dualForecastQuery = useDualForecast(fundId);
  const factsQuery = useQuery({
    queryKey: financialFactsLatestQueryKey(fundId),
    enabled: fundId != null,
    queryFn: async () => {
      if (fundId == null) {
        return null;
      }
      return fetchLatestFinancialFactsSnapshot(fundId);
    },
    staleTime: 60_000,
    gcTime: 600_000,
    retry: false,
  });
  const planVersionsQuery = useCurrentPlanVersions(fundId ?? undefined);
  // Cross-fund guard: the ambient FundContext fund may differ from the
  // resolved route fund this rail is scoped to — never display its identity.
  const scopedFundName =
    fundId != null && currentFund != null && Number(currentFund.id) === fundId
      ? (currentFund.name ?? null)
      : null;
  // Transport states stay distinct from domain absence: a disabled query
  // (no fund) is treated as a settled read with no data.
  const forecastStatus: WorkspaceContextRailSourceStatus =
    fundId == null
      ? 'ready'
      : dualForecastQuery.isError
        ? 'error'
        : dualForecastQuery.data === undefined
          ? 'pending'
          : 'ready';
  const factsStatus: WorkspaceContextRailSourceStatus =
    fundId == null
      ? 'ready'
      : factsQuery.isError
        ? 'error'
        : factsQuery.data === undefined
          ? 'pending'
          : 'ready';
  const role = authSession.data?.user.role;
  const hasTeamWriteRole = isTeamRole(role);
  const recomputeDisabledReason =
    fundId == null
      ? 'Select a fund before recomputing'
      : authSession.isPending
        ? 'Checking write access'
        : writeDeniedFundId === fundId
          ? 'Server denied write access for this fund'
          : !hasTeamWriteRole
            ? 'Your current role has read-only access to recompute'
            : null;
  const handleRecompute = async () => {
    if (fundId == null || recomputeDisabledReason !== null || recomputeBusy) return;

    setRecomputeBusy(true);
    setRecomputeResult(null);
    try {
      const outcome = await apiRequest<RecomputeOutcome>(
        'POST',
        `/api/funds/${fundId}/current-forecast/recompute`,
        {},
        { headers: { 'Idempotency-Key': recomputeIdempotencyKey.keyFor(fundId) } }
      );
      // A returned outcome (completed or failed) is a durably recorded
      // command; retries after a thrown transport error reuse the key so
      // server dedup and stale-pending recovery engage.
      recomputeIdempotencyKey.reset();
      setRecomputeResult(recomputeReadback(fundId, outcome));
      if (outcome.status === 'completed') {
        await Promise.all([dualForecastQuery.refetch(), factsQuery.refetch()]);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setWriteDeniedFundId(fundId);
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.errorCode === 'RECOMPUTE_IN_FLIGHT'
      ) {
        setRecomputeResult({
          fundId,
          tone: 'warning',
          message: 'A recompute is already running.',
        });
      } else {
        setRecomputeResult({
          fundId,
          tone: 'error',
          message: 'Recompute request failed.',
        });
      }
    } finally {
      setRecomputeBusy(false);
    }
  };
  const model = useMemo(
    () =>
      buildWorkspaceContextRailViewModel({
        context: workspaceContext,
        fundName: scopedFundName,
        ...(dualForecastQuery.data?.currentForecastV2
          ? { currentForecastV2: dualForecastQuery.data.currentForecastV2 }
          : {}),
        forecastStatus,
        forecastErrorDetail: dualForecastQuery.error?.message ?? null,
        ...(factsQuery.data !== undefined ? { factsLatest: factsQuery.data } : {}),
        factsStatus,
        planVersions: planVersionsQuery.versions,
        recomputeEnabled: recomputeDisabledReason === null,
        recomputeDisabledReason,
      }),
    [
      scopedFundName,
      dualForecastQuery.data?.currentForecastV2,
      dualForecastQuery.error,
      factsQuery.data,
      factsStatus,
      forecastStatus,
      planVersionsQuery.versions,
      recomputeDisabledReason,
      workspaceContext,
    ]
  );
  const visibleRecomputeResult = recomputeResult?.fundId === fundId ? recomputeResult : null;

  const content = (
    <RailContent
      model={model}
      idPrefix="desktop"
      onViewPresetChange={workspaceContext.setViewPreset}
      recomputeBusy={recomputeBusy}
      recomputeReadback={visibleRecomputeResult}
      onRecompute={handleRecompute}
    />
  );

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <div className="hidden justify-end py-2 lg:flex xl:hidden">
          <SheetTrigger asChild>
            <ContextTrigger />
          </SheetTrigger>
        </div>
        <div className="flex justify-end py-2 lg:hidden">
          <SheetTrigger asChild>
            <ContextTrigger compact />
          </SheetTrigger>
        </div>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-presson-borderSubtle bg-presson-surface p-6 sm:max-w-sm"
        >
          <SheetHeader>
            <SheetTitle className="text-presson-text">Workspace context</SheetTitle>
            <SheetDescription className="text-presson-textMuted">
              Served fund context, basis, freshness, and next available action.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <RailContent
              model={model}
              idPrefix="sheet"
              onViewPresetChange={workspaceContext.setViewPreset}
              recomputeBusy={recomputeBusy}
              recomputeReadback={visibleRecomputeResult}
              onRecompute={handleRecompute}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* >= 1280px: two-column reserved-width layout (dashboard-modern
          precedent) — page content reflows beside the pinned rail instead of
          being overlaid. Below xl the grid collapses to the content column
          and the slide-over / info-button triggers above take over (issue
          #1284 responsive contract). */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">{children}</section>
        <aside
          aria-label="Workspace context rail"
          data-testid="workspace-context-rail"
          className="hidden h-fit max-h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-presson-borderSubtle bg-presson-surface p-4 shadow-presson-md xl:sticky xl:top-24 xl:block"
        >
          {content}
        </aside>
      </div>
    </>
  );
}
