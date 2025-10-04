/**
 * Waterfall Step
 * Step 6: Distribution waterfall configuration
 */

import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { waterfallSchema, type WaterfallInput } from '@/schemas/modeling-wizard.schemas';

export interface WaterfallStepProps {
  initialData?: Partial<WaterfallInput>;
  onSave: (data: WaterfallInput) => void;
}

export function WaterfallStep({ initialData, onSave }: WaterfallStepProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<WaterfallInput>({
    resolver: zodResolver(waterfallSchema),
    defaultValues: initialData || {
      type: 'american',
      preferredReturn: 8,
      catchUp: 100,
      carriedInterest: 20,
      tiers: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'tiers'
  });

  React.useEffect(() => {
    const subscription = watch((value) => {
      waterfallSchema.safeParse(value).success && onSave(value as WaterfallInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      <div className="space-y-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Waterfall Structure</h3>

        <div>
          <Label htmlFor="type" className="font-poppins">
            Waterfall Type *
          </Label>
          <Select
            defaultValue={initialData?.type || 'american'}
            onValueChange={(value) => setValue('type', value as any)}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="american">American</SelectItem>
              <SelectItem value="european">European</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
          {errors.type && (
            <p className="text-sm text-error mt-1">{errors.type.message}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="preferredReturn" className="font-poppins">
              Preferred Return (%) *
            </Label>
            <Input
              id="preferredReturn"
              type="number"
              step="0.1"
              {...register('preferredReturn', { valueAsNumber: true })}
              placeholder="e.g., 8"
              className="mt-2"
            />
            {errors.preferredReturn && (
              <p className="text-sm text-error mt-1">{errors.preferredReturn.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="catchUp" className="font-poppins">
              Catch-Up (%) *
            </Label>
            <Input
              id="catchUp"
              type="number"
              step="0.1"
              {...register('catchUp', { valueAsNumber: true })}
              placeholder="e.g., 100"
              className="mt-2"
            />
            {errors.catchUp && (
              <p className="text-sm text-error mt-1">{errors.catchUp.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="carriedInterest" className="font-poppins">
              Carried Interest (%) *
            </Label>
            <Input
              id="carriedInterest"
              type="number"
              step="0.1"
              {...register('carriedInterest', { valueAsNumber: true })}
              placeholder="e.g., 20"
              className="mt-2"
            />
            {errors.carriedInterest && (
              <p className="text-sm text-error mt-1">{errors.carriedInterest.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <div className="flex items-center justify-between">
          <h3 className="font-inter font-bold text-lg text-pov-charcoal">
            Custom Tiers (Optional)
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({
              id: crypto.randomUUID(),
              name: '',
              threshold: 0,
              gpSplit: 20,
              lpSplit: 80
            })}
            className="font-poppins"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Tier
          </Button>
        </div>

        {fields.length > 0 && (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start p-4 bg-charcoal-50 rounded-lg">
                <div className="flex-1 grid grid-cols-4 gap-4">
                  <div>
                    <Label className="font-poppins text-sm">Tier Name</Label>
                    <Input
                      {...register(`tiers.${index}.name`)}
                      placeholder="e.g., Tier 1"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="font-poppins text-sm">Threshold (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      {...register(`tiers.${index}.threshold`, { valueAsNumber: true })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="font-poppins text-sm">GP Split (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      {...register(`tiers.${index}.gpSplit`, { valueAsNumber: true })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="font-poppins text-sm">LP Split (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      {...register(`tiers.${index}.lpSplit`, { valueAsNumber: true })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  className="text-error hover:text-error hover:bg-error/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
