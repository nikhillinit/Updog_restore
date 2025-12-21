/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calculator,
  DollarSign,
  TrendingUp,
  Target,
  Settings,
  BarChart3
} from "lucide-react";

interface PortfolioParams {
  fundSize: number;
  managementFee: number;
  initialCheckSize: number;
  followOnReserve: number;
  targetCompanies: number;
  targetOwnership: number;
  requiredLPReturn: number;
  seedRoundSize: number;
  seedPreMoney: number;
  seriesAGradRate: number;
  seriesBGradRate: number;
  seriesCGradRate: number;
  fundTerm: number; // years, 0 means no end date
}

interface PortfolioCalculations {
  initialInvestmentCapital: number;
  followOnReserveCapital: number;
  managementFees: number;
  fundCosts: number;
  totalInvestableCapital: number;
  avgInitialCheck: number;
  avgOwnership: number;
  totalRequiredReturn: number;
  returnTheFundValue: number;
  impliedTVPI: number;
}

export default function PortfolioConstruction() {
  const [params, setParams] = useState<PortfolioParams>({
    fundSize: 100000, // $100M in thousands
    managementFee: 2.0,
    initialCheckSize: 1000, // $1M in thousands
    followOnReserve: 67,
    targetCompanies: 30,
    targetOwnership: 15,
    requiredLPReturn: 3.0,
    seedRoundSize: 1776,
    seedPreMoney: 6912,
    seriesAGradRate: 50,
    seriesBGradRate: 50,
    seriesCGradRate: 50,
    fundTerm: 10 // 10 year fund term
  });

  const updateParam = (key: keyof PortfolioParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // Calculate portfolio construction metrics using reserve-driven methodology
  const calculatePortfolio = (): PortfolioCalculations => {
    const fundSizeActual = params.fundSize * 1000; // Convert to actual dollars
    const managementFees = (fundSizeActual * params.managementFee / 100) * 10; // 10 year fund
    const fundCosts = 850000; // $850K fund costs
    
    const totalCosts = managementFees + fundCosts;
    const totalInvestableCapital = fundSizeActual - totalCosts;
    
    // Deploy ALL available capital - no unused capital allowed
    // Start with initial check size, calculate precise number of deals to deploy all capital
    const initialCheckSizeActual = params.initialCheckSize * 1000;
    
    // Calculate follow-on requirements based on graduation rates and market dynamics
    const seedGradRate = params.seriesAGradRate / 100;
    const seriesAGradRate = params.seriesBGradRate / 100; 
    const seriesBGradRate = params.seriesCGradRate / 100;
    
    // Market-driven follow-on check sizes (based on typical round participation)
    const seedFollowOnCheck = 377778; // From market data
    const seriesAFollowOnCheck = 1200000; // From market data
    const seriesBFollowOnCheck = 2000000; // From market data
    
    // Calculate expected follow-on capital per initial investment
    const expectedSeedFollowOn = seedGradRate * seedFollowOnCheck * 0.8; // 80% participation
    const expectedSeriesAFollowOn = seedGradRate * seriesAGradRate * seriesAFollowOnCheck * 0.7; // 70% participation
    const expectedSeriesBFollowOn = seedGradRate * seriesAGradRate * seriesBGradRate * seriesBFollowOnCheck * 0.5; // 50% participation
    
    const totalFollowOnPerDeal = expectedSeedFollowOn + expectedSeriesAFollowOn + expectedSeriesBFollowOn;
    const totalCapitalPerDeal = initialCheckSizeActual + totalFollowOnPerDeal;
    
    // Calculate precise number of deals to deploy ALL capital
    const preciseNumberOfDeals = totalInvestableCapital / totalCapitalPerDeal;
    const numberOfDeals = Math.floor(preciseNumberOfDeals * 100) / 100; // Preserve 2 decimals for transparency
    
    // Recalculate based on precise deal count
    const initialInvestmentCapital = numberOfDeals * initialCheckSizeActual;
    const followOnReserveCapital = numberOfDeals * totalFollowOnPerDeal;
    
    // Verification: ensure all capital is deployed - core portfolio construction principle
    const totalCapitalDeployed = initialInvestmentCapital + followOnReserveCapital;
    const capitalUtilization = (totalCapitalDeployed / totalInvestableCapital) * 100;
    const unusedCapital = totalInvestableCapital - totalCapitalDeployed;
    
    const avgInitialCheck = initialCheckSizeActual;
    const seedPostMoney = params.seedPreMoney + params.seedRoundSize;
    const avgOwnership = (avgInitialCheck / seedPostMoney) * 100;
    
    // Calculate required fund return for target LP multiple
    const targetNetReturn = fundSizeActual * params.requiredLPReturn;
    const carriedInterest = Math.max(0, (targetNetReturn - fundSizeActual) * 0.20); // 20% carry
    const totalRequiredReturn = targetNetReturn + carriedInterest;
    
    // Return the fund calculation
    const returnTheFundValue = fundSizeActual / (avgOwnership / 100);
    
    const impliedTVPI = totalRequiredReturn / totalInvestableCapital;
    
    return {
      initialInvestmentCapital,
      followOnReserveCapital,
      managementFees,
      fundCosts,
      totalInvestableCapital,
      avgInitialCheck,
      avgOwnership,
      totalRequiredReturn,
      returnTheFundValue,
      impliedTVPI
    };
  };

  const calculations = calculatePortfolio();

  // Generate data for charts
  const allocationData = [
    {
      name: "Initial Investments Capital",
      value: calculations.initialInvestmentCapital / 1000, // Convert to thousands for display
      percentage: (calculations.initialInvestmentCapital / (params.fundSize * 1000)) * 100
    },
    {
      name: "Follow-on Reserves",
      value: calculations.followOnReserveCapital / 1000,
      percentage: (calculations.followOnReserveCapital / (params.fundSize * 1000)) * 100
    },
    {
      name: "Fees",
      value: calculations.managementFees / 1000,
      percentage: (calculations.managementFees / (params.fundSize * 1000)) * 100
    },
    {
      name: "Costs",
      value: calculations.fundCosts / 1000,
      percentage: (calculations.fundCosts / (params.fundSize * 1000)) * 100
    }
  ];

  // Generate graduation rate impact data
  const graduationData = [
    {
      round: "Seed",
      available: calculations.initialInvestmentCapital / 1000,
      invested: calculations.initialInvestmentCapital / 1000
    },
    {
      round: "Series A",
      available: (calculations.followOnReserveCapital * 0.4) / 1000,
      invested: (calculations.followOnReserveCapital * 0.4 * params.seriesAGradRate / 100) / 1000
    },
    {
      round: "Series B", 
      available: (calculations.followOnReserveCapital * 0.3) / 1000,
      invested: (calculations.followOnReserveCapital * 0.3 * params.seriesBGradRate / 100) / 1000
    },
    {
      round: "Series C",
      available: (calculations.followOnReserveCapital * 0.2) / 1000,
      invested: (calculations.followOnReserveCapital * 0.2 * params.seriesCGradRate / 100) / 1000
    },
    {
      round: "Series D",
      available: (calculations.followOnReserveCapital * 0.1) / 1000,
      invested: (calculations.followOnReserveCapital * 0.1 * 0.5) / 1000
    }
  ];

  // Generate return the fund data by fund size
  const returnFundData = [100, 150, 200, 250, 300].map(size => {
    const ownership = calculations.avgOwnership;
    const returnValue = (size * 1000) / (ownership / 100);
    return {
      fundSize: size,
      returnValue: returnValue / 1000000 // Convert to millions
    };
  });

  // Generate required return waterfall
  const returnWaterfallData = [
    {
      category: "Initial Investment",
      amount: params.fundSize,
      cumulative: params.fundSize
    },
    {
      category: "Required LP Profits", 
      amount: (params.requiredLPReturn - 1) * params.fundSize,
      cumulative: params.requiredLPReturn * params.fundSize
    },
    {
      category: "Fees",
      amount: calculations.managementFees / 1000,
      cumulative: params.requiredLPReturn * params.fundSize + calculations.managementFees / 1000
    },
    {
      category: "Carry",
      amount: Math.max(0, ((params.requiredLPReturn - 1) * params.fundSize) * 0.20),
      cumulative: calculations.totalRequiredReturn / 1000
    }
  ];

  const formatCurrency = (amount: number) => {
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}M`;
    return `$${amount.toFixed(0)}K`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <span>Portfolio Construction</span>
          </h2>
          <p className="text-muted-foreground">
            Interactive fund modeling with real-time impact analysis
          </p>
        </div>
        <Button variant="outline" className="flex items-center space-x-2">
          <Settings className="h-4 w-4" />
          <span>Reset Parameters</span>
        </Button>
      </div>

      <Tabs defaultValue="construction" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="construction">Construction</TabsTrigger>
          <TabsTrigger value="graduation">Graduation Impact</TabsTrigger>
          <TabsTrigger value="returns">Return Analysis</TabsTrigger>
          <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
        </TabsList>

        <TabsContent value="construction" className="space-y-6">
          {/* Key Metrics Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <DollarSign className="h-8 w-8 text-blue-600" />
                  <div>
                    <div className="text-sm text-blue-800">Avg Initial Check</div>
                    <div className="font-bold text-blue-900">
                      {formatCurrency(calculations.avgInitialCheck / 1000)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <Target className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-sm text-green-800">Avg Ownership</div>
                    <div className="font-bold text-green-900">
                      {formatPercent(calculations.avgOwnership)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <TrendingUp className="h-8 w-8 text-orange-600" />
                  <div>
                    <div className="text-sm text-orange-800">Required Return</div>
                    <div className="font-bold text-orange-900">
                      {formatCurrency(calculations.totalRequiredReturn / 1000)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <Calculator className="h-8 w-8 text-purple-600" />
                  <div>
                    <div className="text-sm text-purple-800">Implied TVPI</div>
                    <div className="font-bold text-purple-900">
                      {calculations.impliedTVPI.toFixed(2)}x
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Fund Parameters</CardTitle>
                <CardDescription>
                  Adjust key fund construction parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Fund Size</Label>
                    <Badge variant="outline">{formatCurrency(params.fundSize)}</Badge>
                  </div>
                  <Slider
                    value={[params.fundSize]}
                    onValueChange={([value]) => { updateParam('fundSize', value ?? 0); }}
                    min={50000}
                    max={250000}
                    step={10000}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Management Fee</Label>
                    <Badge variant="outline">{formatPercent(params.managementFee)}</Badge>
                  </div>
                  <Slider
                    value={[params.managementFee]}
                    onValueChange={([value]) => updateParam('managementFee', value ?? 0)}
                    min={1.6}
                    max={2.4}
                    step={0.1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Initial Check Size</Label>
                    <Badge variant="outline">{formatCurrency(params.initialCheckSize)}</Badge>
                  </div>
                  <Slider
                    value={[params.initialCheckSize]}
                    onValueChange={([value]) => updateParam('initialCheckSize', value ?? 0)}
                    min={800}
                    max={1200}
                    step={50}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Follow-on Reserve %</Label>
                    <Badge variant="outline">{formatPercent(params.followOnReserve)}</Badge>
                  </div>
                  <Slider
                    value={[params.followOnReserve]}
                    onValueChange={([value]) => updateParam('followOnReserve', value ?? 0)}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Fund Capital Allocation Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Allocation of Fund Capital</CardTitle>
                <CardDescription>
                  Breakdown of how fund capital is allocated
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={allocationData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis tickFormatter={(value: any) => formatCurrency(value)} />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), "Amount"]}
                        labelFormatter={(label: any) => `Category: ${label}`}
                      />
                      <Bar dataKey="value" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="graduation" className="space-y-6">
          {/* Graduation Rate Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Graduation Rate Parameters</CardTitle>
              <CardDescription>
                Adjust graduation rates to see impact on investment allocation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Seed Round Size</Label>
                    <Badge variant="outline">{formatCurrency(params.seedRoundSize)}</Badge>
                  </div>
                  <Slider
                    value={[params.seedRoundSize]}
                    onValueChange={([value]) => updateParam('seedRoundSize', value ?? 0)}
                    min={1600}
                    max={2400}
                    step={50}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Seed Pre-Money Valuation</Label>
                    <Badge variant="outline">{formatCurrency(params.seedPreMoney)}</Badge>
                  </div>
                  <Slider
                    value={[params.seedPreMoney]}
                    onValueChange={([value]) => updateParam('seedPreMoney', value ?? 0)}
                    min={6400}
                    max={9600}
                    step={100}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Series A Graduation Rate</Label>
                    <Badge variant="outline">{formatPercent(params.seriesAGradRate)}</Badge>
                  </div>
                  <Slider
                    value={[params.seriesAGradRate]}
                    onValueChange={([value]) => updateParam('seriesAGradRate', value ?? 0)}
                    min={40}
                    max={60}
                    step={2}
                    className="w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Series B Graduation Rate</Label>
                    <Badge variant="outline">{formatPercent(params.seriesBGradRate)}</Badge>
                  </div>
                  <Slider
                    value={[params.seriesBGradRate]}
                    onValueChange={([value]) => updateParam('seriesBGradRate', value ?? 0)}
                    min={40}
                    max={60}
                    step={2}
                    className="w-full"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investment Allocation by Round */}
          <Card>
            <CardHeader>
              <CardTitle>Amount Available to Invest and Actually Invested in Each Round</CardTitle>
              <CardDescription>
                Blue bars show available capital, red bars show actual invested amounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={graduationData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis tickFormatter={(value: any) => formatCurrency(value)} />
                    <Tooltip 
                      formatter={(value: number, name) => [
                        formatCurrency(value), 
                        name === 'available' ? 'Available Investment Amount' : 'Actual Invested Amount'
                      ]}
                    />
                    <Bar dataKey="available" fill="#3b82f6" name="available" />
                    <Bar dataKey="invested" fill="#ef4444" name="invested" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns" className="space-y-6">
          {/* Required Return Waterfall */}
          <Card>
            <CardHeader>
              <CardTitle>Implied Fund Performance to Guarantee LP Return Multiple</CardTitle>
              <CardDescription>
                Waterfall showing required returns to achieve {params.requiredLPReturn}x net LP multiple
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Required LP Net Return Multiple</Label>
                    <Badge variant="outline">{params.requiredLPReturn.toFixed(1)}x</Badge>
                  </div>
                  <Slider
                    value={[params.requiredLPReturn]}
                    onValueChange={([value]) => updateParam('requiredLPReturn', value ?? 0)}
                    min={1.0}
                    max={10.0}
                    step={0.1}
                    className="w-full"
                  />
                </div>
              </div>
              
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={returnWaterfallData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis tickFormatter={(value: any) => formatCurrency(value)} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Amount"]}
                    />
                    <Bar dataKey="amount" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Return the Fund Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Exit Value Needed to Return the Fund Based on Fund Size</CardTitle>
              <CardDescription>
                Required exit value for a single company to return entire fund
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={returnFundData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="fundSize" 
                      tickFormatter={(value: any) => `$${value}K`}
                    />
                    <YAxis tickFormatter={(value: any) => `$${value}B`} />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toFixed(1)}B`, "Exit Value Required"]}
                      labelFormatter={(label: any) => `Fund Size: $${label}K`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="returnValue" 
                      stroke="#10b981" 
                      fill="#10b981" 
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sensitivity" className="space-y-6">
          {/* Sensitivity Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Construction Sensitivity Analysis</CardTitle>
              <CardDescription>
                Key insights and trade-offs in portfolio construction decisions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Current Configuration Impact</h4>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="font-medium text-blue-900">Fund Size: {formatCurrency(params.fundSize)}</p>
                      <p className="text-blue-700">
                        With {params.targetCompanies} companies and {formatPercent(params.followOnReserve)} follow-on reserve, 
                        average initial check is {formatCurrency(calculations.avgInitialCheck / 1000)}
                      </p>
                    </div>
                    
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="font-medium text-green-900">Ownership Impact</p>
                      <p className="text-green-700">
                        At current seed valuations ({formatCurrency(params.seedPreMoney + params.seedRoundSize)} post-money), 
                        achieving {formatPercent(calculations.avgOwnership)} average ownership
                      </p>
                    </div>
                    
                    <div className="p-3 bg-orange-50 rounded-lg">
                      <p className="font-medium text-orange-900">Return Requirements</p>
                      <p className="text-orange-700">
                        To achieve {params.requiredLPReturn}x LP returns, fund must generate 
                        {formatCurrency(calculations.totalRequiredReturn / 1000)} total returns 
                        ({calculations.impliedTVPI.toFixed(2)}x TVPI)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Key Trade-offs</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
                      <p>Higher follow-on reserves reduce initial check sizes but enable doubling down on winners</p>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
                      <p>Larger fund size allows bigger checks but requires proportionally higher returns</p>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-1.5"></div>
                      <p>More companies reduces concentration risk but dilutes follow-on reserves per company</p>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5"></div>
                      <p>Higher graduation rates increase follow-on deployment but require more reserve capital</p>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5"></div>
                      <p>Management fee recycling can boost returns by increasing investable capital</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
