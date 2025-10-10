/**
 * Exit Timing Card (Enhanced with Inline Validation)
 *
 * Configures expected years to exit by stage.
 * Used in portfolio modeling to project when exits will occur.
 */

import React from 'react';
import { CollapsibleCard } from '@/components/wizard/CollapsibleCard';
import { EnhancedField } from '@/components/wizard/EnhancedField';
import { STAGES, STAGE_LABEL, type Stage } from './_types';
import type { FieldErrors } from '@/lib/validation';
import { firstError } from '@/lib/validation';

export interface ExitTiming {
  preSeed: number;
  seed: number;
  seriesA: number;
  seriesB: number;
  seriesC: number;
  seriesD: number;
}

interface ExitTimingCardProps {
  /** Current exit timing values (years) */
  value: ExitTiming;

  /** Callback when values change */
  onChange: (next: ExitTiming) => void;

  /** Scoped validation errors (keys like "preSeed", "seriesA") */
  errors?: FieldErrors;

  /** Whether the card is disabled */
  disabled?: boolean;

  /** Additional class names */
  className?: string;
}

export function ExitTimingCard({
  value,
  onChange,
  errors,
  disabled = false,
  className,
}: ExitTimingCardProps) {
  const set = (stage: Stage, years: number) => {
    onChange({ ...value, [stage]: years });
  };

  const summary = (
    <div className="text-sm text-muted-foreground">
      Typical window: 4–8 years depending on stage.
    </div>
  );

  return (
    <CollapsibleCard
      title="Exit Timing (years from entry)"
      summary={summary}
      {...(className !== undefined ? { className } : {})}
    >
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {STAGES.map((s) => {
          const err = firstError(errors ?? {}, s);
          return (
            <EnhancedField
              key={s}
              id={`time-${s}-years`}
              label={STAGE_LABEL[s]}
              format="number"
              step={0.5}
              min={1}
              max={10}
              value={value[s]}
              onChange={(v: number) => set(s, v)}
              contextChip="Range: 4–8y"
              aria-invalid={!!err}
              {...(err !== undefined ? { error: err } : {})}
              disabled={disabled}
            />
          );
        })}
      </div>
    </CollapsibleCard>
  );
}

export default ExitTimingCard;
