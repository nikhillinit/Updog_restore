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
import { applyWaterfallChange } from '@/lib/waterfall';
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
   * Handle field updates with validation and clamping
   * Uses existing helper for type-safe updates
   */
  const handleFieldChange = React.useCallback((
    field: string,
    value: unknown
  ) => {
    const updated = applyWaterfallChange(waterfall, field, value);

    // Only update if value changed (performance optimization)
    if (updated !== waterfall) {
      // Use type assertion since we know the structure is valid
      Object.keys(updated).forEach((key) => {
        setValue(key as 'type' | 'carryVesting', (updated as any)[key], { shouldValidate: true });
      });
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
        onFieldChange={handleFieldChange}
      />

      {/* Summary Card */}
      <WaterfallSummaryCard
        waterfall={waterfall}
      />
    </div>
  );
}
