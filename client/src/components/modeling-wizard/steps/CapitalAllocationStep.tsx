/**
 * Capital Allocation Step
 *
 * Step 3: Initial investment strategy, follow-on allocations, and pacing schedule.
 * Integrates with calculation engines to model capital deployment across portfolio.
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  capitalAllocationSchema,
  type CapitalAllocationInput,
  type FundFinancialsOutput,
  type SectorProfile
} from '@/schemas/modeling-wizard.schemas';
import { useCapitalAllocationCalculations } from '@/hooks/useCapitalAllocationCalculations';
import { InitialInvestmentSection } from './capital-allocation/InitialInvestmentSection';
import { FollowOnStrategyTable } from './capital-allocation/FollowOnStrategyTable';
import { PacingHorizonBuilder } from './capital-allocation/PacingHorizonBuilder';
import { CalculationSummaryCard } from './capital-allocation/CalculationSummaryCard';
import { generateDefaultPacingPeriods } from '@/lib/capital-allocation-calculations';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface CapitalAllocationStepProps {
  initialData?: Partial<CapitalAllocationInput>;
  onSave: (data: CapitalAllocationInput) => void;
  fundFinancials: FundFinancialsOutput;
  sectorProfiles: SectorProfile[];
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_CAPITAL_ALLOCATION: Partial<CapitalAllocationInput> = {
  entryStrategy: 'amount-based',
  initialCheckSize: 1.0,
  followOnStrategy: {
    reserveRatio: 0.5,
    stageAllocations: []
  },
  pacingModel: {
    investmentsPerYear: 10,
    deploymentCurve: 'linear'
  },
  pacingHorizon: []
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CapitalAllocationStep({
  initialData,
  onSave,
  fundFinancials,
  sectorProfiles
}: CapitalAllocationStepProps) {
  // Form setup
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors }
  } = useForm<CapitalAllocationInput>({
    resolver: zodResolver(capitalAllocationSchema),
    defaultValues: {
      ...DEFAULT_CAPITAL_ALLOCATION,
      ...initialData,
      // Initialize pacing horizon if not provided
      pacingHorizon:
        initialData?.pacingHorizon ||
        generateDefaultPacingPeriods(fundFinancials.investmentPeriod, 'linear')
    }
  });

  // Watch all form values for calculations
  const formValues = watch();
  const entryStrategy = watch('entryStrategy') || 'amount-based';
  const reserveRatio = watch('followOnStrategy.reserveRatio');

  // Calculate all metrics in real-time
  const { calculations, validation } = useCapitalAllocationCalculations({
    formValues,
    fundFinancials,
    sectorProfiles,
    vintageYear: new Date().getFullYear()
  });

  // Auto-save effect
  React.useEffect(() => {
    const subscription = watch(value => {
      const result = capitalAllocationSchema.safeParse(value);
      if (result.success) {
        onSave(result.data);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Section A: Initial Investment Strategy */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <InitialInvestmentSection
          control={control}
          register={register}
          calculations={calculations}
          errors={errors}
          entryStrategy={entryStrategy}
        />
      </div>

      {/* Reserve Ratio Configuration */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <div className="space-y-4">
          <h3 className="font-inter font-bold text-lg text-pov-charcoal">
            Reserve Strategy
          </h3>
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label htmlFor="reserveRatio" className="font-poppins text-charcoal-700">
                Reserve Ratio (% of fund for follow-ons) *
              </Label>
              <span className="font-inter font-bold text-pov-charcoal">
                {(reserveRatio * 100).toFixed(0)}%
              </span>
            </div>
            <Input
              id="reserveRatio"
              type="range"
              min="30"
              max="70"
              step="5"
              value={reserveRatio * 100}
              onChange={e =>
                setValue(
                  'followOnStrategy.reserveRatio',
                  parseFloat(e.target.value) / 100
                )
              }
              className="w-full"
            />
            {errors.followOnStrategy?.reserveRatio && (
              <p className="text-sm text-error mt-1">
                {errors.followOnStrategy.reserveRatio.message}
              </p>
            )}
            <div className="flex justify-between text-xs text-charcoal-600 font-poppins mt-1">
              <span>30% (Conservative)</span>
              <span>50% (Balanced)</span>
              <span>70% (Aggressive)</span>
            </div>
            <div className="mt-2 text-sm font-poppins text-charcoal-700">
              Available reserves: ${(fundFinancials.fundSize * reserveRatio).toFixed(1)}M
            </div>
          </div>
        </div>
      </div>

      {/* Section B: Follow-On Strategy Table */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <FollowOnStrategyTable
          sectorProfiles={sectorProfiles}
          stageAllocations={formValues.followOnStrategy.stageAllocations}
          calculations={calculations.followOnAllocations}
          onChange={allocations =>
            setValue('followOnStrategy.stageAllocations', allocations)
          }
          errors={errors.followOnStrategy}
        />
      </div>

      {/* Investments Per Year */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <div className="space-y-4">
          <h3 className="font-inter font-bold text-lg text-pov-charcoal">
            Pacing Model
          </h3>
          <div>
            <Label htmlFor="investmentsPerYear" className="font-poppins text-charcoal-700">
              Investments Per Year *
            </Label>
            <Input
              id="investmentsPerYear"
              type="number"
              min="1"
              max="50"
              {...register('pacingModel.investmentsPerYear', { valueAsNumber: true })}
              className="mt-2"
            />
            {errors.pacingModel?.investmentsPerYear && (
              <p className="text-sm text-error mt-1">
                {errors.pacingModel.investmentsPerYear.message}
              </p>
            )}
            <p className="text-xs text-charcoal-600 mt-1 font-poppins">
              Number of new portfolio companies to invest in each year during the{' '}
              {fundFinancials.investmentPeriod}-year investment period
            </p>
          </div>
        </div>
      </div>

      {/* Section C: Pacing Horizon */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <PacingHorizonBuilder
          periods={formValues.pacingHorizon}
          fundFinancials={fundFinancials}
          onChange={periods => setValue('pacingHorizon', periods)}
          errors={errors.pacingHorizon as any}
        />
      </div>

      {/* Section D: Calculation Summary */}
      <CalculationSummaryCard
        calculations={calculations}
        validation={validation}
        fundSize={fundFinancials.fundSize}
      />
    </form>
  );
}
