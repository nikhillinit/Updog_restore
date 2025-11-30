/**
 * Fees & Expenses Step
 * Step 4: Management fee basis and admin expenses
 */

import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { feesExpensesSchema, type FeesExpensesInput } from '@/schemas/modeling-wizard.schemas';
import { useDebounce } from '@/hooks/useDebounce';

export interface FeesExpensesStepProps {
  initialData?: Partial<FeesExpensesInput>;
  onSave: (data: FeesExpensesInput) => void;
  shouldReset?: boolean;
}

export function FeesExpensesStep({ initialData, onSave, shouldReset }: FeesExpensesStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<FeesExpensesInput>({
    resolver: zodResolver(feesExpensesSchema),
    defaultValues: initialData || {
      managementFee: {
        rate: 2.0,
        basis: 'committed',
        stepDown: { enabled: false }
      },
      adminExpenses: {
        annualAmount: 0,
        growthRate: 3
      }
    }
  });

  const [isDirty, setIsDirty] = useState(false);
  const formValuesRef = useRef<FeesExpensesInput | null>(null);

  const stepDownEnabled = watch('managementFee.stepDown.enabled');

  // Debounced auto-save (750ms delay)
  const formValues = watch();
  const debouncedValues = useDebounce(formValues, 750);

  React.useEffect(() => {
    // Only save if validation passes (invalid data rejection)
    const parseResult = feesExpensesSchema.safeParse(debouncedValues);
    if (parseResult.success) {
      onSave(parseResult.data);
      setIsDirty(false);
    }
  }, [debouncedValues, onSave]);

  // Unmount protection: save latest valid data on component unmount
  React.useEffect(() => {
    // Capture latest form state
    const currentValues = watch();
    formValuesRef.current = currentValues as FeesExpensesInput;

    return () => {
      // On unmount, save if validation passes
      if (formValuesRef.current) {
        const parseResult = feesExpensesSchema.safeParse(formValuesRef.current);
        if (parseResult.success) {
          onSave(parseResult.data);
        }
      }
    };
  }, [watch, onSave]);

  // Track dirty state for beforeunload warning
  React.useEffect(() => {
    const subscription = watch(() => {
      setIsDirty(true);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Warn user before navigation with unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Reset form when shouldReset prop changes
  React.useEffect(() => {
    if (shouldReset) {
      reset(initialData);
      setIsDirty(false);
    }
  }, [shouldReset, reset, initialData]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      <div className="space-y-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Management Fee</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="mgmtFeeRate" className="font-poppins">
              Rate (%) *
            </Label>
            <Input
              id="mgmtFeeRate"
              type="number"
              step="0.1"
              {...register('managementFee.rate', { valueAsNumber: true })}
              placeholder="e.g., 2.0"
              className="mt-2"
            />
            {errors.managementFee?.rate && (
              <p className="text-sm text-error mt-1">{errors.managementFee.rate.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="feeBasis" className="font-poppins">
              Fee Basis *
            </Label>
            <Select
              defaultValue={initialData?.managementFee?.basis || 'committed'}
              onValueChange={(value) => setValue('managementFee.basis', value as 'committed' | 'called' | 'fmv')}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="committed">Committed Capital</SelectItem>
                <SelectItem value="called">Called Capital</SelectItem>
                <SelectItem value="fmv">Fair Market Value</SelectItem>
              </SelectContent>
            </Select>
            {errors.managementFee?.basis && (
              <p className="text-sm text-error mt-1">
                {errors.managementFee.basis.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4 p-4 bg-charcoal-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <Switch
              id="stepDownEnabled"
              {...(stepDownEnabled !== undefined ? { checked: stepDownEnabled } : {})}
              onCheckedChange={(checked) => setValue('managementFee.stepDown.enabled', checked)}
            />
            <Label htmlFor="stepDownEnabled" className="cursor-pointer font-poppins">
              Enable Fee Step-Down
            </Label>
          </div>

          {stepDownEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="stepDownYear" className="font-poppins">
                  After Year
                </Label>
                <Input
                  id="stepDownYear"
                  type="number"
                  {...register('managementFee.stepDown.afterYear', { valueAsNumber: true })}
                  placeholder="e.g., 5"
                  className="mt-2"
                />
                {errors.managementFee?.stepDown?.afterYear && (
                  <p className="text-sm text-error mt-1">
                    {errors.managementFee.stepDown.afterYear.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="newRate" className="font-poppins">
                  New Rate (%)
                </Label>
                <Input
                  id="newRate"
                  type="number"
                  step="0.1"
                  {...register('managementFee.stepDown.newRate', { valueAsNumber: true })}
                  placeholder="e.g., 1.5"
                  className="mt-2"
                />
                {errors.managementFee?.stepDown?.newRate && (
                  <p className="text-sm text-error mt-1">
                    {errors.managementFee.stepDown.newRate.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Admin Expenses</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="annualAmount" className="font-poppins">
              Annual Amount ($M) *
            </Label>
            <Input
              id="annualAmount"
              type="number"
              step="0.01"
              {...register('adminExpenses.annualAmount', { valueAsNumber: true })}
              placeholder="e.g., 0.5"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="growthRate" className="font-poppins">
              Growth Rate (%) *
            </Label>
            <Input
              id="growthRate"
              type="number"
              step="0.1"
              {...register('adminExpenses.growthRate', { valueAsNumber: true })}
              placeholder="e.g., 3.0"
              className="mt-2"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
