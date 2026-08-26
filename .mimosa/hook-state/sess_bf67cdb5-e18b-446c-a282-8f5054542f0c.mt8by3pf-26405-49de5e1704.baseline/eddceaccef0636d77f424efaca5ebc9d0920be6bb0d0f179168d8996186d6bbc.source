/**
 * Retroactive Fee Catch-Up Panel
 *
 * Fee schedule control for the wizard fee step. It charges the fee months that
 * accrued before the first fee period.
 *
 * This control is a management fee setting. It is not the GP carry catch-up of
 * the distribution waterfall, which the Waterfall step owns.
 *
 * Visual language: DESIGN.md (presson tokens, charcoal ink on warm sand,
 * v3.1.1 truth-first proof strip).
 */

import React, { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  previewRetroactiveFeeCatchUp,
  BASIS_LABEL,
  type RetroactiveFeeCatchUpPreview,
} from '@/lib/retroactive-fee-catch-up-preview';
import type { FeeBasis } from '@/schemas/modeling-wizard.schemas';

export interface RetroactiveFeeCatchUpValue {
  enabled: boolean;
  accrualStartMonth: number;
  maxCatchUpMonths?: number | undefined;
}

export interface RetroactiveFeeCatchUpPanelProps {
  /** Annual management fee rate (%) */
  rate: number;
  /** Fee basis of the step */
  basis: FeeBasis;
  /** First fund year in which the fund charges fees */
  firstFeeYear: number;
  /** Current policy value */
  value: RetroactiveFeeCatchUpValue;
  /** Called with the field that changed */
  onChange: (patch: Partial<RetroactiveFeeCatchUpValue>) => void;
  /** Field-level messages from the form resolver */
  errors?: {
    enabled?: string | undefined;
    accrualStartMonth?: string | undefined;
    maxCatchUpMonths?: string | undefined;
  };
}

/** Format a percentage of the fee basis with a stable number of decimals */
function formatPercent(value: number, decimals: number): string {
  return `${value.toFixed(decimals)}%`;
}

/** One line of the driver list under the headline amount */
function Driver({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="font-poppins text-xs text-presson-textMuted">{label}</dt>
      <dd className="font-mono text-xs tabular-nums text-presson-text">{children}</dd>
    </div>
  );
}

/**
 * Proof strip: what the setting charges, and from which drivers.
 * Truth-first rule of the v3.1.1 rubric - a material number states its drivers.
 */
function CatchUpProof({
  preview,
  basis,
  rate,
  maxCatchUpMonths,
}: {
  preview: RetroactiveFeeCatchUpPreview;
  basis: FeeBasis;
  rate: number;
  maxCatchUpMonths?: number | undefined;
}) {
  return (
    <div
      aria-live="polite"
      className="rounded-presson-md border border-presson-borderSubtle bg-presson-surface px-4 py-3"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-presson-textMuted">
        What this charges
      </p>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-inter text-2xl font-semibold tabular-nums text-presson-text">
          {formatPercent(preview.catchUpPercentOfBasis, 2)}
        </span>
        <span className="font-poppins text-sm text-presson-textMuted">
          of {BASIS_LABEL[basis]}, charged once in fund month {preview.firstFeeMonth}
        </span>
      </p>

      <dl className="mt-3 border-t border-presson-borderSubtle pt-2">
        <Driver label="Missed months charged">
          {preview.chargedMonths}
          {preview.cappedMonths > 0 ? ` of ${preview.missedMonths}` : ''}
        </Driver>
        <Driver label="Monthly fee">
          {formatPercent(preview.monthlyPercentOfBasis, 4)} ({rate.toFixed(2)}% / 12)
        </Driver>
        <Driver label="Limit">
          {maxCatchUpMonths === undefined ? 'none' : `${maxCatchUpMonths} months`}
        </Driver>
      </dl>

      <p className="mt-3 font-poppins text-xs leading-relaxed text-presson-textMuted">
        Assumption: the fee basis at the first fee month applies to the missed months. The GP carry
        catch-up in the Waterfall step does not change.
      </p>
    </div>
  );
}

export function RetroactiveFeeCatchUpPanel({
  rate,
  basis,
  firstFeeYear,
  value,
  onChange,
  errors,
}: RetroactiveFeeCatchUpPanelProps) {
  const switchId = useId();
  const accrualId = useId();
  const limitId = useId();
  const helpId = useId();

  const feesStartInYearOne = firstFeeYear <= 1;
  const preview = value.enabled
    ? previewRetroactiveFeeCatchUp({
        rate,
        basis,
        firstFeeYear,
        enabled: value.enabled,
        accrualStartMonth: value.accrualStartMonth,
        maxCatchUpMonths: value.maxCatchUpMonths,
      })
    : null;

  return (
    <section
      aria-labelledby={`${switchId}-title`}
      className="rounded-presson-lg border border-presson-borderSubtle bg-presson-surfaceSubtle p-5"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-presson-textMuted">
              Fee schedule
            </p>
            <span className="rounded-presson-xs bg-presson-highlight px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-presson-text">
              Management fee
            </span>
          </div>

          <h4
            id={`${switchId}-title`}
            className="mt-2 text-pretty font-inter text-base font-semibold text-presson-text"
          >
            Retroactive fee catch-up
          </h4>

          <p
            id={helpId}
            className="mt-1 font-poppins text-sm leading-relaxed text-presson-textMuted"
          >
            {feesStartInYearOne
              ? 'Fees begin in fund year 1, so no fee months are missed. Set a later first fee year to charge accrued months.'
              : 'Charge the fee months that accrued before the first fee period. This is not the GP carry catch-up of the waterfall.'}
          </p>
        </div>

        <Switch
          id={switchId}
          checked={value.enabled}
          disabled={feesStartInYearOne}
          aria-describedby={helpId}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </div>

      {errors?.enabled && (
        <p className="mt-3 font-poppins text-sm text-error" role="alert">
          {errors.enabled}
        </p>
      )}

      {value.enabled && !feesStartInYearOne && (
        <div className="motion-safe:animate-fade-in mt-5 space-y-5 border-t border-presson-borderSubtle pt-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor={accrualId} className="font-poppins">
                Accrual starts (fund month)
              </Label>
              <Input
                id={accrualId}
                type="number"
                min={0}
                step={1}
                value={Number.isFinite(value.accrualStartMonth) ? value.accrualStartMonth : ''}
                onChange={(event) => onChange({ accrualStartMonth: event.target.valueAsNumber })}
                placeholder="e.g., 0"
                className="mt-2 tabular-nums"
              />
              {errors?.accrualStartMonth && (
                <p className="mt-1 font-poppins text-sm text-error" role="alert">
                  {errors.accrualStartMonth}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor={limitId} className="font-poppins">
                Limit catch-up (months)
              </Label>
              <Input
                id={limitId}
                type="number"
                min={1}
                step={1}
                value={value.maxCatchUpMonths ?? ''}
                onChange={(event) =>
                  onChange({
                    maxCatchUpMonths: Number.isNaN(event.target.valueAsNumber)
                      ? undefined
                      : event.target.valueAsNumber,
                  })
                }
                placeholder="Optional"
                className="mt-2 tabular-nums"
              />
              {errors?.maxCatchUpMonths && (
                <p className="mt-1 font-poppins text-sm text-error" role="alert">
                  {errors.maxCatchUpMonths}
                </p>
              )}
            </div>
          </div>

          {preview ? (
            <CatchUpProof
              preview={preview}
              basis={basis}
              rate={rate}
              maxCatchUpMonths={value.maxCatchUpMonths}
            />
          ) : (
            <p className="font-poppins text-sm text-presson-textMuted">
              Complete the fee rate and the accrual start to see what the catch-up charges.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
