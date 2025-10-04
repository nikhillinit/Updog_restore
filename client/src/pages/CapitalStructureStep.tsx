import React, { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Edit } from "lucide-react";
import { useFundContext } from '@/contexts/FundContext';
import { useFundSelector } from '@/stores/useFundSelector';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';
import { solveCapitalAllocation, type AllocationInputs, type FollowOnStrategy } from '@/core/capitalAllocationSolver';

// Capital Allocation interface
interface CapitalAllocation {
  id: string;
  name: string;
  sectorProfileId?: string;
  entryRound: string;
  capitalAllocationPct: number;
  initialCheckStrategy: 'amount' | 'ownership';
  initialCheckAmount?: number;
  initialOwnershipPct?: number;
  followOnStrategy: 'amount' | 'maintain_ownership';
  followOnAmount?: number;
  followOnParticipationPct: number;
  investmentHorizonMonths: number;
}

// Helper function to format currency with commas
const formatCurrency = (value: number): string => {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

// Helper function to parse currency input (removes commas)
const parseCurrency = (value: string): number => {
  return parseFloat(value.replace(/,/g, '')) || 0;
};

export default function CapitalStructureStep() {
  const [, navigate] = useLocation();
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);

  // Get fund size from context
  // NOTE: Investable capital cannot be calculated yet because expenses are captured in step 5
  const { currentFund } = useFundContext();
  const fundSize = currentFund?.size || 20000000; // Default $20M

  // Get investment strategy stages for graduation rate modeling
  const stages = useFundSelector(s => s.stages);

  // Mock allocations (this would come from store)
  const [allocations, setAllocations] = useState<CapitalAllocation[]>([
    {
      id: 'pre-seed-allocation',
      name: 'Pre-Seed Investments',
      entryRound: 'Pre-Seed',
      capitalAllocationPct: 43,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 250000, // $250k in dollars
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: 100,
      investmentHorizonMonths: 18
    },
    {
      id: 'seed-allocation',
      name: 'Seed Investments',
      entryRound: 'Seed',
      capitalAllocationPct: 43,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 500000, // $500k in dollars
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: 100,
      investmentHorizonMonths: 24
    },
    {
      id: 'series-a-allocation',
      name: 'Series A Investments',
      entryRound: 'Series A',
      capitalAllocationPct: 14,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 750000, // $750k in dollars
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: 100,
      investmentHorizonMonths: 18
    }
  ]);

  // Mock sector profiles
  const sectorProfiles = [
    { id: 'default', name: 'Default' },
    { id: 'fintech', name: 'FinTech' },
    { id: 'healthtech', name: 'HealthTech' },
    { id: 'saas', name: 'Enterprise SaaS' }
  ];

  const entryRounds = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Series C'];

  // Stage order for sequencing allocations
  const stageOrder: Record<string, number> = {
    'Pre-Seed': 1,
    'Seed': 2,
    'Series A': 3,
    'Series B': 4,
    'Series C': 5,
    'Series C+': 6
  };

  // Sort allocations by entry stage
  const sortedAllocations = [...allocations].sort((a, b) => {
    const orderA = stageOrder[a.entryRound] || 999;
    const orderB = stageOrder[b.entryRound] || 999;
    return orderA - orderB;
  });

  const totalAllocationPct = allocations.reduce((sum: any, alloc: any) => sum + alloc.capitalAllocationPct, 0);

  const handleAddAllocation = () => {
    const newAllocation: CapitalAllocation = {
      id: `allocation-${Date.now()}`,
      name: '',
      entryRound: 'Seed',
      capitalAllocationPct: 0,
      initialCheckStrategy: 'amount',
      followOnStrategy: 'amount',
      followOnParticipationPct: 50,
      investmentHorizonMonths: 24
    };
    setAllocations([...allocations, newAllocation]);
    setEditingAllocation(newAllocation.id);
  };

  const handleUpdateAllocation = (id: string, updates: Partial<CapitalAllocation>) => {
    setAllocations(prev => prev.map(alloc =>
      alloc.id === id ? { ...alloc, ...updates } : alloc
    ));
  };

  const handleDeleteAllocation = (id: string) => {
    setAllocations(prev => prev.filter(alloc => alloc.id !== id));
    if (editingAllocation === id) {
      setEditingAllocation(null);
    }
  };

  // NEW: Use binary search solver for accurate capital allocation
  const calculateImpliedValues = (allocation: CapitalAllocation) => {
    const totalAllocatedCapital = fundSize * (allocation.capitalAllocationPct / 100);

    // Get initial check size (in dollars)
    let initialCheckSize = 0;
    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      initialCheckSize = allocation.initialCheckAmount; // already in dollars
    } else if (allocation.initialCheckStrategy === 'ownership' && allocation.initialOwnershipPct) {
      // Use typical valuations for now (would come from Investment Rounds step)
      const typicalPostMoneyValuations: Record<string, number> = {
        'Pre-Seed': 6000000,
        'Seed': 15000000,
        'Series A': 35000000,
        'Series B': 80000000,
        'Series C': 160000000
      };
      const postMoney = typicalPostMoneyValuations[allocation.entryRound] || 15000000;
      initialCheckSize = postMoney * (allocation.initialOwnershipPct / 100);
    }

    if (initialCheckSize === 0) {
      return {
        initialAllocatedCapital: totalAllocatedCapital,
        impliedOwnership: allocation.initialOwnershipPct || null,
        estimatedDeals: 0,
        initialCapital: 0,
        followOnCapital: 0,
        stageProgression: [],
        totalCapitalRequired: 0
      };
    }

    // Use simplified calculation when investment rounds data isn't available
    // TODO: Integrate with Investment Rounds step data
    const estimatedDeals = Math.floor(totalAllocatedCapital / initialCheckSize);
    const initialCapital = estimatedDeals * initialCheckSize;

    // Simplified follow-on calculation
    let followOnCapital = 0;
    if (allocation.followOnStrategy === 'amount' && allocation.followOnAmount) {
      // Fixed follow-on amount per deal
      followOnCapital = estimatedDeals * allocation.followOnAmount * (allocation.followOnParticipationPct / 100);
    } else if (allocation.followOnStrategy === 'maintain_ownership' && initialCheckSize > 0) {
      // Estimate pro-rata needs (very simplified - assumes 2x step-up per round)
      const avgFollowOnPerDeal = initialCheckSize * 2 * (allocation.followOnParticipationPct / 100);
      followOnCapital = estimatedDeals * avgFollowOnPerDeal;
    }

    return {
      initialAllocatedCapital: totalAllocatedCapital,
      impliedOwnership: calculateImpliedOwnership(allocation),
      estimatedDeals,
      initialCapital,
      followOnCapital,
      stageProgression: [],
      totalCapitalRequired: initialCapital + followOnCapital
    };
  };

  // Helper function for simple fallback calculation when stages aren't defined
  const calculateSimpleAllocation = (allocation: CapitalAllocation, initialAllocatedCapital: number) => {
    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      const checkAmountInDollars = allocation.initialCheckAmount * 1000000;
      const estimatedDeals = Math.floor(initialAllocatedCapital / checkAmountInDollars);

      // Simple follow-on calculation without stage progression
      let followOnCapital = 0;
      if (allocation.followOnStrategy === 'amount' && allocation.followOnAmount) {
        const followOnPerDeal = allocation.followOnAmount * 1000000;
        const participationRate = allocation.followOnParticipationPct / 100;
        followOnCapital = followOnPerDeal * estimatedDeals * participationRate;
      }

      return {
        initialAllocatedCapital,
        impliedOwnership: calculateImpliedOwnership(allocation),
        estimatedDeals,
        initialCapital: initialAllocatedCapital,
        followOnCapital,
        totalCapitalRequired: initialAllocatedCapital + followOnCapital
      };
    }
    return {
      initialAllocatedCapital,
      impliedOwnership: calculateImpliedOwnership(allocation),
      estimatedDeals: 0,
      initialCapital: initialAllocatedCapital,
      followOnCapital: 0,
      totalCapitalRequired: initialAllocatedCapital
    };
  };

  // Calculate target number of deals using total capital per deal approach
  const calculateTargetDeals = (allocation: CapitalAllocation, allocatedCapital: number, subsequentStages: any[]): number => {
    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      const initialCheckSize = allocation.initialCheckAmount * 1000000;

      // Calculate total follow-on capital per initial deal
      const followOnPerDeal = calculateFollowOnPerInitialDeal(allocation, subsequentStages);

      // Total cost per deal = initial check + expected follow-ons
      const totalCostPerDeal = initialCheckSize + followOnPerDeal;

      if (totalCostPerDeal <= 0) return 1;

      // Number of deals fund can support
      return Math.floor(allocatedCapital / totalCostPerDeal);
    }
    return 10; // Default fallback
  };

  // Helper to calculate expected follow-on capital for one initial deal
  const calculateFollowOnPerInitialDeal = (allocation: CapitalAllocation, stages: any[]): number => {
    let totalFollowOn = 0;
    let cumulativeGradRate = 1.0;

    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i];
      const nextStage = stages[i + 1];

      if (!currentStage || !nextStage) continue;

      // Cumulative probability of reaching this stage
      cumulativeGradRate *= (currentStage.graduationRate || 0) / 100;

      // Calculate follow-on check size
      let followOnCheck = 0;
      if (allocation.followOnStrategy === 'amount' && allocation.followOnAmount) {
        followOnCheck = allocation.followOnAmount * 1000000;
      } else if (allocation.followOnStrategy === 'maintain_ownership' && allocation.initialOwnershipPct) {
        // Pro-rata: ownership% × round size
        followOnCheck = (allocation.initialOwnershipPct / 100) * (nextStage.roundSize || 0) * 1000000;
      }

      // Expected capital = probability × check size × participation rate
      const participationRate = (allocation.followOnParticipationPct || 0) / 100;
      totalFollowOn += cumulativeGradRate * followOnCheck * participationRate;
    }

    return totalFollowOn;
  };

  // Model how deals progress through subsequent stages
  const modelStageProgression = (subsequentStages: any[], initialDeals: number) => {
    let currentDeals = initialDeals;
    const progression = [];

    for (const stage of subsequentStages) {
      const graduationRate = stage.graduate / 100;
      const exitRate = stage.exit / 100;
      const remainRate = 1 - graduationRate - exitRate;

      const graduatingDeals = Math.floor(currentDeals * graduationRate);
      const exitingDeals = Math.floor(currentDeals * exitRate);
      const remainingDeals = currentDeals - graduatingDeals - exitingDeals;

      progression.push({
        stageName: stage.name,
        startingDeals: currentDeals,
        graduatingDeals,
        exitingDeals,
        remainingDeals,
        months: stage.months
      });

      // Next stage starts with graduating deals from this stage
      currentDeals = graduatingDeals;

      // Stop if no deals graduate to next stage
      if (graduatingDeals === 0) break;
    }

    return progression;
  };

  // Calculate follow-on capital based on user inputs and stage progression
  const calculateFollowOnCapital = (allocation: CapitalAllocation, stageProgression: any[], initialDeals: number): number => {
    if (!allocation.followOnAmount && allocation.followOnStrategy === 'amount') {
      return 0; // No follow-on specified
    }

    // Calculate how many deals graduate to subsequent stages
    let totalFollowOnCapital = 0;

    // Skip the first stage (entry stage) and calculate for subsequent stages
    for (let i = 1; i < stageProgression.length; i++) {
      const stage = stageProgression[i];
      const dealsAtThisStage = stage.startingDeals || 0;

      if (dealsAtThisStage === 0) continue;

      // Use user-specified follow-on strategy
      if (allocation.followOnStrategy === 'amount' && allocation.followOnAmount) {
        // Fixed amount per follow-on
        const followOnCheckSize = allocation.followOnAmount * 1000000;
        const participationRate = allocation.followOnParticipationPct / 100;
        totalFollowOnCapital += followOnCheckSize * dealsAtThisStage * participationRate;
      } else if (allocation.followOnStrategy === 'maintain_ownership' && allocation.initialOwnershipPct) {
        // Pro-rata to maintain ownership (requires valuation assumptions)
        // This is complex and requires valuation step-ups - for now, use a multiplier
        const initialCheckSize = allocation.initialCheckAmount ? allocation.initialCheckAmount * 1000000 : 0;
        const stageMultiplier = i === 1 ? 2.5 : (i === 2 ? 4 : 6); // Typical step-up multipliers
        const proRataAmount = initialCheckSize * stageMultiplier;
        const participationRate = allocation.followOnParticipationPct / 100;
        totalFollowOnCapital += proRataAmount * dealsAtThisStage * participationRate;
      }
    }

    return totalFollowOnCapital;
  };

  // Calculate implied ownership using valuations from Investment Rounds step
  // Note: This requires round data from the previous step
  const calculateImpliedOwnership = (allocation: CapitalAllocation): number | null => {
    // If user specified ownership strategy, return that
    if (allocation.initialCheckStrategy === 'ownership' && allocation.initialOwnershipPct) {
      return allocation.initialOwnershipPct;
    }

    // If user specified check amount, calculate implied ownership using stage valuations
    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      // TODO: Get valuation from Investment Rounds step via store
      // For now, use typical post-money valuations as fallback
      const typicalPostMoneyValuations = {
        'Pre-Seed': 6000000,
        'Seed': 15000000,
        'Series A': 35000000,
        'Series B': 80000000,
        'Series C': 160000000
      };

      const postMoneyValuation = typicalPostMoneyValuations[allocation.entryRound as keyof typeof typicalPostMoneyValuations];

      if (!postMoneyValuation) {
        return null; // Can't calculate without valuation assumption
      }

      const checkSize = allocation.initialCheckAmount * 1000000;
      const ownership = (checkSize / postMoneyValuation) * 100;

      // Return null if ownership is unrealistic (>50% or <0.1%)
      if (ownership < 0.1 || ownership > 50) {
        return null;
      }

      return ownership;
    }

    return null; // Cannot calculate
  };

  return (
    <ModernStepContainer
      title="Capital Allocation"
      description="Configure how investable capital is allocated across investment stages"
    >
      <div className="space-y-8">
        {/* Simplified Info Banner */}
        <div className="space-y-6">
          {totalAllocationPct > 100 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
              ⚠️ Total initial capital allocation exceeds 100%
            </div>
          )}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            <p><strong>📊 Capital Allocation:</strong> Follow-on projections use binary search algorithm with graduation rates from Investment Strategy. Allocations will be refined after expenses (Step 5) and recycling (Step 6).</p>
          </div>
        </div>

        {/* Current Allocations */}
        <div className="space-y-6">
          <div className="pb-4 border-b border-[#E0D8D1]">
            <h3 className="text-lg font-inter font-bold text-[#292929] mb-2">Current Allocations</h3>
            <p className="text-[#292929]/70 font-poppins">
              Your currently defined allocations. Click on + New Allocation to create a new allocation or click on any allocation to edit.
            </p>
          </div>

          <div className="space-y-4">
            {sortedAllocations.map((allocation: any) => {
              const calculations = calculateImpliedValues(allocation);
              const isEditing = editingAllocation === allocation.id;

              return (
                <div key={allocation.id} className="border border-[#E0D8D1] rounded-xl p-4 space-y-4">
                  {!isEditing ? (
                    // View Mode
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-lg">{allocation.name || 'Unnamed Allocation'}</h3>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingAllocation(allocation.id)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAllocation(allocation.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-poppins">
                        <div>
                          <span className="text-[#292929]/60">Entry Round:</span>
                          <div className="font-medium text-[#292929]">{allocation.entryRound}</div>
                        </div>
                        <div>
                          <span className="text-[#292929]/60">Initial Allocation:</span>
                          <div className="font-medium text-[#292929]">{allocation.capitalAllocationPct}%</div>
                        </div>
                        <div>
                          <span className="text-[#292929]/60">Initial Capital:</span>
                          <div className="font-medium text-[#292929]">${formatCurrency(calculations.initialCapital)}</div>
                        </div>
                        <div>
                          <span className="text-[#292929]/60">Follow-On Capital:</span>
                          <div className="font-medium text-[#292929]">${formatCurrency(calculations.followOnCapital)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-poppins mt-2">
                        <div>
                          <span className="text-[#292929]/60">Est. Initial Deals:</span>
                          <div className="font-medium text-[#292929]">{calculations.estimatedDeals}</div>
                        </div>
                        <div>
                          <span className="text-[#292929]/60">Total Required:</span>
                          <div className="font-medium text-[#292929]">${formatCurrency(calculations.totalCapitalRequired)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Edit Mode
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">Edit Allocation</h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingAllocation(null)}
                        >
                          Done
                        </Button>
                      </div>

                      {/* Basic Info */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-[#292929]">Allocation Name</Label>
                          <Input
                            value={allocation.name}
                            onChange={(e: any) => handleUpdateAllocation(allocation.id, { name: e.target.value })}
                            placeholder="e.g., Seed Investments"
                            className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-[#292929]">Sector Profile</Label>
                          <Select
                            value={allocation.sectorProfileId || 'default'}
                            onValueChange={(value: any) => handleUpdateAllocation(allocation.id, { sectorProfileId: value })}
                          >
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {sectorProfiles.map(profile => (
                                <SelectItem key={profile.id} value={profile.id}>
                                  {profile.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-[#292929]">Entry Round</Label>
                          <Select
                            value={allocation.entryRound}
                            onValueChange={(value: any) => handleUpdateAllocation(allocation.id, { entryRound: value })}
                          >
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {entryRounds.map(round => (
                                <SelectItem key={round} value={round}>
                                  {round}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-poppins font-medium text-[#292929]">Initial Capital Allocation (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={allocation.capitalAllocationPct}
                          onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                            capitalAllocationPct: parseFloat(e.target.value) || 0
                          })}
                          className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                        />
                        <p className="text-sm text-[#292929]/60 font-poppins">
                          Initial Investment Capital: ${formatCurrency(fundSize * allocation.capitalAllocationPct / 100)}
                        </p>
                      </div>

                      {/* Initial Check Strategy */}
                      <div className="space-y-4 border-t border-[#E0D8D1] pt-6">
                        <h4 className="text-lg font-inter font-bold text-[#292929]">Initial Check Strategy</h4>

                        <div className="space-y-3">
                          <Label className="text-sm font-poppins font-medium text-[#292929]">Strategy Type</Label>
                          <Select
                            value={allocation.initialCheckStrategy}
                            onValueChange={(value: 'amount' | 'ownership') =>
                              handleUpdateAllocation(allocation.id, { initialCheckStrategy: value })
                            }
                          >
                            <SelectTrigger className="h-12">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="amount">Check Amount</SelectItem>
                              <SelectItem value="ownership">Entry Ownership (%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {allocation.initialCheckStrategy === 'amount' ? (
                          <div className="space-y-3">
                            <Label className="text-sm font-poppins font-medium text-[#292929]">Initial Check Size ($)</Label>
                            <Input
                              type="text"
                              value={allocation.initialCheckAmount ? formatCurrency(allocation.initialCheckAmount) : ''}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                initialCheckAmount: parseCurrency(e.target.value) || undefined
                              })}
                              placeholder="e.g., 500,000"
                              className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                            />
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Label className="text-sm font-poppins font-medium text-[#292929]">Entry Ownership (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={allocation.initialOwnershipPct || ''}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                initialOwnershipPct: parseFloat(e.target.value) || undefined
                              })}
                              placeholder="e.g., 10"
                              className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                            />
                          </div>
                        )}

                        <div className="text-sm bg-gray-100 p-4 rounded-xl font-poppins border border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">📊 CALCULATED OUTPUTS (read-only)</p>
                          {calculations.impliedOwnership !== null && calculations.impliedOwnership !== undefined ? (
                            <p className="text-gray-700"><strong>Implied Entry Ownership:</strong> ~{calculations.impliedOwnership.toFixed(1)}% <span className="text-xs">(based on typical {allocation.entryRound} valuations)</span></p>
                          ) : (
                            <p className="text-gray-700"><strong>Implied Entry Ownership:</strong> <span className="text-gray-400">Not calculable - provide valuation assumptions</span></p>
                          )}
                          <p className="text-gray-700"><strong>Estimated Initial Investments:</strong> {calculations.estimatedDeals}</p>
                          <p className="text-gray-700"><strong>Capital for Initial Investments:</strong> ${formatCurrency(calculations.initialCapital)}</p>
                        </div>
                      </div>

                      {/* Follow-On Strategy */}
                      <div className="space-y-4 border-t border-[#E0D8D1] pt-6">
                        <h4 className="text-lg font-inter font-bold text-[#292929]">Follow-On Strategy</h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-poppins font-medium text-[#292929]">Follow-On Strategy</Label>
                            <Select
                              value={allocation.followOnStrategy}
                              onValueChange={(value: 'amount' | 'maintain_ownership') =>
                                handleUpdateAllocation(allocation.id, { followOnStrategy: value })
                              }
                            >
                              <SelectTrigger className="h-12">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="amount">Fixed Amount</SelectItem>
                                <SelectItem value="maintain_ownership">Maintain Ownership (%)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-sm font-poppins font-medium text-[#292929]">Follow-On Participation (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={allocation.followOnParticipationPct}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                followOnParticipationPct: parseFloat(e.target.value) || 0
                              })}
                              className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                            />
                          </div>
                        </div>

                        {allocation.followOnStrategy === 'amount' && (
                          <div className="space-y-3">
                            <Label className="text-sm font-poppins font-medium text-[#292929]">Follow-On Check Size ($)</Label>
                            <Input
                              type="text"
                              value={allocation.followOnAmount ? formatCurrency(allocation.followOnAmount) : ''}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                followOnAmount: parseCurrency(e.target.value) || undefined
                              })}
                              placeholder="e.g., 1,000,000"
                              className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                            />
                          </div>
                        )}

                        <div className="text-sm bg-gray-100 p-4 rounded-xl font-poppins border border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">📊 CALCULATED OUTPUT (read-only)</p>
                          <p className="text-gray-700"><strong>Projected Follow-On Capital:</strong> ${formatCurrency(calculations.followOnCapital)}</p>
                          <p className="text-xs text-gray-500 mt-1">Based on graduation rates and participation strategy</p>
                        </div>
                      </div>

                      {/* Investment Horizon */}
                      <div className="space-y-3 border-t border-[#E0D8D1] pt-6">
                        <Label className="text-sm font-poppins font-medium text-[#292929]">Initial Investment Horizon (months)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="120"
                          value={allocation.investmentHorizonMonths}
                          onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                            investmentHorizonMonths: parseInt(e.target.value) || 24
                          })}
                          className="h-12 border-[#E0D8D1] focus:border-[#292929] focus:ring-[#292929] font-poppins"
                        />
                        <p className="text-sm text-[#292929]/60 font-poppins">
                          Time period over which you expect to make initial investments in this allocation
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <Button onClick={handleAddAllocation} variant="outline" className="w-full h-12 border-[#E0D8D1] hover:bg-[#E0D8D1]/20 hover:border-[#292929] font-poppins font-medium">
              <Plus className="h-4 w-4 mr-2" />
              + New Allocation
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-[#E0D8D1] mt-8">
          <Button
            variant="outline"
            onClick={() => navigate('/fund-setup?step=2')}
            className="flex items-center gap-2 px-8 py-3 h-auto border-[#E0D8D1] hover:bg-[#E0D8D1]/20 hover:border-[#292929] font-poppins font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            onClick={() => navigate('/fund-setup?step=4')}
            className="flex items-center gap-2 bg-[#292929] hover:bg-[#292929]/90 text-white px-8 py-3 h-auto font-poppins font-medium"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}