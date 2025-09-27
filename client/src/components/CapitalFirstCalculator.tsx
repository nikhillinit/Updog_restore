import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Info, Calculator } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFundTuple } from '@/stores/useFundSelector';
import { 
  computeFromCapital_v2, 
  roundToNearestWhole, 
  validateCapitalFirstInputs,
  type CapitalFirstInputsV2,
  type StageKey,
  type FollowOnRule,
  StageOrder 
} from '@/lib/capital-first';
import { committedFeeDragPctFromTiers } from '@/lib/fees';

interface CapitalFirstCalculatorProps {
  className?: string;
}

export default function CapitalFirstCalculator({ className }: CapitalFirstCalculatorProps) {
  const [showWholeNumbers, setShowWholeNumbers] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get state from store
  const [
    fundSize,
    feeProfiles,
    stages,
    sectorProfiles,
    allocations,
    followOnChecks
  ] = useFundTuple(s => [
    s.fundSize,
    s.feeProfiles,
    s.stages,
    s.sectorProfiles,
    s.allocations,
    s.followOnChecks
  ]);

  // Build inputs for capital-first calculation
  const primaryFeeProfile = feeProfiles[0];
  const inputs: CapitalFirstInputsV2 = useMemo(() => {
    // Calculate fee drag from tier tables
    const feeDragPct = primaryFeeProfile?.feeTiers 
      ? committedFeeDragPctFromTiers(primaryFeeProfile.feeTiers)
      : 20; // Fallback estimate for 2% over 10 years

    // Map allocations to stage percentages
    const allocationPctByStage: Record<StageKey, number> = {
      preseed: 0,
      seed: 0,
      seriesA: 0,
      seriesBplus: 0
    };

    // Simple mapping for demo - in production, you'd have more sophisticated allocation logic
    allocations.forEach((alloc: any, index: any) => {
      const stageKey = StageOrder[index % StageOrder.length];
      if (stageKey) {
        allocationPctByStage[stageKey] = alloc.percentage || 0;
      }
    });

    // Map stages to graduation percentages and initial checks
    const graduationPctByStage: Record<StageKey, number> = {
      preseed: 0,
      seed: 0,
      seriesA: 0,
      seriesBplus: 0
    };
    
    const initialCheckByStage: Record<StageKey, number> = {
      preseed: 250_000,
      seed: 500_000,
      seriesA: 800_000,
      seriesBplus: 1_200_000
    };

    stages.forEach((stage: any, index: any) => {
      const stageKey = StageOrder[index % StageOrder.length];
      if (stageKey) {
        graduationPctByStage[stageKey] = stage.graduate || 0;
        // You could derive check sizes from your store if available
      }
    });

    // Market data - in production this would come from sector profiles
    const marketByStage = {
      preseed: { valuationPost: 8_000_000, roundSize: 2_000_000 },
      seed: { valuationPost: 20_000_000, roundSize: 5_000_000 },
      seriesA: { valuationPost: 50_000_000, roundSize: 12_000_000 },
      seriesBplus: { valuationPost: 150_000_000, roundSize: 25_000_000 }
    };

    // Follow-on rules with maintain ownership strategy
    const followOnRules: FollowOnRule[] = [
      {
        from: 'preseed',
        to: 'seed',
        mode: 'maintain_ownership',
        participationPct: 70, // 70% participation in next rounds
        targetOwnershipPct: 8  // Target 8% ownership
      },
      {
        from: 'seed',
        to: 'seriesA',
        mode: 'maintain_ownership',
        participationPct: 80,
        targetOwnershipPct: 10
      },
      {
        from: 'seriesA',
        to: 'seriesBplus',
        mode: 'fixed_check',
        participationPct: 60,
        fixedAmount: 1_500_000 // Fixed $1.5M follow-on
      }
    ];

    return {
      totalCommitment: fundSize || 100_000_000,
      feeDragPct,
      allocationPctByStage,
      initialCheckByStage,
      graduationPctByStage,
      marketByStage,
      followOnRules
    };
  }, [primaryFeeProfile, fundSize, stages, allocations]);

  // Validate inputs
  const inputErrors = useMemo(() => validateCapitalFirstInputs(inputs), [inputs]);

  // Calculate results
  const results = useMemo(() => {
    if (inputErrors.length > 0) {
      return null;
    }
    return computeFromCapital_v2(inputs);
  }, [inputs, inputErrors]);

  // Calculate rounded portfolio if requested
  const roundedResults = useMemo(() => {
    if (!results || !showWholeNumbers) return null;
    return roundToNearestWhole(
      results.initialInvestmentsByStage,
      results.initialSpendByStage,
      results.followOnSpendByStage
    );
  }, [results, showWholeNumbers]);

  if (!results) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Capital-First Portfolio Calculator
          </CardTitle>
          <CardDescription>
            Preview how capital deploys across stages with proper follow-on modeling
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inputErrors.map((error: any, index: any) => (
            <Alert key={index} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(amount);

  const formatNumber = (num: number) => 
    showWholeNumbers && roundedResults ? Math.round(num).toLocaleString() : num.toFixed(1);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Capital-First Portfolio Calculator
        </CardTitle>
        <CardDescription>
          Preview portfolio deployment with proper follow-on reserve modeling
          {!primaryFeeProfile?.feeTiers && (
            <span className="block text-sm text-muted-foreground mt-1">
              <Info className="inline h-3 w-3 mr-1" />
              Fee drag based on simplified average. Actual fees depend on fee basis and step-downs.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="whole-numbers"
              checked={showWholeNumbers}
              onCheckedChange={setShowWholeNumbers}
            />
            <Label htmlFor="whole-numbers">Show nearest whole portfolio</Label>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Total Commitment</Label>
            <div className="text-lg font-semibold">{formatCurrency(inputs.totalCommitment)}</div>
          </div>
          
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Investable Capital</Label>
            <div className="text-lg font-semibold">{formatCurrency(results.grossInvestable)}</div>
          </div>
          
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Reserve Demand</Label>
            <div className="text-lg font-semibold">{formatCurrency(results.followOnReserveDemand)}</div>
          </div>
          
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Reserve Ratio</Label>
            <div className="text-lg font-semibold">
              {results.impliedReserveRatioPct.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Stage Breakdown */}
        <Tabs defaultValue="counts" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="counts">Investment Counts</TabsTrigger>
            <TabsTrigger value="capital">Capital Deployment</TabsTrigger>
          </TabsList>
          
          <TabsContent value="counts" className="space-y-4">
            <div className="grid gap-3">
              {StageOrder.map((stage: any) => (
                <div key={stage} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Label className="capitalize font-medium">{stage.replace(/([A-Z])/g, ' $1')}</Label>
                    {showWholeNumbers && roundedResults && (
                      <Badge variant={roundedResults.surplusByStage[stage] >= 0 ? "secondary" : "destructive"}>
                        {roundedResults.surplusByStage[stage] >= 0 ? '+' : ''}
                        {formatCurrency(roundedResults.surplusByStage[stage])} surplus
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {formatNumber(
                        showWholeNumbers && roundedResults 
                          ? roundedResults.rounded[stage]
                          : results.initialInvestmentsByStage[stage]
                      )} deals
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="capital" className="space-y-4">
            <div className="grid gap-3">
              {StageOrder.map((stage: any) => (
                <div key={stage} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="capitalize font-medium">{stage.replace(/([A-Z])/g, ' $1')}</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Initial:</span>
                      <span className="ml-2 font-medium">
                        {formatCurrency(results.initialSpendByStage[stage])}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Follow-on:</span>
                      <span className="ml-2 font-medium">
                        {formatCurrency(results.followOnSpendByStage[stage])}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Warnings */}
        {results.warnings.length > 0 && (
          <div className="space-y-2">
            {results.warnings.map((warning: any, index: any) => (
              <Alert key={index}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Advanced Settings */}
        {showAdvanced && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advanced Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fee Drag (%)</Label>
                  <Input 
                    type="number" 
                    value={inputs.feeDragPct.toFixed(1)} 
                    disabled 
                  />
                </div>
                <div>
                  <Label>Fund Term (months)</Label>
                  <Input 
                    type="number" 
                    value={120} 
                    disabled 
                  />
                </div>
              </div>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Advanced settings are calculated from your fee structure and fund configuration.
                  Modify them in the respective wizard steps.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}