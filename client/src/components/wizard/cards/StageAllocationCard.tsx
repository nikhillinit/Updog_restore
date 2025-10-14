/**
 * Stage Allocation Card (Enhanced with Inline Validation)
 *
 * Allows users to allocate capital across investment stages.
 * Enforces 100% allocation constraint with live validation and inline error messages.
 */

import React, { useMemo } from 'react';
import { CollapsibleCard } from '@/components/wizard/CollapsibleCard';
import { EnhancedField } from '@/components/wizard/EnhancedField';
import { formatUSD, pctOfDollars } from '@/lib/formatting';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import { STAGES, STAGE_LABEL } from './_types';
import type { FieldErrors } from '@/lib/validation';
import { firstError } from '@/lib/validation';

export interface StageAllocation {
  preSeed: number;
  seed: number;
  seriesA: number;
  seriesB: number;
  seriesC: number;
  seriesD: number;
  reserves: number;
}

interface StageAllocationCardProps {
  /** Current allocation values (0-100 scale) */
  value: StageAllocation;

  /** Total committed capital in whole dollars (for preview) */
  committedCapitalUSD: number;

  /** Callback when allocation changes */
  onChange: (next: StageAllocation) => void;

  /** Scoped validation errors (keys like "preSeed", "reserves") */
  errors?: FieldErrors;

  /** Whether the card is disabled */
  disabled?: boolean;

  /** Additional class names */
  className?: string;
}

export function StageAllocationCard({
  value,
  committedCapitalUSD,
  onChange,
  errors,
  disabled = false,
  className,
}: StageAllocationCardProps) {
  // Calculate total allocation
  const totalPct = useMemo(
    () => STAGES.reduce((acc, s) => acc + (value[s] ?? 0), 0) + (value.reserves ?? 0),
    [value]
  );

  // Update field value
  const setPct = (key: keyof StageAllocation, pct: number) => {
    onChange({ ...value, [key]: pct });
  };

  // Auto-balance remainder into reserves
  const balanceRemainder = () => {
    const nonReserves = STAGES.reduce((acc, s) => acc + (value[s] ?? 0), 0);
    const remainder = Math.max(0, 100 - nonReserves);
    onChange({ ...value, reserves: remainder });
  };

  const isValid = Math.abs(totalPct - 100) < 0.1;

  const summary = (
    <div className="text-sm text-muted-foreground">
      Total: <span className={isValid ? 'text-green-700' : 'text-red-700'}>{totalPct.toFixed(0)}%</span>
      {' · '}
      Reserves: {(value.reserves ?? 0).toFixed(0)}% ({formatUSD(pctOfDollars(committedCapitalUSD, value.reserves ?? 0))})
    </div>
  );

  return (
    <CollapsibleCard
      title="Stage Allocation (must sum to 100%)"
      summary={summary}
      defaultExpanded
      {...spreadIfDefined("className", className)}
    >
      <div className="space-y-3">
        {/* Stage Fields */}
        {STAGES.map((stage) => {
          const err = firstError(errors ?? {}, stage);
          const stageLabel = STAGE_LABEL[stage as keyof typeof STAGE_LABEL];
          const stageValue = value[stage as keyof StageAllocation] ?? 0;
          return (
            <div
              key={stage}
              className="grid grid-cols-[1fr,120px,1fr] sm:grid-cols-[1fr,140px,200px] items-center gap-3"
            >
              <div className="font-medium">{stageLabel}</div>
              <EnhancedField
                id={`alloc-${stage}-pct`}
                label=""
                format="percent"
                value={stageValue}
                onChange={(v: number) => setPct(stage, v)}
                contextChip="0–100%"
                aria-label={`${stageLabel} allocation percent`}
                aria-invalid={!!err}
                {...(err !== undefined ? { error: err } : {})}
                disabled={disabled}
              />
              <div className="text-sm tabular-nums text-muted-foreground">
                {formatUSD(pctOfDollars(committedCapitalUSD, stageValue))}
              </div>
            </div>
          );
        })}

        {/* Reserves Row */}
        {(() => {
          const err = firstError(errors ?? {}, 'reserves');
          const reservesValue = value.reserves ?? 0;
          return (
            <div className="grid grid-cols-[1fr,120px,1fr] sm:grid-cols-[1fr,140px,200px] items-center gap-3 border-t pt-3">
              <div className="font-medium">Reserves</div>
              <EnhancedField
                id="alloc-reserves-pct"
                label=""
                format="percent"
                value={reservesValue}
                onChange={(v: number) => setPct('reserves', v)}
                contextChip="Common: 40–60%"
                aria-label="Reserves percent"
                aria-invalid={!!err}
                {...(err !== undefined ? { error: err } : {})}
                disabled={disabled}
              />
              <div className="text-sm tabular-nums text-muted-foreground">
                {formatUSD(pctOfDollars(committedCapitalUSD, reservesValue))}
              </div>
            </div>
          );
        })()}

        {/* Total and Balance Button */}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-sm">
            Total:{' '}
            <span className={isValid ? 'text-green-700' : 'text-red-700'}>{totalPct.toFixed(0)}%</span>
            {!isValid && (
              <span className="ml-2 text-red-700">Allocations must sum to 100% to continue.</span>
            )}
          </div>
          {!isValid && (
            <button
              type="button"
              className="text-sm underline hover:text-purple-700"
              onClick={balanceRemainder}
              disabled={disabled}
            >
              Balance remainder into Reserves
            </button>
          )}
        </div>
      </div>
    </CollapsibleCard>
  );
}

export default StageAllocationCard;
