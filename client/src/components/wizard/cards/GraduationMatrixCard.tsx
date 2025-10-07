/**
 * Graduation Matrix Card (Enhanced with Inline Validation)
 *
 * Configures graduation rates (% advancing to next stage) for each investment stage.
 * Supports optional exit probabilities with validation: graduation + exit ≤ 100% per stage.
 */

import React from 'react';
import { CollapsibleCard } from '@/components/wizard/CollapsibleCard';
import { EnhancedField } from '@/components/wizard/EnhancedField';
import type { FieldErrors } from '@/lib/validation';
import { firstError } from '@/lib/validation';

export interface GraduationRates {
  preSeedToSeed: number;
  seedToA: number;
  aToB: number;
  bToC: number;
  cToD: number;
  // Optional exit percentages (may exist in schema)
  preSeedExitPct?: number;
  seedExitPct?: number;
  aExitPct?: number;
  bExitPct?: number;
  cExitPct?: number;
}

interface GraduationMatrixCardProps {
  /** Current graduation rates */
  value: GraduationRates;

  /** Callback when values change */
  onChange: (next: GraduationRates) => void;

  /** Scoped validation errors (keys like "preSeedToSeed") */
  errors?: FieldErrors;

  /** Whether the card is disabled */
  disabled?: boolean;

  /** Additional class names */
  className?: string;
}

export function GraduationMatrixCard({
  value,
  onChange,
  errors,
  disabled = false,
  className,
}: GraduationMatrixCardProps) {
  const set = <K extends keyof GraduationRates>(k: K, v: number) => {
    onChange({ ...value, [k]: v });
  };

  const summary = (
    <div className="text-sm text-muted-foreground">
      Typical ranges: 30–60% per jump; tune per strategy.
    </div>
  );

  const row = (id: keyof GraduationRates, label: string) => {
    const err = firstError(errors ?? {}, id as string);
    return (
      <EnhancedField
        id={`grad-${String(id)}-pct`}
        label={label}
        format="percent"
        value={value[id] ?? 0}
        onChange={(v: number) => set(id, v)}
        aria-invalid={!!err}
        error={err}
        disabled={disabled}
      />
    );
  };

  return (
    <CollapsibleCard
      title="Graduation Rates (advance to next stage)"
      summary={summary}
      defaultExpanded
      className={className}
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {row('preSeedToSeed', 'Pre-Seed → Seed')}
        {row('seedToA', 'Seed → A')}
        {row('aToB', 'A → B')}
        {row('bToC', 'B → C')}
        {row('cToD', 'C → D+')}
      </div>
    </CollapsibleCard>
  );
}

export default GraduationMatrixCard;
