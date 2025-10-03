/**
 * Capital Allocation Step
 * Step 3: Initial checks, follow-on strategy, pacing
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { capitalAllocationSchema, type CapitalAllocationInput } from '@/schemas/modeling-wizard.schemas';

export interface CapitalAllocationStepProps {
  initialData?: Partial<CapitalAllocationInput>;
  onSave: (data: CapitalAllocationInput) => void;
}

export function CapitalAllocationStep({ initialData, onSave }: CapitalAllocationStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<CapitalAllocationInput>({
    resolver: zodResolver(capitalAllocationSchema),
    defaultValues: initialData || {
      followOnStrategy: {
        reserveRatio: 0.5,
        followOnChecks: { A: 0, B: 0, C: 0 }
      },
      pacingModel: {
        investmentsPerYear: 10,
        deploymentCurve: 'linear'
      }
    }
  });

  React.useEffect(() => {
    const subscription = watch((value) => {
      capitalAllocationSchema.safeParse(value).success && onSave(value as CapitalAllocationInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      <div className="space-y-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Initial Investment</h3>
        <div>
          <Label htmlFor="initialCheckSize" className="font-poppins">
            Initial Check Size ($M) *
          </Label>
          <Input
            id="initialCheckSize"
            type="number"
            step="0.1"
            {...register('initialCheckSize', { valueAsNumber: true })}
            placeholder="e.g., 1.0"
            className="mt-2"
          />
          {errors.initialCheckSize && (
            <p className="text-sm text-error mt-1">{errors.initialCheckSize.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Follow-On Strategy</h3>

        <div>
          <Label htmlFor="reserveRatio" className="font-poppins">
            Reserve Ratio (0-1) *
          </Label>
          <Input
            id="reserveRatio"
            type="number"
            step="0.01"
            {...register('followOnStrategy.reserveRatio', { valueAsNumber: true })}
            placeholder="e.g., 0.5"
            className="mt-2"
          />
          {errors.followOnStrategy?.reserveRatio && (
            <p className="text-sm text-error mt-1">{errors.followOnStrategy.reserveRatio.message}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="checkA" className="font-poppins">Check A ($M)</Label>
            <Input
              id="checkA"
              type="number"
              step="0.1"
              {...register('followOnStrategy.followOnChecks.A', { valueAsNumber: true })}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="checkB" className="font-poppins">Check B ($M)</Label>
            <Input
              id="checkB"
              type="number"
              step="0.1"
              {...register('followOnStrategy.followOnChecks.B', { valueAsNumber: true })}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="checkC" className="font-poppins">Check C ($M)</Label>
            <Input
              id="checkC"
              type="number"
              step="0.1"
              {...register('followOnStrategy.followOnChecks.C', { valueAsNumber: true })}
              className="mt-2"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Pacing Model</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="investmentsPerYear" className="font-poppins">
              Investments Per Year *
            </Label>
            <Input
              id="investmentsPerYear"
              type="number"
              {...register('pacingModel.investmentsPerYear', { valueAsNumber: true })}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="deploymentCurve" className="font-poppins">
              Deployment Curve *
            </Label>
            <Select
              defaultValue={initialData?.pacingModel?.deploymentCurve || 'linear'}
              onValueChange={(value) => setValue('pacingModel.deploymentCurve', value as any)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Linear</SelectItem>
                <SelectItem value="front-loaded">Front-Loaded</SelectItem>
                <SelectItem value="back-loaded">Back-Loaded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </form>
  );
}
