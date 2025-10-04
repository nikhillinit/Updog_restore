/**
 * Sector Profiles Step
 * Step 2: Investment thesis and allocations
 */

import React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';
import { sectorProfilesSchema, type SectorProfilesInput } from '@/schemas/modeling-wizard.schemas';

export interface SectorProfilesStepProps {
  initialData?: Partial<SectorProfilesInput>;
  onSave: (data: SectorProfilesInput) => void;
}

export function SectorProfilesStep({ initialData, onSave }: SectorProfilesStepProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<SectorProfilesInput>({
    resolver: zodResolver(sectorProfilesSchema),
    defaultValues: initialData || {
      sectorProfiles: [{ id: crypto.randomUUID(), name: '', allocation: 0 }],
      stageAllocations: [
        { stage: 'seed', allocation: 0 },
        { stage: 'series-a', allocation: 0 }
      ]
    }
  });

  const { fields: sectorFields, append: appendSector, remove: removeSector } = useFieldArray({
    control,
    name: 'sectorProfiles'
  });

  // Auto-save on form changes
  React.useEffect(() => {
    const subscription = watch((value) => {
      sectorProfilesSchema.safeParse(value).success && onSave(value as SectorProfilesInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  const totalSectorAllocation = watch('sectorProfiles')?.reduce(
    (sum, profile) => sum + (profile.allocation || 0),
    0
  ) || 0;

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Sector Profiles */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-inter font-bold text-lg text-pov-charcoal">
            Sector Profiles
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendSector({ id: crypto.randomUUID(), name: '', allocation: 0 })}
            className="font-poppins"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Sector
          </Button>
        </div>

        <div className="space-y-4">
          {sectorFields.map((field, index) => (
            <div key={field.id} className="flex gap-4 items-start p-4 bg-charcoal-50 rounded-lg">
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`sector-name-${index}`} className="font-poppins text-sm">
                      Sector Name
                    </Label>
                    <Input
                      id={`sector-name-${index}`}
                      {...register(`sectorProfiles.${index}.name`)}
                      placeholder="e.g., SaaS, Fintech"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`sector-allocation-${index}`} className="font-poppins text-sm">
                      Allocation (%)
                    </Label>
                    <Input
                      id={`sector-allocation-${index}`}
                      type="number"
                      step="0.1"
                      {...register(`sectorProfiles.${index}.allocation`, { valueAsNumber: true })}
                      placeholder="e.g., 30"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor={`sector-description-${index}`} className="font-poppins text-sm">
                    Description (optional)
                  </Label>
                  <Textarea
                    id={`sector-description-${index}`}
                    {...register(`sectorProfiles.${index}.description`)}
                    placeholder="Investment thesis for this sector"
                    className="mt-1 h-20"
                  />
                </div>
              </div>

              {sectorFields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSector(index)}
                  className="text-error hover:text-error hover:bg-error/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-3 bg-charcoal-100 rounded">
          <span className="font-poppins text-sm font-medium">Total Allocation:</span>
          <span className={`font-poppins text-sm font-bold ${
            Math.abs(totalSectorAllocation - 100) < 0.01 ? 'text-success' : 'text-error'
          }`}>
            {totalSectorAllocation.toFixed(1)}%
          </span>
        </div>

        {errors.sectorProfiles && (
          <p className="text-sm text-error">{errors.sectorProfiles.message}</p>
        )}
      </div>

      {/* Stage Allocations */}
      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Stage Allocations
        </h3>

        <div className="grid grid-cols-2 gap-4">
          {['seed', 'series-a', 'series-b', 'series-c', 'growth'].map((stage, index) => (
            <div key={stage}>
              <Label htmlFor={`stage-${stage}`} className="font-poppins text-sm capitalize">
                {stage.replace('-', ' ')} (%)
              </Label>
              <Input
                id={`stage-${stage}`}
                type="number"
                step="0.1"
                {...register(`stageAllocations.${index}.allocation`, { valueAsNumber: true })}
                placeholder="0"
                className="mt-1"
              />
            </div>
          ))}
        </div>

        {errors.stageAllocations && (
          <p className="text-sm text-error">{errors.stageAllocations.message}</p>
        )}
      </div>
    </form>
  );
}
