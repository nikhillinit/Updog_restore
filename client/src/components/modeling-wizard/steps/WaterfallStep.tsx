/**
 * Waterfall Step
 * Step 6: Distribution waterfall configuration (American vs European)
 *
 * Uses existing waterfall helpers from @/lib/waterfall for type-safe updates
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { WaterfallSchema, type Waterfall } from '@shared/types';
import { changeWaterfallType, applyWaterfallChange } from '@/lib/waterfall';
import { WaterfallConfig } from './waterfall/WaterfallConfig';
import { WaterfallSummaryCard } from './waterfall/WaterfallSummaryCard';

export interface WaterfallStepProps {
  initialData?: Partial<Waterfall>;
  onSave: (data: Waterfall) => void;
}

/**
 * Default waterfall configuration
 */
const DEFAULT_WATERFALL: Waterfall = {
  type: 'AMERICAN',
  carryVesting: {
    cliffYears: 0,
    vestingYears: 4
  }
};

export function WaterfallStep({ initialData, onSave }: WaterfallStepProps) {
  const {
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<Waterfall>({
    resolver: zodResolver(WaterfallSchema),
    defaultValues: initialData || DEFAULT_WATERFALL,
    mode: 'onChange'
  });

  const waterfall = watch();

  /**
   * Handle waterfall type change (AMERICAN ↔ EUROPEAN)
   * Uses schema-backed helper to ensure correct defaults
   */
  const handleTypeChange = React.useCallback((newType: Waterfall['type']) => {
    const updated = changeWaterfallType(waterfall, newType);

    // Update all fields to match new type structure
    setValue('type', updated.type, { shouldValidate: true });
    setValue('carryVesting', updated.carryVesting, { shouldValidate: true });

    if (updated.type === 'EUROPEAN') {
      setValue('hurdle', updated.hurdle, { shouldValidate: true });
      setValue('catchUp', updated.catchUp, { shouldValidate: true });
    }
  }, [waterfall, setValue]);

  /**
   * Handle field updates with validation and clamping
   * Uses existing helper for type-safe updates
   */
  const handleFieldChange = React.useCallback(<K extends keyof Waterfall>(
    field: K,
    value: Waterfall[K]
  ) => {
    const updated = applyWaterfallChange(waterfall, field as string, value);

    // Only update if value changed (performance optimization)
    if (updated !== waterfall) {
      setValue(field, updated[field], { shouldValidate: true });
    }
  }, [waterfall, setValue]);

  /**
   * Auto-save when valid
   */
  React.useEffect(() => {
    if (isValid) {
      onSave(waterfall);
    }
  }, [waterfall, isValid, onSave]);

  return (
    <div className="space-y-8">
      {/* Configuration Form */}
      <WaterfallConfig
        waterfall={waterfall}
        errors={errors}
        onTypeChange={handleTypeChange}
        onFieldChange={handleFieldChange}
      />

      {/* Summary Card */}
      <WaterfallSummaryCard
        waterfall={waterfall}
      />
    </div>
  );
}
