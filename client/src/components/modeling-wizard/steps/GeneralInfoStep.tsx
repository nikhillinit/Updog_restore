/**
 * General Info Step
 * Step 1: Fund basics, vintage year, and size
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
import { generalInfoSchema, type GeneralInfoInput } from '@/schemas/modeling-wizard.schemas';

export interface GeneralInfoStepProps {
  initialData?: Partial<GeneralInfoInput>;
  onSave: (data: GeneralInfoInput) => void;
}

export function GeneralInfoStep({ initialData, onSave }: GeneralInfoStepProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<GeneralInfoInput>({
    resolver: zodResolver(generalInfoSchema),
    defaultValues: initialData || {
      isEvergreen: false,
      currency: 'USD',
    },
  });

  const isEvergreen = watch('isEvergreen');
  const establishmentDate = watch('establishmentDate');

  // Preserve fund life and investment period when toggling evergreen
  const preservedValuesRef = useRef<{
    fundLife?: number;
    investmentPeriod?: number;
  }>({});

  const handleEvergreenToggle = (enabled: boolean) => {
    if (enabled) {
      // Preserve current values before switching to evergreen
      const fundLife = getValues('fundLife');
      const investmentPeriod = getValues('investmentPeriod');
      preservedValuesRef.current = {
        ...(fundLife !== undefined && { fundLife }),
        ...(investmentPeriod !== undefined && { investmentPeriod }),
      };
      setValue('isEvergreen', true);
    } else {
      // Restore preserved values when switching from evergreen
      if (preservedValuesRef.current.fundLife !== undefined) {
        setValue('fundLife', preservedValuesRef.current.fundLife);
      }
      if (preservedValuesRef.current.investmentPeriod !== undefined) {
        setValue('investmentPeriod', preservedValuesRef.current.investmentPeriod);
      }
      setValue('isEvergreen', false);
    }
  };

  // Auto-derive vintage year from establishment date
  React.useEffect(() => {
    if (establishmentDate) {
      const year = new Date(establishmentDate).getFullYear();
      setValue('vintageYear', year);
    }
  }, [establishmentDate, setValue]);

  // Auto-save on form changes
  React.useEffect(() => {
    const subscription = watch((value) => {
      // Validate and save
      generalInfoSchema.safeParse(value).success && onSave(value as GeneralInfoInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Fund Structure Section */}
      <div className="space-y-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Fund Structure</h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="fundName" className="font-poppins">
              Fund Name *
            </Label>
            <Input
              id="fundName"
              {...register('fundName')}
              placeholder="Enter your fund name"
              className="mt-2"
            />
            {errors.fundName && (
              <p className="text-sm text-error mt-1">{errors.fundName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="establishmentDate" className="font-poppins">
                Establishment Date *
              </Label>
              <Input
                id="establishmentDate"
                type="date"
                {...register('establishmentDate')}
                className="mt-2"
              />
              {errors.establishmentDate && (
                <p className="text-sm text-error mt-1">{errors.establishmentDate.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="vintageYear" className="font-poppins">
                Vintage Year
              </Label>
              <Input
                id="vintageYear"
                type="number"
                {...register('vintageYear', { valueAsNumber: true })}
                placeholder="Auto-filled from establishment date"
                className="mt-2 bg-charcoal-50"
                readOnly
              />
              {errors.vintageYear && (
                <p className="text-sm text-error mt-1">{errors.vintageYear.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fundSize" className="font-poppins">
                Target Fund Size ($M) *
              </Label>
              <Input
                id="fundSize"
                type="number"
                step="0.1"
                {...register('fundSize', { valueAsNumber: true })}
                placeholder="e.g., 100"
                className="mt-2"
              />
              {errors.fundSize && (
                <p className="text-sm text-error mt-1">{errors.fundSize.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="currency" className="font-poppins">
                Currency *
              </Label>
              <Select
                defaultValue={initialData?.currency || 'USD'}
                onValueChange={(value) => setValue('currency', value as 'USD' | 'EUR' | 'GBP')}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
              {errors.currency && (
                <p className="text-sm text-error mt-1">{errors.currency.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3 py-4 border-t border-charcoal-200">
            <Switch
              id="isEvergreen"
              checked={isEvergreen || false}
              onCheckedChange={handleEvergreenToggle}
            />
            <Label htmlFor="isEvergreen" className="cursor-pointer font-poppins">
              Evergreen Fund Structure
            </Label>
          </div>

          {!isEvergreen && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fundLife" className="font-poppins">
                  Fund Life (years) *
                </Label>
                <Input
                  id="fundLife"
                  type="number"
                  {...register('fundLife', { valueAsNumber: true })}
                  placeholder="e.g., 10"
                  className="mt-2"
                />
                {errors.fundLife && (
                  <p className="text-sm text-error mt-1">{errors.fundLife.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="investmentPeriod" className="font-poppins">
                  Investment Period (years) *
                </Label>
                <Input
                  id="investmentPeriod"
                  type="number"
                  {...register('investmentPeriod', { valueAsNumber: true })}
                  placeholder="e.g., 3"
                  className="mt-2"
                />
                {errors.investmentPeriod && (
                  <p className="text-sm text-error mt-1">{errors.investmentPeriod.message}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
