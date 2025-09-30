import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Edit } from "lucide-react";
import { useFundContext } from '@/contexts/FundContext';
import { useFundSelector } from '@/stores/useFundSelector';
import { ModernStepContainer } from '@/components/wizard/ModernStepContainer';

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

export default function CapitalStructureStep() {
  const [, navigate] = useLocation();
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);

  // Get investable capital from fund context
  const { currentFund } = useFundContext();
  const fundSize = currentFund?.size || 0;
  const investableCapital = fundSize * 0.8; // Assume 80% investable

  // Get investment strategy stages for graduation rate modeling
  const stages = useFundSelector(s => s.stages);

  // Mock allocations (this would come from store)
  const [allocations, setAllocations] = useState<CapitalAllocation[]>([
    {
      id: 'seed-allocation',
      name: 'Seed Investments',
      entryRound: 'Seed',
      capitalAllocationPct: 43,
      initialCheckStrategy: 'ownership',
      initialOwnershipPct: 8,
      followOnStrategy: 'maintain_ownership',
      followOnParticipationPct: 70,
      investmentHorizonMonths: 24
    },
    {
      id: 'series-a-allocation',
      name: 'Series A Investments',
      entryRound: 'Series A',
      capitalAllocationPct: 14,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 2.5,
      followOnStrategy: 'amount',
      followOnAmount: 1.5,
      followOnParticipationPct: 80,
      investmentHorizonMonths: 18
    },
    {
      id: 'pre-seed-allocation',
      name: 'Pre-Seed Investments',
      entryRound: 'Pre-Seed',
      capitalAllocationPct: 43,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 0.75,
      followOnStrategy: 'amount',
      followOnAmount: 0.5,
      followOnParticipationPct: 60,
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

  // Deterministic portfolio modeling algorithm using graduation rates
  const calculateImpliedValues = (allocation: CapitalAllocation) => {
    const allocatedCapital = investableCapital * (allocation.capitalAllocationPct / 100);

    // Find the entry stage in our investment strategy
    const entryStage = stages.find(stage => stage.name === allocation.entryRound);
    if (!entryStage) {
      // Fallback to simple calculation if stage not found
      return calculateSimpleAllocation(allocation, allocatedCapital);
    }

    // Get stage progression data
    const stageIndex = stages.findIndex(stage => stage.name === allocation.entryRound);
    const subsequentStages = stages.slice(stageIndex);

    // Deterministic algorithm: work backwards from target portfolio size
    const targetDealsInThisStage = calculateTargetDeals(allocation, allocatedCapital);

    // Model progression through subsequent stages using graduation rates
    const stageProgression = modelStageProgression(subsequentStages, targetDealsInThisStage);

    // Calculate total capital requirements across all stages
    const capitalDistribution = calculateCapitalDistribution(allocation, stageProgression, allocatedCapital);

    return {
      allocatedCapital,
      impliedOwnership: calculateImpliedOwnership(allocation),
      estimatedDeals: targetDealsInThisStage,
      initialCapital: capitalDistribution.initialCapital,
      followOnCapital: capitalDistribution.followOnCapital,
      stageProgression, // Additional data for detailed modeling
      totalFutureCommitment: capitalDistribution.totalCommitment
    };
  };

  // Helper function for simple fallback calculation
  const calculateSimpleAllocation = (allocation: CapitalAllocation, allocatedCapital: number) => {
    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      const checkAmountInDollars = allocation.initialCheckAmount * 1000000;
      const estimatedDeals = Math.floor(allocatedCapital / checkAmountInDollars);
      return {
        allocatedCapital,
        impliedOwnership: calculateImpliedOwnership(allocation),
        estimatedDeals,
        initialCapital: checkAmountInDollars * estimatedDeals,
        followOnCapital: allocatedCapital - (checkAmountInDollars * estimatedDeals)
      };
    }
    return {
      allocatedCapital,
      impliedOwnership: 0,
      estimatedDeals: 0,
      initialCapital: 0,
      followOnCapital: allocatedCapital
    };
  };

  // Calculate target number of deals at entry stage
  const calculateTargetDeals = (allocation: CapitalAllocation, allocatedCapital: number): number => {
    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      // Start with simple division, then adjust for follow-on requirements
      const initialCheckSize = allocation.initialCheckAmount * 1000000;
      const baseDeals = Math.floor(allocatedCapital / initialCheckSize);

      // Adjust for follow-on capital requirements (reserve 60% for follow-ons)
      const adjustedDeals = Math.floor(baseDeals * 0.4); // More conservative to account for follow-ons
      return Math.max(1, adjustedDeals);
    }
    return 10; // Default fallback
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

  // Calculate capital distribution across initial and follow-on investments
  const calculateCapitalDistribution = (allocation: CapitalAllocation, stageProgression: any[], totalCapital: number) => {
    if (!allocation.initialCheckAmount) {
      return { initialCapital: 0, followOnCapital: totalCapital, totalCommitment: totalCapital };
    }

    const initialCheckSize = allocation.initialCheckAmount * 1000000;
    const initialDeals = stageProgression[0]?.startingDeals || 0;
    const initialCapital = initialCheckSize * initialDeals;

    // Calculate follow-on requirements based on stage progression
    let totalFollowOnCapital = 0;

    for (let i = 1; i < stageProgression.length; i++) {
      const stage = stageProgression[i];
      if (stage.startingDeals > 0) {
        // Estimate follow-on check size (typically 2-3x initial for growth stages)
        const followOnMultiplier = i === 1 ? 2.5 : (i === 2 ? 4 : 6);
        const followOnPerDeal = initialCheckSize * followOnMultiplier;
        totalFollowOnCapital += followOnPerDeal * stage.startingDeals;
      }
    }

    const totalCommitment = initialCapital + totalFollowOnCapital;

    // Scale down if total exceeds allocation
    const scaleFactor = totalCommitment > totalCapital ? totalCapital / totalCommitment : 1;

    return {
      initialCapital: initialCapital * scaleFactor,
      followOnCapital: totalFollowOnCapital * scaleFactor,
      totalCommitment: totalCommitment * scaleFactor
    };
  };

  // Calculate implied ownership based on typical valuations
  const calculateImpliedOwnership = (allocation: CapitalAllocation): number => {
    if (!allocation.initialCheckAmount) return 0;

    const typicalValuations = {
      'Pre-Seed': 6000000,
      'Seed': 15000000,
      'Series A': 32000000,
      'Series B': 75000000,
      'Series C': 150000000
    };

    const valuation = typicalValuations[allocation.entryRound as keyof typeof typicalValuations] || 20000000;
    const checkSize = allocation.initialCheckAmount * 1000000;
    return (checkSize / valuation) * 100;
  };

  return (
    <ModernStepContainer
      title="Capital Allocation"
      description="Configure how investable capital is allocated across investment stages"
    >
      <div className="space-y-8">
        {/* Overview Section */}
        <div className="space-y-6">
          <div className="p-6 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-charcoal-900">
                  ${(investableCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-sm text-gray-600">Investable Capital</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${
                  totalAllocationPct > 100 ? 'text-red-600' : 'text-charcoal-900'
                }`}>
                  {totalAllocationPct.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Total Allocated</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-charcoal-900">
                  {allocations.length}
                </div>
                <div className="text-sm text-gray-600">Allocations</div>
              </div>
            </div>
            {totalAllocationPct > 100 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
                ⚠️ Total allocation exceeds 100%
              </div>
            )}
          </div>
        </div>

        {/* Current Allocations */}
        <div className="space-y-6">
          <div className="pb-4 border-b border-gray-100">
            <h3 className="text-lg font-medium text-charcoal-800 mb-2">Current Allocations</h3>
            <p className="text-gray-600">
              Your currently defined allocations. Click on + New Allocation to create a new allocation or click on any allocation to edit.
            </p>
          </div>

          <div className="space-y-4">
            {allocations.map((allocation: any) => {
              const calculations = calculateImpliedValues(allocation);
              const isEditing = editingAllocation === allocation.id;

              return (
                <div key={allocation.id} className="border rounded-lg p-4 space-y-4">
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

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Entry Round:</span>
                          <div className="font-medium">{allocation.entryRound}</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Capital Allocation:</span>
                          <div className="font-medium">{allocation.capitalAllocationPct}%</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Allocated Capital:</span>
                          <div className="font-medium">${(calculations.allocatedCapital / 1000000).toFixed(1)}M</div>
                        </div>
                        <div>
                          <span className="text-gray-500">Est. Initial Deals:</span>
                          <div className="font-medium">{calculations.estimatedDeals}</div>
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
                          <Label className="text-sm font-medium text-charcoal-700">Allocation Name</Label>
                          <Input
                            value={allocation.name}
                            onChange={(e: any) => handleUpdateAllocation(allocation.id, { name: e.target.value })}
                            placeholder="e.g., Seed Investments"
                            className="h-12"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-medium text-charcoal-700">Sector Profile</Label>
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
                          <Label className="text-sm font-medium text-charcoal-700">Entry Round</Label>
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
                        <Label className="text-sm font-medium text-charcoal-700">Capital Allocation (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={allocation.capitalAllocationPct}
                          onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                            capitalAllocationPct: parseFloat(e.target.value) || 0
                          })}
                          className="h-12"
                        />
                        <p className="text-sm text-gray-500">
                          Allocated Capital: ${((investableCapital * allocation.capitalAllocationPct / 100) / 1000000).toFixed(1)}M
                        </p>
                      </div>

                      {/* Initial Check Strategy */}
                      <div className="space-y-4 border-t border-gray-100 pt-6">
                        <h4 className="text-lg font-medium text-charcoal-800">Initial Check Strategy</h4>

                        <div className="space-y-3">
                          <Label className="text-sm font-medium text-charcoal-700">Strategy Type</Label>
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
                            <Label className="text-sm font-medium text-charcoal-700">Initial Check Size ($M)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={allocation.initialCheckAmount || ''}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                initialCheckAmount: parseFloat(e.target.value) || undefined
                              })}
                              placeholder="e.g., 1.5"
                              className="h-12"
                            />
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-charcoal-700">Entry Ownership (%)</Label>
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
                              className="h-12"
                            />
                          </div>
                        )}

                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          <p><strong>Implied Entry Ownership:</strong> ~{calculations.impliedOwnership.toFixed(1)}%</p>
                          <p><strong>Estimated Initial Investments:</strong> {calculations.estimatedDeals}</p>
                          <p><strong>Capital for Initial Investments:</strong> ${(calculations.initialCapital / 1000000).toFixed(1)}M</p>
                        </div>
                      </div>

                      {/* Follow-On Strategy */}
                      <div className="space-y-4 border-t border-gray-100 pt-6">
                        <h4 className="text-lg font-medium text-charcoal-800">Follow-On Strategy</h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-charcoal-700">Follow-On Strategy</Label>
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
                            <Label className="text-sm font-medium text-charcoal-700">Follow-On Participation (%)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={allocation.followOnParticipationPct}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                followOnParticipationPct: parseFloat(e.target.value) || 0
                              })}
                              className="h-12"
                            />
                          </div>
                        </div>

                        {allocation.followOnStrategy === 'amount' && (
                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-charcoal-700">Follow-On Check Size ($M)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={allocation.followOnAmount || ''}
                              onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                                followOnAmount: parseFloat(e.target.value) || undefined
                              })}
                              placeholder="e.g., 2.0"
                              className="h-12"
                            />
                          </div>
                        )}

                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          <p><strong>Follow-On Capital:</strong> ${(calculations.followOnCapital / 1000000).toFixed(1)}M</p>
                        </div>
                      </div>

                      {/* Investment Horizon */}
                      <div className="space-y-3 border-t border-gray-100 pt-6">
                        <Label className="text-sm font-medium text-charcoal-700">Initial Investment Horizon (months)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="120"
                          value={allocation.investmentHorizonMonths}
                          onChange={(e: any) => handleUpdateAllocation(allocation.id, {
                            investmentHorizonMonths: parseInt(e.target.value) || 24
                          })}
                          className="h-12"
                        />
                        <p className="text-sm text-gray-500">
                          Time period over which you expect to make initial investments in this allocation
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <Button onClick={handleAddAllocation} variant="outline" className="w-full h-12">
              <Plus className="h-4 w-4 mr-2" />
              + New Allocation
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-8 border-t border-gray-100 mt-8">
          <Button
            variant="outline"
            onClick={() => navigate('/fund-setup?step=1')}
            className="flex items-center gap-2 px-8 py-3 h-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            onClick={() => navigate('/fund-setup?step=3')}
            className="flex items-center gap-2 bg-charcoal-800 hover:bg-charcoal-900 text-white px-8 py-3 h-auto"
          >
            Next Step
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </ModernStepContainer>
  );
}