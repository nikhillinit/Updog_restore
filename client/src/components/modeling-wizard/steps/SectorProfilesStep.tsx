/**
 * Sector Profiles Step (Enhanced)
 *
 * Step 2: Investment thesis with detailed stage cohorts
 *
 * Features:
 * - Sector profiles with allocation percentages
 * - Detailed investment stage cohorts per sector
 * - Round metrics (size, valuation, ESOP)
 * - Graduation, exit, and failure rates
 * - Timing metrics (months to graduate/exit)
 * - Real-time validation and feedback
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Plus, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { sectorProfilesSchema, type SectorProfilesInput } from '@/schemas/modeling-wizard.schemas';
import { SectorProfileCard, type SectorProfile } from './sector-profiles/SectorProfileCard';

// ============================================================================
// TYPES
// ============================================================================

export interface SectorProfilesStepProps {
  initialData?: Partial<SectorProfilesInput>;
  onSave: (data: SectorProfilesInput) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SectorProfilesStep({ initialData, onSave }: SectorProfilesStepProps) {
  const {
    setValue,
    watch,
    handleSubmit,
    formState: { errors }
  } = useForm<SectorProfilesInput>({
    resolver: zodResolver(sectorProfilesSchema),
    defaultValues: initialData || {
      sectorProfiles: [
        {
          id: `sector-${Date.now()}`,
          name: '',
          allocation: 100,
          stages: [
            {
              id: `stage-${Date.now()}`,
              stage: 'seed' as const,
              roundSize: 2.0,
              valuation: 10.0,
              esopPercentage: 10.0,
              graduationRate: 50.0,
              exitRate: 10.0,
              exitValuation: 50.0,
              monthsToGraduate: 18,
              monthsToExit: 24,
              failureRate: 40.0
            }
          ]
        }
      ]
    }
  });

  const sectorProfiles = watch('sectorProfiles') || [];

  // Calculate total allocation
  const totalAllocation = React.useMemo(() => {
    return sectorProfiles.reduce((sum, profile) => sum + (profile.allocation || 0), 0);
  }, [sectorProfiles]);

  const isAllocationValid = Math.abs(totalAllocation - 100) < 0.01;

  // Auto-save on form changes
  React.useEffect(() => {
    const subscription = watch((value) => {
      if (sectorProfilesSchema.safeParse(value).success) {
        onSave(value as SectorProfilesInput);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, onSave]);

  const addSectorProfile = () => {
    const newProfile: SectorProfile = {
      id: `sector-${Date.now()}`,
      name: '',
      allocation: 0,
      stages: [
        {
          id: `stage-${Date.now()}`,
          stage: 'seed' as const,
          roundSize: 2.0,
          valuation: 10.0,
          esopPercentage: 10.0,
          graduationRate: 50.0,
          exitRate: 10.0,
          exitValuation: 50.0,
          monthsToGraduate: 18,
          monthsToExit: 24,
          failureRate: 40.0
        }
      ]
    };
    setValue('sectorProfiles', [...sectorProfiles, newProfile]);
  };

  const updateSectorProfile = (id: string, updates: Partial<SectorProfile>) => {
    setValue(
      'sectorProfiles',
      sectorProfiles.map(profile => {
        if (profile.id !== id) return profile;

        // Determine stages array with conditional spreading for optional properties
        const stagesArray = updates.stages !== undefined ? updates.stages : profile.stages;
        const normalizedStages = stagesArray.map(stage => ({
          id: stage.id,
          stage: stage.stage,
          roundSize: stage.roundSize,
          valuation: stage.valuation,
          esopPercentage: stage.esopPercentage,
          graduationRate: stage.graduationRate,
          exitRate: stage.exitRate,
          exitValuation: stage.exitValuation,
          monthsToGraduate: stage.monthsToGraduate,
          monthsToExit: stage.monthsToExit,
          ...(stage.failureRate !== undefined ? { failureRate: stage.failureRate } : {})
        }));

        // Build updated profile with conditional spreading for optional properties
        const updated: SectorProfile = {
          id: profile.id,
          name: updates.name !== undefined ? updates.name : profile.name,
          allocation: updates.allocation !== undefined ? updates.allocation : profile.allocation,
          stages: normalizedStages,
          ...(updates.description !== undefined
            ? { description: updates.description }
            : profile.description !== undefined
            ? { description: profile.description }
            : {})
        };

        return updated;
      })
    );
  };

  const removeSectorProfile = (id: string) => {
    setValue(
      'sectorProfiles',
      sectorProfiles.filter(profile => profile.id !== id)
    );
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-8">
      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm font-poppins">
          <strong>Sector Profiles</strong> define investment stages and assumptions for each market segment.
          Include later-stage rounds (even if your fund doesn't invest in them) for accurate FMV projections.
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-inter font-bold text-lg text-pov-charcoal">
            Sector Profiles
          </h3>
          <p className="text-sm text-charcoal-600 font-poppins mt-1">
            Define investment thesis and stage cohorts for each sector
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addSectorProfile}
          className="gap-2"
          disabled={sectorProfiles.length >= 10}
        >
          <Plus className="w-4 h-4" />
          Add Sector
        </Button>
      </div>

      {/* Sector Profiles List */}
      <div className="space-y-6">
        {sectorProfiles.map((profile, index) => {
          // Normalize profile to satisfy exactOptionalPropertyTypes
          const normalizedProfile: SectorProfile = {
            id: profile.id,
            name: profile.name,
            allocation: profile.allocation,
            stages: profile.stages.map(stage => ({
              id: stage.id,
              stage: stage.stage,
              roundSize: stage.roundSize,
              valuation: stage.valuation,
              esopPercentage: stage.esopPercentage,
              graduationRate: stage.graduationRate,
              exitRate: stage.exitRate,
              exitValuation: stage.exitValuation,
              monthsToGraduate: stage.monthsToGraduate,
              monthsToExit: stage.monthsToExit,
              ...(stage.failureRate !== undefined ? { failureRate: stage.failureRate } : {})
            })),
            ...(profile.description !== undefined ? { description: profile.description } : {})
          };

          return (
            <SectorProfileCard
              key={profile.id}
              profile={normalizedProfile}
              index={index}
              onUpdate={updateSectorProfile}
              onRemove={removeSectorProfile}
              canRemove={sectorProfiles.length > 1}
            />
          );
        })}
      </div>

      {sectorProfiles.length >= 10 && (
        <p className="text-sm text-charcoal-600 font-poppins text-center">
          Maximum of 10 sector profiles reached
        </p>
      )}

      {/* Allocation Summary */}
      <div className="bg-charcoal-50 rounded-lg p-4 border border-charcoal-200">
        <div className="flex items-center justify-between">
          <span className="font-inter font-bold text-sm text-pov-charcoal">
            Total Sector Allocation:
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`font-inter font-bold text-lg ${
                isAllocationValid ? 'text-success' : 'text-error'
              }`}
            >
              {totalAllocation.toFixed(1)}%
            </span>
            {isAllocationValid ? (
              <span className="text-success text-sm">✓</span>
            ) : (
              <span className="text-error text-sm">(must = 100%)</span>
            )}
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {errors.sectorProfiles && (
        <Alert variant="destructive">
          <AlertDescription>
            {errors.sectorProfiles.message || 'Please fix errors in sector profiles'}
          </AlertDescription>
        </Alert>
      )}

      {/* Common Pitfalls Info */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs font-poppins space-y-2">
          <p><strong>Common Pitfalls:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Incomplete Projections:</strong> Include later-stage rounds for accurate FMV tracking</li>
            <li><strong>Exit Timing:</strong> "Months to Exit" starts from the current stage, not initial investment</li>
            <li><strong>Final Stage:</strong> The last stage must have 0% graduation rate</li>
            <li><strong>Rate Constraints:</strong> Graduation + Exit rates cannot exceed 100%</li>
          </ul>
        </AlertDescription>
      </Alert>
    </form>
  );
}
