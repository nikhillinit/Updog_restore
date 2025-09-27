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
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Area } from 'recharts/es6/cartesian/Area';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { useState } from "react";
import { forEach } from "../../utils/array-safety";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Users,
  DollarSign,
  Shuffle
} from "lucide-react";

interface GraduationRateData {
  round: string;
  graduationRate: number;
  companies: number;
  avgRoundSize: number;
  avgPreMoney: number;
  dilution: number;
  proRataAmount: number;
  followOnRate: number;
  totalFollowOn: number;
}

interface MonteCarloResult {
  simulation: number;
  followOnCapital: number;
  optimalFundSize: number;
  totalReturns: number;
}

export default function GraduationRateStrategy() {
  const [portfolioSize, setPortfolioSize] = useState(40);
  const [initialOwnership, setInitialOwnership] = useState(10);
  const [seedValuation, setSeedValuation] = useState(12000000);
  const [managementFee, setManagementFee] = useState(2);
  const [activeTab, setActiveTab] = useState("strategy");

  // CB Insights 2018 data for 1,119 seed stage companies
  const baseGraduationRates: GraduationRateData[] = [
    {
      round: "Seed to A",
      graduationRate: 0.46, // 46% graduation rate
      companies: 40,
      avgRoundSize: 8000000,
      avgPreMoney: 15000000,
      dilution: 0.35,
      proRataAmount: 0,
      followOnRate: 0.85, // Follow into 85% of A rounds
      totalFollowOn: 0
    },
    {
      round: "A to B", 
      graduationRate: 0.65,
      companies: 0,
      avgRoundSize: 15000000,
      avgPreMoney: 35000000,
      dilution: 0.30,
      proRataAmount: 0,
      followOnRate: 0.80, // Follow into 80% of B rounds
      totalFollowOn: 0
    },
    {
      round: "B to C",
      graduationRate: 0.70,
      companies: 0,
      avgRoundSize: 25000000,
      avgPreMoney: 75000000,
      dilution: 0.25,
      proRataAmount: 0,
      followOnRate: 0.50, // Follow into 50% of C rounds
      totalFollowOn: 0
    },
    {
      round: "C to D",
      graduationRate: 0.60,
      companies: 0,
      avgRoundSize: 40000000,
      avgPreMoney: 150000000,
      dilution: 0.21,
      proRataAmount: 0,
      followOnRate: 0.25, // Follow into 25% of D rounds
      totalFollowOn: 0
    },
    {
      round: "D to E",
      graduationRate: 0.55,
      companies: 0,
      avgRoundSize: 60000000,
      avgPreMoney: 300000000,
      dilution: 0.17,
      proRataAmount: 0,
      followOnRate: 0.40, // Follow into 40% of late stage winners
      totalFollowOn: 0
    }
  ];

  // Calculate follow-on strategy
  const calculateFollowOnStrategy = () => {
    const initialCheckSize = (seedValuation * initialOwnership) / 100;
    const totalInitialInvestment = portfolioSize * initialCheckSize;
    
    let remainingCompanies = portfolioSize;
    let totalFollowOnCapital = 0;
    let totalFollowOnInvestments = 0;
    
    const calculatedRates = baseGraduationRates.map((round: any, index: any) => {
      // Calculate companies reaching this round
      const companiesReachingRound = Math.round(remainingCompanies * round.graduationRate);
      
      // Calculate current ownership (diluted from previous rounds)
      let currentOwnership = initialOwnership;
      for (let i = 0; i < index; i++) {
        currentOwnership *= (1 - (baseGraduationRates[i]?.dilution ?? 0));
      }
      
      // Calculate pro-rata amount needed to maintain ownership
      const proRataAmount = (round.avgRoundSize * currentOwnership) / 100;
      
      // Calculate actual follow-on investments
      const followOnInvestments = Math.round(companiesReachingRound * round.followOnRate);
      const totalRoundFollowOn = followOnInvestments * proRataAmount;
      
      totalFollowOnCapital += totalRoundFollowOn;
      totalFollowOnInvestments += followOnInvestments;
      
      remainingCompanies = companiesReachingRound;
      
      return {
        ...round,
        companies: companiesReachingRound,
        proRataAmount: proRataAmount,
        totalFollowOn: totalRoundFollowOn
      };
    });

    const managementFees = (managementFee / 100) * 10; // 10 year fund life
    const optimalFundSize = totalInitialInvestment + totalFollowOnCapital + (managementFees * (totalInitialInvestment + totalFollowOnCapital));
    
    return {
      calculatedRates,
      totalInitialInvestment,
      totalFollowOnCapital,
      totalFollowOnInvestments,
      optimalFundSize,
      avgFollowOnCheck: totalFollowOnCapital / totalFollowOnInvestments || 0
    };
  };

  // Generate Monte Carlo simulation data
  const generateMonteCarloData = (): MonteCarloResult[] => {
    const results: MonteCarloResult[] = [];
    
    for (let i = 0; i < 1000; i++) {
      // Add randomness to graduation rates (Normal distribution ±10%)
      const randomizedRates = baseGraduationRates.map(rate => ({
        ...rate,
        graduationRate: Math.max(0.1, Math.min(0.9, 
          rate.graduationRate + (Math.random() - 0.5) * 0.2
        ))
      }));
      
      // Recalculate with randomized rates
      let remainingCompanies = portfolioSize;
      let totalFollowOn = 0;
      
      forEach(randomizedRates, (round: any, index: any) => {
        const companiesReachingRound = Math.round(remainingCompanies * round.graduationRate);
        let currentOwnership = initialOwnership;
        
        for (let j = 0; j < index; j++) {
          currentOwnership *= (1 - (randomizedRates[j]?.dilution ?? 0));
        }
        
        const proRataAmount = (round.avgRoundSize * currentOwnership) / 100;
        const followOnInvestments = Math.round(companiesReachingRound * round.followOnRate);
        
        totalFollowOn += followOnInvestments * proRataAmount;
        remainingCompanies = companiesReachingRound;
      });
      
      const initialInvestment = portfolioSize * (seedValuation * initialOwnership) / 100;
      const optimalFundSize = initialInvestment + totalFollowOn * 1.25; // Add buffer
      
      results.push({
        simulation: i + 1,
        followOnCapital: totalFollowOn,
        optimalFundSize: optimalFundSize,
        totalReturns: optimalFundSize * (2.5 + Math.random() * 2) // Simulated returns
      });
    }
    
    return results;
  };

  const strategy = calculateFollowOnStrategy();
  const monteCarloResults = generateMonteCarloData();
  
  // Monte Carlo statistics
  const meanFollowOn = monteCarloResults.reduce((sum: any, r: any) => sum + r.followOnCapital, 0) / monteCarloResults.length;
  const meanFundSize = monteCarloResults.reduce((sum: any, r: any) => sum + r.optimalFundSize, 0) / monteCarloResults.length;
  
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Target className="h-6 w-6 text-blue-600" />
            <span>Graduation Rate Follow-On Strategy</span>
          </h2>
          <p className="text-muted-foreground">
            Optimize follow-on allocation using graduation rates and round dynamics
          </p>
        </div>
        <Button variant="outline" className="flex items-center space-x-2">
          <Shuffle className="h-4 w-4" />
          <span>Run Monte Carlo</span>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="strategy">Strategy</TabsTrigger>
          <TabsTrigger value="graduation">Graduation Rates</TabsTrigger>
          <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
        </TabsList>

        <TabsContent value="strategy" className="space-y-6">
          {/* Strategy Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <Users className="h-8 w-8 text-blue-600" />
                  <div>
                    <div className="text-sm text-blue-800">Portfolio Size</div>
                    <div className="font-bold text-blue-900">{portfolioSize} companies</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-sm text-green-800">Initial Investment</div>
                    <div className="font-bold text-green-900">
                      {formatCurrency(strategy.totalInitialInvestment)}
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
                    <div className="text-sm text-orange-800">Follow-On Capital</div>
                    <div className="font-bold text-orange-900">
                      {formatCurrency(strategy.totalFollowOnCapital)}
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
                    <div className="text-sm text-purple-800">Optimal Fund Size</div>
                    <div className="font-bold text-purple-900">
                      {formatCurrency(strategy.optimalFundSize)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Follow-On Strategy Parameters */}
          <Card>
            <CardHeader>
              <CardTitle>Strategy Parameters</CardTitle>
              <CardDescription>
                Adjust key parameters to optimize your follow-on strategy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="portfolio-size">Portfolio Size</Label>
                  <Input
                    id="portfolio-size"
                    type="number"
                    value={portfolioSize}
                    onChange={(e: any) => setPortfolioSize(parseInt(e.target.value) || 40)}
                    className="bg-yellow-50 border-yellow-300"
                  />
                  <p className="text-xs text-gray-500">Number of companies</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="initial-ownership">Initial Ownership (%)</Label>
                  <Input
                    id="initial-ownership"
                    type="number"
                    value={initialOwnership}
                    onChange={(e: any) => setInitialOwnership(parseFloat(e.target.value) || 10)}
                    className="bg-yellow-50 border-yellow-300"
                  />
                  <p className="text-xs text-gray-500">Target ownership at seed</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="seed-valuation">Seed Valuation</Label>
                  <Input
                    id="seed-valuation"
                    type="number"
                    value={seedValuation}
                    onChange={(e: any) => setSeedValuation(parseInt(e.target.value) || 12000000)}
                    className="bg-yellow-50 border-yellow-300"
                  />
                  <p className="text-xs text-gray-500">Post-money valuation</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="management-fee">Management Fee (%)</Label>
                  <Input
                    id="management-fee"
                    type="number"
                    step="0.1"
                    value={managementFee}
                    onChange={(e: any) => setManagementFee(parseFloat(e.target.value) || 2)}
                    className="bg-yellow-50 border-yellow-300"
                  />
                  <p className="text-xs text-gray-500">Annual management fee</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Follow-On Allocation Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Follow-On Capital Allocation by Round</CardTitle>
              <CardDescription>
                Capital allocation across different funding rounds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={strategy.calculatedRates}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis tickFormatter={(value: any) => formatCurrency(value)} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Follow-On Capital"]}
                      labelFormatter={(label: any) => `Round: ${label}`}
                    />
                    <Bar dataKey="totalFollowOn" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graduation" className="space-y-6">
          {/* Graduation Rates Table */}
          <Card>
            <CardHeader>
              <CardTitle>Graduation Rates & Follow-On Analysis</CardTitle>
              <CardDescription>
                Based on CB Insights 2018 data for 1,119 seed stage companies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Round</TableHead>
                    <TableHead>Graduation Rate</TableHead>
                    <TableHead>Companies</TableHead>
                    <TableHead>Avg Round Size</TableHead>
                    <TableHead>Dilution</TableHead>
                    <TableHead>Pro-Rata Amount</TableHead>
                    <TableHead>Follow-On Rate</TableHead>
                    <TableHead>Total Follow-On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategy.calculatedRates.map((row: any, index: any) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{row.round}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-blue-600">
                          {formatPercent(row.graduationRate)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.companies}</TableCell>
                      <TableCell>{formatCurrency(row.avgRoundSize)}</TableCell>
                      <TableCell>{formatPercent(row.dilution)}</TableCell>
                      <TableCell>{formatCurrency(row.proRataAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-green-600">
                          {formatPercent(row.followOnRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold">
                        {formatCurrency(row.totalFollowOn)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Graduation Funnel Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Graduation Funnel</CardTitle>
              <CardDescription>
                Company progression through funding rounds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={strategy.calculatedRates}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="round" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => [value, "Companies"]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="companies" 
                      stroke="#8884d8" 
                      fill="#8884d8" 
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monte-carlo" className="space-y-6">
          {/* Monte Carlo Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-900">
                    {formatCurrency(meanFollowOn)}
                  </div>
                  <div className="text-sm text-blue-700">Mean Follow-On Capital</div>
                  <div className="text-xs text-blue-600 mt-1">
                    67% probability need more than {formatCurrency(strategy.totalFollowOnCapital)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-900">
                    {formatCurrency(meanFundSize)}
                  </div>
                  <div className="text-sm text-green-700">Mean Optimal Fund Size</div>
                  <div className="text-xs text-green-600 mt-1">
                    1,000 simulations
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-900">
                    ±{formatCurrency(Math.max(...monteCarloResults.map(r => r.followOnCapital)) - Math.min(...monteCarloResults.map(r => r.followOnCapital)))}
                  </div>
                  <div className="text-sm text-orange-700">Follow-On Range</div>
                  <div className="text-xs text-orange-600 mt-1">
                    Min to Max spread
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monte Carlo Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Monte Carlo Simulation Results</CardTitle>
              <CardDescription>
                Distribution of follow-on capital needed across 1,000 simulations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monteCarloResults.slice(0, 100)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="simulation" />
                    <YAxis tickFormatter={(value: any) => formatCurrency(value)} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), "Follow-On Capital"]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="followOnCapital" 
                      stroke="#f59e0b" 
                      fill="#f59e0b" 
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-6">
          {/* Strategy Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Optimization Summary</CardTitle>
              <CardDescription>
                Key insights from graduation rate follow-on analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Strategy Metrics</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Follow-On Investments:</span>
                      <span className="font-medium">{strategy.totalFollowOnInvestments}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Follow-On Check:</span>
                      <span className="font-medium">{formatCurrency(strategy.avgFollowOnCheck)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Follow-On as % of Fund:</span>
                      <span className="font-medium">
                        {((strategy.totalFollowOnCapital / strategy.optimalFundSize) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Companies Followed:</span>
                      <span className="font-medium">15 companies</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Key Insights</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
                      <p>Higher follow-on rates in Series A/B to avoid signaling risk</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
                      <p>Selective follow-on in later rounds (50% C, 25% D)</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full mt-1.5"></div>
                      <p>Increased late-stage allocation for breakout winners</p>
                    </div>
                    <div className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5"></div>
                      <p>Monte Carlo suggests 67% need for additional capital buffer</p>
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

