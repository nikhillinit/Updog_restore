/**
 * Scenarios Step (Step 7/7)
 *
 * Final wizard step: "What-if" scenario analysis
 *
 * Features:
 * - Enable/disable scenario analysis
 * - Create up to 5 scenario variants
 * - Adjust MOIC, exit timing, loss rates, participation rates
 * - Load default scenarios (Base, Optimistic, Pessimistic)
 * - Side-by-side comparison table
 * - Real-time calculations
 *
 * Uses:
 * - useScenarioCalculations hook for real-time updates
 * - ScenarioCard for individual scenario editing
 * - ScenarioComparisonTable for side-by-side comparison
 * - DefaultScenarioButton for quick presets
 */

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle } from 'lucide-react';
import {
  scenariosSchema,
  type ScenariosInput,
  type ScenarioAdjustment
} from '@/schemas/modeling-wizard.schemas';
import { generateCustomScenario, isBaseCase } from '@/lib/scenario-calculations';
import { useScenarioCalculations } from '@/hooks/useScenarioCalculations';
import { ScenarioCard } from './scenarios/ScenarioCard';
import { ScenarioComparisonTable } from './scenarios/ScenarioComparisonTable';
import { DefaultScenarioButton } from './scenarios/DefaultScenarioButton';

// ============================================================================
// TYPES
// ============================================================================

export interface ScenariosStepProps {
  initialData?: Partial<ScenariosInput>;
  onSave: (data: ScenariosInput) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ScenariosStep({ initialData, onSave }: ScenariosStepProps) {
  const {
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors }
  } = useForm<ScenariosInput>({
    resolver: zodResolver(scenariosSchema),
    defaultValues: initialData || {
      enabled: true,
      scenarios: [{
        id: 'base-case',
        name: 'Base Case',
        description: 'Expected performance based on plan assumptions',
        moicMultiplier: 1.0,
        exitTimingDelta: 0,
        lossRateDelta: 0,
        participationRateDelta: 0
      }]
    }
  });

  // Watch form values
  const enabled = watch('enabled');
  const scenarios = watch('scenarios');

  // Mock base model (in real wizard, this would come from previous steps)
  const baseModel = React.useMemo(() => ({
    grossMOIC: 2.5,
    netMOIC: 2.1,
    grossIRR: 25,
    netIRR: 20,
    lossRate: 30,
    avgExitYears: 7.0,
    participationRate: 75
  }), []);

  // Calculate scenario results in real-time
  const { results, comparison} = useScenarioCalculations({
    baseModel,
    scenarios: scenarios as ScenarioAdjustment[],
    enabled
  });

  // Auto-save on form changes
  React.useEffect(() => {
    const subscription = watch((value) => {
      if (scenariosSchema.safeParse(value).success) {
        onSave(value as ScenariosInput);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAddScenario = () => {
    if (scenarios.length >= 5) return;

    const newScenario = generateCustomScenario(`Custom ${scenarios.length + 1}`);
    setValue('scenarios', [...scenarios, newScenario], { shouldValidate: true });
  };

  const handleUpdateScenario = (index: number, updated: ScenarioAdjustment) => {
    const newScenarios = [...scenarios];
    newScenarios[index] = updated;
    setValue('scenarios', newScenarios, { shouldValidate: true });
  };

  const handleRemoveScenario = (index: number) => {
    if (scenarios.length <= 1) return; // Must have at least one scenario

    const newScenarios = scenarios.filter((_, i) => i !== index);
    setValue('scenarios', newScenarios, { shouldValidate: true });
  };

  const handleLoadDefaults = (defaults: ScenarioAdjustment[]) => {
    setValue('scenarios', defaults, { shouldValidate: true });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Enable Toggle Section */}
      <div className="bg-charcoal-50 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-inter font-bold text-lg text-pov-charcoal mb-2">
              Scenario Analysis
            </h3>
            <p className="text-sm text-charcoal-600 font-poppins mb-4">
              Create multiple "what-if" scenarios to compare different outcomes
              based on varying assumptions about exits, losses, and follow-on investments.
            </p>
          </div>

          <Controller
            name="enabled"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        {errors.scenarios && (
          <div className="mt-4 p-3 bg-error/10 border border-error/30 rounded flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-error mt-0.5 flex-shrink-0" />
            <p className="text-sm text-error font-poppins">
              {errors.scenarios.message}
            </p>
          </div>
        )}
      </div>

      {/* Scenarios List */}
      {enabled && (
        <>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-inter font-bold text-lg text-pov-charcoal">
                  Scenarios ({scenarios.length}/5)
                </h3>
                <p className="text-sm text-charcoal-600 font-poppins mt-1">
                  Configure up to 5 scenario variants with different assumptions
                </p>
              </div>

              <DefaultScenarioButton
                onLoadDefaults={handleLoadDefaults}
                disabled={scenarios.length >= 5}
              />
            </div>

            {/* Scenario Cards */}
            <div className="space-y-4">
              {scenarios.map((scenario, index) => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario as ScenarioAdjustment}
                  onUpdate={(updated) => handleUpdateScenario(index, updated)}
                  onRemove={() => handleRemoveScenario(index)}
                  disableRemove={scenarios.length === 1}
                  isBaseCase={isBaseCase(scenario as ScenarioAdjustment)}
                />
              ))}
            </div>

            {/* Add Scenario Button */}
            {scenarios.length < 5 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleAddScenario}
                className="w-full gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Scenario ({scenarios.length}/5)
              </Button>
            )}
          </div>

          {/* Comparison Table */}
          {scenarios.length > 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-inter font-bold text-lg text-pov-charcoal">
                  Scenario Comparison
                </h3>
                <p className="text-sm text-charcoal-600 font-poppins mt-1">
                  Side-by-side comparison of key metrics across all scenarios
                </p>
              </div>

              <div className="bg-white rounded-lg border border-charcoal-200 p-6">
                <ScenarioComparisonTable results={results} />
              </div>

              {/* Summary Stats */}
              {results.length > 1 && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-charcoal-50 rounded-lg p-4">
                    <p className="text-sm text-charcoal-600 font-poppins mb-1">
                      MOIC Range
                    </p>
                    <p className="font-inter font-bold text-lg text-pov-charcoal">
                      {comparison.summary.netMOIC.min.toFixed(2)}x - {comparison.summary.netMOIC.max.toFixed(2)}x
                    </p>
                  </div>

                  <div className="bg-charcoal-50 rounded-lg p-4">
                    <p className="text-sm text-charcoal-600 font-poppins mb-1">
                      IRR Range
                    </p>
                    <p className="font-inter font-bold text-lg text-pov-charcoal">
                      {comparison.summary.netIRR.min.toFixed(1)}% - {comparison.summary.netIRR.max.toFixed(1)}%
                    </p>
                  </div>

                  <div className="bg-charcoal-50 rounded-lg p-4">
                    <p className="text-sm text-charcoal-600 font-poppins mb-1">
                      Avg Exit Timeline
                    </p>
                    <p className="font-inter font-bold text-lg text-pov-charcoal">
                      {comparison.summary.avgExitYears.avg.toFixed(1)} years
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-pov-blue/10 border border-pov-blue/30 rounded-lg p-4">
            <p className="text-sm text-pov-blue font-poppins">
              <strong>Tip:</strong> Scenario analysis helps you understand the range of possible
              outcomes and prepare for different market conditions. Start with the default scenarios
              (Base, Optimistic, Pessimistic) and customize as needed.
            </p>
          </div>
        </>
      )}

      {/* Disabled State Message */}
      {!enabled && (
        <div className="bg-charcoal-50 rounded-lg p-8 text-center">
          <p className="text-charcoal-500 font-poppins">
            Scenario analysis is disabled. Enable it above to create and compare multiple scenarios.
          </p>
        </div>
      )}
    </form>
  );
}
