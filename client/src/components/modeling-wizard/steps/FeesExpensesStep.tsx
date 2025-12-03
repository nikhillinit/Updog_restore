/**
 * Fees & Expenses Step
 * Step 4: Management fee basis and admin expenses
 */

import React, { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { feesExpensesSchema, type FeesExpensesInput } from '@/schemas/modeling-wizard.schemas';

export interface FeesExpensesStepProps {
  initialData?: Partial<FeesExpensesInput>;
  onSave: (data: FeesExpensesInput) => void;
}

export function FeesExpensesStep({ initialData, onSave }: FeesExpensesStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FeesExpensesInput>({
    resolver: zodResolver(feesExpensesSchema),
    defaultValues: initialData || {
      managementFee: {
        rate: 2.0,
        basis: 'committed',
        stepDown: { enabled: false },
      },
      adminExpenses: {
        annualAmount: 0,
        growthRate: 3,
      },
    },
  });

  // Preserve step-down fields when toggling
  const preservedValuesRef = useRef<{
    stepDown?: { afterYear: number | undefined; newRate: number | undefined };
  }>({});

  const stepDownEnabled = watch('managementFee.stepDown.enabled');

  React.useEffect(() => {
    const subscription = watch((value) => {
      feesExpensesSchema.safeParse(value).success && onSave(value as FeesExpensesInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  // Toggle handler with preservation pattern
  const handleStepDownToggle = (enabled: boolean) => {
    if (!enabled) {
      // Toggle OFF: Preserve nested fields
      preservedValuesRef.current.stepDown = {
        afterYear: getValues('managementFee.stepDown.afterYear'),
        newRate: getValues('managementFee.stepDown.newRate'),
      };
      setValue('managementFee.stepDown.enabled', false);
    } else if (preservedValuesRef.current.stepDown) {
      // Toggle ON: Restore from ref
      setValue('managementFee.stepDown.afterYear', preservedValuesRef.current.stepDown.afterYear);
      setValue('managementFee.stepDown.newRate', preservedValuesRef.current.stepDown.newRate);
      setValue('managementFee.stepDown.enabled', true);
    } else {
      // Toggle ON without preserved values
      setValue('managementFee.stepDown.enabled', true);
    }
  };

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
              onValueChange={(value) =>
                setValue('managementFee.basis', value as 'committed' | 'called' | 'fmv')
              }
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
          </div>
        </div>

        <div className="space-y-4 p-4 bg-charcoal-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <Switch
              id="stepDownEnabled"
              {...(stepDownEnabled !== undefined ? { checked: stepDownEnabled } : {})}
              onCheckedChange={handleStepDownToggle}
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
