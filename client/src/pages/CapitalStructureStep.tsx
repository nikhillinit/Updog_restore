import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, ArrowRight, Edit } from "lucide-react";
import { useFundSelector, useFundTuple, useFundAction } from '@/stores/useFundSelector';

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

  const totalAllocationPct = allocations.reduce((sum, alloc) => sum + alloc.capitalAllocationPct, 0);

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
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Capital Allocations</h2>
        <p className="text-gray-600 mt-2">Define how your fund's capital will be allocated across investment strategies</p>
      </div>

      {/* Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle>Allocation Overview</CardTitle>
          <CardDescription>
            Investable Capital: ${(investableCapital / 1000000).toFixed(1)}M 
            {totalAllocationPct > 0 && (
              <span className="ml-2">• Total Allocated: {totalAllocationPct.toFixed(1)}%</span>
            )}
            {totalAllocationPct > 100 && (
              <span className="text-red-500 ml-2">⚠️ Over-allocated</span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Current Allocations */}
      <Card>
        <CardHeader>
          <CardTitle>Current Allocations</CardTitle>
          <CardDescription>
            Your currently defined allocations. Click on + New Allocation to create a new allocation or click on any allocation to edit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {allocations.map((allocation) => {
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
                      <div className="space-y-2">
                        <Label>Allocation Name</Label>
                        <Input
                          value={allocation.name}
                          onChange={(e) => handleUpdateAllocation(allocation.id, { name: e.target.value })}
                          placeholder="e.g., Seed Investments"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Sector Profile</Label>
                        <Select
                          value={allocation.sectorProfileId || 'default'}
                          onValueChange={(value) => handleUpdateAllocation(allocation.id, { sectorProfileId: value })}
                        >
                          <SelectTrigger>
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
                      
                      <div className="space-y-2">
                        <Label>Entry Round</Label>
                        <Select
                          value={allocation.entryRound}
                          onValueChange={(value) => handleUpdateAllocation(allocation.id, { entryRound: value })}
                        >
                          <SelectTrigger>
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

                    <div className="space-y-2">
                      <Label>Capital Allocation (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={allocation.capitalAllocationPct}
                        onChange={(e) => handleUpdateAllocation(allocation.id, { 
                          capitalAllocationPct: parseFloat(e.target.value) || 0 
                        })}
                      />
                      <p className="text-sm text-gray-500">
                        Allocated Capital: ${((investableCapital * allocation.capitalAllocationPct / 100) / 1000000).toFixed(1)}M
                      </p>
                    </div>

                    {/* Initial Check Strategy */}
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="font-medium">Initial Check Strategy</h4>
                      
                      <div className="space-y-2">
                        <Label>Strategy Type</Label>
                        <Select
                          value={allocation.initialCheckStrategy}
                          onValueChange={(value: 'amount' | 'ownership') => 
                            handleUpdateAllocation(allocation.id, { initialCheckStrategy: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">Check Amount</SelectItem>
                            <SelectItem value="ownership">Entry Ownership (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {allocation.initialCheckStrategy === 'amount' ? (
                        <div className="space-y-2">
                          <Label>Initial Check Size ($M)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={allocation.initialCheckAmount || ''}
                            onChange={(e) => handleUpdateAllocation(allocation.id, { 
                              initialCheckAmount: parseFloat(e.target.value) || undefined 
                            })}
                            placeholder="e.g., 1.5"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Entry Ownership (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={allocation.initialOwnershipPct || ''}
                            onChange={(e) => handleUpdateAllocation(allocation.id, { 
                              initialOwnershipPct: parseFloat(e.target.value) || undefined 
                            })}
                            placeholder="e.g., 10"
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
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="font-medium">Follow-On Strategy</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Follow-On Strategy</Label>
                          <Select
                            value={allocation.followOnStrategy}
                            onValueChange={(value: 'amount' | 'maintain_ownership') => 
                              handleUpdateAllocation(allocation.id, { followOnStrategy: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="amount">Fixed Amount</SelectItem>
                              <SelectItem value="maintain_ownership">Maintain Ownership (%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Follow-On Participation (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={allocation.followOnParticipationPct}
                            onChange={(e) => handleUpdateAllocation(allocation.id, { 
                              followOnParticipationPct: parseFloat(e.target.value) || 0 
                            })}
                          />
                        </div>
                      </div>

                      {allocation.followOnStrategy === 'amount' && (
                        <div className="space-y-2">
                          <Label>Follow-On Check Size ($M)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={allocation.followOnAmount || ''}
                            onChange={(e) => handleUpdateAllocation(allocation.id, { 
                              followOnAmount: parseFloat(e.target.value) || undefined 
                            })}
                            placeholder="e.g., 2.0"
                          />
                        </div>
                      )}
                      
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                        <p><strong>Follow-On Capital:</strong> ${(calculations.followOnCapital / 1000000).toFixed(1)}M</p>
                      </div>
                    </div>

                    {/* Investment Horizon */}
                    <div className="space-y-2 border-t pt-4">
                      <Label>Initial Investment Horizon (months)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="120"
                        value={allocation.investmentHorizonMonths}
                        onChange={(e) => handleUpdateAllocation(allocation.id, { 
                          investmentHorizonMonths: parseInt(e.target.value) || 24 
                        })}
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
          
          <Button onClick={handleAddAllocation} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            + New Allocation
          </Button>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button 
          variant="outline"
          onClick={() => navigate('/fund-setup?step=1')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button 
          onClick={() => navigate('/fund-setup?step=3')}
          className="flex items-center gap-2"
        >
          Next Step
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}