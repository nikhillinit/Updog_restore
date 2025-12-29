/**
 * Secondary Market Analysis Component
 * Provides liquidity analysis, secondary valuation tracking, and market opportunity assessment
 *
 * Uses BrandChartThemeProvider for consistent chart styling.
 * Migration: Replaced hardcoded COLORS with getChartColor() from chart-theme.
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  DollarSign,
  Clock,
  BarChart3,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { getChartColor } from '@/lib/chart-theme';

interface SecondaryPosition {
  id: string;
  companyName: string;
  sector: string;
  currentValuation: number;
  costBasis: number;
  shares: number;
  liquidityScore: number;
  marketInterest: 'High' | 'Medium' | 'Low';
  timeToExit: number; // months
  potentialBuyers: number;
  lastSecondaryPrice: number;
  priceChange: number;
  riskFactors: string[];
  stage: string;
}

interface MarketOpportunity {
  id: string;
  companyName: string;
  availableShares: number;
  askPrice: number;
  discount: number;
  timeRemaining: number; // days
  seller: string;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  estimatedFairValue: number;
}

const MOCK_POSITIONS: SecondaryPosition[] = [
  {
    id: 'pos-1',
    companyName: 'AlphaTech',
    sector: 'SaaS',
    currentValuation: 2100000,
    costBasis: 1250000,
    shares: 85000,
    liquidityScore: 85,
    marketInterest: 'High',
    timeToExit: 8,
    potentialBuyers: 12,
    lastSecondaryPrice: 24.50,
    priceChange: 8.5,
    riskFactors: ['Market volatility', 'Regulatory changes'],
    stage: 'Series A'
  },
  {
    id: 'pos-2',
    companyName: 'InnovateLabs',
    sector: 'DeepTech',
    currentValuation: 4200000,
    costBasis: 1800000,
    shares: 69000,
    liquidityScore: 72,
    marketInterest: 'High',
    timeToExit: 12,
    potentialBuyers: 8,
    lastSecondaryPrice: 60.80,
    priceChange: 15.2,
    riskFactors: ['Technology risk', 'Competition'],
    stage: 'Series A'
  },
  {
    id: 'pos-3',
    companyName: 'DigitalWave',
    sector: 'Consumer',
    currentValuation: 1000000,
    costBasis: 800000,
    shares: 101000,
    liquidityScore: 45,
    marketInterest: 'Low',
    timeToExit: 18,
    potentialBuyers: 3,
    lastSecondaryPrice: 9.90,
    priceChange: -5.1,
    riskFactors: ['Market saturation', 'Customer acquisition'],
    stage: 'Seed'
  }
];

const MOCK_OPPORTUNITIES: MarketOpportunity[] = [
  {
    id: 'opp-1',
    companyName: 'CatalystLabs',
    availableShares: 25000,
    askPrice: 34.00,
    discount: 15,
    timeRemaining: 7,
    seller: 'Early Employee',
    confidenceLevel: 'High',
    estimatedFairValue: 40.00
  },
  {
    id: 'opp-2',
    companyName: 'EchelonTech',
    availableShares: 15000,
    askPrice: 31.25,
    discount: 8,
    timeRemaining: 14,
    seller: 'Strategic Investor',
    confidenceLevel: 'Medium',
    estimatedFairValue: 34.00
  }
];

// Removed hardcoded COLORS - now using getChartColor() from chart-theme

export const SecondaryMarketAnalysis: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState('portfolio');

  // Calculate portfolio metrics
  const portfolioMetrics = useMemo(() => {
    const totalCurrentValue = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.currentValuation, 0);
    const totalCostBasis = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.costBasis, 0);
    const totalUnrealizedGain = totalCurrentValue - totalCostBasis;
    const avgLiquidityScore = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.liquidityScore, 0) / MOCK_POSITIONS.length;
    const highLiquidityCount = MOCK_POSITIONS.filter(pos => pos.liquidityScore >= 70).length;
    const avgTimeToExit = MOCK_POSITIONS.reduce((sum, pos) => sum + pos.timeToExit, 0) / MOCK_POSITIONS.length;

    return {
      totalCurrentValue,
      totalCostBasis,
      totalUnrealizedGain,
      returnMultiple: totalCurrentValue / totalCostBasis,
      avgLiquidityScore,
      highLiquidityCount,
      avgTimeToExit
    };
  }, []);

  // Prepare chart data
  const liquidityDistribution = MOCK_POSITIONS.map(pos => ({
    name: pos.companyName,
    liquidity: pos.liquidityScore,
    value: pos.currentValuation
  }));

  const sectorDistribution = MOCK_POSITIONS.reduce((acc, pos) => {
    const existing = acc.find(item => item.sector === pos.sector);
    if (existing) {
      existing.value += pos.currentValuation;
      existing.count += 1;
    } else {
      acc.push({
        sector: pos.sector,
        value: pos.currentValuation,
        count: 1
      });
    }
    return acc;
  }, [] as Array<{ sector: string; value: number; count: number }>);

  const pricePerformance = MOCK_POSITIONS.map(pos => ({
    name: pos.companyName.split(' ')[0],
    current: pos.lastSecondaryPrice,
    change: pos.priceChange
  }));

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const getLiquidityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getInterestBadgeColor = (interest: string) => {
    switch (interest) {
      case 'High': return 'bg-green-100 text-green-800 border-green-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Position Value</p>
                <p className="text-2xl font-bold">{formatCurrency(portfolioMetrics.totalCurrentValue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Unrealized Gain</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(portfolioMetrics.totalUnrealizedGain)}
                </p>
                <p className="text-xs text-gray-500">
                  {portfolioMetrics.returnMultiple.toFixed(2)}x multiple
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Liquidity Score</p>
                <p className={`text-2xl font-bold ${getLiquidityColor(portfolioMetrics.avgLiquidityScore)}`}>
                  {portfolioMetrics.avgLiquidityScore.toFixed(0)}
                </p>
                <p className="text-xs text-gray-500">
                  {portfolioMetrics.highLiquidityCount}/{MOCK_POSITIONS.length} high liquidity
                </p>
              </div>
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Time to Exit</p>
                <p className="text-2xl font-bold">{portfolioMetrics.avgTimeToExit.toFixed(0)}mo</p>
                <p className="text-xs text-gray-500">Estimated timeline</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analysis Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="portfolio">Portfolio Analysis</TabsTrigger>
          <TabsTrigger value="opportunities">Market Opportunities</TabsTrigger>
          <TabsTrigger value="insights">Insights & Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Liquidity Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Liquidity Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={liquidityDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, 'Liquidity Score']}
                      labelFormatter={(name) => `${name}`}
                    />
                    <Bar dataKey="liquidity" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Sector Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Value by Sector
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sectorDistribution}
                      dataKey="value"
                      nameKey="sector"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(props: any) => `${props.sector || ''}: ${formatCurrency(props.value || 0)}`}
                    >
                      {sectorDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={getChartColor(index)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Position Details */}
          <Card>
            <CardHeader>
              <CardTitle>Position Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {MOCK_POSITIONS.map(position => (
                  <div key={position.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{position.companyName}</h3>
                        <p className="text-sm text-gray-600">{position.sector} • {position.stage}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getInterestBadgeColor(position.marketInterest)}>
                          {position.marketInterest} Interest
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatCurrency(position.currentValuation)}</p>
                          <p className={`text-xs ${position.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {position.priceChange >= 0 ? '+' : ''}{position.priceChange}%
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Liquidity Score</p>
                        <div className="flex items-center gap-2">
                          <Progress value={position.liquidityScore} className="h-2 flex-1" />
                          <span className={`text-sm font-medium ${getLiquidityColor(position.liquidityScore)}`}>
                            {position.liquidityScore}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Time to Exit</p>
                        <p className="text-sm font-medium">{position.timeToExit} months</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Potential Buyers</p>
                        <p className="text-sm font-medium">{position.potentialBuyers} interested</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Last Price</p>
                        <p className="text-sm font-medium">${position.lastSecondaryPrice}</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-1">Risk Factors</p>
                      <div className="flex flex-wrap gap-1">
                        {position.riskFactors.map((risk, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {risk}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-6">
          {/* Price Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Secondary Price Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={pricePerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === 'current' ? `$${value}` : `${value >= 0 ? '+' : ''}${value}%`,
                      name === 'current' ? 'Current Price' : 'Price Change'
                    ]}
                  />
                  <Line type="monotone" dataKey="current" stroke="#3B82F6" strokeWidth={2} />
                  <Line type="monotone" dataKey="change" stroke="#10B981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Market Opportunities */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Available Market Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {MOCK_OPPORTUNITIES.map(opportunity => (
                  <div key={opportunity.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{opportunity.companyName}</h3>
                        <p className="text-sm text-gray-600">Seller: {opportunity.seller}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={opportunity.confidenceLevel === 'High' ? 'default' : 'outline'}>
                          {opportunity.confidenceLevel} Confidence
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-medium">${opportunity.askPrice}</p>
                          <p className="text-xs text-green-600">{opportunity.discount}% discount</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Available Shares</p>
                        <p className="text-sm font-medium">{opportunity.availableShares.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Ask Price</p>
                        <p className="text-sm font-medium">${opportunity.askPrice}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Fair Value Est.</p>
                        <p className="text-sm font-medium">${opportunity.estimatedFairValue}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Time Remaining</p>
                        <p className="text-sm font-medium">{opportunity.timeRemaining} days</p>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button size="sm">
                        <Info className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Liquidity Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Liquidity Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium">High Liquidity Assets</p>
                    <p className="text-sm text-gray-600">
                      {portfolioMetrics.highLiquidityCount} of {MOCK_POSITIONS.length} positions show strong secondary market activity
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Market Timing</p>
                    <p className="text-sm text-gray-600">
                      Current market conditions favor selective secondary sales in SaaS and DeepTech
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium">Risk Monitoring</p>
                    <p className="text-sm text-gray-600">
                      Monitor market volatility and regulatory changes affecting portfolio liquidity
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-600" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                  <p className="font-medium text-green-900">Consider Partial Exit</p>
                  <p className="text-sm text-green-700">
                    AlphaTech and InnovateLabs show strong secondary demand - consider 20-30% position sales
                  </p>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="font-medium text-blue-900">Market Opportunity</p>
                  <p className="text-sm text-blue-700">
                    CatalystLabs secondary offering at 15% discount represents attractive entry point
                  </p>
                </div>
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="font-medium text-yellow-900">Portfolio Rebalancing</p>
                  <p className="text-sm text-yellow-700">
                    Consider increasing liquidity buffer to 15-20% of portfolio for opportunistic investments
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SecondaryMarketAnalysis;