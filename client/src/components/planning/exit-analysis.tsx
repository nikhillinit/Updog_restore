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
import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  Calculator,
  Target,
  DollarSign,
  Percent,
  Trophy,
  Info
} from "lucide-react";

interface ExitData {
  stage: string;
  companiesAtStage: number;
  exitRate: number;
  avgExitValue: number;
  avgOwnership: number;
  totalExitValue: number;
  realizedValue: number;
}

interface FundReturns {
  totalInvestment: number;
  totalRealizedValue: number;
  netMultiple: number;
  grossMultiple: number;
  totalExits: number;
}

export default function ExitAnalysis() {
  const [fundSize, setFundSize] = useState(138000000);
  const [portfolioSize, setPortfolioSize] = useState(40);
  const [carryPercentage, setCarryPercentage] = useState(20);
  const [managementFee, setManagementFee] = useState(2);

  // Exit analysis data based on Tactyc methodology
  const baseExitData: ExitData[] = [
    {
      stage: "Seed",
      companiesAtStage: 40,
      exitRate: 0.00, // 0% exit at seed stage
      avgExitValue: 0,
      avgOwnership: 10.0,
      totalExitValue: 0,
      realizedValue: 0
    },
    {
      stage: "Series A",
      companiesAtStage: 18, // 46% graduation rate from seed
      exitRate: 0.15, // 15% exit after Series A
      avgExitValue: 23000000, // Post-money from Series A
      avgOwnership: 6.5, // Diluted from 10% by 35%
      totalExitValue: 0,
      realizedValue: 0
    },
    {
      stage: "Series B", 
      companiesAtStage: 12, // 65% graduation from A to B
      exitRate: 0.25, // 25% exit after Series B
      avgExitValue: 50000000, // Post-money from Series B
      avgOwnership: 4.6, // Further diluted by 30%
      totalExitValue: 0,
      realizedValue: 0
    },
    {
      stage: "Series C",
      companiesAtStage: 8, // 70% graduation from B to C
      exitRate: 0.40, // 40% exit after Series C
      avgExitValue: 100000000, // Post-money from Series C
      avgOwnership: 3.4, // Further diluted by 25%
      totalExitValue: 0,
      realizedValue: 0
    },
    {
      stage: "Series D",
      companiesAtStage: 5, // 60% graduation from C to D
      exitRate: 0.60, // 60% exit after Series D
      avgExitValue: 190000000, // Post-money from Series D
      avgOwnership: 2.7, // Further diluted by 21%
      totalExitValue: 0,
      realizedValue: 0
    },
    {
      stage: "Series E+",
      companiesAtStage: 3, // 55% graduation from D to E+
      exitRate: 0.85, // 85% exit after Series E+
      avgExitValue: 360000000, // Post-money from Series E+
      avgOwnership: 2.2, // Further diluted by 17%
      totalExitValue: 0,
      realizedValue: 0
    }
  ];

  // Calculate exit analysis
  const calculateExitAnalysis = (): { exitData: ExitData[], fundReturns: FundReturns } => {
    const calculatedExitData = baseExitData.map(stage => {
      const exitingCompanies = Math.round(stage.companiesAtStage * stage.exitRate);
      const totalExitValue = exitingCompanies * stage.avgExitValue;
      const realizedValue = totalExitValue * (stage.avgOwnership / 100);
      
      return {
        ...stage,
        totalExitValue,
        realizedValue
      };
    });

    const totalRealizedValue = calculatedExitData.reduce((sum, stage) => sum + stage.realizedValue, 0);
    const totalExits = calculatedExitData.reduce((sum, stage) => sum + Math.round(stage.companiesAtStage * stage.exitRate), 0);
    
    // Calculate fund returns
    const managementFees = (fundSize * managementFee / 100) * 10; // 10 year fund
    const totalInvestment = fundSize - managementFees;
    const grossMultiple = totalRealizedValue / totalInvestment;
    
    // Calculate carry and net returns
    const carriedInterest = Math.max(0, (totalRealizedValue - totalInvestment) * (carryPercentage / 100));
    const netReturnsToLPs = totalRealizedValue - carriedInterest;
    const netMultiple = netReturnsToLPs / totalInvestment;

    const fundReturns: FundReturns = {
      totalInvestment,
      totalRealizedValue,
      grossMultiple,
      netMultiple,
      totalExits
    };

    return { exitData: calculatedExitData, fundReturns };
  };

  const { exitData, fundReturns } = calculateExitAnalysis();

  // Chart data for exit value by stage
  const exitChartData = exitData.map(stage => ({
    stage: stage.stage,
    exitingCompanies: Math.round(stage.companiesAtStage * stage.exitRate),
    realizedValue: stage.realizedValue / 1000000, // Convert to millions
    avgOwnership: stage.avgOwnership
  }));

  // Colors for charts
  const stageColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatMultiple = (value: number) => `${value.toFixed(2)}x`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Trophy className="h-6 w-6 text-green-600" />
            <span>Exit Analysis & Fund Returns</span>
          </h2>
          <p className="text-muted-foreground">
            Calculate fund profitability based on exit rates and valuations
          </p>
        </div>
        <Button variant="outline" className="flex items-center space-x-2">
          <Info className="h-4 w-4" />
          <span>Export Analysis</span>
        </Button>
      </div>

      {/* Fund Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-sm text-green-800">Total Realized Value</div>
                <div className="font-bold text-green-900">
                  {formatCurrency(fundReturns.totalRealizedValue)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-sm text-blue-800">Gross Multiple</div>
                <div className="font-bold text-blue-900">
                  {formatMultiple(fundReturns.grossMultiple)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <Percent className="h-8 w-8 text-purple-600" />
              <div>
                <div className="text-sm text-purple-800">Net Multiple (to LPs)</div>
                <div className="font-bold text-purple-900">
                  {formatMultiple(fundReturns.netMultiple)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <Trophy className="h-8 w-8 text-orange-600" />
              <div>
                <div className="text-sm text-orange-800">Total Exits</div>
                <div className="font-bold text-orange-900">
                  {fundReturns.totalExits} companies
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fund Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Fund Parameters</CardTitle>
          <CardDescription>
            Adjust fund parameters to see impact on returns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label htmlFor="fund-size">Fund Size ($)</Label>
              <Input
                id="fund-size"
                type="number"
                value={fundSize}
                onChange={(e) => setFundSize(parseInt(e.target.value) || 138000000)}
                className="bg-yellow-50 border-yellow-300"
              />
              <p className="text-xs text-gray-500">Total fund size</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="portfolio-size-exit">Portfolio Size</Label>
              <Input
                id="portfolio-size-exit"
                type="number"
                value={portfolioSize}
                onChange={(e) => setPortfolioSize(parseInt(e.target.value) || 40)}
                className="bg-yellow-50 border-yellow-300"
              />
              <p className="text-xs text-gray-500">Number of companies</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="carry-percentage">Carry (%)</Label>
              <Input
                id="carry-percentage"
                type="number"
                value={carryPercentage}
                onChange={(e) => setCarryPercentage(parseFloat(e.target.value) || 20)}
                className="bg-yellow-50 border-yellow-300"
              />
              <p className="text-xs text-gray-500">Carried interest</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="mgmt-fee">Management Fee (%)</Label>
              <Input
                id="mgmt-fee"
                type="number"
                step="0.1"
                value={managementFee}
                onChange={(e) => setManagementFee(parseFloat(e.target.value) || 2)}
                className="bg-yellow-50 border-yellow-300"
              />
              <p className="text-xs text-gray-500">Annual management fee</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exit Analysis Table */}
      <Card>
        <CardHeader>
          <CardTitle>Exit Analysis by Stage</CardTitle>
          <CardDescription>
            Exit rates, valuations, and realized returns by funding stage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Companies at Stage</TableHead>
                <TableHead>Exit Rate</TableHead>
                <TableHead>Exiting Companies</TableHead>
                <TableHead>Avg Exit Value</TableHead>
                <TableHead>Avg Ownership</TableHead>
                <TableHead>Total Exit Value</TableHead>
                <TableHead>Realized Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exitData.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{row.stage}</TableCell>
                  <TableCell>{row.companiesAtStage}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-blue-600">
                      {formatPercent(row.exitRate * 100)}
                    </Badge>
                  </TableCell>
                  <TableCell>{Math.round(row.companiesAtStage * row.exitRate)}</TableCell>
                  <TableCell>{formatCurrency(row.avgExitValue)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-green-600">
                      {formatPercent(row.avgOwnership)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(row.totalExitValue)}</TableCell>
                  <TableCell className="font-bold text-green-600">
                    {formatCurrency(row.realizedValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Realized Value by Stage */}
        <Card>
          <CardHeader>
            <CardTitle>Realized Value by Stage</CardTitle>
            <CardDescription>
              Fund returns generated from exits at each stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={exitChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis tickFormatter={(value) => `$${value}M`} />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toFixed(1)}M`, "Realized Value"]}
                    labelFormatter={(label) => `Stage: ${label}`}
                  />
                  <Bar dataKey="realizedValue" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Exit Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Exit Distribution by Stage</CardTitle>
            <CardDescription>
              Number of companies exiting at each stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={exitChartData.filter(d => d.exitingCompanies > 0)}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="exitingCompanies"
                    nameKey="stage"
                  >
                    {exitChartData.filter(d => d.exitingCompanies > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={stageColors[index % stageColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [value, "Exiting Companies"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ownership Dilution Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Ownership Dilution Over Time</CardTitle>
          <CardDescription>
            How ownership percentage decreases through funding rounds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={exitData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip 
                  formatter={(value: number) => [`${value.toFixed(1)}%`, "Avg Ownership"]}
                />
                <Line 
                  type="monotone" 
                  dataKey="avgOwnership" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={{ fill: "#3b82f6", strokeWidth: 2, r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Fund Performance Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Fund Performance Analysis</CardTitle>
          <CardDescription>
            Detailed breakdown of fund economics and returns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Fund Economics</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Fund Size:</span>
                  <span className="font-medium">{formatCurrency(fundSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Management Fees (10yr):</span>
                  <span className="font-medium">{formatCurrency((fundSize * managementFee / 100) * 10)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Investable Capital:</span>
                  <span className="font-medium">{formatCurrency(fundReturns.totalInvestment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Realized Value:</span>
                  <span className="font-medium text-green-600">{formatCurrency(fundReturns.totalRealizedValue)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Returns Analysis</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Gross Multiple:</span>
                  <span className="font-medium">{formatMultiple(fundReturns.grossMultiple)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Carried Interest:</span>
                  <span className="font-medium">
                    {formatCurrency(Math.max(0, (fundReturns.totalRealizedValue - fundReturns.totalInvestment) * (carryPercentage / 100)))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Net Multiple (to LPs):</span>
                  <span className="font-medium text-blue-600">{formatMultiple(fundReturns.netMultiple)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Exit Success Rate:</span>
                  <span className="font-medium">{((fundReturns.totalExits / portfolioSize) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
