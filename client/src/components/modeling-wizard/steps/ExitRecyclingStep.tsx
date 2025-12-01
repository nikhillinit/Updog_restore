/**
 * Exit Recycling Step
 *
 * Step 5: Configure exit recycling policy to extend fund deployment capacity.
 * Allows recycling of exit proceeds back into new investments within policy limits.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  exitRecyclingSchema,
  type ExitRecyclingInput,
  type FundFinancialsOutput
} from '@/schemas/modeling-wizard.schemas';
import { useExitRecyclingCalculations } from '@/hooks/useExitRecyclingCalculations';
import { RecyclingSummaryCard } from './exit-recycling/RecyclingSummaryCard';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface ExitRecyclingStepProps {
  initialData?: Partial<ExitRecyclingInput>;
  onSave: (data: ExitRecyclingInput) => void;
  fundFinancials: FundFinancialsOutput;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_EXIT_RECYCLING: Partial<ExitRecyclingInput> = {
  enabled: false,
  recyclingCap: 15, // 15% typical
  recyclingPeriod: 5, // 5 years typical
  exitRecyclingRate: 75, // 75% of exit proceeds
  mgmtFeeRecyclingRate: 0 // Uncommon, default off
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ExitRecyclingStep({
  initialData,
  onSave,
  fundFinancials
}: ExitRecyclingStepProps) {
  // Form setup
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors }
  } = useForm<ExitRecyclingInput>({
    resolver: zodResolver(exitRecyclingSchema),
    defaultValues: {
      ...DEFAULT_EXIT_RECYCLING,
      ...initialData
    }
  });

  // Preserve recycling fields when toggling
  const preservedValuesRef = React.useRef<{
    recyclingCap?: number;
    recyclingPeriod?: number;
    exitRecyclingRate?: number;
    mgmtFeeRecyclingRate?: number;
  }>({});

  // Watch all form values for calculations
  const formValues = watch();
  const enabled = watch('enabled') || false;
  const recyclingCap = watch('recyclingCap') || 15;
  const exitRecyclingRate = watch('exitRecyclingRate') || 75;

  // Calculate all metrics in real-time
  const { calculations, validation } = useExitRecyclingCalculations({
    formValues,
    fundSize: fundFinancials.fundSize
  });

  // Debounced auto-save effect (750ms debounce for 1-2 saves per window)
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidDataRef = React.useRef<ExitRecyclingInput | null>(null);

  React.useEffect(() => {
    const subscription = watch(value => {
      // Clear existing debounce timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Validate data before saving
      const result = exitRecyclingSchema.safeParse(value);
      if (result.success) {
        lastValidDataRef.current = result.data;

        // Debounce save to prevent excessive calls (1-2 per 750ms window)
        saveTimeoutRef.current = setTimeout(() => {
          onSave(result.data);
        }, 750);
      }
    });

    return () => {
      subscription.unsubscribe();

      // On unmount: save immediately if there's pending valid data (no data loss)
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (lastValidDataRef.current) {
        onSave(lastValidDataRef.current);
      }
    };
  }, [watch, onSave]);

  // Toggle handler with preservation pattern
  const handleRecyclingToggle = (enabled: boolean) => {
    if (!enabled) {
      // Toggle OFF: Preserve all 4 recycling fields
      preservedValuesRef.current = {
        recyclingCap: getValues('recyclingCap'),
        recyclingPeriod: getValues('recyclingPeriod'),
        exitRecyclingRate: getValues('exitRecyclingRate'),
        mgmtFeeRecyclingRate: getValues('mgmtFeeRecyclingRate')
      };
      setValue('enabled', false);
    } else if (preservedValuesRef.current.recyclingCap !== undefined) {
      // Toggle ON: Restore all fields
      setValue('recyclingCap', preservedValuesRef.current.recyclingCap);
      setValue('recyclingPeriod', preservedValuesRef.current.recyclingPeriod);
      setValue('exitRecyclingRate', preservedValuesRef.current.exitRecyclingRate);
      setValue('mgmtFeeRecyclingRate', preservedValuesRef.current.mgmtFeeRecyclingRate);
      setValue('enabled', true);
    } else {
      // Toggle ON without preserved values
      setValue('enabled', true);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Section A: Enable/Disable Toggle */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-inter font-bold text-lg text-pov-charcoal mb-2">
              Exit Recycling
            </h3>
            <p className="text-sm text-charcoal-700 font-poppins mb-4">
              Exit recycling allows you to reinvest proceeds from early exits back into new
              portfolio companies, extending your fund's deployment capacity within policy limits.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="enabled" className="font-poppins text-charcoal-700">
                Enable Exit Recycling
              </Label>
              <p className="text-xs text-charcoal-600 font-poppins">
                Allows recycling of exit proceeds during the recycling period
              </p>
            </div>
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={handleRecyclingToggle}
            />
          </div>
        </div>
      </div>

      {/* Sections B-D: Configuration (only shown when enabled) */}
      {enabled && (
        <>
          {/* Section B: Recycling Configuration */}
          <div className="bg-charcoal-50 rounded-lg p-6">
            <div className="space-y-4">
              <h3 className="font-inter font-bold text-lg text-pov-charcoal">
                Recycling Policy
              </h3>

              {/* Recycling Cap */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <Label htmlFor="recyclingCap" className="font-poppins text-charcoal-700">
                    Recycling Cap (% of committed capital) *
                  </Label>
                  <span className="font-inter font-bold text-pov-charcoal">
                    {recyclingCap.toFixed(0)}%
                  </span>
                </div>
                <Input
                  id="recyclingCap"
                  type="range"
                  min="5"
                  max="25"
                  step="1"
                  value={recyclingCap}
                  onChange={e => setValue('recyclingCap', parseFloat(e.target.value))}
                  className="w-full"
                />
                {errors.recyclingCap && (
                  <p className="text-sm text-error mt-1">{errors.recyclingCap.message}</p>
                )}
                <div className="flex justify-between text-xs text-charcoal-600 font-poppins mt-1">
                  <span>5% (Conservative)</span>
                  <span>15% (Typical)</span>
                  <span>25% (Aggressive)</span>
                </div>
                <div className="mt-2 text-sm font-poppins text-charcoal-700">
                  Maximum recyclable: $
                  {((fundFinancials.fundSize * recyclingCap) / 100).toFixed(1)}M
                </div>
              </div>

              {/* Recycling Period */}
              <div>
                <Label htmlFor="recyclingPeriod" className="font-poppins text-charcoal-700">
                  Recycling Period (years) *
                </Label>
                <Input
                  id="recyclingPeriod"
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  {...register('recyclingPeriod', { valueAsNumber: true })}
                  className="mt-2"
                />
                {errors.recyclingPeriod && (
                  <p className="text-sm text-error mt-1">{errors.recyclingPeriod.message}</p>
                )}
                <p className="text-xs text-charcoal-600 mt-1 font-poppins">
                  Only exits within this period are eligible for recycling. Typical: 3-7 years.
                </p>
              </div>
            </div>
          </div>

          {/* Section C: Recycling Rates */}
          <div className="bg-charcoal-50 rounded-lg p-6">
            <div className="space-y-4">
              <h3 className="font-inter font-bold text-lg text-pov-charcoal">
                Recycling Rates
              </h3>

              {/* Exit Recycling Rate */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <Label htmlFor="exitRecyclingRate" className="font-poppins text-charcoal-700">
                    Exit Recycling Rate (% of exit proceeds) *
                  </Label>
                  <span className="font-inter font-bold text-pov-charcoal">
                    {exitRecyclingRate.toFixed(0)}%
                  </span>
                </div>
                <Input
                  id="exitRecyclingRate"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={exitRecyclingRate}
                  onChange={e => setValue('exitRecyclingRate', parseFloat(e.target.value))}
                  className="w-full"
                />
                {errors.exitRecyclingRate && (
                  <p className="text-sm text-error mt-1">{errors.exitRecyclingRate.message}</p>
                )}
                <div className="flex justify-between text-xs text-charcoal-600 font-poppins mt-1">
                  <span>0% (None)</span>
                  <span>50% (Moderate)</span>
                  <span>75% (Typical)</span>
                  <span>100% (Maximum)</span>
                </div>
                <p className="text-xs text-charcoal-600 mt-2 font-poppins">
                  Percentage of exit proceeds to recycle back into new investments. Remaining
                  proceeds are distributed to LPs.
                </p>
              </div>

              {/* Management Fee Recycling Rate (Optional/Advanced) */}
              <div>
                <Label
                  htmlFor="mgmtFeeRecyclingRate"
                  className="font-poppins text-charcoal-700"
                >
                  Management Fee Recycling Rate (% of fees) - Optional
                </Label>
                <Input
                  id="mgmtFeeRecyclingRate"
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  {...register('mgmtFeeRecyclingRate', { valueAsNumber: true })}
                  className="mt-2"
                  placeholder="0"
                />
                {errors.mgmtFeeRecyclingRate && (
                  <p className="text-sm text-error mt-1">
                    {errors.mgmtFeeRecyclingRate.message}
                  </p>
                )}
                <p className="text-xs text-charcoal-600 mt-1 font-poppins">
                  Uncommon provision. Allows recycling unused management fees. Typically 0%.
                  Requires specific LPA provisions.
                </p>
              </div>
            </div>
          </div>

          {/* Section D: Summary */}
          <RecyclingSummaryCard
            calculations={calculations}
            validation={validation}
            fundSize={fundFinancials.fundSize}
          />
        </>
      )}

      {/* Summary when disabled */}
      {!enabled && (
        <RecyclingSummaryCard
          calculations={calculations}
          validation={validation}
          fundSize={fundFinancials.fundSize}
        />
      )}
    </form>
  );
}
