import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Edit } from "lucide-react";
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

  // Get investable capital from fund size (assuming some percentage)
  const fundSize = useFundSelector(s => s.fundSize);
  const investableCapital = fundSize ? fundSize * 0.8 : 0; // Assume 80% investable

  // Mock allocations (this would come from store)
  const [allocations, setAllocations] = useState<CapitalAllocation[]>([
    {
      id: 'seed-allocation',
      name: 'Seed Investments',
      entryRound: 'Seed',
      capitalAllocationPct: 40,
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
      capitalAllocationPct: 35,
      initialCheckStrategy: 'amount',
      initialCheckAmount: 2.5,
      followOnStrategy: 'amount',
      followOnAmount: 1.5,
      followOnParticipationPct: 80,
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

  const calculateImpliedValues = (allocation: CapitalAllocation) => {
    const allocatedCapital = investableCapital * (allocation.capitalAllocationPct / 100);

    let impliedOwnership = 0;
    let estimatedDeals = 0;
    let initialCapital = 0;

    if (allocation.initialCheckStrategy === 'amount' && allocation.initialCheckAmount) {
      estimatedDeals = Math.floor(allocatedCapital / allocation.initialCheckAmount);
      // Would need sector profile data to calculate implied ownership
      impliedOwnership = 8; // Mock value
      initialCapital = allocation.initialCheckAmount * estimatedDeals;
    } else if (allocation.initialCheckStrategy === 'ownership' && allocation.initialOwnershipPct) {
      impliedOwnership = allocation.initialOwnershipPct;
      // Would need sector profile valuations to calculate check size and deal count
      estimatedDeals = 15; // Mock value
      initialCapital = allocatedCapital * 0.6; // Mock value
    }

    return {
      allocatedCapital,
      impliedOwnership,
      estimatedDeals,
      initialCapital,
      followOnCapital: allocatedCapital - initialCapital
    };
  };

  return (
    <ModernStepContainer
      title="Capital Structure"
      description="LP/GP commitments and capital calls"
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