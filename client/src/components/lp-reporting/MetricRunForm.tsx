/**
 * LP Reporting -- Metric-run dry-run form (Phase 1b.4).
 *
 * Posts a JSON body to the protected route
 *   POST /api/funds/:fundId/metric-runs/dry-run
 * via `useMetricsDryRun`. The client form schema is derived from the
 * shared request contract and narrows the visible perspectives to the
 * engine-supported options.
 *
 * Server route reference: server/routes/lp-reporting/metric-runs.ts
 * Server body shape:
 *   {
 *     asOfDate: 'YYYY-MM-DD',
 *     runType: LpMetricRunType,
 *     perspective: LpMetricRunPerspective ('lp_net' | 'fund_gross'),
 *     sourceEventIds?: number[],
 *     sourceMarkIds?: number[],
 *   }
 *
 * Phase 1.2 engine supports `lp_net` and `fund_gross` only; the
 * `vehicle` perspective is in the schema but the server returns 400
 * with `UNSUPPORTED_PERSPECTIVE`. We expose lp_net + fund_gross only
 * in the dropdown and keep `vehicle` out of the form altogether.
 *
 * @module client/components/lp-reporting/MetricRunForm
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMetricsDryRun } from '@/hooks/lp-reporting';
import type { LpReportingHookError } from '@/hooks/lp-reporting';
import {
  MetricRunDryRunRequestSchema,
  type MetricRunDryRunRequest,
  type MetricRunDryRunResponse,
} from '@shared/contracts/lp-reporting';

export const MetricRunDryRunRequestClientSchema = MetricRunDryRunRequestSchema.pick({
  asOfDate: true,
  runType: true,
  perspective: true,
})
  .extend({
    perspective: z.enum(['lp_net', 'fund_gross']),
  })
  .strict();

export type MetricRunFormValues = z.infer<typeof MetricRunDryRunRequestClientSchema>;

const RUN_TYPE_OPTIONS: ReadonlyArray<{
  value: MetricRunFormValues['runType'];
  label: string;
}> = [
  { value: 'quarterly_report', label: 'Quarterly report' },
  { value: 'fundraise_pack', label: 'Fundraise pack' },
  { value: 'internal_review', label: 'Internal review' },
  { value: 'lp_update', label: 'LP update' },
];

const PERSPECTIVE_OPTIONS: ReadonlyArray<{
  value: MetricRunFormValues['perspective'];
  label: string;
}> = [
  { value: 'lp_net', label: 'LP (net)' },
  { value: 'fund_gross', label: 'Fund (gross)' },
];

/**
 * Today's date as YYYY-MM-DD using UTC components. Mirrors the helper
 * in `valuations.tsx` so TZ=UTC tests observe a stable value and
 * cross-locale users see the same default.
 *
 * Exported so tests can pin behaviour without re-deriving it.
 */
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface MetricRunFormProps {
  fundId: number | null;
  onSuccess: (response: MetricRunDryRunResponse, request: MetricRunDryRunRequest) => void;
  onError?: (error: LpReportingHookError) => void;
}

export function MetricRunForm({ fundId, onSuccess, onError }: MetricRunFormProps) {
  const mutation = useMetricsDryRun(fundId);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MetricRunFormValues>({
    resolver: zodResolver(MetricRunDryRunRequestClientSchema),
    defaultValues: {
      asOfDate: todayIsoDate(),
      runType: 'internal_review',
      perspective: 'lp_net',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const request: MetricRunDryRunRequest = {
        asOfDate: values.asOfDate,
        runType: values.runType,
        perspective: values.perspective,
        sourceEventIds: [],
        sourceMarkIds: [],
      };
      const result = await mutation.mutateAsync(request);
      onSuccess(result, request);
    } catch (err) {
      if (onError && err && typeof err === 'object') {
        onError(err as LpReportingHookError);
      }
    }
  });

  const disabled = fundId === null || isSubmitting || mutation.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Metric-run dry-run form">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="metric-run-as-of-date">As-of date</Label>
          <Input
            id="metric-run-as-of-date"
            type="date"
            placeholder="YYYY-MM-DD"
            aria-invalid={errors.asOfDate ? true : undefined}
            {...register('asOfDate')}
          />
          {errors.asOfDate?.message ? (
            <p data-testid="error-asOfDate" className="text-sm text-destructive font-poppins">
              {errors.asOfDate.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="metric-run-run-type">Run type</Label>
          <select
            id="metric-run-run-type"
            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-poppins"
            aria-invalid={errors.runType ? true : undefined}
            {...register('runType')}
          >
            {RUN_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.runType?.message ? (
            <p data-testid="error-runType" className="text-sm text-destructive font-poppins">
              {errors.runType.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="metric-run-perspective">Perspective</Label>
          <select
            id="metric-run-perspective"
            className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-poppins"
            aria-invalid={errors.perspective ? true : undefined}
            {...register('perspective')}
          >
            {PERSPECTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.perspective?.message ? (
            <p data-testid="error-perspective" className="text-sm text-destructive font-poppins">
              {errors.perspective.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={disabled}>
          {mutation.isPending ? 'Computing...' : 'Run metrics'}
        </Button>
      </div>
    </form>
  );
}

export default MetricRunForm;
