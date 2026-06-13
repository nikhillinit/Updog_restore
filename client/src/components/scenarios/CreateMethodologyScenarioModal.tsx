import React, { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest, ApiError } from '@/lib/queryClient';
import { scenarioApiPath } from '@/lib/fund-scenario-workspace-api';
import {
  scenarioSetDetailQueryKey,
  workspaceQueryKey,
} from '@/lib/fund-scenario-workspace-query-keys';
import {
  FundScenarioSetDetailV1Schema,
  type FundScenarioSetDetailV1,
  type CreateFundScenarioSetV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

// ─── Schema ──────────────────────────────────────────────────────────────────

const OptionalPercentageNumberSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return Number(value);
}, z.number().finite().min(0).max(100).optional());

const CreateMethodologyScenarioFormSchema = z
  .object({
    scenarioSetName: z.string().trim().min(1, 'Required').max(120),
    variantName: z.string().trim().min(1, 'Required').max(120),
    waterfallType: z.enum(['american', 'hybrid']).optional(),
    managementFeeRate: OptionalPercentageNumberSchema,
  })
  .refine((data) => data.waterfallType !== undefined || data.managementFeeRate !== undefined, {
    message: 'Specify at least one override: waterfall type or management fee rate.',
    path: ['waterfallType'],
  });

type CreateMethodologyScenarioFormValues = z.infer<typeof CreateMethodologyScenarioFormSchema>;
type CreateMethodologyScenarioFormInput = z.input<typeof CreateMethodologyScenarioFormSchema>;

const WATERFALL_UNSET_VALUE = '__unset__';

// ─── Payload builder ─────────────────────────────────────────────────────────

export function buildCreateMethodologyScenarioPayload(
  values: CreateMethodologyScenarioFormValues
): CreateFundScenarioSetV1 {
  return {
    name: values.scenarioSetName,
    variants: [
      {
        name: values.variantName,
        override: {
          overrideType: 'methodology',
          payload: {
            ...(values.waterfallType ? { waterfallType: values.waterfallType } : {}),
            ...(values.managementFeeRate !== undefined
              ? { managementFeeRate: values.managementFeeRate }
              : {}),
          },
        },
      },
    ],
  };
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function extractErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? (error.errorCode ?? null) : null;
}

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `methodology-scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface CreateMethodologyScenarioModalProps {
  fundId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (created: FundScenarioSetDetailV1) => void;
}

export function CreateMethodologyScenarioModal({
  fundId,
  open,
  onOpenChange,
  onSuccess,
}: CreateMethodologyScenarioModalProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const submitInFlightRef = useRef(false);

  const form = useForm<
    CreateMethodologyScenarioFormInput,
    unknown,
    CreateMethodologyScenarioFormValues
  >({
    resolver: zodResolver(CreateMethodologyScenarioFormSchema),
    defaultValues: {
      scenarioSetName: '',
      variantName: '',
      waterfallType: undefined,
      managementFeeRate: undefined,
    },
  });

  function resolveIdempotencyKey(payload: CreateFundScenarioSetV1): string {
    const signature = JSON.stringify(payload);
    if (idempotencyRef.current?.signature === signature) {
      return idempotencyRef.current.key;
    }
    const key = createIdempotencyKey();
    idempotencyRef.current = { signature, key };
    return key;
  }

  const createMutation = useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateFundScenarioSetV1;
      idempotencyKey: string;
    }) =>
      apiRequest('POST', scenarioApiPath(fundId, '/scenario-sets'), payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }).then((raw) => FundScenarioSetDetailV1Schema.parse(raw)),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async (created) => {
      queryClient.setQueryData(scenarioSetDetailQueryKey(fundId, created.id), created);
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKey(fundId) });
      form.reset();
      idempotencyRef.current = null;
      setServerError(null);
      onOpenChange(false);
      onSuccess(created);
    },
    onError: (error) => {
      const code = extractErrorCode(error);
      if (code === 'duplicate_scenario_set_name') {
        form.setError('scenarioSetName', {
          message: 'A scenario set with this name already exists.',
        });
      } else if (code === 'max_scenario_sets') {
        setServerError('This fund has reached the maximum of 10 active scenario sets.');
      } else if (code === 'no_published_config') {
        setServerError('Publish a fund configuration before creating scenarios.');
      } else {
        setServerError('Failed to create scenario. Please try again.');
      }
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && createMutation.isPending) return;
    if (!nextOpen) {
      form.reset();
      idempotencyRef.current = null;
      setServerError(null);
    }
    onOpenChange(nextOpen);
  }

  function onSubmit(values: CreateMethodologyScenarioFormValues) {
    if (submitInFlightRef.current) return;
    const payload = buildCreateMethodologyScenarioPayload(values);
    const idempotencyKey = resolveIdempotencyKey(payload);
    submitInFlightRef.current = true;
    createMutation.mutate(
      { payload, idempotencyKey },
      {
        onSettled: () => {
          submitInFlightRef.current = false;
        },
      }
    );
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = form;

  const waterfallTypeValue = watch('waterfallType');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-inter text-charcoal">New methodology scenario</DialogTitle>
          <DialogDescription className="sr-only">
            Create one scenario variant by changing waterfall type, management fee rate, or both.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="scenarioSetName" className="font-poppins text-sm text-charcoal">
              Scenario set name
            </Label>
            <Input
              id="scenarioSetName"
              aria-label="Scenario set name"
              {...register('scenarioSetName')}
              placeholder="e.g. Waterfall comparison"
            />
            {errors.scenarioSetName && (
              <p className="text-xs text-error-dark font-poppins">
                {errors.scenarioSetName.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="variantName" className="font-poppins text-sm text-charcoal">
              Variant name
            </Label>
            <Input
              id="variantName"
              aria-label="Variant name"
              {...register('variantName')}
              placeholder="e.g. American waterfall"
            />
            {errors.variantName && (
              <p className="text-xs text-error-dark font-poppins">{errors.variantName.message}</p>
            )}
          </div>

          <div className="space-y-3 rounded-md border border-beige-200 p-3">
            <p className="font-poppins text-xs uppercase text-charcoal-400">
              At least one override required
            </p>

            <div className="space-y-1">
              <Label htmlFor="waterfallType" className="font-poppins text-sm text-charcoal">
                Waterfall type
              </Label>
              <Select
                value={waterfallTypeValue ?? WATERFALL_UNSET_VALUE}
                onValueChange={(value) =>
                  setValue(
                    'waterfallType',
                    value === WATERFALL_UNSET_VALUE ? undefined : (value as 'american' | 'hybrid'),
                    { shouldValidate: true }
                  )
                }
              >
                <SelectTrigger id="waterfallType" aria-label="Waterfall type">
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WATERFALL_UNSET_VALUE}>No change</SelectItem>
                  <SelectItem value="american">American (deal-by-deal)</SelectItem>
                  <SelectItem value="hybrid">Hybrid (fund-level)</SelectItem>
                </SelectContent>
              </Select>
              {errors.waterfallType && (
                <p className="text-xs text-error-dark font-poppins">
                  {errors.waterfallType.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="managementFeeRate" className="font-poppins text-sm text-charcoal">
                Management fee rate
              </Label>
              <div className="relative">
                <Input
                  id="managementFeeRate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g. 2"
                  className="pr-7"
                  aria-label="Management fee rate"
                  {...register('managementFeeRate', { valueAsNumber: true })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-charcoal-400">
                  %
                </span>
              </div>
              {errors.managementFeeRate && (
                <p className="text-xs text-error-dark font-poppins">
                  {errors.managementFeeRate.message}
                </p>
              )}
            </div>
          </div>

          {serverError && (
            <Alert className="border-error/20 bg-error/5">
              <AlertDescription className="font-poppins text-sm text-error-dark">
                {serverError}
              </AlertDescription>
            </Alert>
          )}

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
              {createMutation.isPending ? 'Creating…' : 'Create scenario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
