/**
 * Exit Values Card (Enhanced with Inline Validation)
 *
 * Configures exit values in DOLLARS (not multiples) by stage.
 * Supports low/median/high scenarios with probability weights.
 * Displays computed implied multiples as read-only reference.
 */

import React from 'react';
import { CollapsibleCard } from '@/components/wizard/CollapsibleCard';
import { EnhancedField } from '@/components/wizard/EnhancedField';
import { formatUSD } from '@/lib/formatting';
import { computeImpliedMultiple } from '@/lib/exits';
import { STAGES, STAGE_LABEL, type Stage } from './\./_types';
import type { FieldErrors } from '@/lib/validation';
import { firstError } from '@/lib/validation';

export interface StageExitValue {
  low?: number;
  median: number;
  high?: number;
  weights?: {
    low?: number;
    median?: number;
    high?: number;
  };
}

export type ExitValuesByStage = Record<Stage, StageExitValue>;

interface ExitValuesCardProps {
  /** Current exit values by stage */
  value: ExitValuesByStage;

  /** Callback when values change */
  onChange: (next: ExitValuesByStage) => void;

  /** Optional cost basis by stage for implied multiple calculation */
  costBasisAtStageUSD?: Partial<Record<Stage, number>>;

  /** Show probability weights for scenarios */
  showWeights?: boolean;

  /** Scoped validation errors (keys like "preSeed.low", "seed.median") */
  errors?: FieldErrors;

  /** Whether the card is disabled */
  disabled?: boolean;

  /** Additional class names */
  className?: string;
}

export function ExitValuesCard({
  value,
  onChange,
  costBasisAtStageUSD = {},
  showWeights = false,
  errors,
  disabled = false,
  className,
}: ExitValuesCardProps) {
  const set = <K extends keyof StageExitValue>(stage: Stage, key: K, v: StageExitValue[K]) => {
    onChange({ ...value, [stage]: { ...value[stage], [key]: v } });
  };

  const summary = (
    <div className="text-sm text-muted-foreground">
      Enter equity exit values in whole dollars (median required).
    </div>
  );

  const errFor = (stage: Stage, key: 'low' | 'median' | 'high' | 'weights.low' | 'weights.median' | 'weights.high') => {
    // errors keyed like "preSeed.low" or "preSeed.weights.low"
    return firstError(errors ?? {}, `${stage}.${key}`);
  };

  return (
    <CollapsibleCard
      title="Exit Values by Stage (equity dollars)"
      summary={summary}
      defaultExpanded
      className={className}
    >
      <div className="grid gap-4">
        {STAGES.map((s) => {
          const st = value[s];
          const cost = costBasisAtStageUSD[s] ?? 0;
          const mult = computeImpliedMultiple(st?.median ?? 0, cost);

          return (
            <div key={s} className="rounded-md border p-3">
              <div className="mb-2 font-medium">{STAGE_LABEL[s]}</div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <EnhancedField
                  id={`exit-${s}-low`}
                  label="Low (optional)"
                  format="usd"
                  value={st?.low ?? 0}
                  onChange={(v: number) => set(s, 'low', v)}
                  aria-invalid={!!errFor(s, 'low')}
                  error={errFor(s, 'low')}
                  disabled={disabled}
                />
                <EnhancedField
                  id={`exit-${s}-median`}
                  label="Median"
                  format="usd"
                  value={st?.median ?? 0}
                  onChange={(v: number) => set(s, 'median', v)}
                  required
                  aria-invalid={!!errFor(s, 'median')}
                  error={errFor(s, 'median')}
                  disabled={disabled}
                />
                <EnhancedField
                  id={`exit-${s}-high`}
                  label="High (optional)"
                  format="usd"
                  value={st?.high ?? 0}
                  onChange={(v: number) => set(s, 'high', v)}
                  aria-invalid={!!errFor(s, 'high')}
                  error={errFor(s, 'high')}
                  disabled={disabled}
                />
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                {cost > 0 ? (
                  <>
                    Implied median multiple: {mult.toFixed(2)}× ({formatUSD(st?.median ?? 0)} ÷{' '}
                    {formatUSD(cost)})
                  </>
                ) : (
                  <>Implied multiple shown when cost basis provided.</>
                )}
              </div>

              {showWeights && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <EnhancedField
                    id={`exit-${s}-w-low`}
                    label="Weight Low"
                    format="percent"
                    value={st?.weights?.low ?? 0}
                    onChange={(v: number) => set(s, 'weights', { ...(st?.weights ?? {}), low: v })}
                    aria-invalid={!!errFor(s, 'weights.low')}
                    error={errFor(s, 'weights.low')}
                    disabled={disabled}
                  />
                  <EnhancedField
                    id={`exit-${s}-w-med`}
                    label="Weight Median"
                    format="percent"
                    value={st?.weights?.median ?? 100}
                    onChange={(v: number) => set(s, 'weights', { ...(st?.weights ?? {}), median: v })}
                    aria-invalid={!!errFor(s, 'weights.median')}
                    error={errFor(s, 'weights.median')}
                    disabled={disabled}
                  />
                  <EnhancedField
                    id={`exit-${s}-w-high`}
                    label="Weight High"
                    format="percent"
                    value={st?.weights?.high ?? 0}
                    onChange={(v: number) => set(s, 'weights', { ...(st?.weights ?? {}), high: v })}
                    aria-invalid={!!errFor(s, 'weights.high')}
                    error={errFor(s, 'weights.high')}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}

export default ExitValuesCard;
