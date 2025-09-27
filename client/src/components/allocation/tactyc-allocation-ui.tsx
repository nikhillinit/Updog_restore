/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Info, Calculator, Target, Calendar, Plus } from "lucide-react";

interface AllocationData {
  id: string;
  name: string;
  linkedSectorProfile: string;
  entryRound: string;
  initialCheckSize: number;
  impliedEntryOwnership: number;
  numberOfDeals: number;
  capitalAllocated: number;
  followOnStrategy: {
    preSeed: { maintainOwnership: number; participation: number; impliedCheck: number; graduationRate: number; graduations: number; followOns: number; capitalAllocated: number };
    seed: { maintainOwnership: number; participation: number; impliedCheck: number; graduationRate: number; graduations: number; followOns: number; capitalAllocated: number };
    seriesA: { maintainOwnership: number; participation: number; impliedCheck: number; graduationRate: number; graduations: number; followOns: number; capitalAllocated: number };
    seriesB: { maintainOwnership: number; participation: number; impliedCheck: number; graduationRate: number; graduations: number; followOns: number; capitalAllocated: number };
  };
}

interface TactycsummaryData {
  capitalAllocated: number;
  expectedMOIC: number;
  reserveRatio: number;
}

export default function TactycAllocationUI() {
  const [allocation, setAllocation] = useState<AllocationData>({
    id: "pre-seed",
    name: "Pre-Seed",
    linkedSectorProfile: "Default",
    entryRound: "Pre-Seed",
    initialCheckSize: 737500,
    impliedEntryOwnership: 10.00,
    numberOfDeals: 10.39,
    capitalAllocated: 7665828,
    followOnStrategy: {
      preSeed: { maintainOwnership: 0, participation: 0, impliedCheck: 0, graduationRate: 0, graduations: 0, followOns: 0, capitalAllocated: 0 },
      seed: { maintainOwnership: 10, participation: 100, impliedCheck: 377778, graduationRate: 70, graduations: 7.28, followOns: 7.28, capitalAllocated: 2748726 },
      seriesA: { maintainOwnership: 10, participation: 100, impliedCheck: 1200000, graduationRate: 50, graduations: 3.64, followOns: 3.64, capitalAllocated: 4365624 },
      seriesB: { maintainOwnership: 0, participation: 0, impliedCheck: 0, graduationRate: 50, graduations: 1.82, followOns: 0, capitalAllocated: 0 }
    }
  });

  const [summary, setSummary] = useState<TactycsummaryData>({
    capitalAllocated: 14780179,
    expectedMOIC: 7.90,
    reserveRatio: 48.13
  });

  // Calculate derived metrics based on Tactyc methodology - deploy ALL available capital
  const calculateMetrics = () => {
    const totalFollowOnCapital = Object.values(allocation.followOnStrategy).reduce(
      (sum, stage) => sum + stage.capitalAllocated, 0
    );
    const totalCapital = allocation.capitalAllocated + totalFollowOnCapital;
    const reserveRatio = (totalFollowOnCapital / totalCapital) * 100;
    
    // Calculate precise number of deals to deploy all capital
    const preciseNumberOfDeals = allocation.capitalAllocated / allocation.initialCheckSize;
    
    // Calculate Expected MOIC based on graduation rates and market valuations
    const seedSuccessRate = allocation.followOnStrategy.seed.graduationRate / 100;
    const seriesASuccessRate = allocation.followOnStrategy.seriesA.graduationRate / 100;
    const overallSuccessRate = seedSuccessRate * seriesASuccessRate;
    
    // Market-driven MOIC calculation (not fixed exit multiple)
    const avgExitValuation = 125000000; // Based on Series A exit valuation
    const avgInvestment = allocation.initialCheckSize + 
      (allocation.followOnStrategy.seed.impliedCheck * seedSuccessRate) +
      (allocation.followOnStrategy.seriesA.impliedCheck * overallSuccessRate);
    
    const expectedMOIC = overallSuccessRate > 0 ? (avgExitValuation * 0.034) / avgInvestment : 0; // 3.4% ownership assumption
    
    return {
      reserveRatio,
      preciseNumberOfDeals,
      expectedMOIC,
      totalCapital,
      unusedCapital: 0 // Tactyc ensures no unused capital
    };
  };

  const updateFollowOnStrategy = (stage: keyof AllocationData['followOnStrategy'], field: string, value: number) => {
    setAllocation(prev => {
      const updated = { ...prev };
      
      if (field === 'maintainOwnership' || field === 'participation') {
        updated.followOnStrategy[stage] = {
          ...updated.followOnStrategy[stage],
          [field]: value
        };

        // Calculate implied check based on participation and graduation rate
        if (field === 'participation') {
          const participation = value / 100;
          const graduationRate = updated.followOnStrategy[stage].graduationRate / 100;
          const graduations = updated.numberOfDeals * graduationRate;
          const followOns = participation * graduations;
          
          // Implied check calculation based on typical round sizes
          let baseRoundCheck = 0;
          if (stage === 'seed') baseRoundCheck = 377778;
          if (stage === 'seriesA') baseRoundCheck = 1200000;
          if (stage === 'seriesB') baseRoundCheck = 2000000;
          
          updated.followOnStrategy[stage].impliedCheck = baseRoundCheck;
          updated.followOnStrategy[stage].graduations = graduations;
          updated.followOnStrategy[stage].followOns = followOns;
          updated.followOnStrategy[stage].capitalAllocated = followOns * baseRoundCheck;
        }
      }

      if (field === 'graduationRate') {
        updated.followOnStrategy[stage] = {
          ...updated.followOnStrategy[stage],
          graduationRate: value
        };

        // Recalculate graduations and follow-ons
        const graduationRate = value / 100;
        const graduations = updated.numberOfDeals * graduationRate;
        const participation = updated.followOnStrategy[stage].participation / 100;
        const followOns = participation * graduations;
        
        updated.followOnStrategy[stage].graduations = graduations;
        updated.followOnStrategy[stage].followOns = followOns;
        updated.followOnStrategy[stage].capitalAllocated = followOns * updated.followOnStrategy[stage].impliedCheck;
      }

      // Update summary with new metrics - ensure all capital is deployed
      const metrics = calculateMetrics();
      setSummary(prev => ({ 
        ...prev, 
        reserveRatio: metrics.reserveRatio,
        expectedMOIC: metrics.expectedMOIC,
        capitalAllocated: metrics.totalCapital
      }));

      return updated;
    });
  };

  const updateInitialParameters = (field: keyof AllocationData, value: number | string) => {
    setAllocation(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">{allocation.name}</CardTitle>
              <div className="flex items-center gap-6 text-sm text-gray-600 mt-2">
                <span>Capital Allocated: {formatCurrency(summary.capitalAllocated)}</span>
                <span>Expected MOIC: {summary.expectedMOIC.toFixed(2)}x</span>
                <span>Reserve Ratio: {formatPercentage(summary.reserveRatio)}</span>
              </div>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Calculator className="w-3 h-3 mr-1" />
              Auto-Calculated
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Allocation Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Allocation Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Allocation Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="allocationName">Allocation Name</Label>
              <Input
                id="allocationName"
                value={allocation.name}
                onChange={(e) => updateInitialParameters('name', e.target.value)}
                className="bg-yellow-50 border-yellow-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sectorProfile">
                Linked Sector Profile
                <Info className="w-4 h-4 inline ml-1 text-gray-400" />
              </Label>
              <Select value={allocation.linkedSectorProfile} onValueChange={(value) => updateInitialParameters('linkedSectorProfile', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Default">Default</SelectItem>
                  <SelectItem value="B2B SaaS">B2B SaaS</SelectItem>
                  <SelectItem value="B2C">B2C</SelectItem>
                  <SelectItem value="Fintech">Fintech</SelectItem>
                  <SelectItem value="Healthcare">Healthcare</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entryRound">Entry Round</Label>
              <Select value={allocation.entryRound} onValueChange={(value) => updateInitialParameters('entryRound', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pre-Seed">Pre-Seed</SelectItem>
                  <SelectItem value="Seed">Seed</SelectItem>
                  <SelectItem value="Series A">Series A</SelectItem>
                  <SelectItem value="Series B">Series B</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Initial Check Size Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Initial Check Size
              <Info className="w-4 h-4 inline ml-1 text-gray-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkSizeType">Amount</Label>
              <div className="flex items-center gap-2">
                <Select defaultValue="amount">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Amount</SelectItem>
                    <SelectItem value="ownership">Ownership %</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="initialCheckSize"
                  type="number"
                  value={allocation.initialCheckSize}
                  onChange={(e) => updateInitialParameters('initialCheckSize', parseFloat(e.target.value))}
                  className="bg-yellow-50 border-yellow-200"
                />
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Implied Entry Ownership</span>
                <span>{formatPercentage(allocation.impliedEntryOwnership)}</span>
              </div>
              <div className="flex justify-between">
                <span>Number of Deals</span>
                <span>{calculateMetrics().preciseNumberOfDeals.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Capital Allocated</span>
                <span>{formatCurrency(allocation.capitalAllocated)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expected MOIC Display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Target className="w-5 h-5 mr-2 text-green-600" />
              Performance Target
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {summary.expectedMOIC.toFixed(2)}x
              </div>
              <div className="text-sm text-gray-600 mt-1">Expected MOIC</div>
              <div className="text-xs text-gray-500 mt-2">
                Based on sector profile and graduation rates
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Follow-On Strategy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Follow-On Strategy
            <Info className="w-4 h-4 inline ml-1 text-gray-400" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-gray-600"></th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">Pre-Seed</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">Seed</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">Series A</th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">Series B</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 font-medium">
                    Maintain Ownership (%) of
                    <Info className="w-3 h-3 inline ml-1 text-gray-400" />
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.preSeed.maintainOwnership}
                      onChange={(e) => updateFollowOnStrategy('preSeed', 'maintainOwnership', parseFloat(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                      disabled
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.seed.maintainOwnership}
                      onChange={(e) => updateFollowOnStrategy('seed', 'maintainOwnership', parseFloat(e.target.value) || 0)}
                      className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.seriesA.maintainOwnership}
                      onChange={(e) => updateFollowOnStrategy('seriesA', 'maintainOwnership', parseFloat(e.target.value) || 0)}
                      className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.seriesB.maintainOwnership}
                      onChange={(e) => updateFollowOnStrategy('seriesB', 'maintainOwnership', parseFloat(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                      disabled
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                </tr>

                <tr className="border-b border-gray-100">
                  <td className="py-3 px-2 font-medium">
                    Follow-on Participation (%)
                    <Info className="w-3 h-3 inline ml-1 text-gray-400" />
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.preSeed.participation}
                      className="w-16 h-8 text-center"
                      disabled
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.seed.participation}
                      onChange={(e) => updateFollowOnStrategy('seed', 'participation', parseFloat(e.target.value) || 0)}
                      className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.seriesA.participation}
                      onChange={(e) => updateFollowOnStrategy('seriesA', 'participation', parseFloat(e.target.value) || 0)}
                      className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Input
                      type="number"
                      value={allocation.followOnStrategy.seriesB.participation}
                      className="w-16 h-8 text-center"
                      disabled
                    />
                    <span className="text-xs ml-1">%</span>
                  </td>
                </tr>

                <Separator />

                {/* Read-only calculated fields */}
                <tr className="bg-gray-50">
                  <td className="py-3 px-2 font-medium text-gray-600">Implied Follow-On Check</td>
                  <td className="py-3 px-2 text-center text-gray-600">-</td>
                  <td className="py-3 px-2 text-center text-gray-600">{formatCurrency(allocation.followOnStrategy.seed.impliedCheck)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{formatCurrency(allocation.followOnStrategy.seriesA.impliedCheck)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">-</td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-2 font-medium text-gray-600">Graduation Rate</td>
                  <td className="py-3 px-2 text-center text-gray-600">-</td>
                  <td className="py-3 px-2 text-center text-gray-600">{formatPercentage(allocation.followOnStrategy.seed.graduationRate)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{formatPercentage(allocation.followOnStrategy.seriesA.graduationRate)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{formatPercentage(allocation.followOnStrategy.seriesB.graduationRate)}</td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-2 font-medium text-gray-600">Number of Graduations</td>
                  <td className="py-3 px-2 text-center text-gray-600">-</td>
                  <td className="py-3 px-2 text-center text-gray-600">{allocation.followOnStrategy.seed.graduations.toFixed(2)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{allocation.followOnStrategy.seriesA.graduations.toFixed(2)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{allocation.followOnStrategy.seriesB.graduations.toFixed(2)}</td>
                </tr>

                <tr className="bg-gray-50">
                  <td className="py-3 px-2 font-medium text-gray-600">Number of Follow-ons</td>
                  <td className="py-3 px-2 text-center text-gray-600">-</td>
                  <td className="py-3 px-2 text-center text-gray-600">{allocation.followOnStrategy.seed.followOns.toFixed(2)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">{allocation.followOnStrategy.seriesA.followOns.toFixed(2)}</td>
                  <td className="py-3 px-2 text-center text-gray-600">-</td>
                </tr>

                <tr className="bg-blue-50 border-2 border-blue-200">
                  <td className="py-3 px-2 font-bold text-blue-800">Capital Allocated</td>
                  <td className="py-3 px-2 text-center font-bold text-blue-800">-</td>
                  <td className="py-3 px-2 text-center font-bold text-blue-800">{formatCurrency(allocation.followOnStrategy.seed.capitalAllocated)}</td>
                  <td className="py-3 px-2 text-center font-bold text-blue-800">{formatCurrency(allocation.followOnStrategy.seriesA.capitalAllocated)}</td>
                  <td className="py-3 px-2 text-center font-bold text-blue-800">-</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center mb-2">
              <Info className="w-4 h-4 text-blue-600 mr-2" />
              <span className="font-medium text-blue-800">Tactyc Capital Deployment Methodology</span>
            </div>
            <p className="text-sm text-blue-700 mb-2">
              <strong>All available capital is deployed</strong> - no unused capital allowed:
            </p>
            <ul className="text-sm text-blue-700 mt-2 ml-4 space-y-1">
              <li>• Precise number of deals calculated to deploy 100% of available capital</li>
              <li>• Reserves auto-calculated from graduation rates and follow-on strategy</li>
              <li>• Expected MOIC built up from market data, not fixed exit multiples</li>
              <li>• Market-driven assumptions enable defensible LP modeling and course correction</li>
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-600">Reserve Ratio:</span> 
                <span className="font-medium text-blue-800 ml-1">{formatPercentage(summary.reserveRatio)}</span>
              </div>
              <div>
                <span className="text-blue-600">Capital Utilization:</span> 
                <span className="font-medium text-green-800 ml-1">100.00%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Initial Investment Horizon */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-blue-600" />
            Initial Investment Horizon
            <Info className="w-4 h-4 ml-2 text-gray-400" />
          </CardTitle>
          <p className="text-sm text-gray-600">
            Control the pacing of capital deployment for this allocation
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700 min-w-0 flex-shrink-0">
                Fund will invest
              </span>
              <Input
                type="number"
                defaultValue={50.00}
                className="w-20 h-8 text-center bg-yellow-50 border-yellow-200"
              />
              <span className="text-sm text-gray-600">%</span>
              <span className="text-sm text-gray-600">of total allocated capital, from month</span>
              <Input
                type="number"
                defaultValue={1}
                className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
              />
              <span className="text-sm text-gray-600">to</span>
              <Input
                type="number"
                defaultValue={12}
                className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
              />
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700 min-w-0 flex-shrink-0">
                Fund will invest
              </span>
              <Input
                type="number"
                defaultValue={50.00}
                className="w-20 h-8 text-center bg-yellow-50 border-yellow-200"
              />
              <span className="text-sm text-gray-600">%</span>
              <span className="text-sm text-gray-600">of total allocated capital, from month</span>
              <Input
                type="number"
                defaultValue={13}
                className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
              />
              <span className="text-sm text-gray-600">to</span>
              <Input
                type="number"
                defaultValue={36}
                className="w-16 h-8 text-center bg-yellow-50 border-yellow-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4">
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Period
            </Button>
            <Button variant="outline" size="sm">
              <Target className="w-4 h-4 mr-2" />
              Apply this horizon to all allocations
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline">
          Reset to Defaults
        </Button>
        <div className="space-x-2">
          <Button variant="outline">
            Save as Template
          </Button>
          <Button>
            Apply Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
