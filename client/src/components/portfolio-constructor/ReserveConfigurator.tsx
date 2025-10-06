import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart
} from 'recharts';
import {
  Target,
  TrendingUp,
  Shield,
  AlertCircle,
  Clock,
  BarChart3,
  Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortfolioState } from "@/pages/portfolio-constructor";

interface ReservePool {
  id: string;
  name: string;
  percentage: number;
  amount: number;
  purpose: string;
  deploymentTrigger: string;
  riskLevel: 'low' | 'medium' | 'high';
  timeframe: string;
  companies: string[];
  status: 'allocated' | 'available' | 'deployed' | 'reserved';
}

interface OptimizationSuggestion {
  type: 'reallocation' | 'timing' | 'risk_reduction' | 'opportunity';
  title: string;
  description: string;
  impact: number; // Expected IRR impact
  confidence: number; // 0-1
  effort: 'low' | 'medium' | 'high';
  category: string;
}

interface ReserveConfiguratorProps {
  portfolioState: PortfolioState;
  onUpdate: (updates: Partial<PortfolioState>) => void;
  isCalculating: boolean;
}

const defaultReservePools: ReservePool[] = [
  {
    id: 'follow-on-primary',
    name: 'Primary Follow-On',
    percentage: 45,
    amount: 9000000,
    purpose: 'Series B+ follow-on investments for top performers',
    deploymentTrigger: 'Performance milestones met',
    riskLevel: 'medium',
    timeframe: '18-36 months',
    companies: ['Company A', 'Company C', 'Company F'],
    status: 'allocated'
  },
  {
    id: 'bridge-rounds',
    name: 'Bridge Financing',
    percentage: 20,
    amount: 4000000,
    purpose: 'Bridge rounds and emergency support',
    deploymentTrigger: 'Company in distress or opportunity',
    riskLevel: 'high',
    timeframe: '6-18 months',
    companies: ['Company D', 'Company G'],
    status: 'available'
  },
  {
    id: 'opportunistic',
    name: 'Opportunistic',
    percentage: 25,
    amount: 5000000,
    purpose: 'Market opportunities and pro-rata rights',
    deploymentTrigger: 'Market conditions and valuations',
    riskLevel: 'medium',
    timeframe: '12-24 months',
    companies: [],
    status: 'available'
  },
  {
    id: 'contingency',
    name: 'Contingency Reserve',
    percentage: 10,
    amount: 2000000,
    purpose: 'Emergency reserves and unforeseen circumstances',
    deploymentTrigger: 'Fund manager discretion',
    riskLevel: 'low',
    timeframe: 'Fund lifetime',
    companies: [],
    status: 'reserved'
  }
];

const optimizationSuggestions: OptimizationSuggestion[] = [
  {
    type: 'reallocation',
    title: 'Increase Primary Follow-On Pool',
    description: 'Top 3 companies showing strong performance. Consider increasing follow-on allocation by 5%.',
    impact: 0.032,
    confidence: 0.78,
    effort: 'medium',
    category: 'Portfolio Optimization'
  },
  {
    type: 'timing',
    title: 'Deploy Bridge Financing Earlier',
    description: 'Company D needs bridge financing. Early deployment could secure better terms.',
    impact: 0.018,
    confidence: 0.65,
    effort: 'low',
    category: 'Timing Optimization'
  },
  {
    type: 'risk_reduction',
    title: 'Diversify Opportunistic Pool',
    description: 'Current opportunistic reserves lack sector diversification. Consider constraints.',
    impact: -0.008,
    confidence: 0.82,
    effort: 'low',
    category: 'Risk Management'
  },
  {
    type: 'opportunity',
    title: 'Market Timing Opportunity',
    description: 'FinTech valuations down 25%. Consider accelerating deployment in this sector.',
    impact: 0.045,
    confidence: 0.54,
    effort: 'high',
    category: 'Market Opportunity'
  }
];

const POOL_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed'];

export function ReserveConfigurator({
  portfolioState,
  onUpdate,
  isCalculating
}: ReserveConfiguratorProps) {
  const [reservePools, setReservePools] = useState<ReservePool[]>(defaultReservePools);
  const [selectedPool, setSelectedPool] = useState<string>('follow-on-primary');
  const [optimizationMode, setOptimizationMode] = useState<'manual' | 'guided' | 'auto'>('guided');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const selectedPoolData = reservePools.find(pool => pool.id === selectedPool);
  const totalReserveAmount = portfolioState.totalFundSize * portfolioState.reserveRatio;
  const totalAllocated = reservePools.reduce((sum: any, pool: any) => sum + pool.percentage, 0);
  const isOverAllocated = totalAllocated > 100;

  // Generate deployment timeline data
  const deploymentTimeline = useMemo(() => {
    const months: number[] = Array.from({ length: 48 }, (_: unknown, i: number) => i + 1);

    return months.map(month => {
      const dataPoint: any = { month: `M${month}` };

      reservePools.forEach(pool => {
        // Simulate deployment curves based on pool characteristics
        let deploymentRate = 0;

        if (pool.id === 'follow-on-primary') {
          // Gradual deployment over 36 months
          deploymentRate = month <= 36 ? (month / 36) * 0.8 : 0.8;
        } else if (pool.id === 'bridge-rounds') {
          // More volatile deployment
          deploymentRate = Math.min(1, (month / 24) + Math.sin(month / 6) * 0.2);
        } else if (pool.id === 'opportunistic') {
          // Market-driven deployment
          deploymentRate = Math.min(1, (month / 30) * (1 + Math.sin(month / 8) * 0.3));
        } else {
          // Contingency - minimal deployment
          deploymentRate = Math.min(0.3, month / 60);
        }

        dataPoint[pool.name] = deploymentRate * pool.amount;
      });

      return dataPoint;
    });
  }, [reservePools]);

  // Calculate optimization score
  const optimizationScore = useMemo(() => {
    const baseScore = 75;
    const diversificationBonus = reservePools.length >= 4 ? 10 : 0;
    const allocationPenalty = isOverAllocated ? -15 : 0;
    const riskBalance = reservePools.filter(p => p.riskLevel === 'medium').length >= 2 ? 5 : 0;

    return Math.max(0, Math.min(100, baseScore + diversificationBonus + allocationPenalty + riskBalance));
  }, [reservePools, isOverAllocated]);

  const updatePoolPercentage = (poolId: string, percentage: number) => {
    setReservePools(prev => prev.map(pool =>
      pool.id === poolId
        ? {
            ...pool,
            percentage,
            amount: (totalReserveAmount * percentage) / 100
          }
        : pool
    ));
  };

  const updatePoolProperty = (poolId: string, property: string, value: any) => {
    setReservePools(prev => prev.map(pool =>
      pool.id === poolId
        ? { ...pool, [property]: value }
        : pool
    ));
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'high': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'allocated': return 'text-blue-600 bg-blue-100';
      case 'available': return 'text-green-600 bg-green-100';
      case 'deployed': return 'text-purple-600 bg-purple-100';
      case 'reserved': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const chartData = reservePools.map((pool: any, index: any) => ({
    name: pool.name,
    value: pool.percentage,
    amount: pool.amount,
    color: POOL_COLORS[index % POOL_COLORS.length]
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.name}</p>
          <p className="text-sm text-gray-600">
            Allocation: <span className="font-medium">{data.value.toFixed(1)}%</span>
          </p>
          <p className="text-sm text-gray-600">
            Amount: <span className="font-medium">${(data.amount / 1000000).toFixed(1)}M</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
        <div>
          <h3 className="text-lg font-semibold">Reserve Strategy Configuration</h3>
          <p className="text-sm text-gray-600">
            Optimize reserve allocation across {reservePools.length} pools (${(totalReserveAmount / 1000000).toFixed(1)}M total)
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="optimization-mode" className="text-sm">Mode:</Label>
            <Select value={optimizationMode} onValueChange={(value: any) => setOptimizationMode(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="guided">Guided</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="suggestions"
              checked={showSuggestions}
              onCheckedChange={setShowSuggestions}
            />
            <Label htmlFor="suggestions" className="text-sm">Suggestions</Label>
          </div>
        </div>
      </div>

      {/* Optimization Score */}
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium">Optimization Score</p>
                <p className="text-sm text-gray-600">Portfolio reserve allocation efficiency</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{optimizationScore}/100</p>
              <Badge
                variant={optimizationScore >= 80 ? "default" : optimizationScore >= 60 ? "secondary" : "destructive"}
                className="mt-1"
              >
                {optimizationScore >= 80 ? "Excellent" : optimizationScore >= 60 ? "Good" : "Needs Work"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reserve Pool Configuration */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Reserve Pools
              {isOverAllocated && (
                <Badge variant="destructive" className="ml-2 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Over-allocated
                </Badge>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Pool List */}
            <div className="space-y-3">
              {reservePools.map((pool: any, index: any) => (
                <div
                  key={pool.id}
                  className={cn(
                    "p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md",
                    selectedPool === pool.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                  )}
                  onClick={() => setSelectedPool(pool.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: POOL_COLORS[index % POOL_COLORS.length] }}
                      />
                      <div>
                        <p className="font-medium">{pool.name}</p>
                        <p className="text-sm text-gray-500">{pool.purpose}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getRiskColor(pool.riskLevel)}>
                        {pool.riskLevel.toUpperCase()}
                      </Badge>
                      <Badge className={getStatusColor(pool.status)}>
                        {pool.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Allocation</span>
                      <span className="font-medium">
                        {pool.percentage.toFixed(1)}% (${(pool.amount / 1000000).toFixed(1)}M)
                      </span>
                    </div>

                    <Slider
                      value={[pool.percentage]}
                      onValueChange={([value]) => updatePoolPercentage(pool.id, value ?? 0)}
                      max={60}
                      step={1}
                      className="w-full"
                      disabled={optimizationMode === 'auto'}
                    />

                    <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Trigger:</span> {pool.deploymentTrigger}
                      </div>
                      <div>
                        <span className="font-medium">Timeline:</span> {pool.timeframe}
                      </div>
                    </div>

                    {pool.companies.length > 0 && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Companies:</span> {pool.companies.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total Allocation */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span>Total Allocation</span>
                <span className={cn(
                  "font-medium",
                  isOverAllocated ? "text-red-600" : totalAllocated === 100 ? "text-green-600" : "text-gray-600"
                )}>
                  {totalAllocated.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all",
                    isOverAllocated ? "bg-red-500" : totalAllocated === 100 ? "bg-green-500" : "bg-blue-500"
                  )}
                  style={{ width: `${Math.min(100, totalAllocated)}%` }}
                />
              </div>
              {isOverAllocated && (
                <p className="text-xs text-red-600 mt-1 flex items-center">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Over-allocated by {(totalAllocated - 100).toFixed(1)}%
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Visualization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              Allocation Breakdown
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              {/* Pie Chart */}
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend */}
              <div className="space-y-2">
                {chartData.map((entry: any, index: any) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span>{entry.name}</span>
                    </div>
                    <span className="font-medium">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Optimization Suggestions */}
      {showSuggestions && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center">
              <Lightbulb className="w-5 h-5 mr-2" />
              Optimization Suggestions
            </CardTitle>
            <Badge variant="secondary">{optimizationSuggestions.length} suggestions</Badge>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {optimizationSuggestions.map((suggestion: any, index: any) => (
                <div
                  key={index}
                  className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className={cn(
                        "p-1 rounded-full",
                        suggestion.type === 'opportunity' ? "bg-green-100" :
                        suggestion.type === 'risk_reduction' ? "bg-red-100" :
                        suggestion.type === 'reallocation' ? "bg-blue-100" : "bg-yellow-100"
                      )}>
                        {suggestion.type === 'opportunity' ? <TrendingUp className="w-4 h-4 text-green-600" /> :
                         suggestion.type === 'risk_reduction' ? <Shield className="w-4 h-4 text-red-600" /> :
                         suggestion.type === 'reallocation' ? <Target className="w-4 h-4 text-blue-600" /> :
                         <Clock className="w-4 h-4 text-yellow-600" />}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {suggestion.category}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">
                        +{(suggestion.impact * 100).toFixed(1)}% IRR
                      </p>
                      <p className="text-xs text-gray-500">
                        {(suggestion.confidence * 100).toFixed(0)}% confidence
                      </p>
                    </div>
                  </div>

                  <h4 className="font-medium text-gray-900 mb-2">{suggestion.title}</h4>
                  <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>

                  <div className="flex items-center justify-between">
                    <Badge
                      variant={suggestion.effort === 'low' ? "default" : suggestion.effort === 'medium' ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {suggestion.effort.toUpperCase()} EFFORT
                    </Badge>
                    <Button size="sm" variant="outline" className="text-xs">
                      Apply
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Deployment Timeline Projection
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={deploymentTimeline.slice(0, 36)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  interval={5}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value: any) => `$${(value / 1000000).toFixed(0)}M`}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value: any, name) => [`$${(value / 1000000).toFixed(1)}M`, name]}
                  labelFormatter={(label: any) => `Month ${label.slice(1)}`}
                />
                {reservePools.map((pool: any, index: any) => (
                  <Area
                    key={pool.id}
                    type="monotone"
                    dataKey={pool.name}
                    stackId="1"
                    stroke={POOL_COLORS[index % POOL_COLORS.length]}
                    fill={POOL_COLORS[index % POOL_COLORS.length]}
                    fillOpacity={0.6}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}