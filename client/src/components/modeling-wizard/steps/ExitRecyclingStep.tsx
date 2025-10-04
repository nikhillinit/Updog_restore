/**
 * Exit Recycling Step
 * Step 5: Optional recycling configuration
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { exitRecyclingSchema, type ExitRecyclingInput } from '@/schemas/modeling-wizard.schemas';

export interface ExitRecyclingStepProps {
  initialData?: Partial<ExitRecyclingInput>;
  onSave: (data: ExitRecyclingInput) => void;
}

export function ExitRecyclingStep({ initialData, onSave }: ExitRecyclingStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<ExitRecyclingInput>({
    resolver: zodResolver(exitRecyclingSchema),
    defaultValues: initialData || {
      enabled: false
    }
  });

  const enabled = watch('enabled');

  React.useEffect(() => {
    const subscription = watch((value) => {
      exitRecyclingSchema.safeParse(value).success && onSave(value as ExitRecyclingInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="font-poppins">
          Exit recycling allows you to reinvest distributions from exits back into the fund.
          This step is optional and can be skipped if not applicable.
        </AlertDescription>
      </Alert>

      <div className="space-y-6">
        <div className="flex items-center space-x-3 p-4 bg-charcoal-50 rounded-lg">
          <Switch
            id="enabled"
            checked={enabled}
            onCheckedChange={(checked) => setValue('enabled', checked)}
          />
          <Label htmlFor="enabled" className="cursor-pointer font-poppins font-medium">
            Enable Exit Recycling
          </Label>
        </div>

        {enabled && (
          <div className="space-y-6 pt-4">
            <h3 className="font-inter font-bold text-lg text-pov-charcoal">
              Recycling Configuration
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="recyclingCap" className="font-poppins">
                  Recycling Cap (%) *
                </Label>
                <Input
                  id="recyclingCap"
                  type="number"
                  step="0.1"
                  {...register('recyclingCap', { valueAsNumber: true })}
                  placeholder="e.g., 20"
                  className="mt-2"
                />
                {errors.recyclingCap && (
                  <p className="text-sm text-error mt-1">{errors.recyclingCap.message}</p>
                )}
                <p className="text-xs text-charcoal-500 mt-1">
                  Maximum % of fund size that can be recycled
                </p>
              </div>

              <div>
                <Label htmlFor="recyclingPeriod" className="font-poppins">
                  Recycling Period (years) *
                </Label>
                <Input
                  id="recyclingPeriod"
                  type="number"
                  {...register('recyclingPeriod', { valueAsNumber: true })}
                  placeholder="e.g., 5"
                  className="mt-2"
                />
                {errors.recyclingPeriod && (
                  <p className="text-sm text-error mt-1">{errors.recyclingPeriod.message}</p>
                )}
                <p className="text-xs text-charcoal-500 mt-1">
                  Years during which recycling is allowed
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exitRecyclingRate" className="font-poppins">
                  Exit Recycling Rate (%)
                </Label>
                <Input
                  id="exitRecyclingRate"
                  type="number"
                  step="0.1"
                  {...register('exitRecyclingRate', { valueAsNumber: true })}
                  placeholder="e.g., 100"
                  className="mt-2"
                />
                <p className="text-xs text-charcoal-500 mt-1">
                  % of exit proceeds to recycle
                </p>
              </div>

              <div>
                <Label htmlFor="mgmtFeeRecyclingRate" className="font-poppins">
                  Mgmt Fee Recycling Rate (%)
                </Label>
                <Input
                  id="mgmtFeeRecyclingRate"
                  type="number"
                  step="0.1"
                  {...register('mgmtFeeRecyclingRate', { valueAsNumber: true })}
                  placeholder="e.g., 0"
                  className="mt-2"
                />
                <p className="text-xs text-charcoal-500 mt-1">
                  % of management fees to recycle
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
