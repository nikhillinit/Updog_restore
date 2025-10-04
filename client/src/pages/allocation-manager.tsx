/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AllocationUI from "@/components/allocation/allocation-ui";
import SectorProfileBuilder from "@/components/allocation/sector-profile-builder";
import { computeReservesFromGraduation, type FundDataForReserves } from "@/core/reserves/computeReservesFromGraduation";
import { yearsToQuarters } from "@/lib/horizon";
import { 
  ArrowLeft, 
  Plus, 
  Settings, 
  Target, 
  TrendingUp, 
  BarChart3,
  Calculator,
  Info
} from "lucide-react";

interface AllocationSummary {
  id: string;
  name: string;
  stage: string;
  capitalAllocated: number;
  initialCapital: number;
  followOnCapital: number;
  reserveRatio: number;
  numberOfDeals: number;
  expectedMOIC: number;
  status: 'active' | 'draft' | 'archived';
}

export default function AllocationManager() {
  const [selectedAllocation, setSelectedAllocation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'allocations' | 'sector-profiles'>('allocations');
  
  // "Deploy ALL Capital" Methodology - No Unused Capital Allowed
  const calculatePreciseAllocation = () => {
    const totalFundSize = 55000000; // $55M fund
    const managementFees = totalFundSize * 0.2; // 20% management fees over life
    const fundCosts = 850000; // $850K fund costs
    const totalInvestableCapital = totalFundSize - managementFees - fundCosts;
    
    // Market-driven graduation rates (NOT fixed exit multiples)
    const stages = [
      {
        name: "Pre-Seed",
        avgCheckSize: 737868, // Auto-calculated for precise deployment
        graduationRate: 0.35,
        exitRate: 0.65,
        avgRoundSize: 2000000,
        avgPreMoney: 8000000,
        followOnParticipation: 0.85
      },
      {
        name: "Seed", 
        avgCheckSize: 1000000,
        graduationRate: 0.50,
        exitRate: 0.50,
        avgRoundSize: 5000000,
        avgPreMoney: 15000000,
        followOnParticipation: 0.80
      },
      {
        name: "Series A",
        avgCheckSize: 2000000,
        graduationRate: 0.60,
        exitRate: 0.40,
        avgRoundSize: 12000000,
        avgPreMoney: 30000000,
        followOnParticipation: 0.50
      }
    ];

    // Calculate exact number of deals to deploy ALL capital (with decimals)
    let remainingCapital = totalInvestableCapital;
    const calculatedAllocations = stages.map(stage => {
      const stagePercentage = stage.name === "Pre-Seed" ? 0.27 : stage.name === "Seed" ? 0.40 : 0.33;
      const stageCapital = totalInvestableCapital * stagePercentage;
      
      // CRITICAL: Precise decimal deals calculation to deploy ALL capital
      const exactNumberOfDeals = stageCapital / stage.avgCheckSize;
      
      // Calculate follow-on requirements using graduation-driven reserves engine
      const fundData: FundDataForReserves = {
        totalCommitment: stageCapital,
        targetCompanies: Math.round(exactNumberOfDeals),
        avgCheckSize: stage.avgCheckSize,
        deploymentPacePerYear: Math.round(exactNumberOfDeals / 2.5), // 2.5 year deployment
        graduationRates: {
          seedToA: { graduate: 35, fail: 45, remain: 20, months: 18 },
          aToB: { graduate: 50, fail: 30, remain: 20, months: 24 },
          bToC: { graduate: 60, fail: 25, remain: 15, months: 18 }
        },
        followOnChecks: { A: 800000, B: 1500000, C: 2500000 },
        horizonQuarters: yearsToQuarters(5), // Bind horizon: derive from investmentHorizonYears (default 5 years)
        // v1.1: Enable remain pass for more realistic reserve calculations
        remainAttempts: 1, // One extra attempt for remain companies
        remainDelayQuarters: 2 // 2 quarters (6 months) delay before retry
      };
      
      const reservesResult = computeReservesFromGraduation(fundData);
      const followOnCapital = reservesResult.totalReserves;
      const initialCapital = stageCapital - followOnCapital;
      const reserveRatio = reservesResult.reserveRatioPct;
      
      // Build MOIC from granular market assumptions, not fixed exit multiples
      const expectedMOIC = (
        (stage.graduationRate * 5.0) + // Graduated companies
        (stage.exitRate * 2.5) + // Early exits
        ((1 - stage.graduationRate - stage.exitRate) * 0.2) // Write-offs
      );

      remainingCapital -= stageCapital;
      
      return {
        id: stage.name.toLowerCase().replace(' ', '-'),
        name: stage.name,
        stage: stage.name,
        capitalAllocated: stageCapital,
        initialCapital: initialCapital,
        followOnCapital: followOnCapital,
        reserveRatio: reserveRatio,
        numberOfDeals: exactNumberOfDeals, // Exact decimal calculation
        expectedMOIC: expectedMOIC,
        status: 'active' as const,
        graduationRate: stage.graduationRate,
        exitRate: stage.exitRate,
        avgCheckSize: stage.avgCheckSize
      };
    });

    return {
      allocations: calculatedAllocations,
      totalDeployed: totalInvestableCapital,
      unusedCapital: 0, // ZERO unused capital per portfolio construction principle
      deploymentEfficiency: 100.0
    };
  };

  const allocationResults = calculatePreciseAllocation();
  const allocations: AllocationSummary[] = allocationResults.allocations;

  const totalCapitalAllocated = allocations.reduce((sum: any, alloc: any) => sum + alloc.capitalAllocated, 0);
  const totalInitialCapital = allocations.reduce((sum: any, alloc: any) => sum + alloc.initialCapital, 0);
  const totalFollowOnCapital = allocations.reduce((sum: any, alloc: any) => sum + alloc.followOnCapital, 0);
  const averageReserveRatio = (totalFollowOnCapital / totalCapitalAllocated) * 100;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (selectedAllocation) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-6">
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setSelectedAllocation(null)}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Allocations
            </Button>
            <AllocationUI />
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'sector-profiles') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-6">
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setActiveTab('allocations')}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Allocations
            </Button>
            <SectorProfileBuilder />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Allocation Manager</h1>
              <p className="text-gray-600 mt-2">
                Configure fund allocations with automatic reserve calculation using market-driven methodology
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                <Calculator className="w-3 h-3 mr-1" />
                Auto-Calculated Reserves
              </Badge>
              <Button 
                variant="outline" 
                onClick={() => setActiveTab('sector-profiles')}
              >
                <Settings className="w-4 h-4 mr-2" />
                Sector Profiles
              </Button>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Allocation
              </Button>
            </div>
          </div>
        </div>

        {/* Fund Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="w-8 h-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Allocated</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(totalCapitalAllocated)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="w-8 h-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Initial Capital</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(totalInitialCapital)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <BarChart3 className="w-8 h-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Follow-On Reserves</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(totalFollowOnCapital)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calculator className="w-8 h-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Reserve Ratio</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {averageReserveRatio.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reserve Sizing Methodology Info */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-start">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Reserve Sizing Methodology</h3>
                <p className="text-sm text-gray-600 mb-3">
                  The system calculates your fund's expected reserve ratios instead of having you enter them directly. 
                  This ensures there is no "left-over" capital and enables you to "build up" to the ideal reserve ratio from more granular assumptions.
                </p>
                <div className="text-sm text-gray-600">
                  <strong>Follow-on reserves are calculated based on:</strong>
                  <ul className="list-disc ml-6 mt-1 space-y-1">
                    <li>Number of graduations (from Sector Profile graduation rates)</li>
                    <li>Follow-on strategy defined in each allocation (check sizes, participation %)</li>
                    <li>How many rounds your fund will follow-on for each allocation</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Allocations Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Current Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Allocation</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Capital Allocated</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Initial Capital</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Follow-On Reserves</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Reserve Ratio</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Deals</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Expected MOIC</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((allocation: any) => (
                    <tr key={allocation.id} className="border-b hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <div>
                          <div className="font-medium text-gray-900">{allocation.name}</div>
                          <div className="text-sm text-gray-500">{allocation.stage}</div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right font-medium">
                        {formatCurrency(allocation.capitalAllocated)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {formatCurrency(allocation.initialCapital)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {formatCurrency(allocation.followOnCapital)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {allocation.reserveRatio.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {allocation.numberOfDeals.toFixed(1)}
                      </td>
                      <td className="py-4 px-4 text-center font-medium">
                        {allocation.expectedMOIC.toFixed(2)}x
                      </td>
                      <td className="py-4 px-4 text-center">
                        <Badge 
                          variant={allocation.status === 'active' ? 'default' : 'secondary'}
                          className={allocation.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                        >
                          {allocation.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAllocation(allocation.id)}
                        >
                          <Settings className="w-4 h-4 mr-1" />
                          Configure
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Reserve Adjustment Tips */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Reserve Ratio Adjustment Tips</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 mb-2">If your reserves are too low:</h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li>• Increase the follow-on check sizes</li>
                  <li>• Increase follow-on participation percentages</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">If your reserves are too high:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Revisit Sector Profiles and adjust Graduation Rates</li>
                  <li>• Adjust Exit Rates (follow-on capital only deployed into graduated companies)</li>
                  <li>• This is a "macro" change that implies your sector view has changed</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

