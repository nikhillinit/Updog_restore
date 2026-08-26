import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { scenarioApiPath } from '@/lib/fund-scenario-workspace-api';
import {
  scenarioSetDetailQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import { useScenarioSourceConfig } from '@/hooks/use-scenario-source-config';
import {
  CreateFundScenarioSetV2Schema,
  FundScenarioSetDetailV1Schema,
  type CreateFundScenarioSetV2,
  type FundScenarioSetDetailV1,
  type FundScenarioSourceConfigResponseV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

type AllocationRow = NonNullable<FundScenarioSourceConfigResponseV1['allocations']>[number];
type CapitalPlanAllocationRow = NonNullable<
  FundScenarioSourceConfigResponseV1['capitalPlanAllocations']
>[number];

type ScenarioVariantDraft = {
  name: string;
  allocations: AllocationRow[] | null;
  capitalPlanAllocations: CapitalPlanAllocationRow[] | null;
};

type ScenarioVariants = [ScenarioVariantDraft, ScenarioVariantDraft, ScenarioVariantDraft];

type ScenarioDraft = {
  name: string;
  variants: ScenarioVariants;
};

type VariantIndex = 0 | 1 | 2;
type AllocationTextField = 'category' | 'description';
type CapitalPlanTextField = 'name';
type AllocationNumericField = 'percentage';
type CapitalPlanNumericField =
  | 'capitalAllocationPct'
  | 'initialCheckAmount'
  | 'initialOwnershipPct'
  | 'followOnAmount'
  | 'followOnParticipationPct'
  | 'investmentHorizonMonths';

const VARIANT_LABELS = ['Base', 'Upside', 'Downside'] as const;
const INPUT_CLASS_NAME =
  'flex h-9 w-full rounded-md border border-presson-borderSubtle bg-presson-surface px-2.5 py-1.5 text-sm text-presson-text placeholder:text-presson-textMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent disabled:cursor-not-allowed disabled:bg-presson-surfaceSubtle disabled:text-presson-textMuted';

function ScenarioInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${INPUT_CLASS_NAME} ${className ?? ''}`} {...props} />;
}

function cloneRows<T extends object>(rows: T[] | null): T[] | null {
  return rows === null ? null : rows.map((row) => ({ ...row }));
}

function buildInitialDraft(sourceConfig: FundScenarioSourceConfigResponseV1): ScenarioDraft {
  const createVariant = (name: string): ScenarioVariantDraft => ({
    name,
    allocations: cloneRows(sourceConfig.allocations),
    capitalPlanAllocations: cloneRows(sourceConfig.capitalPlanAllocations),
  });

  return {
    name: 'Allocation scenarios',
    variants: [createVariant('Base'), createVariant('Upside'), createVariant('Downside')],
  };
}

function updateVariant(
  draft: ScenarioDraft,
  variantIndex: VariantIndex,
  update: Partial<ScenarioVariantDraft>
): ScenarioDraft {
  const variants = draft.variants.map((variant, index) =>
    index === variantIndex ? { ...variant, ...update } : variant
  ) as ScenarioVariants;
  return { ...draft, variants };
}

function updateAllocationText(
  draft: ScenarioDraft,
  variantIndex: VariantIndex,
  rowIndex: number,
  field: AllocationTextField,
  value: string
): ScenarioDraft {
  const rows = draft.variants[variantIndex].allocations;
  if (rows === null) return draft;

  const nextRows = rows.map((row, index) =>
    index === rowIndex
      ? ({
          ...row,
          [field]: field === 'description' && value === '' ? undefined : value,
        } as AllocationRow)
      : row
  );
  return updateVariant(draft, variantIndex, { allocations: nextRows });
}

function updateAllocationNumeric(
  draft: ScenarioDraft,
  variantIndex: VariantIndex,
  rowIndex: number,
  field: AllocationNumericField,
  value: string
): ScenarioDraft {
  const rows = draft.variants[variantIndex].allocations;
  if (rows === null) return draft;

  const parsed = value.trim() === '' ? 0 : Number(value);
  const nextRows = rows.map((row, index) =>
    index === rowIndex
      ? ({ ...row, [field]: Number.isFinite(parsed) ? parsed : 0 } as AllocationRow)
      : row
  );
  return updateVariant(draft, variantIndex, { allocations: nextRows });
}

function updateCapitalPlanText(
  draft: ScenarioDraft,
  variantIndex: VariantIndex,
  rowIndex: number,
  field: CapitalPlanTextField,
  value: string
): ScenarioDraft {
  const rows = draft.variants[variantIndex].capitalPlanAllocations;
  if (rows === null) return draft;

  const nextRows = rows.map((row, index) =>
    index === rowIndex ? { ...row, [field]: value } : row
  );
  return updateVariant(draft, variantIndex, { capitalPlanAllocations: nextRows });
}

function updateCapitalPlanNumeric(
  draft: ScenarioDraft,
  variantIndex: VariantIndex,
  rowIndex: number,
  field: CapitalPlanNumericField,
  value: string
): ScenarioDraft {
  const rows = draft.variants[variantIndex].capitalPlanAllocations;
  if (rows === null) return draft;

  const optional =
    field === 'initialCheckAmount' || field === 'initialOwnershipPct' || field === 'followOnAmount';
  const parsed = value.trim() === '' ? undefined : Number(value);
  const nextValue =
    parsed === undefined ? (optional ? undefined : 0) : Number.isFinite(parsed) ? parsed : 0;
  const nextRows = rows.map((row, index) =>
    index === rowIndex ? ({ ...row, [field]: nextValue } as CapitalPlanAllocationRow) : row
  );
  return updateVariant(draft, variantIndex, { capitalPlanAllocations: nextRows });
}

function buildCreatePayload(
  draft: ScenarioDraft,
  sourceConfig: FundScenarioSourceConfigResponseV1
): CreateFundScenarioSetV2 {
  const variants = draft.variants.map((variant) => ({
    name: variant.name.trim(),
    override: {
      overrideType: 'allocation' as const,
      payload: {
        ...(variant.allocations !== null ? { allocations: variant.allocations } : {}),
        ...(variant.capitalPlanAllocations !== null
          ? { capitalPlanAllocations: variant.capitalPlanAllocations }
          : {}),
      },
    },
  })) as CreateFundScenarioSetV2['variants'];

  return CreateFundScenarioSetV2Schema.parse({
    contractVersion: 'fund-scenario-set-create/2.0.0',
    name: draft.name.trim(),
    variants,
    expectedSourceConfigId: sourceConfig.sourceConfigId,
    expectedSourceConfigVersion: sourceConfig.sourceConfigVersion,
  });
}

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `allocation-scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? (error.errorCode ?? null) : null;
}

function sourceConfigErrorMessage(error: unknown): string {
  if (errorCode(error) === 'no_published_config') {
    return 'Publish a fund configuration before creating allocation scenarios.';
  }
  return error instanceof Error
    ? error.message
    : 'Published source configuration could not be loaded.';
}

export interface CreateAllocationScenarioModalProps {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: FundScenarioSetDetailV1) => void;
}

export function CreateAllocationScenarioModal({
  fundId,
  open,
  onOpenChange,
  onSuccess,
}: CreateAllocationScenarioModalProps) {
  const queryClient = useQueryClient();
  const sourceConfigQuery = useScenarioSourceConfig(fundId, open);
  const [draft, setDraft] = useState<ScenarioDraft | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverErrorKind, setServerErrorKind] = useState<'stale' | 'refusal' | 'error' | null>(
    null
  );
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (open && sourceConfigQuery.data) {
      setDraft(buildInitialDraft(sourceConfigQuery.data));
      setServerError(null);
      setServerErrorKind(null);
    }
  }, [open, sourceConfigQuery.data]);

  const createMutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateFundScenarioSetV2;
      idempotencyKey: string;
    }) =>
      apiRequest('POST', scenarioApiPath(fundId, '/scenario-sets'), payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }).then((raw) => FundScenarioSetDetailV1Schema.parse(raw)),
    onSuccess: async (created) => {
      queryClient.setQueryData(scenarioSetDetailQueryKey(fundId, created.id), created);
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
      idempotencyRef.current = null;
      setDraft(null);
      setServerError(null);
      setServerErrorKind(null);
      onOpenChange(false);
      onSuccess(created);
    },
    onError: (error) => {
      if (errorCode(error) === 'scenario_source_config_stale') {
        setServerError(
          'Published source configuration changed while this form was open. Refresh the source configuration, review the fixed rows, and retry.'
        );
        setServerErrorKind('stale');
        return;
      }
      if (error instanceof ApiError && error.status === 422) {
        setServerError(`Creation refused: ${error.message}`);
        setServerErrorKind('refusal');
        return;
      }
      setServerError(
        error instanceof Error ? error.message : 'Failed to create allocation scenarios.'
      );
      setServerErrorKind('error');
    },
  });

  const sourceConfig = sourceConfigQuery.data;
  const sourceUnavailable =
    sourceConfig !== undefined &&
    sourceConfig.allocations === null &&
    sourceConfig.capitalPlanAllocations === null;
  const namesValid =
    draft !== null &&
    draft.name.trim().length > 0 &&
    draft.name.trim().length <= 120 &&
    draft.variants.every(
      (variant) => variant.name.trim().length > 0 && variant.name.trim().length <= 120
    );
  const canSubmit =
    draft !== null &&
    sourceConfig !== undefined &&
    !sourceUnavailable &&
    namesValid &&
    !createMutation.isPending;

  function resolveIdempotencyKey(payload: CreateFundScenarioSetV2): string {
    const signature = JSON.stringify(payload);
    if (idempotencyRef.current?.signature === signature) {
      return idempotencyRef.current.key;
    }
    const key = createIdempotencyKey();
    idempotencyRef.current = { signature, key };
    return key;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createMutation.isPending) return;
    if (!nextOpen) {
      setDraft(null);
      setServerError(null);
      setServerErrorKind(null);
      idempotencyRef.current = null;
    }
    onOpenChange(nextOpen);
  }

  function updateDraft(update: (current: ScenarioDraft) => ScenarioDraft) {
    setDraft((current) => (current === null ? current : update(current)));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !draft || !sourceConfig) return;

    try {
      const payload = buildCreatePayload(draft, sourceConfig);
      createMutation.mutate({ payload, idempotencyKey: resolveIdempotencyKey(payload) });
    } catch (error) {
      setServerError(
        error instanceof Error
          ? `Creation refused: ${error.message}`
          : 'Invalid allocation scenario payload.'
      );
      setServerErrorKind('refusal');
    }
  }

  function refreshSourceConfig() {
    setServerError(null);
    setServerErrorKind(null);
    void sourceConfigQuery.refetch();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[min(96vw,1100px)] overflow-hidden border-presson-borderSubtle bg-presson-surface">
        <DialogHeader>
          <DialogTitle className="font-inter text-presson-text">
            New allocation scenarios
          </DialogTitle>
          <DialogDescription className="font-poppins text-presson-textMuted">
            Create fixed Base, Upside, and Downside variants from the current published source
            configuration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            {sourceConfigQuery.isLoading && (
              <p className="text-sm text-presson-textMuted">Loading pinned source configuration…</p>
            )}

            {sourceConfigQuery.isError && (
              <Alert className="border-presson-negative/30 bg-presson-negative/10 text-presson-text">
                <AlertTitle>Source configuration unavailable</AlertTitle>
                <AlertDescription className="space-y-3 font-poppins text-presson-textMuted">
                  <p>{sourceConfigErrorMessage(sourceConfigQuery.error)}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshSourceConfig}
                    disabled={sourceConfigQuery.isFetching}
                    className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
                  >
                    {sourceConfigQuery.isFetching ? 'Refreshing…' : 'Refresh source configuration'}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {sourceUnavailable && (
              <Alert className="border-presson-warning/30 bg-presson-warning/10 text-presson-text">
                <AlertTitle>Allocation scenarios unavailable</AlertTitle>
                <AlertDescription className="font-poppins text-presson-textMuted">
                  The published source configuration has no allocation rows or capital-plan
                  allocation rows. Create is disabled until one is published.
                </AlertDescription>
              </Alert>
            )}

            {sourceConfig && !sourceUnavailable && draft && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-presson-borderSubtle bg-presson-surfaceSubtle px-3 py-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-presson-textMuted">
                      Pinned source
                    </p>
                    <p className="mt-1 text-sm text-presson-text">
                      Config {sourceConfig.sourceConfigId} · version{' '}
                      {sourceConfig.sourceConfigVersion}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshSourceConfig}
                    disabled={sourceConfigQuery.isFetching || createMutation.isPending}
                    className="border-presson-borderSubtle text-presson-text hover:bg-presson-surface"
                  >
                    {sourceConfigQuery.isFetching ? 'Refreshing…' : 'Refresh source'}
                  </Button>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="allocation-scenario-set-name"
                    className="text-sm text-presson-text"
                  >
                    Scenario set name
                  </label>
                  <ScenarioInput
                    id="allocation-scenario-set-name"
                    value={draft.name}
                    maxLength={120}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    aria-invalid={draft.name.trim().length === 0 || draft.name.trim().length > 120}
                    placeholder="e.g. Q3 allocation decisions"
                  />
                  {(draft.name.trim().length === 0 || draft.name.trim().length > 120) && (
                    <p className="text-xs text-presson-negative">
                      Enter a scenario set name up to 120 characters.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {draft.variants.map((variant, variantIndex) => {
                    const editable = variantIndex !== 0;
                    const index = variantIndex as VariantIndex;
                    return (
                      <section
                        key={VARIANT_LABELS[variantIndex]}
                        className="space-y-4 rounded-md border border-presson-borderSubtle bg-presson-bg p-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs uppercase tracking-wide text-presson-textMuted">
                              Position {variantIndex + 1}
                            </p>
                            <span className="rounded-full border border-presson-borderSubtle px-2 py-0.5 text-xs text-presson-textMuted">
                              {VARIANT_LABELS[variantIndex]}
                            </span>
                          </div>
                          <label
                            htmlFor={`allocation-variant-name-${variantIndex}`}
                            className="text-sm text-presson-text"
                          >
                            Variant name
                          </label>
                          <ScenarioInput
                            id={`allocation-variant-name-${variantIndex}`}
                            value={variant.name}
                            maxLength={120}
                            onChange={(event) =>
                              updateDraft((current) =>
                                updateVariant(current, index, { name: event.target.value })
                              )
                            }
                            aria-invalid={
                              variant.name.trim().length === 0 || variant.name.trim().length > 120
                            }
                          />
                        </div>

                        <div className="space-y-3">
                          <div>
                            <h3 className="font-inter text-sm font-semibold text-presson-text">
                              Allocations
                            </h3>
                            <p className="mt-1 text-xs text-presson-textMuted">
                              {editable
                                ? 'Edit labels and percentages.'
                                : 'Pinned base rows; no edits.'}
                            </p>
                          </div>
                          {variant.allocations === null ? (
                            <p className="rounded-md border border-dashed border-presson-borderSubtle px-3 py-2 text-xs text-presson-textMuted">
                              Not present in pinned source; omitted from this variant.
                            </p>
                          ) : variant.allocations.length === 0 ? (
                            <p className="text-xs text-presson-textMuted">
                              Present but empty. No rows can be added.
                            </p>
                          ) : (
                            variant.allocations.map((row, rowIndex) => (
                              <div
                                key={row.id}
                                className="space-y-2 rounded-md border border-presson-borderSubtle bg-presson-surface p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-presson-textMuted">
                                      Fixed row {rowIndex + 1}
                                    </p>
                                    <code className="text-xs text-presson-textMuted">{row.id}</code>
                                  </div>
                                  <span className="text-xs text-presson-textMuted">Allocation</span>
                                </div>
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`allocation-category-${variantIndex}-${rowIndex}`}
                                    className="text-xs text-presson-textMuted"
                                  >
                                    Category
                                  </label>
                                  <ScenarioInput
                                    id={`allocation-category-${variantIndex}-${rowIndex}`}
                                    value={row.category}
                                    disabled={!editable}
                                    onChange={(event) =>
                                      updateDraft((current) =>
                                        updateAllocationText(
                                          current,
                                          index,
                                          rowIndex,
                                          'category',
                                          event.target.value
                                        )
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`allocation-percentage-${variantIndex}-${rowIndex}`}
                                    className="text-xs text-presson-textMuted"
                                  >
                                    Percentage
                                  </label>
                                  <ScenarioInput
                                    id={`allocation-percentage-${variantIndex}-${rowIndex}`}
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.01"
                                    inputMode="decimal"
                                    value={row.percentage}
                                    disabled={!editable}
                                    onChange={(event) =>
                                      updateDraft((current) =>
                                        updateAllocationNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'percentage',
                                          event.target.value
                                        )
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`allocation-description-${variantIndex}-${rowIndex}`}
                                    className="text-xs text-presson-textMuted"
                                  >
                                    Description
                                  </label>
                                  <ScenarioInput
                                    id={`allocation-description-${variantIndex}-${rowIndex}`}
                                    value={row.description ?? ''}
                                    disabled={!editable}
                                    onChange={(event) =>
                                      updateDraft((current) =>
                                        updateAllocationText(
                                          current,
                                          index,
                                          rowIndex,
                                          'description',
                                          event.target.value
                                        )
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <h3 className="font-inter text-sm font-semibold text-presson-text">
                              Capital-plan allocations
                            </h3>
                            <p className="mt-1 text-xs text-presson-textMuted">
                              {editable
                                ? 'Edit names and numeric assumptions; control fields stay pinned.'
                                : 'Pinned base rows; no edits.'}
                            </p>
                          </div>
                          {variant.capitalPlanAllocations === null ? (
                            <p className="rounded-md border border-dashed border-presson-borderSubtle px-3 py-2 text-xs text-presson-textMuted">
                              Not present in pinned source; omitted from this variant.
                            </p>
                          ) : variant.capitalPlanAllocations.length === 0 ? (
                            <p className="text-xs text-presson-textMuted">
                              Present but empty. No rows can be added.
                            </p>
                          ) : (
                            variant.capitalPlanAllocations.map((row, rowIndex) => (
                              <div
                                key={row.id}
                                className="space-y-2 rounded-md border border-presson-borderSubtle bg-presson-surface p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-presson-textMuted">
                                      Fixed row {rowIndex + 1}
                                    </p>
                                    <code className="text-xs text-presson-textMuted">{row.id}</code>
                                  </div>
                                  <span className="text-xs text-presson-textMuted">
                                    Capital plan
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <label
                                    htmlFor={`capital-name-${variantIndex}-${rowIndex}`}
                                    className="text-xs text-presson-textMuted"
                                  >
                                    Name
                                  </label>
                                  <ScenarioInput
                                    id={`capital-name-${variantIndex}-${rowIndex}`}
                                    value={row.name}
                                    disabled={!editable}
                                    onChange={(event) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanText(
                                          current,
                                          index,
                                          rowIndex,
                                          'name',
                                          event.target.value
                                        )
                                      )
                                    }
                                  />
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <FrozenField
                                    label="Sector profile"
                                    value={row.sectorProfileId ?? 'Not assigned'}
                                  />
                                  <FrozenField label="Entry round" value={row.entryRound} />
                                  <FrozenField
                                    label="Initial check strategy"
                                    value={row.initialCheckStrategy}
                                  />
                                  <FrozenField
                                    label="Follow-on strategy"
                                    value={row.followOnStrategy}
                                  />
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <NumericField
                                    id={`capital-allocation-pct-${variantIndex}-${rowIndex}`}
                                    label="Capital allocation %"
                                    value={row.capitalAllocationPct}
                                    disabled={!editable}
                                    onChange={(value) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'capitalAllocationPct',
                                          value
                                        )
                                      )
                                    }
                                  />
                                  <NumericField
                                    id={`capital-initial-check-amount-${variantIndex}-${rowIndex}`}
                                    label="Initial check amount"
                                    value={row.initialCheckAmount}
                                    disabled={!editable}
                                    onChange={(value) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'initialCheckAmount',
                                          value
                                        )
                                      )
                                    }
                                  />
                                  <NumericField
                                    id={`capital-initial-ownership-${variantIndex}-${rowIndex}`}
                                    label="Initial ownership %"
                                    value={row.initialOwnershipPct}
                                    disabled={!editable}
                                    onChange={(value) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'initialOwnershipPct',
                                          value
                                        )
                                      )
                                    }
                                  />
                                  <NumericField
                                    id={`capital-follow-on-amount-${variantIndex}-${rowIndex}`}
                                    label="Follow-on amount"
                                    value={row.followOnAmount}
                                    disabled={!editable}
                                    onChange={(value) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'followOnAmount',
                                          value
                                        )
                                      )
                                    }
                                  />
                                  <NumericField
                                    id={`capital-follow-on-participation-${variantIndex}-${rowIndex}`}
                                    label="Follow-on participation %"
                                    value={row.followOnParticipationPct}
                                    disabled={!editable}
                                    onChange={(value) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'followOnParticipationPct',
                                          value
                                        )
                                      )
                                    }
                                  />
                                  <NumericField
                                    id={`capital-horizon-${variantIndex}-${rowIndex}`}
                                    label="Investment horizon (months)"
                                    value={row.investmentHorizonMonths}
                                    disabled={!editable}
                                    onChange={(value) =>
                                      updateDraft((current) =>
                                        updateCapitalPlanNumeric(
                                          current,
                                          index,
                                          rowIndex,
                                          'investmentHorizonMonths',
                                          value
                                        )
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {serverError && (
            <Alert
              className={
                serverErrorKind === 'stale'
                  ? 'border-presson-warning/30 bg-presson-warning/10 text-presson-text'
                  : 'border-presson-negative/30 bg-presson-negative/10 text-presson-text'
              }
              aria-live="polite"
            >
              <AlertTitle>
                {serverErrorKind === 'stale' ? 'Source configuration changed' : 'Create refused'}
              </AlertTitle>
              <AlertDescription className="space-y-3 font-poppins text-presson-textMuted">
                <p>{serverError}</p>
                {serverErrorKind === 'stale' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshSourceConfig}
                    disabled={sourceConfigQuery.isFetching || createMutation.isPending}
                    className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
                  >
                    {sourceConfigQuery.isFetching ? 'Refreshing…' : 'Refresh and retry'}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
              className="border-presson-borderSubtle text-presson-text hover:bg-presson-surfaceSubtle"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || sourceConfigQuery.isFetching}
              className="bg-presson-accent text-presson-accentOn hover:bg-presson-accent/90"
            >
              {createMutation.isPending ? 'Creating…' : 'Create allocation scenarios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FrozenField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-presson-textMuted">{label}</p>
      <div className="min-h-9 rounded-md border border-presson-borderSubtle bg-presson-surfaceSubtle px-2.5 py-2 text-xs text-presson-textMuted">
        {value}
      </div>
    </div>
  );
}

function NumericField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-presson-textMuted">
        {label}
      </label>
      <ScenarioInput
        id={id}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
