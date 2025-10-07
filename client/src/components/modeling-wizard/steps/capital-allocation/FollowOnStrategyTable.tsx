/**
 * Follow-On Strategy Table
 *
 * Editable table for configuring follow-on investment strategy per stage.
 * Shows graduation flow, participation rates, and calculated capital requirements.
 */

import React from 'react';
import { Info, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  StageAllocation,
  SectorProfile
} from '@/schemas/modeling-wizard.schemas';
import type { FollowOnCalculation } from '@/lib/capital-allocation-calculations';

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface FollowOnStrategyTableProps {
  sectorProfiles: SectorProfile[];
  stageAllocations: StageAllocation[];
  calculations: FollowOnCalculation[];
  onChange: (allocations: StageAllocation[]) => void;
  errors?: { message?: string };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build stage allocation template from sector profiles
 */
function buildStageAllocationsFromProfiles(
  sectorProfiles: SectorProfile[]
): StageAllocation[] {
  const stageMap = new Map<string, { stageName: string }>();

  // Collect unique stages from all sectors
  for (const sector of sectorProfiles) {
    for (const stage of sector.stages) {
      if (!stageMap.has(stage.stage)) {
        stageMap.set(stage.stage, { stageName: stage.stage });
      }
    }
  }

  // Create allocations for each stage (except entry stage)
  const stages = Array.from(stageMap.entries());
  const allocations: StageAllocation[] = [];

  for (let i = 1; i < stages.length; i++) {
    const [stageId, { stageName }] = stages[i]!;
    allocations.push({
      stageId,
      stageName: formatStageName(stageName),
      maintainOwnership: 15, // Default target
      participationRate: 70  // Default 70% participation
    });
  }

  return allocations;
}

function formatStageName(stage: string): string {
  return stage
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatMoney(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}B`;
  }
  return `$${value.toFixed(1)}M`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FollowOnStrategyTable({
  sectorProfiles,
  stageAllocations,
  calculations,
  onChange,
  errors
}: FollowOnStrategyTableProps) {
  // Initialize stage allocations if empty
  React.useEffect(() => {
    if (stageAllocations.length === 0 && sectorProfiles.length > 0) {
      const defaultAllocations = buildStageAllocationsFromProfiles(sectorProfiles);
      if (defaultAllocations.length > 0) {
        onChange(defaultAllocations);
      }
    }
  }, [sectorProfiles, stageAllocations.length, onChange]);

  const updateStageAllocation = (
    stageId: string,
    updates: Partial<StageAllocation>
  ) => {
    onChange(
      stageAllocations.map(stage =>
        stage.stageId === stageId ? { ...stage, ...updates } : stage
      )
    );
  };

  // Find calculation for stage
  const getCalculation = (stageId: string): FollowOnCalculation | undefined => {
    return calculations.find(calc => calc.stageId === stageId);
  };

  if (stageAllocations.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Follow-On Strategy
        </h3>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm font-poppins">
            Complete the Sector Profiles step first to define investment stages.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-inter font-bold text-lg text-pov-charcoal">
          Follow-On Strategy
        </h3>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm font-poppins">
          <strong>Follow-On Strategy</strong> defines how you support portfolio companies through subsequent rounds.
          Set target ownership and participation rates for each stage transition.
        </AlertDescription>
      </Alert>

      {errors?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.message}</AlertDescription>
        </Alert>
      )}

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-charcoal-100">
              <th className="px-3 py-3 text-left font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                Stage
              </th>
              <th className="px-3 py-3 text-center font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 mx-auto">
                      Maintain Ownership
                      <HelpCircle className="w-3 h-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        Target ownership % after dilution from this round
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="px-3 py-3 text-center font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 mx-auto">
                      Participation
                      <HelpCircle className="w-3 h-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        % of graduates that receive follow-on investment
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="px-3 py-3 text-right font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                Implied Check
              </th>
              <th className="px-3 py-3 text-right font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                Graduates
              </th>
              <th className="px-3 py-3 text-right font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                Follow-Ons
              </th>
              <th className="px-3 py-3 text-right font-inter font-bold text-sm text-pov-charcoal border-b-2 border-charcoal-300">
                Capital Required
              </th>
            </tr>
          </thead>
          <tbody>
            {stageAllocations.map((stage, index) => {
              const calc = getCalculation(stage.stageId);
              const isEven = index % 2 === 0;

              return (
                <tr
                  key={stage.stageId}
                  className={isEven ? 'bg-white' : 'bg-charcoal-50'}
                >
                  {/* Stage Name */}
                  <td className="px-3 py-3 font-inter font-bold text-sm text-pov-charcoal">
                    {stage.stageName}
                  </td>

                  {/* Maintain Ownership Input */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center">
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={stage.maintainOwnership}
                        onChange={e =>
                          updateStageAllocation(stage.stageId, {
                            maintainOwnership: parseFloat(e.target.value) || 0
                          })
                        }
                        className="w-20 text-center"
                      />
                      <span className="ml-1 text-sm text-charcoal-600 font-poppins">%</span>
                    </div>
                  </td>

                  {/* Participation Rate Input */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center">
                      <Input
                        type="number"
                        step="5"
                        min="0"
                        max="100"
                        value={stage.participationRate}
                        onChange={e =>
                          updateStageAllocation(stage.stageId, {
                            participationRate: parseFloat(e.target.value) || 0
                          })
                        }
                        className="w-20 text-center"
                      />
                      <span className="ml-1 text-sm text-charcoal-600 font-poppins">%</span>
                    </div>
                  </td>

                  {/* Implied Check Size (Calculated) */}
                  <td className="px-3 py-3 font-poppins text-sm text-pov-charcoal text-right">
                    {calc ? formatMoney(calc.impliedCheckSize) : '-'}
                  </td>

                  {/* Graduates (Calculated) */}
                  <td className="px-3 py-3 font-poppins text-sm text-pov-charcoal text-right">
                    {calc?.graduatesIn || 0}
                  </td>

                  {/* Follow-On Investments (Calculated) */}
                  <td className="px-3 py-3 font-poppins text-sm text-pov-charcoal text-right">
                    {calc?.followOnInvestments || 0}
                  </td>

                  {/* Capital Allocated (Calculated) */}
                  <td className="px-3 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                    {calc ? formatMoney(calc.capitalAllocated) : '-'}
                  </td>
                </tr>
              );
            })}

            {/* Totals Row */}
            <tr className="bg-charcoal-200 border-t-2 border-charcoal-300">
              <td className="px-3 py-3 font-inter font-bold text-sm text-pov-charcoal" colSpan={5}>
                Total Follow-On Capital
              </td>
              <td className="px-3 py-3 font-inter font-bold text-sm text-pov-charcoal text-right">
                {calculations.reduce((sum, calc) => sum + calc.followOnInvestments, 0)}
              </td>
              <td className="px-3 py-3 font-inter font-bold text-base text-pov-charcoal text-right">
                {formatMoney(
                  calculations.reduce((sum, calc) => sum + calc.capitalAllocated, 0)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="bg-charcoal-50 rounded-lg p-4 border border-charcoal-200">
        <h4 className="font-inter font-bold text-sm text-pov-charcoal mb-2">
          How It Works
        </h4>
        <ul className="space-y-1 text-sm font-poppins text-charcoal-700">
          <li>
            <strong>Graduates:</strong> Companies from previous stage that advance (based on sector profile graduation rates)
          </li>
          <li>
            <strong>Follow-Ons:</strong> Graduates × Participation Rate (e.g., 50 graduates × 70% = 35 follow-ons)
          </li>
          <li>
            <strong>Implied Check:</strong> Investment needed to maintain target ownership after dilution
          </li>
          <li>
            <strong>Capital Required:</strong> Follow-Ons × Implied Check Size
          </li>
        </ul>
      </div>
    </div>
  );
}
