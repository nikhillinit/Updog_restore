/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { ScatterChart } from 'recharts/es6/chart/ScatterChart';
import { Scatter } from 'recharts/es6/cartesian/Scatter';
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Calculator, Target, Info } from "lucide-react";

type MOICData = {
  companyName: string;
  currentMOIC: number;
  currentMOICOnInitial: number;
  currentMOICOnDeployedReserves: number;
  exitMOIC: number;
  exitMOICOnInitial: number;
  exitMOICOnFollowOns: number;
  exitMOICOnPlannedReserves: number;
  totalInvested: number;
  initialInvestment: number;
  deployedReserves: number;
  plannedReserves: number;
  sector: string;
  stage: string;
};

const sampleMOICData: MOICData[] = [
  {
    companyName: "AlphaTech",
    currentMOIC: 3.5,
    currentMOICOnInitial: 4.2,
    currentMOICOnDeployedReserves: 2.8,
    exitMOIC: 8.5,
    exitMOICOnInitial: 10.2,
    exitMOICOnFollowOns: 6.8,
    exitMOICOnPlannedReserves: 5.5,
    totalInvested: 2500000,
    initialInvestment: 1000000,
    deployedReserves: 1500000,
    plannedReserves: 2000000,
    sector: "SaaS",
    stage: "Series B"
  },
  {
    companyName: "BetaCorp",
    currentMOIC: 2.4,
    currentMOICOnInitial: 2.8,
    currentMOICOnDeployedReserves: 1.9,
    exitMOIC: 5.2,
    exitMOICOnInitial: 6.1,
    exitMOICOnFollowOns: 4.3,
    exitMOICOnPlannedReserves: 3.8,
    totalInvested: 1800000,
    initialInvestment: 750000,
    deployedReserves: 1050000,
    plannedReserves: 1200000,
    sector: "Fintech",
    stage: "Series A"
  },
  {
    companyName: "GammaSoft",
    currentMOIC: 2.0,
    currentMOICOnInitial: 2.0,
    currentMOICOnDeployedReserves: 0,
    exitMOIC: 4.5,
    exitMOICOnInitial: 4.5,
    exitMOICOnFollowOns: 0,
    exitMOICOnPlannedReserves: 3.2,
    totalInvested: 750000,
    initialInvestment: 750000,
    deployedReserves: 0,
    plannedReserves: 500000,
    sector: "Healthcare",
    stage: "Seed"
  },
  {
    companyName: "DeltaFlow",
    currentMOIC: 4.5,
    currentMOICOnInitial: 5.8,
    currentMOICOnDeployedReserves: 3.2,
    exitMOIC: 12.8,
    exitMOICOnInitial: 16.5,
    exitMOICOnFollowOns: 9.1,
    exitMOICOnPlannedReserves: 7.8,
    totalInvested: 5000000,
    initialInvestment: 2000000,
    deployedReserves: 3000000,
    plannedReserves: 2500000,
    sector: "E-commerce",
    stage: "Series C"
  }
];

const moicDefinitions = [
  {
    name: "Current MOIC",
    formula: "(Unrealized FMV today + Realized Proceeds) / (Total Invested Capital to Date)",
    description: "The MOIC today on total invested capital to date - the return for every $1 of investment"
  },
  {
    name: "Current MOIC on Initial",
    formula: "Current Share Price / Purchase Price at Entry Round",
    description: "The MOIC on only the initial investment, excluding follow-on investments"
  },
  {
    name: "Current MOIC on Deployed Reserves",
    formula: "Current Share Price / Weighted Average Purchase Price Per Share in Follow-On Rounds",
    description: "The performance of deployed reserves to date - return for every $1 of follow-on investments"
  },
  {
    name: "Exit MOIC",
    formula: "Expected Exit Proceeds / Expected Total Invested Capital By Exit",
    description: "Expected MOIC at exit on total invested capital - expected return at exit for every $1"
  },
  {
    name: "Exit MOIC on Initial",
    formula: "Expected Exit Share Price / Purchase Price at Entry Round",
    description: "Expected MOIC at exit on initial investment only - expected return for every $1 of initial investment"
  },
  {
    name: "Exit MOIC on Follow-Ons",
    formula: "Expected Exit Share Price / Weighted Average Purchase Price Per Share in Follow-On Rounds",
    description: "Expected MOIC at exit on follow-on investments only - expected return for every $1 of follow-on investment"
  },
  {
    name: "Exit MOIC on Planned Reserves",
    formula: "Expected Exit Share Price / Weighted Average Purchase Price Per Share of Future Follow-Ons",
    description: "Expected performance on future reserves - expected return for every $1 of future follow-on investments"
  }
];

export default function MOICAnalysis() {
  const [selectedMOICType, setSelectedMOICType] = useState("current");

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    return `$${(amount / 1000).toFixed(0)}K`;
  };

  const getMOICColor = (value: number) => {
    if (value >= 5) return "text-green-600";
    if (value >= 3) return "text-blue-600";
    if (value >= 2) return "text-yellow-600";
    return "text-red-600";
  };

  const getCurrentMOICChartData = () => {
    return sampleMOICData.map(company => ({
      name: company.companyName,
      "Current MOIC": company.currentMOIC,
      "Current MOIC on Initial": company.currentMOICOnInitial,
      "Current MOIC on Deployed Reserves": company.currentMOICOnDeployedReserves || 0
    }));
  };

  const getExitMOICChartData = () => {
    return sampleMOICData.map(company => ({
      name: company.companyName,
      "Exit MOIC": company.exitMOIC,
      "Exit MOIC on Initial": company.exitMOICOnInitial,
      "Exit MOIC on Follow-Ons": company.exitMOICOnFollowOns || 0,
      "Exit MOIC on Planned Reserves": company.exitMOICOnPlannedReserves
    }));
  };

  const getPlannedReservesData = () => {
    return sampleMOICData.map(company => ({
      name: company.companyName,
      plannedReserves: company.plannedReserves / 1000000,
      expectedMOIC: company.exitMOICOnPlannedReserves,
      sector: company.sector
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Investment MOICs Analysis</h2>
          <p className="text-gray-600 mt-1">
            Track seven different MOIC calculations for comprehensive investment performance analysis
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Calculator className="w-4 h-4 mr-1" />
            MOIC Calculator
          </Button>
          <Button variant="outline" size="sm">
            <Target className="w-4 h-4 mr-1" />
            Benchmarks
          </Button>
        </div>
      </div>

      {/* MOIC Definitions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Info className="w-5 h-5 mr-2 text-blue-600" />
            Seven MOIC Calculation Types
          </CardTitle>
          <p className="text-sm text-gray-600">
            Each MOIC represents a different and nuanced performance view of your investments
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {moicDefinitions.map((def, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <div className="font-medium text-gray-900 mb-2">{def.name}</div>
                <div className="text-sm text-blue-600 font-mono mb-2 bg-blue-50 p-2 rounded">
                  {def.formula}
                </div>
                <div className="text-sm text-gray-600">{def.description}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* MOIC Analysis Tabs */}
      <Tabs value={selectedMOICType} onValueChange={setSelectedMOICType}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="current">Current MOICs</TabsTrigger>
          <TabsTrigger value="exit">Exit MOICs</TabsTrigger>
          <TabsTrigger value="reserves">Planned Reserves</TabsTrigger>
          <TabsTrigger value="comparison">MOIC Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Current MOIC Performance</CardTitle>
                <p className="text-sm text-gray-600">
                  Performance to date across different investment components
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getCurrentMOICChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" stroke="#666" fontSize={12} />
                      <YAxis stroke="#666" fontSize={12} />
                      <Tooltip formatter={(value, name) => [`${value}x`, name]} />
                      <Bar dataKey="Current MOIC" fill="#3b82f6" />
                      <Bar dataKey="Current MOIC on Initial" fill="#06b6d4" />
                      <Bar dataKey="Current MOIC on Deployed Reserves" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current MOIC Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sampleMOICData.map((company, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium">{company.companyName}</div>
                        <div className="text-sm text-gray-600">{company.sector} • {company.stage}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${getMOICColor(company.currentMOIC)}`}>
                          {company.currentMOIC.toFixed(1)}x
                        </div>
                        <div className="text-sm text-gray-600">
                          {formatCurrency(company.totalInvested)} invested
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="exit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Expected Exit MOIC Performance</CardTitle>
              <p className="text-sm text-gray-600">
                Projected performance at exit across different investment components
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getExitMOICChartData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" stroke="#666" fontSize={12} />
                    <YAxis stroke="#666" fontSize={12} />
                    <Tooltip formatter={(value, name) => [`${value}x`, name]} />
                    <Bar dataKey="Exit MOIC" fill="#8b5cf6" />
                    <Bar dataKey="Exit MOIC on Initial" fill="#f59e0b" />
                    <Bar dataKey="Exit MOIC on Follow-Ons" fill="#ef4444" />
                    <Bar dataKey="Exit MOIC on Planned Reserves" fill="#06d6a0" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reserves" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Exit MOIC on Planned Reserves</CardTitle>
              <p className="text-sm text-gray-600">
                Expected return for every $1 of future follow-on investments - key metric for optimal reserve deployment
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart data={getPlannedReservesData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="plannedReserves" 
                      stroke="#666" 
                      fontSize={12}
                      label={{ value: 'Planned Reserves ($M)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      dataKey="expectedMOIC"
                      stroke="#666" 
                      fontSize={12}
                      label={{ value: 'Expected MOIC', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      formatter={(value, name, props) => {
                        if (name === 'expectedMOIC') return [`${value}x`, 'Expected MOIC on Reserves'];
                        return [value, name];
                      }}
                      labelFormatter={(value, payload) => `${payload?.[0]?.payload?.name}`}
                      contentStyle={{ 
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px'
                      }}
                    />
                    <Scatter dataKey="expectedMOIC" fill="#3b82f6" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Performers - Planned Reserves</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sampleMOICData
                    .sort((a, b) => b.exitMOICOnPlannedReserves - a.exitMOICOnPlannedReserves)
                    .map((company, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div>
                          <div className="font-medium">{company.companyName}</div>
                          <div className="text-sm text-gray-600">
                            {formatCurrency(company.plannedReserves)} planned
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            {company.exitMOICOnPlannedReserves.toFixed(1)}x
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Rank #{index + 1}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reserve Optimization Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center mb-2">
                      <TrendingUp className="w-5 h-5 text-blue-600 mr-2" />
                      <span className="font-medium text-blue-900">Highest Expected Return</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.max(...sampleMOICData.map(c => c.exitMOICOnPlannedReserves)).toFixed(1)}x
                    </div>
                    <div className="text-sm text-blue-700">
                      on {sampleMOICData.find(c => c.exitMOICOnPlannedReserves === Math.max(...sampleMOICData.map(d => d.exitMOICOnPlannedReserves)))?.companyName}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-amber-50 rounded-lg">
                    <div className="font-medium text-amber-900 mb-2">Average Expected MOIC</div>
                    <div className="text-2xl font-bold text-amber-600">
                      {(sampleMOICData.reduce((sum, c) => sum + c.exitMOICOnPlannedReserves, 0) / sampleMOICData.length).toFixed(1)}x
                    </div>
                    <div className="text-sm text-amber-700">across all planned reserves</div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-900 mb-2">Total Planned Reserves</div>
                    <div className="text-2xl font-bold text-gray-700">
                      {formatCurrency(sampleMOICData.reduce((sum, c) => sum + c.plannedReserves, 0))}
                    </div>
                    <div className="text-sm text-gray-600">across {sampleMOICData.length} companies</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>MOIC Performance Comparison</CardTitle>
              <p className="text-sm text-gray-600">
                Compare current vs expected performance across all MOIC types
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left p-3 font-medium">Company</th>
                      <th className="text-left p-3 font-medium">Current MOIC</th>
                      <th className="text-left p-3 font-medium">Current MOIC on Initial</th>
                      <th className="text-left p-3 font-medium">Exit MOIC</th>
                      <th className="text-left p-3 font-medium">Exit MOIC on Initial</th>
                      <th className="text-left p-3 font-medium">Exit MOIC on Planned Reserves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleMOICData.map((company, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">{company.companyName}</div>
                          <div className="text-sm text-gray-600">{company.sector}</div>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${getMOICColor(company.currentMOIC)}`}>
                            {company.currentMOIC.toFixed(1)}x
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${getMOICColor(company.currentMOICOnInitial)}`}>
                            {company.currentMOICOnInitial.toFixed(1)}x
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${getMOICColor(company.exitMOIC)}`}>
                            {company.exitMOIC.toFixed(1)}x
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${getMOICColor(company.exitMOICOnInitial)}`}>
                            {company.exitMOICOnInitial.toFixed(1)}x
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${getMOICColor(company.exitMOICOnPlannedReserves)}`}>
                            {company.exitMOICOnPlannedReserves.toFixed(1)}x
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
