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
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { computeReservesFromGraduation, type FundDataForReserves, type GraduationStep } from "@/core/reserves/computeReservesFromGraduation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Calculator, TrendingUp, Target, AlertTriangle } from "lucide-react";

interface Scenario {
  name: string;
  description: string;
  fundData: FundDataForReserves;
  color: string;
}

export default function GraduationReservesDemo() {
  const [selectedScenario, setSelectedScenario] = useState<number>(0);
  
  const scenarios: Scenario[] = [
    {
      name: "Conservative VC",
      description: "Lower graduation rates, higher follow-on checks",
      color: "#ef4444",
      fundData: {
        totalCommitment: 50000000,
        targetCompanies: 25,
        avgCheckSize: 800000,
        deploymentPacePerYear: 10,
        graduationRates: {
          seedToA: { graduate: 25, fail: 55, remain: 20, months: 24 },
          aToB: { graduate: 40, fail: 40, remain: 20, months: 30 },
          bToC: { graduate: 50, fail: 35, remain: 15, months: 24 }
        },
        followOnChecks: { A: 1200000, B: 2000000, C: 3500000 }
      }
    },
    {
      name: "Aggressive Growth",
      description: "Higher graduation rates, moderate follow-ons",
      color: "#10b981",
      fundData: {
        totalCommitment: 50000000,
        targetCompanies: 35,
        avgCheckSize: 700000,
        deploymentPacePerYear: 15,
        graduationRates: {
          seedToA: { graduate: 45, fail: 35, remain: 20, months: 15 },
          aToB: { graduate: 65, fail: 20, remain: 15, months: 18 },
          bToC: { graduate: 70, fail: 20, remain: 10, months: 15 }
        },
        followOnChecks: { A: 800000, B: 1500000, C: 2200000 }
      }
    },
    {
      name: "Balanced Portfolio",
      description: "Market-average rates and check sizes",
      color: "#3b82f6",
      fundData: {
        totalCommitment: 50000000,
        targetCompanies: 30,
        avgCheckSize: 750000,
        deploymentPacePerYear: 12,
        graduationRates: {
          seedToA: { graduate: 35, fail: 45, remain: 20, months: 18 },
          aToB: { graduate: 50, fail: 30, remain: 20, months: 24 },
          bToC: { graduate: 60, fail: 25, remain: 15, months: 18 }
        },
        followOnChecks: { A: 1000000, B: 1800000, C: 2800000 }
      }
    }
  ];

  const currentScenario = scenarios[selectedScenario];
  const result = computeReservesFromGraduation(currentScenario.fundData);
  
  // Calculate comparison data for all scenarios
  const comparisonData = scenarios.map((scenario, index) => {
    const scenarioResult = computeReservesFromGraduation(scenario.fundData);
    return {
      name: scenario.name,
      reserveRatio: scenarioResult.reserveRatioPct,
      totalReserves: scenarioResult.totalReserves / 1000000, // Convert to millions
      seriesA: scenarioResult.aggregateByStage.A / 1000000,
      seriesB: scenarioResult.aggregateByStage.B / 1000000,
      seriesC: scenarioResult.aggregateByStage.C / 1000000,
      color: scenario.color
    };
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="space-y-6" data-testid="demo-root">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center">
                <Calculator className="w-6 h-6 mr-2 text-blue-600" />
                Graduation-Driven Reserves Engine
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Compare how different graduation rates and follow-on strategies impact your reserve requirements
              </p>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              Expected Value v1
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Scenario Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Investment Strategy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((scenario, index) => (
              <Button
                key={index}
                variant={selectedScenario === index ? "default" : "outline"}
                className={`h-auto p-4 text-left justify-start ${
                  selectedScenario === index ? "" : "hover:bg-gray-50"
                }`}
                onClick={() => setSelectedScenario(index)}
              >
                <div>
                  <div className="font-semibold">{scenario.name}</div>
                  <div className="text-sm text-gray-600 mt-1">{scenario.description}</div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Scenario Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Target className="w-5 h-5 mr-2 text-green-600" />
              {currentScenario.name} Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-blue-600">Total Reserves</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {formatCurrency(result.totalReserves)}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-green-600">Reserve Ratio</div>
                  <div className="text-2xl font-bold text-green-900" data-testid="demo-ratio">
                    {formatPercent(result.reserveRatioPct)}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Series A Follow-ons:</span>
                  <span className="font-medium">{formatCurrency(result.aggregateByStage.A)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Series B Follow-ons:</span>
                  <span className="font-medium">{formatCurrency(result.aggregateByStage.B)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Series C Follow-ons:</span>
                  <span className="font-medium">{formatCurrency(result.aggregateByStage.C)}</span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="text-sm text-gray-600 space-y-1">
                  <div><strong>Companies per Quarter:</strong> {result.assumptions.perQuarter}</div>
                  <div><strong>Deployment Period:</strong> {result.assumptions.deploymentQuarters} quarters</div>
                  <div><strong>Target Companies:</strong> {currentScenario.fundData.targetCompanies}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Graduation Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Graduation Assumptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(currentScenario.fundData.graduationRates).map(([stage, rates]) => (
                <div key={stage} className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm font-semibold text-gray-700 mb-2">
                    {stage === 'seedToA' ? 'Seed → Series A' : 
                     stage === 'aToB' ? 'Series A → Series B' : 'Series B → Series C'}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-green-600 font-medium">Graduate: {rates.graduate}%</div>
                    </div>
                    <div>
                      <div className="text-red-600 font-medium">Fail: {rates.fail}%</div>
                    </div>
                    <div>
                      <div className="text-yellow-600 font-medium">Remain: {rates.remain}%</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Avg time: {rates.months} months
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <BarChart className="w-5 h-5 mr-2 text-purple-600" />
            Strategy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" label={{ value: 'Reserves ($M)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'Reserve Ratio (%)', angle: 90, position: 'insideRight' }} />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    if (name === 'reserveRatio') return [`${value}%`, 'Reserve Ratio'];
                    return [`$${value}M`, name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="seriesA" stackId="reserves" fill="#3b82f6" name="Series A" />
                <Bar yAxisId="left" dataKey="seriesB" stackId="reserves" fill="#10b981" name="Series B" />
                <Bar yAxisId="left" dataKey="seriesC" stackId="reserves" fill="#f59e0b" name="Series C" />
                <Bar yAxisId="right" dataKey="reserveRatio" fill="#ef4444" name="Reserve Ratio (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-orange-600" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center mb-2">
                <AlertTriangle className="w-4 h-4 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-800">Conservative Strategy</span>
              </div>
              <p className="text-sm text-blue-700">
                Lower graduation rates require higher reserve ratios ({formatPercent(comparisonData[0].reserveRatio)}) 
                due to fewer companies reaching follow-on stages.
              </p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center mb-2">
                <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-800">Aggressive Growth</span>
              </div>
              <p className="text-sm text-green-700">
                High graduation rates with smaller checks create the most capital-efficient reserves 
                ({formatPercent(comparisonData[1].reserveRatio)}).
              </p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 text-purple-600 mr-2" />
                <span className="text-sm font-medium text-purple-800">Dynamic Calculation</span>
              </div>
              <p className="text-sm text-purple-700">
                Reserve ratios automatically adjust based on your portfolio graduation assumptions 
                instead of using fixed percentages.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

