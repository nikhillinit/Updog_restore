/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { useFundStore } from "@/stores/useFundStore";
import { signatureForStrategy } from "@/domain/strategy-signature";
import { traceWizard } from "@/debug/wizard-trace";
import type { Stage, SectorProfile, Allocation } from "@shared/types";

export default function InvestmentStrategyStep() {
  // 1) Use store directly with individual selectors to avoid array recreation
  const hydrated = useFundStore(s => s.hydrated);
  const stages = useFundStore(s => s.stages);
  const sectorProfiles = useFundStore(s => s.sectorProfiles);
  const allocations = useFundStore(s => s.allocations);

  // 2) Get actions once and memoize - they are stable references
  const actions = React.useMemo(() => {
    const state = useFundStore.getState();
    return {
      fromInvestmentStrategy: state.fromInvestmentStrategy,
      addStage: state.addStage,
      removeStage: state.removeStage,
      updateStageName: state.updateStageName,
      updateStageRate: state.updateStageRate,
    };
  }, []); // Empty deps - actions never change
  
  // 3) Derive UI payload from store slices (memo)
  const data = React.useMemo(() => ({
    stages: stages.map((s: any) => ({
      id: s.id,
      name: s.name,
      graduationRate: s.graduate,
      exitRate: s.exit,
      months: s.months,
    })),
    sectorProfiles,
    allocations,
  }), [stages, sectorProfiles, allocations]);
  
  // 4) Memoize validation to prevent recalculation on every render
  const { allValid } = React.useMemo(() => {
    const errors = stages.map((r: any, i: number) => {
      if (!r.name?.trim()) return 'Stage name required';
      if (r.graduate + r.exit > 100) return 'Graduate + Exit must be ≤ 100%';
      if (i === stages.length - 1 && r.graduate !== 0) return 'Last stage must have 0% graduation';
      return null;
    });
    return { allValid: errors.every((e: any) => !e), errorsByRow: errors };
  }, [stages]);
  const [activeTab, setActiveTab] = useState("stages");
  
  // 5) Signature-based sync (guarded) — stabilize the action via ref
  const fromRef = useRef(actions.fromInvestmentStrategy);
  useEffect(() => { 
    fromRef.current = actions.fromInvestmentStrategy; 
  }, [actions.fromInvestmentStrategy]);

  const sigRef = useRef<string>('');
  useEffect(() => {
    if (!hydrated) {
      traceWizard('STEP3_NOT_HYDRATED', { hydrated }, { component: 'InvestmentStrategyStep' });
      return;
    }
    const sig = signatureForStrategy(data);
    if (sig === sigRef.current) {
      traceWizard('STEP3_SKIP_WRITE_SAME', { sig }, { component: 'InvestmentStrategyStep' });
      return;
    }
    sigRef.current = sig;
    traceWizard('STEP3_WRITE_FROM_STRATEGY', { sig }, { component: 'InvestmentStrategyStep' });
    if (import.meta.env.DEV) {
      console.debug('[InvestmentStrategyStep] Data changed, sig:', sig.substring(0, 40) + '...');
    }
    // Use ref to avoid dependency on function identity
    // fromRef.current(data); // Note: Only call when parent needs sync
  }, [data, hydrated]);

  const handleAddStage = () => {
    actions.addStage();
  };

  const updateStage = (index: number, updates: Partial<Stage>) => {
    if ('name' in updates && updates.name !== undefined) {
      actions.updateStageName(index, updates.name);
    }
    if ('graduationRate' in updates || 'exitRate' in updates) {
      actions.updateStageRate(index, {
        graduate: updates.graduationRate,
        exit: updates.exitRate
      });
    }
  };

  const handleRemoveStage = (index: number) => {
    actions.removeStage(index);
  };

  const addSectorProfile = () => {
    const newSector: SectorProfile = {
      id: `sector-${Date.now()}`,
      name: '',
      targetPercentage: 0,
      description: '',
    };
    actions.fromInvestmentStrategy({
      ...data,
      sectorProfiles: [...data.sectorProfiles, newSector]
    });
  };

  const updateSectorProfile = (index: number, updates: Partial<SectorProfile>) => {
    const updatedSectors = data.sectorProfiles.map((sector: any, i: number) => 
      i === index ? { ...sector, ...updates } : sector
    );
    actions.fromInvestmentStrategy({
      ...data,
      sectorProfiles: updatedSectors
    });
  };

  const removeSectorProfile = (index: number) => {
    const updatedSectors = data.sectorProfiles.filter((_: any, i: number) => i !== index);
    actions.fromInvestmentStrategy({
      ...data,
      sectorProfiles: updatedSectors
    });
  };

  const addAllocation = () => {
    const newAllocation: Allocation = {
      id: `allocation-${Date.now()}`,
      category: '',
      percentage: 0,
      description: '',
    };
    actions.fromInvestmentStrategy({
      ...data,
      allocations: [...data.allocations, newAllocation]
    });
  };

  const updateAllocation = (index: number, updates: Partial<Allocation>) => {
    const updatedAllocations = data.allocations.map((allocation: any, i: number) => 
      i === index ? { ...allocation, ...updates } : allocation
    );
    actions.fromInvestmentStrategy({
      ...data,
      allocations: updatedAllocations
    });
  };

  const removeAllocation = (index: number) => {
    const updatedAllocations = data.allocations.filter((_: any, i: number) => i !== index);
    actions.fromInvestmentStrategy({
      ...data,
      allocations: updatedAllocations
    });
  };

  const totalSectorAllocation = data.sectorProfiles.reduce((sum: number, sector: any) => sum + sector.targetPercentage, 0);
  const totalAllocation = data.allocations.reduce((sum: number, alloc: any) => sum + alloc.percentage, 0);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Investment Strategy</h2>
        <p className="text-gray-600 mt-2">Define your investment stages, sector focus, and capital allocation</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stages">Investment Stages</TabsTrigger>
          <TabsTrigger value="sectors">Sector Profiles</TabsTrigger>
          <TabsTrigger value="allocations">Capital Allocation</TabsTrigger>
        </TabsList>

        <TabsContent value="stages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Investment Stages</CardTitle>
              <CardDescription>
                Define the stages of investment and their graduation/exit rates. Last stage must have 0% graduation rate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.stages.map((stage: any, index: number) => (
                <div key={stage.id} className="border rounded-lg p-4 space-y-4" data-testid={`stage-${index}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Stage {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveStage(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Stage Name</Label>
                      <Input
                        data-testid={`stage-${index}-name`}
                        value={stage.name}
                        onChange={(e) => updateStage(index, { name: e.target.value })}
                        placeholder="e.g., Seed, Series A"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Graduation Rate (%)</Label>
                      <Input
                        data-testid={`stage-${index}-graduate`}
                        type="number"
                        min="0"
                        max="100"
                        value={stage.graduationRate}
                        onChange={(e) => updateStage(index, { graduationRate: parseFloat(e.target.value) || 0 })}
                        disabled={index === data.stages.length - 1}
                      />
                      {index === data.stages.length - 1 && stage.graduationRate > 0 && (
                        <p className="text-sm text-red-500">Last stage must have 0% graduation rate</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Exit Rate (%)</Label>
                      <Input
                        data-testid={`stage-${index}-exit`}
                        type="number"
                        min="0"
                        max="100"
                        value={stage.exitRate}
                        onChange={(e) => updateStage(index, { exitRate: parseFloat(e.target.value) || 0 })}
                      />
                      {(stage.graduationRate + stage.exitRate) > 100 && (
                        <p className="text-sm text-red-500">Graduation + Exit rates cannot exceed 100%</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Remain (%)</Label>
                      <div className="p-2 bg-gray-50 rounded h-10 flex items-center">
                        <span className="text-gray-700" data-testid={`stage-${index}-remain`}>
                          {Math.max(0, 100 - stage.graduationRate - stage.exitRate)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              <Button onClick={handleAddStage} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Stage
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sectors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sector Profiles</CardTitle>
              <CardDescription>
                Define target allocation percentages by sector. Total: {totalSectorAllocation.toFixed(1)}%
                {totalSectorAllocation > 100 && <span className="text-red-500"> (exceeds 100%)</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.sectorProfiles.map((sector: any, index: number) => (
                <div key={sector.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Sector {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSectorProfile(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Sector Name</Label>
                      <Input
                        value={sector.name}
                        onChange={(e) => updateSectorProfile(index, { name: e.target.value })}
                        placeholder="e.g., FinTech, HealthTech"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Allocation (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={sector.targetPercentage}
                        onChange={(e) => updateSectorProfile(index, { targetPercentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Description (Optional)</Label>
                    <Textarea
                      value={sector.description || ''}
                      onChange={(e) => updateSectorProfile(index, { description: e.target.value })}
                      placeholder="Describe your focus and thesis for this sector"
                    />
                  </div>
                </div>
              ))}
              
              <Button onClick={addSectorProfile} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Sector
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Capital Allocation</CardTitle>
              <CardDescription>
                Define how capital will be allocated across different categories. Total: {totalAllocation.toFixed(1)}%
                {totalAllocation > 100 && <span className="text-red-500"> (exceeds 100%)</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.allocations.map((allocation: any, index: number) => (
                <div key={allocation.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Allocation {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAllocation(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input
                        value={allocation.category}
                        onChange={(e) => updateAllocation(index, { category: e.target.value })}
                        placeholder="e.g., New Investments, Reserves"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Allocation (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={allocation.percentage}
                        onChange={(e) => updateAllocation(index, { percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Description (Optional)</Label>
                    <Textarea
                      value={allocation.description || ''}
                      onChange={(e) => updateAllocation(index, { description: e.target.value })}
                      placeholder="Describe this allocation category"
                    />
                  </div>
                </div>
              ))}
              
              <Button onClick={addAllocation} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Allocation
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

