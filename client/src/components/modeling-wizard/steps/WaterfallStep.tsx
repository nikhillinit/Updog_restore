/**
 * Waterfall Step
 * Step 6: Distribution waterfall configuration (American waterfall)
 *
 * Uses existing waterfall helpers from @/lib/waterfall for type-safe updates
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { WaterfallSchema, type Waterfall } from '@shared/types';
import { applyWaterfallChange } from '@/lib/waterfall';
import { useDebounceDeep } from '@/hooks/useDebounceDeep';
import { WaterfallConfig } from './waterfall/WaterfallConfig';
import { WaterfallSummaryCard } from './waterfall/WaterfallSummaryCard';

export interface WaterfallStepProps {
  initialData?: Partial<Waterfall>;
  onSave: (data: Waterfall) => void;
}

/**
 * Default waterfall configuration (American)
 */
const DEFAULT_WATERFALL: Waterfall = {
  type: 'AMERICAN',
  carryVesting: {
    cliffYears: 0,
    vestingYears: 4,
  },
};

export function WaterfallStep({ initialData, onSave }: WaterfallStepProps) {
  const {
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<Waterfall>({
    resolver: zodResolver(WaterfallSchema),
    defaultValues: initialData || DEFAULT_WATERFALL,
    mode: 'onChange',
  });

  const waterfall = watch();

  // Debounce form values to prevent watch() from defeating memoization
  // watch() returns new object every render -> breaks memoization
  // Debouncing with deep equality ensures stable references for auto-save
  const debouncedWaterfall = useDebounceDeep(waterfall, 250);

  /**
   * Handle field updates with validation and clamping
   * Uses existing helper for type-safe updates
   */
  const handleFieldChange = React.useCallback(
    (field: string, value: unknown) => {
      const updated = applyWaterfallChange(waterfall, field, value);

      // Only update if value changed (performance optimization)
      if (updated !== waterfall) {
        if ('carryVesting' in updated) {
          setValue('carryVesting', updated.carryVesting, { shouldValidate: true });
        }
      }
    },
    [waterfall, setValue]
  );

  /**
   * Auto-save when valid (uses debounced value to prevent excessive saves)
   */
  React.useEffect(() => {
    if (isValid) {
      onSave(debouncedWaterfall);
    }
  }, [debouncedWaterfall, isValid, onSave]);

  return (
    <div className="space-y-8">
      {/* Configuration Form */}
      <WaterfallConfig waterfall={waterfall} errors={errors} onFieldChange={handleFieldChange} />

      {/* Summary Card */}
      <WaterfallSummaryCard waterfall={waterfall} />
    </div>
  );
}
