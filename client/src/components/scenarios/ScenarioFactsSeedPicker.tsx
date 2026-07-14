import React, { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';

import { TRUST_CHIP_CLASSES } from '@/components/dashboard/TrustStateCounts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFeatureFlag } from '@/core/flags/flagAdapter';
import { useFundScenarioSeeds } from '@/hooks/useFundScenarioSeeds';
import { scenarioApiPath } from '@/lib/fund-scenario-workspace-api';
import {
  fundScenarioSeedsQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import type { ScenarioCaseSeedV1 } from '@shared/contracts/scenarios/scenario-case-seed-v1.contract';

const DecimalInputSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,6})?$/, 'Enter a non-negative number with up to 6 decimals');

const FractionInputSchema = DecimalInputSchema.refine(
  (value) => Number(value) <= 1,
  'Enter a value from 0 to 1'
);

const PositiveIntegerInputSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^\d+$/, 'Enter a whole number')
  .refine((value) => Number(value) > 0, 'Enter a value greater than 0');

const ScenarioFactsSeedPickerFormSchema = z
  .object({
    selectedCompanyId: z.string().min(1, 'Select a company'),
    caseName: z.string().trim().min(1, 'Required').max(255),
    probability: FractionInputSchema,
    exitValuation: DecimalInputSchema,
    ownershipAtExit: FractionInputSchema,
    monthsToExit: PositiveIntegerInputSchema,
    useSeedInvestment: z.boolean(),
    useSeedFollowOns: z.boolean(),
    useSeedFmv: z.boolean(),
    investmentOverride: z.string(),
    followOnsOverride: z.string(),
    fmvOverride: z.string(),
  })
  .superRefine((values, context) => {
    const requiredOverrides = [
      ['useSeedInvestment', 'investmentOverride'],
      ['useSeedFollowOns', 'followOnsOverride'],
      ['useSeedFmv', 'fmvOverride'],
    ] as const;

    for (const [seedToggle, overrideField] of requiredOverrides) {
      if (values[seedToggle]) continue;
      const parsed = DecimalInputSchema.safeParse(values[overrideField]);
      if (!parsed.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [overrideField],
          message: parsed.error.issues[0]?.message ?? 'Required',
        });
      }
    }
  });

type ScenarioFactsSeedPickerFormValues = z.infer<typeof ScenarioFactsSeedPickerFormSchema>;

const CreateScenarioCaseFromSeedResponseSchema = z
  .object({
    scenarioCaseId: z.string().uuid(),
    scenarioId: z.string().uuid(),
    scenarioVersion: z.number().int(),
    seededAt: z.string().datetime(),
    replay: z.boolean(),
  })
  .strict();

type SeedMoneyField =
  ScenarioCaseSeedV1['fields']['investment'] | ScenarioCaseSeedV1['fields']['fmv'];

export interface ScenarioFactsSeedPickerScenario {
  id: string;
  version: number;
  locked_at?: string | Date | null;
}

export interface ScenarioFactsSeedPickerProps {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario?: ScenarioFactsSeedPickerScenario;
  createdFromFactsHash?: string;
  /**
   * Plan 9 Wave 9B1 (review P2-3) additive: preselect this company's seed
   * once it is disclosed. Ignored when the company has no disclosed seed;
   * never overrides a selection the user has already made.
   */
  initialSelectedCompanyId?: string;
}

function unavailableCopy(field: SeedMoneyField): string {
  if (field.status === 'seeded') return field.value;
  return field.reason === 'currency_blocked' ? 'currency blocked' : 'facts unavailable';
}

function SeedValue({ field }: { field: SeedMoneyField }) {
  if (field.status === 'seeded') {
    return <span className="tabular-nums text-charcoal">{field.value}</span>;
  }
  return <span className="text-charcoal-500">{unavailableCopy(field)}</span>;
}

function trustLabel(seed: ScenarioCaseSeedV1): string {
  switch (seed.trustState) {
    case 'LIVE':
      return 'Live';
    case 'PARTIAL':
      return 'Partial';
    case 'UNAVAILABLE':
      return 'Unavailable';
    case 'FAILED':
      return 'Failed';
  }
}

function currencyLabel(seed: ScenarioCaseSeedV1): string {
  switch (seed.currencyStatus) {
    case 'base_currency':
      return 'Base currency';
    case 'mismatch_blocked':
      return 'Currency blocked';
    case 'unknown':
      return 'Currency unknown';
  }
}

function SeedDisclosureCard({
  seed,
  selected,
  onSelect,
}: {
  seed: ScenarioCaseSeedV1;
  selected: boolean;
  onSelect: () => void;
}) {
  const radioId = `scenario-seed-company-${seed.companyId}`;
  const liveMutedOverride =
    seed.trustState === 'LIVE' ? 'border-beige-200 bg-beige-100 text-charcoal-600' : undefined;

  return (
    <article
      className={cn(
        'space-y-3 rounded-md border p-4',
        selected ? 'border-charcoal bg-beige-50' : 'border-beige-200 bg-white'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            id={radioId}
            type="radio"
            name="scenario-seed-company"
            checked={selected}
            onChange={onSelect}
            className="h-4 w-4 accent-charcoal"
          />
          <Label htmlFor={radioId} className="font-inter text-sm font-semibold text-charcoal">
            Company {seed.companyId}
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
              TRUST_CHIP_CLASSES[seed.trustState],
              liveMutedOverride
            )}
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-charcoal-400" />
            {trustLabel(seed)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-beige-200 bg-beige-50 px-2 py-0.5 text-xs text-charcoal-600">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-charcoal-400" />
            {currencyLabel(seed)}
          </span>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-charcoal-500">Observed investment</dt>
          <dd>
            <SeedValue field={seed.fields.investment} />
          </dd>
        </div>
        <div>
          <dt className="text-charcoal-500">Follow-ons</dt>
          <dd>
            <SeedValue field={seed.fields.followOns} />
          </dd>
        </div>
        <div>
          <dt className="text-charcoal-500">Active FMV</dt>
          <dd>
            <SeedValue field={seed.fields.fmv} />
          </dd>
        </div>
        <div>
          <dt className="text-charcoal-500">Latest-round market reference — not seeded</dt>
          <dd>
            {seed.fields.exitValuation.marketReference === null ? (
              <span className="text-charcoal-500">facts unavailable</span>
            ) : (
              <span className="tabular-nums text-charcoal">
                {seed.fields.exitValuation.marketReference}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-charcoal-500">
        <span>As of {seed.asOfDate}</span>
        <span>Facts hash {seed.factsInputHash.slice(0, 8)}…</span>
      </div>
      <p className="text-xs text-charcoal-500">
        This seed is a snapshot of recorded actuals as of {seed.asOfDate}. It will not update
        automatically.
      </p>
    </article>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? <p className="text-xs text-error-dark">{message}</p> : null;
}

function SeedFieldControl({
  field,
  label,
  checkboxLabel,
  checkboxId,
  checked,
  onCheckedChange,
  overrideId,
  overrideLabel,
  overrideRegistration,
  error,
}: {
  field: SeedMoneyField;
  label: string;
  checkboxLabel: string;
  checkboxId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  overrideId: string;
  overrideLabel: string;
  overrideRegistration: UseFormRegisterReturn;
  error: string | undefined;
}) {
  const seedAvailable = field.status === 'seeded';

  return (
    <div className="space-y-2 rounded-md border border-beige-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-charcoal-600">{label}</span>
        <SeedValue field={field} />
      </div>
      {seedAvailable && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
            className="data-[state=checked]:border-charcoal data-[state=checked]:bg-charcoal"
          />
          <Label htmlFor={checkboxId} className="text-sm font-normal text-charcoal-600">
            {checkboxLabel}
          </Label>
        </div>
      )}
      {!checked && (
        <div className="space-y-1">
          <Label htmlFor={overrideId} className="text-sm text-charcoal">
            {overrideLabel}
          </Label>
          <Input
            id={overrideId}
            type="number"
            min="0"
            step="0.000001"
            inputMode="decimal"
            className="tabular-nums"
            {...overrideRegistration}
          />
          <FieldError message={error} />
        </div>
      )}
    </div>
  );
}

export function ScenarioFactsSeedPicker({
  fundId,
  open,
  onOpenChange,
  scenario,
  createdFromFactsHash,
  initialSelectedCompanyId,
}: ScenarioFactsSeedPickerProps) {
  const enabledByFlag = useFeatureFlag('enable_scenario_seed_picker');
  const { seeds, response, isLoading, error } = useFundScenarioSeeds(fundId);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const appliedInitialSelectionRef = useRef(false);

  const form = useForm<ScenarioFactsSeedPickerFormValues>({
    resolver: zodResolver(ScenarioFactsSeedPickerFormSchema),
    defaultValues: {
      selectedCompanyId: '',
      caseName: '',
      probability: '',
      exitValuation: '',
      ownershipAtExit: '',
      monthsToExit: '',
      useSeedInvestment: false,
      useSeedFollowOns: false,
      useSeedFmv: false,
      investmentOverride: '',
      followOnsOverride: '',
      fmvOverride: '',
    },
  });

  const selectedCompanyId = form.watch('selectedCompanyId');
  const useSeedInvestment = form.watch('useSeedInvestment');
  const useSeedFollowOns = form.watch('useSeedFollowOns');
  const useSeedFmv = form.watch('useSeedFmv');
  const selectedSeed = seeds.find((seed) => String(seed.companyId) === selectedCompanyId);
  const isLocked = scenario?.locked_at != null;
  const seedChanged =
    createdFromFactsHash !== undefined &&
    response?.factsInputHash !== null &&
    response?.factsInputHash !== undefined &&
    response.factsInputHash !== createdFromFactsHash;

  const createMutation = useMutation({
    retry: false,
    mutationFn: async ({
      payload,
      idempotencyKey,
    }: {
      payload: {
        seed: ScenarioCaseSeedV1;
        overrides: {
          caseName: string;
          probability: string;
          exitValuation: string;
          ownershipAtExit: string;
          monthsToExit: number;
          investment?: string;
          followOns?: string;
          fmv?: string;
        };
        expectedScenarioVersion: number;
      };
      idempotencyKey: string;
    }) => {
      if (!scenario) throw new Error('A scenario is required to create a case.');
      const raw = await apiRequest(
        'POST',
        scenarioApiPath(
          fundId,
          `/scenario-analysis/scenarios/${encodeURIComponent(scenario.id)}/cases/from-seed`
        ),
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );
      return CreateScenarioCaseFromSeedResponseSchema.parse(raw);
    },
    onMutate: () => setServerError(null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) }),
        queryClient.invalidateQueries({ queryKey: fundScenarioSeedsQueryKey(fundId) }),
      ]);
      form.reset();
      idempotencyRef.current = null;
      setServerError(null);
      onOpenChange(false);
    },
    onError: (mutationError: unknown) => {
      if (
        mutationError instanceof ApiError &&
        mutationError.status === 409 &&
        mutationError.errorCode === 'version_conflict'
      ) {
        setServerError('Scenario changed. Refresh and try again.');
        return;
      }
      if (
        mutationError instanceof ApiError &&
        mutationError.status === 409 &&
        mutationError.errorCode === 'seed_conflict'
      ) {
        void queryClient.invalidateQueries({ queryKey: fundScenarioSeedsQueryKey(fundId) });
        setServerError('Portfolio actuals changed. Refresh and try again.');
        return;
      }
      setServerError('Case creation failed. Review the inputs and try again.');
    },
  });

  // Review P2-3: apply the deep-linked preselect once per open cycle, only
  // when the company's seed is actually disclosed, and never after the user
  // has interacted (the guard flips on first application or manual choice).
  useEffect(() => {
    if (!open) {
      appliedInitialSelectionRef.current = false;
      return;
    }
    if (appliedInitialSelectionRef.current || initialSelectedCompanyId === undefined) {
      return;
    }
    const seed = seeds.find(
      (candidate) => String(candidate.companyId) === initialSelectedCompanyId
    );
    if (!seed) {
      return;
    }
    appliedInitialSelectionRef.current = true;
    handleSeedSelect(seed);
  });

  if (!enabledByFlag) return null;

  function handleSeedSelect(seed: ScenarioCaseSeedV1) {
    form.reset({
      selectedCompanyId: String(seed.companyId),
      caseName: '',
      probability: '',
      exitValuation: '',
      ownershipAtExit: '',
      monthsToExit: '',
      useSeedInvestment: seed.fields.investment.status === 'seeded',
      useSeedFollowOns: seed.fields.followOns.status === 'seeded',
      useSeedFmv: seed.fields.fmv.status === 'seeded',
      investmentOverride: '',
      followOnsOverride: '',
      fmvOverride: '',
    });
    idempotencyRef.current = null;
    setServerError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createMutation.isPending) return;
    if (!nextOpen) {
      form.reset();
      idempotencyRef.current = null;
      setServerError(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSubmit(values: ScenarioFactsSeedPickerFormValues) {
    if (!scenario || isLocked || !selectedSeed) return;
    const overrides = {
      caseName: values.caseName.trim(),
      probability: values.probability,
      exitValuation: values.exitValuation,
      ownershipAtExit: values.ownershipAtExit,
      monthsToExit: Number(values.monthsToExit),
      ...(!values.useSeedInvestment ? { investment: values.investmentOverride } : {}),
      ...(!values.useSeedFollowOns ? { followOns: values.followOnsOverride } : {}),
      ...(!values.useSeedFmv ? { fmv: values.fmvOverride } : {}),
    };
    const payload = {
      seed: selectedSeed,
      overrides,
      expectedScenarioVersion: scenario.version,
    };
    const signature = JSON.stringify(payload);
    if (idempotencyRef.current?.signature !== signature) {
      idempotencyRef.current = { signature, key: globalThis.crypto.randomUUID() };
    }
    createMutation.mutate({ payload, idempotencyKey: idempotencyRef.current.key });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-inter text-charcoal">
            Start case from portfolio actuals
          </DialogTitle>
          <DialogDescription>
            Choose a disclosed company snapshot, then confirm every assumption that is not seeded.
          </DialogDescription>
        </DialogHeader>

        {seedChanged && (
          <Alert className="border-beige-200 bg-beige-50">
            <AlertDescription className="text-charcoal-600">
              seed has changed since creation
            </AlertDescription>
          </Alert>
        )}

        {isLoading && <p className="text-sm text-charcoal-500">Loading portfolio actuals…</p>}
        {error && (
          <Alert className="border-error/20 bg-error/5">
            <AlertDescription className="text-error-dark">
              Seed facts could not be loaded.
            </AlertDescription>
          </Alert>
        )}
        {response?.factsStatus === 'failed' && (
          <Alert className="border-beige-200 bg-beige-50">
            <AlertDescription className="text-charcoal-600">
              Seed facts are unavailable for this fund.
            </AlertDescription>
          </Alert>
        )}
        {isLocked ? (
          <p className="text-sm font-medium text-charcoal-600">Scenario is locked</p>
        ) : !scenario ? (
          <p className="text-sm text-charcoal-600">Select a company scenario to create a case.</p>
        ) : null}

        {seeds.length > 0 && (
          <div className="space-y-3" role="radiogroup" aria-label="Portfolio actuals seeds">
            {seeds.map((seed) => (
              <SeedDisclosureCard
                key={seed.companyId}
                seed={seed}
                selected={selectedCompanyId === String(seed.companyId)}
                onSelect={() => {
                  appliedInitialSelectionRef.current = true;
                  handleSeedSelect(seed);
                }}
              />
            ))}
          </div>
        )}

        {selectedSeed && (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SeedFieldControl
                field={selectedSeed.fields.investment}
                label="Observed investment"
                checkboxLabel="Use observed investment"
                checkboxId="use-seed-investment"
                checked={useSeedInvestment}
                onCheckedChange={(checked) =>
                  form.setValue('useSeedInvestment', checked, { shouldValidate: true })
                }
                overrideId="investmentOverride"
                overrideLabel="Observed investment override"
                overrideRegistration={form.register('investmentOverride')}
                error={form.formState.errors.investmentOverride?.message}
              />
              <SeedFieldControl
                field={selectedSeed.fields.followOns}
                label="Follow-ons"
                checkboxLabel="Use recorded follow-ons"
                checkboxId="use-seed-follow-ons"
                checked={useSeedFollowOns}
                onCheckedChange={(checked) =>
                  form.setValue('useSeedFollowOns', checked, { shouldValidate: true })
                }
                overrideId="followOnsOverride"
                overrideLabel="Follow-ons override"
                overrideRegistration={form.register('followOnsOverride')}
                error={form.formState.errors.followOnsOverride?.message}
              />
              <SeedFieldControl
                field={selectedSeed.fields.fmv}
                label="Active FMV"
                checkboxLabel="Use active FMV"
                checkboxId="use-seed-fmv"
                checked={useSeedFmv}
                onCheckedChange={(checked) =>
                  form.setValue('useSeedFmv', checked, { shouldValidate: true })
                }
                overrideId="fmvOverride"
                overrideLabel="Active FMV override"
                overrideRegistration={form.register('fmvOverride')}
                error={form.formState.errors.fmvOverride?.message}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="caseName">Case name</Label>
                <Input id="caseName" {...form.register('caseName')} />
                <FieldError message={form.formState.errors.caseName?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="probability">Probability (0 to 1)</Label>
                <Input
                  id="probability"
                  type="number"
                  min="0"
                  max="1"
                  step="0.000001"
                  inputMode="decimal"
                  {...form.register('probability')}
                />
                <FieldError message={form.formState.errors.probability?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exitValuation">Exit valuation</Label>
                <Input
                  id="exitValuation"
                  type="number"
                  min="0"
                  step="0.000001"
                  inputMode="decimal"
                  className="tabular-nums"
                  {...form.register('exitValuation')}
                />
                <FieldError message={form.formState.errors.exitValuation?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ownershipAtExit">Ownership at exit (0 to 1)</Label>
                <Input
                  id="ownershipAtExit"
                  type="number"
                  min="0"
                  max="1"
                  step="0.000001"
                  inputMode="decimal"
                  {...form.register('ownershipAtExit')}
                />
                <FieldError message={form.formState.errors.ownershipAtExit?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="monthsToExit">Months to exit</Label>
                <Input
                  id="monthsToExit"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  {...form.register('monthsToExit')}
                />
                <FieldError message={form.formState.errors.monthsToExit?.message} />
              </div>
            </div>

            {serverError && (
              <Alert className="border-error/20 bg-error/5">
                <AlertDescription className="text-error-dark">{serverError}</AlertDescription>
              </Alert>
            )}

            {!isLocked && scenario && (
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-charcoal text-white hover:bg-charcoal/90"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create case'}
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
