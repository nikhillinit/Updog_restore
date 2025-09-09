/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useFundStore, setRenderPhase } from "@/stores/useFundStore";
import { type StrategyInputs } from "@/selectors/buildInvestmentStrategy";
import { useWorkerMemo } from "@/hooks/useWorkerMemo";
import { useFundPick } from "@/hooks/useFundPick";
import type { Stage, SectorProfile, Allocation } from "@shared/types";

export default function InvestmentStrategyStep() {
  // Mount effect guards
  const isMountedRef = useRef(false);
  const renderCountRef = useRef(0);
  
  // Safe mode and isolation toggles detection
  const urlParams = new URLSearchParams(window.location.search);
  const safeMode = urlParams.has('safe') || urlParams.get('debug') === 'safe';
  const noCharts = urlParams.has('nocharts') || urlParams.get('charts') === 'off';
  
  // Development render phase tracking
  useEffect(() => {
    setRenderPhase(true);
    return () => setRenderPhase(false);
  });

  // Mount effect idempotency with one-shot init guard
  const didInitRef = useRef(false);
  const [chartsInteractive, setChartsInteractive] = useState(false);
  
  useEffect(() => {
    if (isMountedRef.current) {
      console.warn('⚠️  InvestmentStrategyStep: Double mount detected');
      return;
    }
    isMountedRef.current = true;
    
    // Performance mark for Step 3 first render
    performance.mark('step3:first-render');
    try {
      performance.measure('step2->3', 'step2->3:click', 'step3:first-render');
      const measure = performance.getEntriesByName('step2->3')[0];
      if (measure && import.meta.env.DEV) {
        console.log(`⚡ Step 2->3 transition: ${measure.duration.toFixed(2)}ms`);
      }
    } catch {}
    
    if (import.meta.env.DEV) {
      console.log('✅ InvestmentStrategyStep mounted');
    }
    
    // One-shot initialization guard
    if (!didInitRef.current) {
      didInitRef.current = true;
      // Any one-time store updates would go here
      if (import.meta.env.DEV) {
        console.log('🏁 InvestmentStrategyStep: One-time initialization complete');
      }
    }
    
    // Enable chart interactivity after first paint (deferred rendering)
    const id = 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback(() => setChartsInteractive(true))
      : setTimeout(() => setChartsInteractive(true), 0);
    
    return () => {
      isMountedRef.current = false;
      if ('cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(id);
      } else {
        clearTimeout(id);
      }
      if (import.meta.env.DEV) {
        console.log('🧹 InvestmentStrategyStep unmounted');
      }
    };
  }, []);

  // Render counting for debugging
  if (import.meta.env.DEV) {
    renderCountRef.current += 1;
    if (renderCountRef.current > 100) {
      console.error('🚨 INFINITE RENDER DETECTED:', renderCountRef.current);
    }
  }

  // 1) Select ONLY primitives/arrays needed for strategy (guarded tuple selector)
  const inputs = useFundPick(
    useCallback((s) => ({
      stages: s.stages,
      sectorProfiles: s.sectorProfiles,
      allocations: s.allocations,
    }), [])
  ) as StrategyInputs;

  // 2) Worker factory for off-main-thread computation
  const makeWorker = useCallback(
    () => new Worker(new URL('../workers/strategy.worker.ts', import.meta.url), { type: 'module' }),
    []
  );

  // 3) Actually gate compute based on safe mode
  const strategy = useMemo(() => {
    if (safeMode) {
      // Safe mode: minimal synchronous computation only
      return {
        stages: inputs.stages.map(s => ({
          id: s.id,
          name: s.name,
          graduationRate: s.graduate,
          exitRate: s.exit,
          remainRate: Math.max(0, 100 - s.graduate - s.exit)
        })),
        sectorProfiles: inputs.sectorProfiles,
        allocations: inputs.allocations,
        totalSectorAllocation: inputs.sectorProfiles.reduce((sum, s) => sum + s.targetPercentage, 0),
        totalAllocation: inputs.allocations.reduce((sum, a) => sum + a.percentage, 0),
        validation: { stages: [], sectors: [], allocations: [], allValid: true }
      };
    }
    return null; // Will be computed by worker
  }, [inputs, safeMode]);

  // 4) Compute off the main thread using Web Worker (only when not in safe mode)
  const { data: workerData, loading: workerLoading, error: workerError, timing } = useWorkerMemo(
    makeWorker,
    safeMode ? null : inputs // Skip worker entirely in safe mode
  );

  // 5) Final data: safe mode immediate result or worker result (with proper typing)
  const data = (safeMode ? strategy : workerData) as {
    stages?: Array<{
      id: string;
      name: string;
      graduationRate: number;
      exitRate: number;
      remainRate: number;
    }>;
    sectorProfiles?: Array<{
      id: string;
      name: string;
      targetPercentage: number;
      description: string;
    }>;
    allocations?: Array<{
      id: string;
      category: string;
      percentage: number;
      description: string;
    }>;
    totalSectorAllocation?: number;
    totalAllocation?: number;
  } | null;

  const storeAddStage = useFundStore(state => state.addStage);
  const storeRemoveStage = useFundStore(state => state.removeStage);
  const storeUpdateStageName = useFundStore(state => state.updateStageName);
  const storeUpdateStageRate = useFundStore(state => state.updateStageRate);
  const fromInvestmentStrategy = useFundStore(state => state.fromInvestmentStrategy);
  const allValid = useFundStore(state => state.stageValidation().allValid);
  const [activeTab, setActiveTab] = useState("stages");

  const addStage = () => {
    storeAddStage();
  };

  const updateStage = (index: number, updates: Partial<Stage>) => {
    if ('name' in updates && updates.name !== undefined) {
      storeUpdateStageName(index, updates.name);
    }
    if ('graduationRate' in updates || 'exitRate' in updates) {
      storeUpdateStageRate(index, {
        graduate: updates.graduationRate,
        exit: updates.exitRate
      });
    }
  };

  const removeStage = (index: number) => {
    storeRemoveStage(index);
  };

  const addSectorProfile = () => {
    if (!data?.sectorProfiles) return;
    
    const newSector: SectorProfile = {
      id: `sector-${Date.now()}`,
      name: '',
      targetPercentage: 0,
      description: '',
    };
    fromInvestmentStrategy({
      stages: data.stages || [],
      sectorProfiles: [...data.sectorProfiles, newSector],
      allocations: data.allocations || []
    });
  };

  const updateSectorProfile = (index: number, updates: Partial<SectorProfile>) => {
    if (!data?.sectorProfiles) return;
    
    const updatedSectors = data.sectorProfiles.map((sector: any, i: number) => 
      i === index ? { ...sector, ...updates } : sector
    );
    fromInvestmentStrategy({
      stages: data.stages || [],
      sectorProfiles: updatedSectors,
      allocations: data.allocations || []
    });
  };

  const removeSectorProfile = (index: number) => {
    if (!data?.sectorProfiles) return;
    
    const updatedSectors = data.sectorProfiles.filter((_: any, i: number) => i !== index);
    fromInvestmentStrategy({
      stages: data.stages || [],
      sectorProfiles: updatedSectors,
      allocations: data.allocations || []
    });
  };

  const addAllocation = () => {
    if (!data?.allocations) return;
    
    const newAllocation: Allocation = {
      id: `allocation-${Date.now()}`,
      category: '',
      percentage: 0,
      description: '',
    };
    fromInvestmentStrategy({
      stages: data.stages || [],
      sectorProfiles: data.sectorProfiles || [],
      allocations: [...data.allocations, newAllocation]
    });
  };

  const updateAllocation = (index: number, updates: Partial<Allocation>) => {
    if (!data?.allocations) return;
    
    const updatedAllocations = data.allocations.map((allocation: any, i: number) => 
      i === index ? { ...allocation, ...updates } : allocation
    );
    fromInvestmentStrategy({
      stages: data.stages || [],
      sectorProfiles: data.sectorProfiles || [],
      allocations: updatedAllocations
    });
  };

  const removeAllocation = (index: number) => {
    if (!data?.allocations) return;
    
    const updatedAllocations = data.allocations.filter((_: any, i: number) => i !== index);
    fromInvestmentStrategy({
      stages: data.stages || [],
      sectorProfiles: data.sectorProfiles || [],
      allocations: updatedAllocations
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-charcoal">Investment Strategy</h2>
        <p className="text-gray-600 mt-2">Define your investment stages, sector focus, and capital allocation</p>
        {(safeMode || noCharts) && (
          <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-yellow-800 text-sm">
              {safeMode && noCharts ? 'Safe Mode + No Charts Active' : 
               safeMode ? 'Safe Mode Active - Limited functionality for debugging' :
               'No Charts Mode Active'}
            </span>
          </div>
        )}
        {import.meta.env.DEV && (
          <div className="mt-1 text-xs text-gray-500">
            Render: #{renderCountRef.current} | Mode: {safeMode ? 'Safe' : 'Normal'} | Charts: {noCharts ? 'Off' : 'On'}
            {timing && ` | Worker: ${timing.toFixed(1)}ms`}
            {workerLoading && ` | Computing...`}
          </div>
        )}
        {workerError && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-red-800 text-sm">Strategy computation failed: {workerError.message}</span>
          </div>
        )}
      </div>

      {safeMode || noCharts ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <AlertTriangle className="h-8 w-8 mx-auto text-yellow-600" />
            <p className="text-gray-600">
              {safeMode && noCharts ? 'Safe Mode + No Charts Active' : 
               safeMode ? 'Safe Mode Active - Minimal computation only' :
               'No Charts Mode Active - UI interactions disabled'}
            </p>
            <p className="text-sm text-gray-500">
              {safeMode ? 'Heavy computation bypassed for debugging' : 'Chart rendering disabled for debugging'}
            </p>
          </div>
        </div>
      ) : workerLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="text-gray-600">Computing investment strategy...</p>
            <p className="text-sm text-gray-500">This runs off the main thread to keep the UI responsive</p>
          </div>
        </div>
      ) : (
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
              {(data?.stages || []).map((stage: any, index: number) => (
                <div key={stage.id} className="border rounded-lg p-4 space-y-4" data-testid={`stage-${index}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Stage {index + 1}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStage(index)}
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
                        disabled={index === (data?.stages?.length || 0) - 1}
                      />
                      {index === (data?.stages?.length || 0) - 1 && stage.graduationRate > 0 && (
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
                          {stage.remainRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              <Button onClick={addStage} variant="outline" className="w-full">
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
                Define target allocation percentages by sector. Total: {data?.totalSectorAllocation?.toFixed(1) || '0.0'}%
                {(data?.totalSectorAllocation || 0) > 100 && <span className="text-red-500"> (exceeds 100%)</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(data?.sectorProfiles || []).map((sector: any, index: number) => (
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
                Define how capital will be allocated across different categories. Total: {data?.totalAllocation?.toFixed(1) || '0.0'}%
                {(data?.totalAllocation || 0) > 100 && <span className="text-red-500"> (exceeds 100%)</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(data?.allocations || []).map((allocation: any, index: number) => (
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
      )}
    </div>
  );
}

