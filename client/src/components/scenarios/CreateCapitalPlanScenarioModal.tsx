import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/queryClient';
import {
  createCapitalScenario,
  fetchCapitalScenarioSource,
} from '@/lib/fund-scenario-workspace-api';
import {
  capitalScenarioSourceQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import { reviewCapitalPlanDraft } from '@/lib/capital-plan-review';
import {
  CAPITAL_BENCHMARK_CATALOG_VERSION,
  getCapitalBenchmarkPresetV1,
} from '@/lib/investment-round-defaults';
import { CapitalPlanResultView } from '@/components/fund-results/CapitalPlanComparisonTable';
import {
  CAPITAL_PLANNING_PROVISIONAL_LIMITS as limits,
  CAPITAL_PLANNING_DISCLOSURES,
  CapitalHashV1Schema,
  CapitalSourceProjectionV1Schema,
  type CapitalIssueV1,
  type CapitalPlanningMemoV1,
  type CapitalBenchmarkSelectionV1,
} from '@shared/contracts/capital-planning-v1.contract';
import type { FundScenarioCapitalCreateResponseV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import {
  capitalDraftRequest,
  capitalErrorIssues,
  capitalIssuePath,
  capitalSourceIdentity,
  emptyCapitalAllocation,
  emptyCapitalCompanion,
  emptyCapitalRound,
  getCapitalDraft,
  getCapitalSaveIntent,
  retainCapitalSaveIntent,
  newCapitalDraft,
  retainCapitalDraft,
  type CapitalPlanDraft,
  type RawCapitalVariant,
} from './capital-plan-draft';

const STEPS = [
  'Source and budget',
  'Allocations',
  'Follow-ons',
  'Optional companion',
  'Review',
] as const;
const CONTROL =
  'w-full min-w-0 rounded-md border border-presson-borderSubtle bg-presson-surface px-3 py-2 text-presson-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-presson-accent';
type Path = (string | number)[];
type Reviewed = Extract<Awaited<ReturnType<typeof reviewCapitalPlanDraft>>, { ok: true }>;
type SaveOperation = {
  command: NonNullable<ReturnType<typeof getCapitalSaveIntent>>;
  generation: number;
};
const sourceIdentityShape = CapitalSourceProjectionV1Schema.innerType().shape;
const SourceConflictDetailsSchema = z
  .object({
    suppliedSourceConfigId: sourceIdentityShape.sourceConfigId,
    suppliedSourceConfigVersion: sourceIdentityShape.sourceConfigVersion,
    suppliedSourceBundleHash: CapitalHashV1Schema,
    currentSourceConfigId: sourceIdentityShape.sourceConfigId,
    currentSourceConfigVersion: sourceIdentityShape.sourceConfigVersion,
    currentSourceBundleHash: CapitalHashV1Schema,
  })
  .strict();
type Props = {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: FundScenarioCapitalCreateResponseV1) => void;
};

function readPath(value: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (item, key) =>
      item && typeof item === 'object'
        ? (item as Record<string | number, unknown>)[key]
        : undefined,
    value
  );
}
function writePath(value: CapitalPlanDraft, path: Path, next: unknown): void {
  let parent = value as unknown as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;
  const key = path[path.length - 1]!;
  if (next === undefined) delete parent[key];
  else parent[key] = next;
}
function controlPath(path: Path): string {
  return capitalIssuePath(path)
    .replace(/^(variants\[\d+\])\.input/, '$1.override.payload.input')
    .replace(/^(variants\[\d+\])\.benchmarkSelections/, '$1.override.payload.benchmarkSelections');
}
function idFor(path: string): string {
  return `capital-field-${encodeURIComponent(path)}`;
}
function stepFor(path: string): number {
  if (path.includes('performanceCase')) return 3;
  if (path.includes('followOnRounds')) return 2;
  if (path.includes('allocations')) return 1;
  return 0;
}

export function CreateCapitalPlanScenarioModal(props: Props) {
  return <CapitalPlanScenarioEditor key={props.fundId} {...props} />;
}

function CapitalPlanScenarioEditor({ fundId, open, onOpenChange, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => getCapitalDraft(fundId));
  const [step, setStep] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const [issues, setIssues] = useState<CapitalIssueV1[]>([]);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [busy, setBusy] = useState<'review' | 'save' | null>(null);
  const [notice, setNotice] = useState(() =>
    getCapitalSaveIntent(fundId)
      ? 'A prior save is unconfirmed. Retry capital save uses its original reviewed request and key. Edits start a new intent.'
      : ''
  );
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [sourceConflict, setSourceConflict] = useState<z.infer<
    typeof SourceConflictDetailsSchema
  > | null>(null);
  const generation = useRef(0);
  const intent = useRef(getCapitalSaveIntent(fundId));
  const submitting = useRef<SaveOperation | null>(null);
  const refreshing = useRef(false);
  const sourceQuery = useQuery({
    queryKey: capitalScenarioSourceQueryKey(fundId),
    queryFn: () => fetchCapitalScenarioSource(fundId),
    enabled: open,
    retry: false,
  });
  const sourceChanged = Boolean(
    draft.source &&
    sourceQuery.data &&
    capitalSourceIdentity(draft.source) !== capitalSourceIdentity(sourceQuery.data)
  );

  function replace(next: CapitalPlanDraft) {
    generation.current += 1;
    intent.current = null;
    retainCapitalSaveIntent(fundId, null);
    setReviewed(null);
    setSourceConflict(null);
    setBusy((current) => (current === 'review' ? null : current));
    retainCapitalDraft(fundId, next);
    setDraft(next);
  }
  function edit(path: Path, value: unknown) {
    const next = structuredClone(draft);
    if (path[path.length - 1] === 'allocationId') {
      const previous = readPath(draft, path);
      for (const selection of next.variants[variantIndex]!.benchmarkSelections) {
        if (selection.target.allocationId === previous && typeof value === 'string')
          selection.target.allocationId = value;
      }
    }
    writePath(next, path, value);
    replace(next);
  }
  useEffect(() => {
    if (sourceQuery.data && !draft.source) {
      const next = { ...draft, source: sourceQuery.data };
      retainCapitalDraft(fundId, next);
      setDraft(next);
      generation.current += 1;
    }
  }, [draft, fundId, sourceQuery.data]);
  useEffect(() => {
    if (sourceChanged && !refreshing.current) {
      generation.current += 1;
      setReviewed(null);
      setBusy((current) => (current === 'review' ? null : current));
      setNotice(
        intent.current
          ? 'Current source changed. Retry the retained save request to recover its outcome before starting a new source review.'
          : 'Current source changed. Refresh source and review before saving.'
      );
    }
  }, [sourceChanged]);
  useEffect(
    () => () => {
      generation.current += 1;
      submitting.current = null;
    },
    []
  );
  useEffect(() => {
    if (!focusPath || !open) return;
    const element = document.getElementById(idFor(focusPath));
    if (element) {
      element.focus();
      setFocusPath(null);
    }
  }, [focusPath, step, variantIndex, open, issues]);

  function normalizedIssuePath(path: string): string {
    if (draft.source?.remainingDeclarations.some((item) => item.path === path)) return path;
    return path
      .replace(/^inputs\[(\d+)\]/, 'variants[$1].override.payload.input')
      .replace(/^input(?=\.|$)/, `variants[${variantIndex}].override.payload.input`);
  }
  function focusIssue(issue: CapitalIssueV1) {
    const path = normalizedIssuePath(issue.path);
    const selected = /^variants\[(\d+)\]/.exec(path);
    if (selected) setVariantIndex(Number(selected[1]));
    const benchmarkIndex = /\.benchmarkSelections\[(\d+)\]/.exec(path);
    const selection = benchmarkIndex
      ? draft.variants[selected ? Number(selected[1]) : variantIndex]?.benchmarkSelections[
          Number(benchmarkIndex[1])
        ]
      : undefined;
    setStep(selection ? (selection.target.kind === 'follow_on' ? 2 : 1) : stepFor(path));
    setFocusPath(path);
  }
  function refuse(nextIssues: CapitalIssueV1[]) {
    setIssues(nextIssues);
    setReviewed(null);
    setNotice(
      `Review failed: ${nextIssues.length} issue${nextIssues.length === 1 ? '' : 's'}. Your entries are retained.`
    );
    if (nextIssues[0]) focusIssue(nextIssues[0]);
  }
  function field(
    label: string,
    path: Path,
    options?: {
      choices?: readonly (readonly [string, string])[];
      type?: string;
      errorPath?: string;
      onChange?: (value: string) => void;
    }
  ) {
    const errorPath = options?.errorPath ?? controlPath(path);
    const errors = issues.filter((issue) => normalizedIssuePath(issue.path) === errorPath);
    const id = idFor(errorPath);
    const value = readPath(draft, path);
    const props = {
      id,
      value: typeof value === 'string' ? value : '',
      'aria-invalid': errors.length > 0,
      'aria-describedby': errors.length ? `${id}-error` : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        options?.onChange ? options.onChange(event.target.value) : edit(path, event.target.value),
      className: CONTROL,
    };
    return (
      <div className="min-w-0 space-y-1" key={id}>
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        {options?.choices ? (
          <select {...props}>
            <option value="">Choose explicitly</option>
            {props.value && !options.choices.some(([key]) => key === props.value) && (
              <option value={props.value}>{props.value} (review required)</option>
            )}
            {options.choices.map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...props}
            type={options?.type ?? 'text'}
            inputMode={/USD|ratio|count|years|Months/.test(label) ? 'decimal' : undefined}
          />
        )}
        {errors.length > 0 && (
          <p id={`${id}-error`} className="text-sm text-presson-negative">
            {errors.map((issue) => issue.message).join(' ')}
          </p>
        )}
      </div>
    );
  }
  const variant = draft.variants[variantIndex] ?? draft.variants[0]!;
  const vpath: Path = ['variants', variantIndex];
  const ipath: Path = [...vpath, 'input'];
  const source = draft.source;
  function sourceRows(prefix: string): [string, string][] {
    if (!source) return [];
    const rows: [string, string][] = [];
    for (const fact of source.projection.facts) {
      if (
        fact.state !== 'present' ||
        typeof fact.rawValue !== 'string' ||
        !fact.path.startsWith(prefix) ||
        !fact.path.endsWith('.id')
      )
        continue;
      const tail = fact.path.slice(prefix.length);
      if (!/^\[\d+\]\.id$/.test(tail)) continue;
      const name = source.projection.facts.find(
        (item) => item.path === fact.path.replace(/\.id$/, '.name')
      );
      rows.push([fact.rawValue, name?.state === 'present' ? String(name.rawValue) : fact.rawValue]);
    }
    return rows;
  }
  function stages(profileId: string): [string, string][] {
    const fact = source?.projection.facts.find(
      (item) =>
        item.state === 'present' &&
        item.rawValue === profileId &&
        /^pipelineProfiles\[\d+\]\.id$/.test(item.path)
    );
    return fact ? sourceRows(fact.path.replace(/\.id$/, '.stages')) : [];
  }
  function financing(path: Path, label: string) {
    const present = readPath(draft, path) !== undefined;
    const errorPath = controlPath(path);
    const errors = issues.filter((issue) => normalizedIssuePath(issue.path) === errorPath);
    const id = idFor(errorPath);
    return (
      <div className="space-y-3 rounded-md border border-presson-borderSubtle p-3">
        <label htmlFor={id} className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={present}
            aria-invalid={errors.length > 0}
            aria-describedby={errors.length ? `${id}-error` : undefined}
            onChange={(event) =>
              edit(
                path,
                event.target.checked
                  ? { valuationUsd: '', valuationBasis: '', totalPrimaryRoundUsd: '' }
                  : undefined
              )
            }
          />
          {label}
        </label>
        {errors.length > 0 && (
          <p id={`${id}-error`} className="text-sm text-presson-negative">
            {errors.map((issue) => issue.message).join(' ')}
          </p>
        )}
        {present && (
          <div className="grid gap-3 sm:grid-cols-3">
            {field('Valuation (USD)', [...path, 'valuationUsd'])}
            {field('Valuation basis', [...path, 'valuationBasis'], {
              choices: [
                ['pre_money', 'Pre-money'],
                ['post_money', 'Post-money'],
              ],
            })}
            {field('Primary round capital (USD)', [...path, 'totalPrimaryRoundUsd'])}
          </div>
        )}
      </div>
    );
  }
  function benchmark(allocationIndex: number, roundIndex?: number) {
    const allocation = variant.input.allocations[allocationIndex]!;
    const round = roundIndex === undefined ? undefined : allocation.followOnRounds[roundIndex];
    const selectedIndex = variant.benchmarkSelections.findIndex(
      (selection) =>
        selection.target.allocationId === allocation.allocationId &&
        (round
          ? selection.target.kind === 'follow_on' &&
            'roundId' in selection.target &&
            selection.target.roundId === round.roundId
          : selection.target.kind === 'entry')
    );
    const selection = variant.benchmarkSelections[selectedIndex];
    const target: CapitalBenchmarkSelectionV1['target'] = round
      ? { kind: 'follow_on', allocationId: allocation.allocationId, roundId: round.roundId }
      : { kind: 'entry', allocationId: allocation.allocationId };
    const financingPath: Path =
      roundIndex === undefined
        ? [...ipath, 'allocations', allocationIndex, 'entryFinancing']
        : [...ipath, 'allocations', allocationIndex, 'followOnRounds', roundIndex, 'financing'];
    const name = round
      ? `${round.roundLabel || 'Follow-on'} benchmark`
      : `${allocation.name || 'Entry'} benchmark`;
    let preset: ReturnType<typeof getCapitalBenchmarkPresetV1> | undefined;
    if (selection) {
      try {
        preset = getCapitalBenchmarkPresetV1(
          selection.selector as CapitalBenchmarkSelectionV1['selector']
        );
      } catch {
        /* Invalid selection remains visible and blocks Review. */
      }
    }
    return (
      <div className="space-y-3">
        <label className="block space-y-1">
          {name}
          <select
            aria-label={name}
            className={CONTROL}
            value={selection?.selector.stage ?? ''}
            onChange={(event) => {
              const next = structuredClone(draft);
              const selections = next.variants[variantIndex]!.benchmarkSelections;
              if (selectedIndex >= 0) selections.splice(selectedIndex, 1);
              if (event.target.value) {
                selections.push({
                  target,
                  selector: {
                    version: CAPITAL_BENCHMARK_CATALOG_VERSION,
                    stage: event.target.value,
                  },
                });
                writePath(next, financingPath, undefined);
              }
              replace(next);
            }}
          >
            <option value="">No benchmark</option>
            {[
              ['seed', 'Seed'],
              ['series_a', 'Series A'],
              ['series_b', 'Series B'],
              ['series_c', 'Series C'],
              ['series_d', 'Series D'],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {selection ? (
          <>
            <p className="text-sm">
              Explicit benchmark: {selection.selector.version}. Synthetic financing uses separate
              valuation and cash-raised medians; cash raised is not independently verified
              primary-only priced financing.
            </p>
            {preset && (
              <details>
                <summary>Benchmark source and applicability</summary>
                <pre className="whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(preset, null, 2)}
                </pre>
              </details>
            )}
            {(['valuation', 'totalPrimaryRoundUsd'] as const).map((key) => {
              const path: Path = [...vpath, 'benchmarkSelections', selectedIndex, 'overrides'];
              const enabled = selection.overrides && key in selection.overrides;
              return (
                <div key={key} className="space-y-2">
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(enabled)}
                      onChange={(event) => {
                        const next = structuredClone(draft);
                        const item =
                          next.variants[variantIndex]!.benchmarkSelections[selectedIndex]!;
                        const overrides = { ...item.overrides };
                        if (event.target.checked) {
                          if (key === 'valuation')
                            overrides.valuation = { valuationUsd: '', valuationBasis: '' };
                          else overrides.totalPrimaryRoundUsd = '';
                        } else delete overrides[key];
                        item.overrides = overrides;
                        replace(next);
                      }}
                    />
                    Override benchmark {key === 'valuation' ? 'valuation' : 'round capital'}{' '}
                    (retained even when equal)
                  </label>
                  {enabled &&
                    (key === 'valuation' ? (
                      <>
                        {field('Override valuation (USD)', [...path, key, 'valuationUsd'])}
                        {field('Override valuation basis', [...path, key, 'valuationBasis'], {
                          choices: [
                            ['pre_money', 'Pre-money'],
                            ['post_money', 'Post-money'],
                          ],
                        })}
                      </>
                    ) : (
                      field('Override primary round capital (USD)', [...path, key])
                    ))}
                </div>
              );
            })}
          </>
        ) : (
          financing(
            financingPath,
            round ? 'Declare follow-on financing' : 'Declare entry financing'
          )
        )}
      </div>
    );
  }
  async function review() {
    if (busy === 'save' || intent.current) return;
    const parsed = capitalDraftRequest(draft);
    if (!parsed.ok) {
      refuse(parsed.issues);
      return;
    }
    const captured = ++generation.current;
    setBusy('review');
    setIssues([]);
    setReviewed(null);
    setNotice('Reviewing the current draft and source.');
    try {
      const result = await reviewCapitalPlanDraft({
        fundId: Number(fundId),
        source: draft.source,
        request: parsed.request,
      });
      if (captured !== generation.current) return;
      if (!result.ok) {
        refuse(result.issues);
        return;
      }
      setReviewed(result);
      setStep(4);
      setNotice('Review complete. This is an unsaved preview. Save explicitly to retain it.');
    } catch (error) {
      if (captured === generation.current) refuse(capitalErrorIssues(error));
    } finally {
      if (captured === generation.current) setBusy(null);
    }
  }
  function ownsSave(operation: SaveOperation): boolean {
    return (
      submitting.current === operation &&
      intent.current === operation.command &&
      getCapitalSaveIntent(fundId) === operation.command &&
      generation.current === operation.generation
    );
  }
  function clearSaveIntent(command: SaveOperation['command']) {
    if (intent.current === command) intent.current = null;
    if (getCapitalSaveIntent(fundId) === command) retainCapitalSaveIntent(fundId, null);
  }
  function saveSucceeded(operation: SaveOperation, created: FundScenarioCapitalCreateResponseV1) {
    if (!ownsSave(operation)) return;
    setNotice('Capital scenario saved. Calculate its saved inputs in the workspace.');
    setReviewed(null);
    clearSaveIntent(operation.command);
    onSuccess(created);
    onOpenChange(false);
  }
  function saveFailed(operation: SaveOperation, error: unknown) {
    if (!ownsSave(operation)) return;
    const serverIssues = capitalErrorIssues(error);
    setIssues(serverIssues);
    if (serverIssues[0]) focusIssue(serverIssues[0]);
    if (error instanceof ApiError && error.errorCode === 'scenario_source_config_stale') {
      clearSaveIntent(operation.command);
      setReviewed(null);
      const conflict = SourceConflictDetailsSchema.safeParse(error.details);
      setSourceConflict(conflict.success ? conflict.data : null);
      setNotice(
        'Source conflict. Your draft is retained. Refresh source and review before a new save.'
      );
    } else
      setNotice(
        'Save failed or its response was lost. Your draft is retained. Retry Save with the same request and key.'
      );
  }
  function finishSave(operation: SaveOperation) {
    if (submitting.current !== operation) return;
    submitting.current = null;
    setBusy(null);
  }
  async function save() {
    if ((!reviewed && !intent.current) || (sourceChanged && !intent.current) || submitting.current)
      return;
    const command = intent.current ?? { request: reviewed!.request, key: crypto.randomUUID() };
    const operation = { command, generation: generation.current };
    intent.current = command;
    retainCapitalSaveIntent(fundId, command);
    submitting.current = operation;
    setBusy('save');
    setSourceConflict(null);
    try {
      const created = await createCapitalScenario(fundId, command.request, command.key);
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
      saveSucceeded(operation, created);
    } catch (error) {
      saveFailed(operation, error);
    } finally {
      finishSave(operation);
    }
  }
  async function refreshSource() {
    const captured = ++generation.current;
    refreshing.current = true;
    setReviewed(null);
    setBusy((current) => (current === 'review' ? null : current));
    const result = await sourceQuery.refetch();
    refreshing.current = false;
    if (captured !== generation.current) return;
    if (result.data) {
      setSourceConflict(null);
      const next = { ...getCapitalDraft(fundId), source: result.data };
      retainCapitalDraft(fundId, next);
      setDraft(next);
      setNotice(
        intent.current
          ? 'Source refreshed. The prior save is still unconfirmed; retry its original request before a new review.'
          : 'Source refreshed. Your entries are retained; review again.'
      );
    } else setNotice('Source could not be refreshed. Your draft is retained.');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto bg-presson-surface text-presson-text">
        <DialogHeader>
          <DialogTitle>New capital planning scenario</DialogTitle>
          <DialogDescription>
            Review lifetime construction feasibility under explicit assumptions. No financial values
            are filled silently.
          </DialogDescription>
        </DialogHeader>
        <p role="status" aria-live="polite" className="text-sm">
          {notice}
        </p>
        {sourceConflict && (
          <section
            aria-label="Source conflict identities"
            className="space-y-2 break-words rounded-md border border-presson-negative p-3 text-sm"
          >
            <p>
              Supplied source: config {sourceConflict.suppliedSourceConfigId}, version{' '}
              {sourceConflict.suppliedSourceConfigVersion}, hash{' '}
              {sourceConflict.suppliedSourceBundleHash}
            </p>
            <p>
              Current source: config {sourceConflict.currentSourceConfigId}, version{' '}
              {sourceConflict.currentSourceConfigVersion}, hash{' '}
              {sourceConflict.currentSourceBundleHash}
            </p>
          </section>
        )}
        {issues.length > 0 && (
          <section
            aria-label="Validation errors"
            className="rounded-md border border-presson-negative p-3"
          >
            <h2 className="font-semibold">Correct the following issues</h2>
            <ul>
              {issues.map((issue, index) => (
                <li key={`${issue.path}-${index}`}>
                  <button
                    type="button"
                    className="text-left underline focus-visible:ring-2 focus-visible:ring-presson-accent"
                    onClick={() => focusIssue(issue)}
                  >
                    {issue.path}: {issue.code} — {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <nav aria-label="Capital planning steps" className="flex flex-wrap gap-2">
          {STEPS.map((name, index) => (
            <Button
              key={name}
              type="button"
              variant={step === index ? 'default' : 'outline'}
              aria-current={step === index ? 'step' : undefined}
              onClick={() => setStep(index)}
            >
              {index + 1}. {name}
            </Button>
          ))}
        </nav>
        <fieldset disabled={busy === 'save'} className="min-w-0 space-y-4">
          <legend className="sr-only">Capital scenario draft</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('Scenario name', ['name'])}
            <label className="space-y-1">
              Selected variant
              <select
                className={CONTROL}
                aria-label="Selected variant"
                value={variantIndex}
                onChange={(event) => setVariantIndex(Number(event.target.value))}
              >
                {draft.variants.map((item, index) => (
                  <option key={item.variantId} value={index}>
                    {index === 0 ? 'Baseline: ' : ''}
                    {item.name || `Variant ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={draft.variants.length >= 5}
              onClick={() => {
                const next = structuredClone(draft);
                const added: RawCapitalVariant = {
                  ...structuredClone(variant),
                  variantId: crypto.randomUUID(),
                  name: '',
                };
                next.variants.push(added);
                replace(next);
                setVariantIndex(next.variants.length - 1);
              }}
            >
              Add variant
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={variantIndex === 0}
              onClick={() => {
                const next = structuredClone(draft);
                next.variants.splice(variantIndex, 1);
                replace(next);
                setVariantIndex(0);
              }}
            >
              Remove variant
            </Button>
          </div>
          {field('Variant name', [...vpath, 'name'])}
          <section aria-label={STEPS[step]} className="min-w-0 space-y-4">
            <h2 className="font-heading text-lg font-semibold">{STEPS[step]}</h2>
            {step === 0 && (
              <>
                <p>
                  Fund {fundId}. Lifetime commitments less supported fees, expenses and GP deemed
                  contribution determine available construction capital A. This is not current cash
                  or called capital.
                </p>
                <Button type="button" variant="outline" onClick={() => void refreshSource()}>
                  Refresh source
                </Button>
                {sourceQuery.isPending && <p>Loading published source.</p>}
                {sourceQuery.isError && <p>Source unavailable. {sourceQuery.error.message}</p>}
                {source && (
                  <>
                    <p className="break-words font-mono text-sm">
                      Source {source.projection.sourceConfigId}, version{' '}
                      {source.projection.sourceConfigVersion}; interpretation{' '}
                      {source.interpretationVersion}; hash {source.sourceBundleHash}
                    </p>
                    <p>
                      Source inspection: {source.calculationReadiness.state}. Scenario selections
                      and declarations must pass explicit Review.
                    </p>
                    {source.calculationReadiness.issues.map((issue, index) => (
                      <p key={index} className="break-words text-sm">
                        {issue.code}: {issue.path} — {issue.message}
                      </p>
                    ))}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {source.remainingDeclarations.map(({ path, allowedUnits }) =>
                        field(`Source unit: ${path}`, ['declarations', path], {
                          errorPath: path,
                          choices: allowedUnits.map((unit) => [unit, unit] as const),
                        })
                      )}
                    </div>
                    {Object.keys(draft.declarations)
                      .filter(
                        (path) => !source.remainingDeclarations.some((item) => item.path === path)
                      )
                      .map((path) => (
                        <div key={path} className="break-words">
                          Retained declaration {path}: {draft.declarations[path]}{' '}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => edit(['declarations', path], undefined)}
                          >
                            Remove declaration {path}
                          </Button>
                        </div>
                      ))}
                    <details>
                      <summary>Original published source facts</summary>
                      <dl className="space-y-2 break-words text-sm">
                        {source.projection.facts.map((fact) => (
                          <div key={fact.path}>
                            <dt>{fact.path}</dt>
                            <dd className="font-mono">
                              {fact.state === 'present'
                                ? String(fact.rawValue)
                                : fact.state === 'array'
                                  ? `${fact.length} entries`
                                  : 'Absent'}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </>
                )}
                {field('Planning budget (USD, optional)', [...ipath, 'netInvestableCapitalUsd'])}
                <p className="text-sm">
                  An explicit planning budget changes planning demand; it does not replace lifetime
                  available construction capital. Blank retains the source-derived budget.
                </p>
              </>
            )}
            {step === 1 && (
              <>
                <p>
                  Expected companies = allocated investment capital / initial check. Entered counts
                  are separate from fractional expectations. Allocation shares must not exceed one.
                </p>
                {variant.input.allocations.map((allocation, index) => {
                  const path: Path = [...ipath, 'allocations', index];
                  return (
                    <fieldset
                      key={index}
                      className="min-w-0 space-y-3 rounded-md border border-presson-borderSubtle p-4"
                    >
                      <legend>Allocation {index + 1}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {field('Source allocation', [...path, 'allocationId'], {
                          choices: sourceRows('capitalPlanAllocations'),
                        })}
                        {field('Allocation name', [...path, 'name'])}
                        {field('Pipeline profile', [...path, 'pipelineProfileId'], {
                          choices: sourceRows('pipelineProfiles'),
                        })}
                        {field('Entry stage', [...path, 'entryStageId'], {
                          choices: stages(allocation.pipelineProfileId),
                        })}
                        {field('Entry round', [...path, 'entryRound'])}
                        {field('Budget share (ratio)', [...path, 'budgetShareRatio'])}
                        {field('Initial check (USD)', [...path, 'initialCheckUsd'])}
                        {field('Deployment period (years)', [...path, 'deploymentPeriodYears'])}
                        {field('Planned company count (optional)', [
                          ...path,
                          'plannedCompanyCount',
                        ])}
                      </div>
                      {benchmark(index)}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={variant.input.allocations.length === 1}
                        onClick={() => {
                          const next = structuredClone(draft);
                          const current = next.variants[variantIndex]!;
                          current.input.allocations.splice(index, 1);
                          current.benchmarkSelections = current.benchmarkSelections.filter(
                            (item) => item.target.allocationId !== allocation.allocationId
                          );
                          replace(next);
                        }}
                      >
                        Remove allocation
                      </Button>
                    </fieldset>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  disabled={variant.input.allocations.length >= limits.maxAllocations}
                  onClick={() =>
                    edit(
                      [...ipath, 'allocations'],
                      [...variant.input.allocations, emptyCapitalAllocation()]
                    )
                  }
                >
                  Add allocation
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  Graduation is conditional on the previous round. Participation scales demand
                  separately. Pro-rata requires explicit financing and incremental pre-money pool
                  dilution through the final pro-rata round.
                </p>
                {variant.input.allocations.map((allocation, ai) => (
                  <fieldset
                    key={ai}
                    className="space-y-4 rounded-md border border-presson-borderSubtle p-4"
                  >
                    <legend>{allocation.name || `Allocation ${ai + 1}`}</legend>
                    {allocation.followOnRounds.map((round, ri) => {
                      const path: Path = [...ipath, 'allocations', ai, 'followOnRounds', ri];
                      return (
                        <fieldset
                          key={round.roundId}
                          className="min-w-0 space-y-3 border-t border-presson-borderSubtle pt-3"
                        >
                          <legend>Follow-on {ri + 1}</legend>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {field('Round label', [...path, 'roundLabel'])}
                            {field('Stage', [...path, 'stageId'], {
                              choices: stages(allocation.pipelineProfileId),
                            })}
                            {field('Graduation (ratio)', [...path, 'graduationRatio'])}
                            {field('Participation (ratio)', [...path, 'participationRatio'])}
                            {field('Check policy', [...path, 'checkPolicy', 'type'], {
                              choices: [
                                ['fixed_check', 'Fixed check'],
                                ['pro_rata', 'Pro-rata'],
                              ],
                              onChange: (value) =>
                                edit(
                                  [...path, 'checkPolicy'],
                                  value === 'pro_rata'
                                    ? { type: 'pro_rata', proRataExerciseRatio: '' }
                                    : { type: value, checkUsd: '' }
                                ),
                            })}
                            {round.checkPolicy.type === 'pro_rata'
                              ? field('Pro-rata exercise (ratio)', [
                                  ...path,
                                  'checkPolicy',
                                  'proRataExerciseRatio',
                                ])
                              : field('Check (USD)', [...path, 'checkPolicy', 'checkUsd'])}
                            {field('Months after previous round', [
                              ...path,
                              'monthsAfterPreviousRound',
                            ])}
                            {field('Incremental pool dilution (ratio)', [
                              ...path,
                              'incrementalPreMoneyPoolDilutionRatio',
                            ])}
                          </div>
                          <p className="text-sm">
                            Time origin: previous round. Total pool size is not incremental
                            dilution.
                          </p>
                          {benchmark(ai, ri)}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const next = structuredClone(draft);
                              next.variants[variantIndex]!.input.allocations[
                                ai
                              ]!.followOnRounds.splice(ri, 1);
                              next.variants[variantIndex]!.benchmarkSelections = next.variants[
                                variantIndex
                              ]!.benchmarkSelections.filter(
                                (item) =>
                                  !('roundId' in item.target) ||
                                  item.target.roundId !== round.roundId
                              );
                              replace(next);
                            }}
                          >
                            Remove follow-on round
                          </Button>
                        </fieldset>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={allocation.followOnRounds.length >= limits.maxFollowOnRounds}
                      onClick={() =>
                        edit(
                          [...ipath, 'allocations', ai, 'followOnRounds'],
                          [...allocation.followOnRounds, emptyCapitalRound()]
                        )
                      }
                    >
                      Add follow-on round
                    </Button>
                  </fieldset>
                ))}
              </>
            )}
            {step === 3 && (
              <>
                <p>
                  The optional representative performance case is separate from construction
                  feasibility. Its FMV does not change proceeds, MOIC or construction.
                </p>
                {!variant.input.performanceCase ? (
                  <>
                    <p>
                      Companion unavailable: no performance case selected. FMV and MOIC are
                      unavailable, not zero.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => edit([...ipath, 'performanceCase'], emptyCapitalCompanion())}
                    >
                      Add companion
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => edit([...ipath, 'performanceCase'], undefined)}
                    >
                      Remove companion
                    </Button>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field('Issuer label', [...ipath, 'performanceCase', 'issuerLabel'])}
                      {field('Issuer kind', [...ipath, 'performanceCase', 'issuerKind'], {
                        choices: [
                          ['named_holding', 'Named holding'],
                          ['representative_issuer', 'Representative issuer'],
                        ],
                      })}
                      {field('Exit equity value (USD)', [
                        ...ipath,
                        'performanceCase',
                        'exitEquityValueUsd',
                      ])}
                      {field('Exit date', [...ipath, 'performanceCase', 'exitDate'], {
                        type: 'date',
                      })}
                      {field('As-converted ownership (ratio)', [
                        ...ipath,
                        'performanceCase',
                        'asConvertedOwnershipRatio',
                      ])}
                      {field('Fund liquidation preference (USD)', [
                        ...ipath,
                        'performanceCase',
                        'fundLiquidationPreferenceUsd',
                      ])}
                      {field('Preference type', [...ipath, 'performanceCase', 'preferenceType'], {
                        choices: [
                          ['non_participating', 'Non-participating'],
                          ['participating', 'Participating'],
                        ],
                      })}
                      {field('Preferences senior to position (USD)', [
                        ...ipath,
                        'performanceCase',
                        'totalPreferencesSeniorUsd',
                      ])}
                      {field('Other pari-passu preferences (USD)', [
                        ...ipath,
                        'performanceCase',
                        'totalPreferencesPariPassuUsd',
                      ])}
                      {field('Preferences Behind Position (USD)', [
                        ...ipath,
                        'performanceCase',
                        'totalPreferencesJuniorUsd',
                      ])}
                      {field('Invested cost (USD)', [
                        ...ipath,
                        'performanceCase',
                        'investedCostUsd',
                      ])}
                    </div>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={
                          variant.input.performanceCase.manualOwnershipOverrideRatio !== undefined
                        }
                        onChange={(event) => {
                          const next = structuredClone(draft);
                          const companion = next.variants[variantIndex]!.input.performanceCase!;
                          if (event.target.checked) companion.manualOwnershipOverrideRatio = '';
                          else {
                            delete companion.manualOwnershipOverrideRatio;
                            delete companion.ownershipOverrideExplanation;
                          }
                          replace(next);
                        }}
                      />
                      Manual ownership override
                    </label>
                    {variant.input.performanceCase.manualOwnershipOverrideRatio !== undefined && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {field('Manual ownership override (ratio)', [
                          ...ipath,
                          'performanceCase',
                          'manualOwnershipOverrideRatio',
                        ])}
                        {field('Ownership override explanation', [
                          ...ipath,
                          'performanceCase',
                          'ownershipOverrideExplanation',
                        ])}
                      </div>
                    )}
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={
                          variant.input.performanceCase.participationCap.type === 'total_payout'
                        }
                        onChange={(event) =>
                          edit(
                            [...ipath, 'performanceCase', 'participationCap'],
                            event.target.checked
                              ? { type: 'total_payout', capAmountUsd: '' }
                              : { type: 'none' }
                          )
                        }
                      />
                      Cap total payout
                    </label>
                    {variant.input.performanceCase.participationCap.type === 'total_payout' &&
                      field('Total payout cap (USD)', [
                        ...ipath,
                        'performanceCase',
                        'participationCap',
                        'capAmountUsd',
                      ])}
                    {(['positionFmv', 'manualFmvOverride'] as const).map((key) => (
                      <div key={key} className="space-y-2">
                        <label className="flex gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(variant.input.performanceCase?.[key])}
                            onChange={(event) =>
                              edit(
                                [...ipath, 'performanceCase', key],
                                event.target.checked
                                  ? {
                                      amountUsd: '',
                                      asOfDate: '',
                                      basis: key === 'manualFmvOverride' ? 'manual' : '',
                                    }
                                  : undefined
                              )
                            }
                          />
                          {key === 'manualFmvOverride' ? 'Manual FMV override' : 'Position FMV'}
                        </label>
                        {variant.input.performanceCase?.[key] && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {field(
                              `${key === 'manualFmvOverride' ? 'Manual' : 'Position'} FMV (USD)`,
                              [...ipath, 'performanceCase', key, 'amountUsd']
                            )}
                            {field(
                              'FMV as-of date',
                              [...ipath, 'performanceCase', key, 'asOfDate'],
                              { type: 'date' }
                            )}
                            {key === 'positionFmv' &&
                              field('FMV basis', [...ipath, 'performanceCase', key, 'basis'], {
                                choices: [
                                  ['direct', 'Direct'],
                                  ['derived', 'Derived'],
                                  ['manual', 'Manual'],
                                ],
                              })}
                            {field('FMV explanation (optional)', [
                              ...ipath,
                              'performanceCase',
                              key,
                              'explanation',
                            ])}
                          </div>
                        )}
                      </div>
                    ))}
                    <p className="text-sm">
                      Explicit zero invested cost is valid; MOIC is unavailable with reason
                      ZERO_COST. Omitted FMV remains unavailable.
                    </p>
                  </>
                )}
              </>
            )}
            {step === 4 && (
              <>
                <p className="font-semibold">UNSAVED PREVIEW</p>
                <p>
                  Review checks every selected variant and original source pin. An incomplete or
                  unsupported preview cannot be saved or copied as a saved memo.
                </p>
                {!reviewed && <p>Review is required after every draft or source change.</p>}
                {reviewed?.results.map((result, index) => {
                  const memo: CapitalPlanningMemoV1 = {
                    contractVersion: 'capital-planning-memo/1.0.0',
                    fundId: Number(fundId),
                    scenarioSetId: '00000000-0000-4000-8000-000000000000',
                    variantId: reviewed.request.variants[index]!.variantId,
                    scenarioSetName: reviewed.request.name,
                    variantName: reviewed.request.variants[index]!.name,
                    result,
                    readState: {
                      calculationReadiness: {
                        state: 'READY',
                        context: 'current_preview',
                        issues: [],
                      },
                      sourceFreshness: 'CURRENT',
                      interpretationCompatibility: source!.interpretationCompatibility,
                    },
                    countBasis: 'expected',
                    limitations: [
                      'Unsaved local preview; server revalidates the original source when saving.',
                    ],
                    detailScope: 'complete',
                  };
                  return (
                    <CapitalPlanResultView
                      key={memo.variantId}
                      memo={memo}
                      copyAllowed={false}
                      preview
                    />
                  );
                })}
                <details>
                  <summary>Draft input and declaration review</summary>
                  <pre className="whitespace-pre-wrap break-words text-xs">
                    {JSON.stringify(
                      draft.variants.map((item) => ({
                        name: item.name,
                        input: item.input,
                        benchmarkSelections: item.benchmarkSelections,
                      })),
                      null,
                      2
                    )}
                  </pre>
                </details>
              </>
            )}
          </section>
          <div className="space-y-2 text-sm">
            {Object.values(CAPITAL_PLANNING_DISCLOSURES).map((disclosure) => (
              <p key={disclosure}>{disclosure}</p>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-presson-borderSubtle pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
            {step < 4 && (
              <Button type="button" variant="outline" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={
                busy === 'review' || sourceChanged || sourceQuery.isError || intent.current !== null
              }
              onClick={() => void review()}
            >
              {busy === 'review' ? 'Reviewing capital plan' : 'Review capital plan'}
            </Button>
            <Button
              type="button"
              disabled={
                (!reviewed && !intent.current) ||
                (sourceChanged && !intent.current) ||
                (sourceQuery.isError && !intent.current) ||
                busy !== null
              }
              onClick={() => void save()}
            >
              {busy === 'save'
                ? 'Saving capital scenario'
                : intent.current
                  ? 'Retry capital save'
                  : 'Save capital scenario'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close and keep draft
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              replace(newCapitalDraft());
              setVariantIndex(0);
              setStep(0);
              setIssues([]);
              setNotice('New empty draft started.');
            }}
          >
            New empty draft
          </Button>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
