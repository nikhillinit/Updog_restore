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
import { useFundTuple, useFundAction } from '@/stores/useFundSelector';
import { signatureForStrategy } from '@/domain/strategy-signature';
import { traceWizard } from '@/debug/wizard-trace';
import { useRenderTracking } from '@/utils/performance-baseline';
import { spreadIfDefined } from '@/lib/ts/spreadIfDefined';
import CapitalFirstCalculator from '@/components/CapitalFirstCalculator';
import type { Stage, SectorProfile, Allocation } from "@shared/types";

/**
 * Investment Strategy Step - Migrated to use new safe selector patterns
 * This component uses the new vanilla store with proper selector hooks to prevent
 * infinite re-renders and getSnapshot warnings.
 */
export default function InvestmentStrategyStep() {
  // Track render performance in development
  useRenderTracking('InvestmentStrategyStep');
  
  // Use tuple selector for state values with shallow equality
  const [hydrated, stages, sectorProfiles, allocations] = useFundTuple(s => [
    s.hydrated,
    s.stages,
    s.sectorProfiles,
    s.allocations,
  ]);
  
  // Use action selectors for stable function references
  const fromInvestmentStrategy = useFundAction(s => s.fromInvestmentStrategy);
  const addStage = useFundAction(s => s.addStage);
  const removeStage = useFundAction(s => s.removeStage);
  const updateStageName = useFundAction(s => s.updateStageName);
  const updateStageRate = useFundAction(s => s.updateStageRate);
  
  // Use ref pattern to keep action reference stable across renders
  const fromStrategyRef = useRef(fromInvestmentStrategy);
  useEffect(() => {
    fromStrategyRef.current = fromInvestmentStrategy;
  }, [fromInvestmentStrategy]);
  
  // Build the payload in a memo (don't recreate on each render)
  const data = React.useMemo(() => ({
    stages: stages.map((s: any) => ({
      id: s.id,
      name: s.name,
      graduationRate: s.graduate, // adapt to engine shape
      exitRate: s.exit,
    })),
    sectorProfiles,
    allocations,
  }), [stages, sectorProfiles, allocations]);
  
  // Memoize validation to prevent recalculation on every render
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
  
  // Guarded write-back: only when hydrated and signature changes
  const lastSig = React.useRef<string>('');
  React.useEffect(() => {
    if (!hydrated) {
      traceWizard('STEP2_NOT_HYDRATED', { hydrated }, { component: 'InvestmentStrategyStep' });
      return;
    }

    const sig = signatureForStrategy(data);
    if (sig === lastSig.current) {
      traceWizard('SKIP_WRITE_SAME', { sig }, { component: 'InvestmentStrategyStep' });
      return;
    }

    // Update store once per actual change
    traceWizard('WRITE_FROM_STRATEGY', { sig, prevSig: lastSig.current }, { component: 'InvestmentStrategyStep' });
    lastSig.current = sig;
    
    // Use ref pattern to avoid stale closures - keeps React semantics
    fromStrategyRef.current(data as any);
  }, [hydrated, data]); // Function deliberately omitted from deps

  const handleAddStage = () => {
    addStage();
  };

  const updateStage = (index: number, updates: Partial<Stage>) => {
    if ('name' in updates && updates.name !== undefined) {
      updateStageName(index, updates.name);
    }
    if ('graduationRate' in updates || 'exitRate' in updates) {
      updateStageRate(index, {
        ...spreadIfDefined('graduate', updates.graduationRate),
        ...spreadIfDefined('exit', updates.exitRate)
      });
    }
  };

  const handleRemoveStage = (index: number) => {
    removeStage(index);
  };

  const addSectorProfile = () => {
    const newSector: SectorProfile = {
      id: `sector-${Date.now()}`,
      name: '',
      targetPercentage: 0,
      description: '',
    };
    fromStrategyRef.current({
      ...data,
      sectorProfiles: [...data.sectorProfiles, newSector]
    });
  };

  const updateSectorProfile = (index: number, updates: Partial<SectorProfile>) => {
    const updatedSectors = data.sectorProfiles.map((sector: any, i: number) => 
      i === index ? { ...sector, ...updates } : sector
    );
    fromStrategyRef.current({
      ...data,
      sectorProfiles: updatedSectors
    });
  };

  const removeSectorProfile = (index: number) => {
    const updatedSectors = data.sectorProfiles.filter((_: any, i: number) => i !== index);
    fromStrategyRef.current({
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
    fromStrategyRef.current({
      ...data,
      allocations: [...data.allocations, newAllocation]
    });
  };

  const updateAllocation = (index: number, updates: Partial<Allocation>) => {
    const updatedAllocations = data.allocations.map((allocation: any, i: number) => 
      i === index ? { ...allocation, ...updates } : allocation
    );
    fromStrategyRef.current({
      ...data,
      allocations: updatedAllocations
    });
  };

  const removeAllocation = (index: number) => {
    const updatedAllocations = data.allocations.filter((_: any, i: number) => i !== index);
    fromStrategyRef.current({
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stages">Investment Stages</TabsTrigger>
          <TabsTrigger value="sectors">Sector Profiles</TabsTrigger>
          <TabsTrigger value="allocations">Capital Allocation</TabsTrigger>
          <TabsTrigger value="calculator">Portfolio Calculator</TabsTrigger>
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
                        onChange={(e: any) => updateStage(index, { name: e.target.value })}
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
                        onChange={(e: any) => updateStage(index, { graduationRate: parseFloat(e.target.value) || 0 })}
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
                        onChange={(e: any) => updateStage(index, { exitRate: parseFloat(e.target.value) || 0 })}
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
                        onChange={(e: any) => updateSectorProfile(index, { name: e.target.value })}
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
                        onChange={(e: any) => updateSectorProfile(index, { targetPercentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Description (Optional)</Label>
                    <Textarea
                      value={sector.description || ''}
                      onChange={(e: any) => updateSectorProfile(index, { description: e.target.value })}
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
                        onChange={(e: any) => updateAllocation(index, { category: e.target.value })}
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
                        onChange={(e: any) => updateAllocation(index, { percentage: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Description (Optional)</Label>
                    <Textarea
                      value={allocation.description || ''}
                      onChange={(e: any) => updateAllocation(index, { description: e.target.value })}
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

        <TabsContent value="calculator" className="space-y-4">
          <CapitalFirstCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}