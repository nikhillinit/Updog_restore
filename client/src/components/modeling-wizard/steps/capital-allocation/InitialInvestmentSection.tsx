/**
 * Initial Investment Section
 *
 * UI for configuring initial investment strategy (amount-based or ownership-based).
 * Displays calculated metrics like implied ownership and number of deals.
 */

import React from 'react';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  CapitalAllocationInput,
  EntryStrategy
} from '@/schemas/modeling-wizard.schemas';
import type { CapitalAllocationCalculations } from '@/lib/capital-allocation-calculations';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface InitialInvestmentSectionProps {
  control: Control<CapitalAllocationInput>;
  register: UseFormRegister<CapitalAllocationInput>;
  calculations: CapitalAllocationCalculations;
  errors: FieldErrors<CapitalAllocationInput>;
  entryStrategy: EntryStrategy;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InitialInvestmentSection({
  control,
  register,
  calculations,
  errors,
  entryStrategy
}: InitialInvestmentSectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Initial Investment Strategy
        </h3>
      </div>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm font-poppins">
          <strong>Initial Strategy</strong> defines how your fund makes first investments.
          Choose amount-based for fixed check sizes, or ownership-based for target ownership percentages.
        </AlertDescription>
      </Alert>

      {/* Entry Strategy Selection */}
      <div>
        <Label className="font-poppins text-charcoal-700">Entry Strategy *</Label>
        <Controller
          name="entryStrategy"
          control={control}
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className="mt-3 space-y-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="amount-based" id="amount-based" />
                <Label htmlFor="amount-based" className="font-poppins font-normal cursor-pointer">
                  <span className="font-inter font-bold text-pov-charcoal">Amount-Based</span>
                  <span className="text-charcoal-600 ml-2">
                    - Fixed check size (e.g., $1.0M per deal)
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ownership-based" id="ownership-based" />
                <Label htmlFor="ownership-based" className="font-poppins font-normal cursor-pointer">
                  <span className="font-inter font-bold text-pov-charcoal">Ownership-Based</span>
                  <span className="text-charcoal-600 ml-2">
                    - Target ownership percentage (e.g., 15% ownership)
                  </span>
                </Label>
              </div>
            </RadioGroup>
          )}
        />
        {errors.entryStrategy && (
          <p className="text-sm text-error mt-1">{errors.entryStrategy.message}</p>
        )}
      </div>

      {/* Amount-Based Input */}
      {entryStrategy === 'amount-based' && (
        <div>
          <Label htmlFor="initialCheckSize" className="font-poppins text-charcoal-700">
            Initial Check Size ($M) *
          </Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500 font-poppins">
              $
            </span>
            <Input
              id="initialCheckSize"
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              {...register('initialCheckSize', { valueAsNumber: true })}
              placeholder="1.0"
              className="pl-7"
            />
          </div>
          {errors.initialCheckSize && (
            <p className="text-sm text-error mt-1">{errors.initialCheckSize.message}</p>
          )}
          <p className="text-xs text-charcoal-600 mt-1 font-poppins">
            Amount invested in each company at entry
          </p>
        </div>
      )}

      {/* Ownership-Based Input */}
      {entryStrategy === 'ownership-based' && (
        <>
          <div>
            <Label htmlFor="targetEntryOwnership" className="font-poppins text-charcoal-700">
              Target Entry Ownership (%) *
            </Label>
            <Input
              id="targetEntryOwnership"
              type="number"
              step="0.5"
              min="5"
              max="30"
              {...register('targetEntryOwnership', { valueAsNumber: true })}
              placeholder="15"
              className="mt-2"
            />
            {errors.targetEntryOwnership && (
              <p className="text-sm text-error mt-1">{errors.targetEntryOwnership.message}</p>
            )}
            <p className="text-xs text-charcoal-600 mt-1 font-poppins">
              Percentage of company you aim to own after entry investment
            </p>
          </div>

          {/* Calculated Check Size (for ownership-based) */}
          <div className="bg-white rounded-lg border border-charcoal-200 p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-poppins text-charcoal-700">
                Calculated Check Size:
              </span>
              <span className="font-inter font-bold text-base text-pov-charcoal">
                ${(calculations.avgRoundSize * ((register('targetEntryOwnership' as any).value || 15) / 100)).toFixed(2)}M
              </span>
            </div>
            <p className="text-xs text-charcoal-600 mt-1 font-poppins">
              Based on average round size and target ownership
            </p>
          </div>
        </>
      )}

      {/* Calculated Metrics Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        {/* Implied Ownership */}
        <div className="bg-white rounded-lg border border-charcoal-200 p-4">
          <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
            Implied Entry Ownership
          </div>
          <div className="font-inter font-bold text-2xl text-pov-charcoal">
            {calculations.impliedOwnership.toFixed(1)}%
          </div>
          <p className="text-xs text-charcoal-600 mt-1 font-poppins">
            Based on weighted avg round size
          </p>
        </div>

        {/* Number of Deals */}
        <div className="bg-white rounded-lg border border-charcoal-200 p-4">
          <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
            Number of Deals
          </div>
          <div className="font-inter font-bold text-2xl text-pov-charcoal">
            {calculations.estimatedDeals}
          </div>
          <p className="text-xs text-charcoal-600 mt-1 font-poppins">
            Over investment period
          </p>
        </div>

        {/* Capital Allocated */}
        <div className="bg-white rounded-lg border border-charcoal-200 p-4">
          <div className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide mb-1">
            Capital Allocated
          </div>
          <div className="font-inter font-bold text-2xl text-pov-charcoal">
            ${calculations.initialCapitalAllocated.toFixed(1)}M
          </div>
          <p className="text-xs text-charcoal-600 mt-1 font-poppins">
            To initial investments
          </p>
        </div>
      </div>

      {/* Warning for high allocation */}
      {calculations.initialCapitalAllocated > (calculations.totalCapitalAllocated + calculations.remainingCapital) * 0.7 && (
        <Alert variant="warning">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm font-poppins">
            Initial investments consume {((calculations.initialCapitalAllocated / (calculations.totalCapitalAllocated + calculations.remainingCapital)) * 100).toFixed(1)}% of fund.
            Consider reserving more capital for follow-on investments.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
