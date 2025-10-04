/**
 * Scenarios Step
 * Step 7: Scenario configuration and comparison
 */

import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { scenariosSchema, type ScenariosInput } from '@/schemas/modeling-wizard.schemas';

export interface ScenariosStepProps {
  initialData?: Partial<ScenariosInput>;
  onSave: (data: ScenariosInput) => void;
}

export function ScenariosStep({ initialData, onSave }: ScenariosStepProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<ScenariosInput>({
    resolver: zodResolver(scenariosSchema),
    defaultValues: initialData || {
      scenarioType: 'construction',
      baseCase: {
        name: 'Base Case',
        assumptions: {}
      },
      scenarios: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'scenarios'
  });

  const scenarioType = watch('scenarioType');

  React.useEffect(() => {
    const subscription = watch((value) => {
      scenariosSchema.safeParse(value).success && onSave(value as ScenariosInput);
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      <div className="space-y-6">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Scenario Type</h3>

        <div>
          <Label htmlFor="scenarioType" className="font-poppins">
            Modeling Approach *
          </Label>
          <Select
            defaultValue={initialData?.scenarioType || 'construction'}
            onValueChange={(value) => setValue('scenarioType', value as any)}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="construction">Fund Construction</SelectItem>
              <SelectItem value="current_state">Current State Analysis</SelectItem>
              <SelectItem value="comparison">Construction vs Current State</SelectItem>
            </SelectContent>
          </Select>
          {errors.scenarioType && (
            <p className="text-sm text-error mt-1">{errors.scenarioType.message}</p>
          )}
          <p className="text-xs text-charcoal-500 mt-2">
            {scenarioType === 'construction' && 'Model a new fund from scratch'}
            {scenarioType === 'current_state' && 'Analyze an existing fund portfolio'}
            {scenarioType === 'comparison' && 'Compare planned vs actual performance'}
          </p>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">Base Case</h3>

        <div>
          <Label htmlFor="baseCaseName" className="font-poppins">
            Base Case Name *
          </Label>
          <Input
            id="baseCaseName"
            {...register('baseCase.name')}
            placeholder="e.g., Conservative Growth"
            className="mt-2"
          />
          {errors.baseCase?.name && (
            <p className="text-sm text-error mt-1">{errors.baseCase.name.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="baseCaseAssumptions" className="font-poppins">
            Key Assumptions
          </Label>
          <Textarea
            id="baseCaseAssumptions"
            placeholder="Describe your base case assumptions (e.g., 25% success rate, 3x median MOIC)"
            className="mt-2 h-24"
          />
          <p className="text-xs text-charcoal-500 mt-1">
            Document the key assumptions for your base case scenario
          </p>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-charcoal-200">
        <div className="flex items-center justify-between">
          <h3 className="font-inter font-bold text-lg text-pov-charcoal">
            Comparison Scenarios (Optional)
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({
              id: crypto.randomUUID(),
              name: '',
              assumptions: {}
            })}
            className="font-poppins"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Scenario
          </Button>
        </div>

        {fields.length > 0 && (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start p-4 bg-charcoal-50 rounded-lg">
                <div className="flex-1 space-y-3">
                  <div>
                    <Label className="font-poppins text-sm">Scenario Name</Label>
                    <Input
                      {...register(`scenarios.${index}.name`)}
                      placeholder="e.g., Bull Case, Bear Case"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="font-poppins text-sm">Assumptions</Label>
                    <Textarea
                      placeholder="Describe how this scenario differs from the base case"
                      className="mt-1 h-20"
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

        <p className="text-sm text-charcoal-500 italic">
          Tip: Create multiple scenarios to compare different assumptions and model sensitivities
        </p>
      </div>
    </form>
  );
}
