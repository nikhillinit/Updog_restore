/**
 * Fund Strategy Builder
 *
 * Uses BrandChartThemeProvider for consistent chart styling.
 * Migration: Replaced hardcoded COLORS with getChartColor() from chart-theme.
 */
import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  TrendingUp,
  Target,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortfolioState } from '@/pages/portfolio-constructor';
import { getChartColor } from '@/lib/chart-theme';

interface AllocationBucket {
  id: string;
  name: string;
  targetPercentage: number;
  allocatedAmount: number;
  color: string;
  category: 'sector' | 'stage' | 'geography' | 'risk';
  constraints?: {
    min?: number;
    max?: number;
    preferred?: number;
  };
}

interface FundStrategyBuilderProps {
  portfolioState: PortfolioState;
  onUpdate: (updates: Partial<PortfolioState>) => void;
  isCalculating: boolean;
}

const defaultBuckets: AllocationBucket[] = [
  {
    id: 'enterprise-software',
    name: 'Enterprise Software',
    targetPercentage: 35,
    allocatedAmount: 17500000,
    color: '#2563eb',
    category: 'sector',
    constraints: { min: 25, max: 45, preferred: 35 },
  },
  {
    id: 'fintech',
    name: 'FinTech',
    targetPercentage: 25,
    allocatedAmount: 12500000,
    color: '#dc2626',
    category: 'sector',
    constraints: { min: 15, max: 35, preferred: 25 },
  },
  {
    id: 'healthcare-tech',
    name: 'Healthcare Tech',
    targetPercentage: 20,
    allocatedAmount: 10000000,
    color: '#059669',
    category: 'sector',
    constraints: { min: 10, max: 30, preferred: 20 },
  },
  {
    id: 'early-stage',
    name: 'Early Stage (Seed/A)',
    targetPercentage: 45,
    allocatedAmount: 22500000,
    color: '#7c3aed',
    category: 'stage',
    constraints: { min: 35, max: 55, preferred: 45 },
  },
  {
    id: 'growth-stage',
    name: 'Growth Stage (B+)',
    targetPercentage: 35,
    allocatedAmount: 17500000,
    color: '#ea580c',
    category: 'stage',
    constraints: { min: 25, max: 45, preferred: 35 },
  },
];

// Removed hardcoded COLORS - now using getChartColor() from chart-theme

export function FundStrategyBuilder({
  portfolioState,
  onUpdate,
  isCalculating,
}: FundStrategyBuilderProps) {
  const [buckets, setBuckets] = useState<AllocationBucket[]>(defaultBuckets);
  const [selectedCategory, setSelectedCategory] = useState<
    'sector' | 'stage' | 'geography' | 'risk'
  >('sector');

  const filteredBuckets = buckets.filter((bucket) => bucket.category === selectedCategory);
  const totalAllocated = filteredBuckets.reduce((sum, bucket) => sum + bucket.targetPercentage, 0);
  const isOverAllocated = totalAllocated > 100;

  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const items = Array.from(filteredBuckets);
      [items[index - 1], items[index]] = [items[index]!, items[index - 1]!];
      const reorderedIds = new Set(items.map((i) => i.id));
      const newBuckets = buckets.map((bucket) => {
        if (!reorderedIds.has(bucket.id)) return bucket;
        return items.find((i) => i.id === bucket.id) ?? bucket;
      });
      setBuckets(newBuckets);
    },
    [buckets, filteredBuckets]
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index >= filteredBuckets.length - 1) return;
      const items = Array.from(filteredBuckets);
      [items[index], items[index + 1]] = [items[index + 1]!, items[index]!];
      const reorderedIds = new Set(items.map((i) => i.id));
      const newBuckets = buckets.map((bucket) => {
        if (!reorderedIds.has(bucket.id)) return bucket;
        return items.find((i) => i.id === bucket.id) ?? bucket;
      });
      setBuckets(newBuckets);
    },
    [buckets, filteredBuckets]
  );

  const updateBucketPercentage = (bucketId: string, percentage: number) => {
    setBuckets((prev) =>
      prev.map((bucket) =>
        bucket.id === bucketId
          ? {
              ...bucket,
              targetPercentage: percentage,
              allocatedAmount: (portfolioState.totalFundSize * percentage) / 100,
            }
          : bucket
      )
    );

    // Update portfolio state
    const newAllocated = buckets.reduce(
      (sum, bucket) =>
        sum +
        (bucket.id === bucketId
          ? (portfolioState.totalFundSize * percentage) / 100
          : bucket.allocatedAmount),
      0
    );
    onUpdate({ allocatedCapital: newAllocated });
  };

  const addNewBucket = () => {
    const newBucket: AllocationBucket = {
      id: `bucket-${Date.now()}`,
      name: `New ${selectedCategory}`,
      targetPercentage: 0,
      allocatedAmount: 0,
      color: getChartColor(buckets.length),
      category: selectedCategory ?? 'Strategy',
    };
    setBuckets((prev) => [...prev, newBucket]);
  };

  const removeBucket = (bucketId: string) => {
    setBuckets((prev) => prev.filter((bucket) => bucket.id !== bucketId));
  };

  const chartData = filteredBuckets.map((bucket) => ({
    name: bucket.name,
    value: bucket.targetPercentage,
    color: bucket.color,
    amount: bucket.allocatedAmount,
  }));

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: { name: string; value: number; amount: number } }>;
  }) => {
    if (active && payload && payload.length && payload[0]) {
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
      {/* Category Selection */}
      <div className="flex flex-wrap gap-2">
        {(['sector', 'stage', 'geography', 'risk'] as const).map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            onClick={() => setSelectedCategory(category)}
            className="capitalize"
          >
            {category}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Controls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center">
              <Target className="w-5 h-5 mr-2" />
              {selectedCategory} Allocation
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Badge
                variant={
                  isOverAllocated ? 'destructive' : totalAllocated === 100 ? 'default' : 'secondary'
                }
                className="flex items-center"
              >
                {isOverAllocated && <AlertCircle className="w-3 h-3 mr-1" />}
                {totalAllocated.toFixed(1)}%
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={addNewBucket}
                className="flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-3 min-h-[200px] p-2 rounded-lg">
              {filteredBuckets.map((bucket, index) => (
                <div
                  key={bucket.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 transition-all"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 rounded hover:bg-gray-100"
                        aria-label={`Move ${bucket.name} up`}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(index)}
                        disabled={index === filteredBuckets.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 rounded hover:bg-gray-100"
                        aria-label={`Move ${bucket.name} down`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: bucket.color }}
                    />

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <Input
                          value={bucket.name}
                          onChange={(e) =>
                            setBuckets((prev) =>
                              prev.map((b) =>
                                b.id === bucket.id ? { ...b, name: e.target.value } : b
                              )
                            )
                          }
                          className="font-medium border-none p-0 h-auto focus-visible:ring-0"
                        />

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeBucket(bucket.id)}
                          className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Target Allocation</span>
                          <span className="font-medium">
                            {bucket.targetPercentage.toFixed(1)}% ($
                            {(bucket.allocatedAmount / 1000000).toFixed(1)}M)
                          </span>
                        </div>

                        <Slider
                          value={[bucket.targetPercentage]}
                          onValueChange={([value]) => updateBucketPercentage(bucket.id, value ?? 0)}
                          max={100}
                          step={0.5}
                          className="w-full"
                        />

                        {bucket.constraints && (
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <span>Constraints:</span>
                            <Badge variant="outline" className="text-xs">
                              Min: {bucket.constraints.min}%
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Max: {bucket.constraints.max}%
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Total Allocation</span>
                <span
                  className={cn(
                    'font-medium',
                    isOverAllocated
                      ? 'text-red-600'
                      : totalAllocated === 100
                        ? 'text-green-600'
                        : 'text-gray-600'
                  )}
                >
                  {totalAllocated.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={Math.min(totalAllocated, 100)}
                className={cn('w-full', isOverAllocated && 'bg-red-100')}
              />
              {isOverAllocated && (
                <p className="text-xs text-red-600 flex items-center">
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
              <TrendingUp className="w-5 h-5 mr-2" />
              Allocation Visualization
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              {/* Pie Chart */}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart */}
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} fontSize={12} />
                    <YAxis
                      label={{ value: 'Allocation %', angle: -90, position: 'insideLeft' }}
                      fontSize={12}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Allocated</p>
              <p className="text-2xl font-bold">
                $
                {(filteredBuckets.reduce((sum, b) => sum + b.allocatedAmount, 0) / 1000000).toFixed(
                  1
                )}
                M
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Target className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Buckets Defined</p>
              <p className="text-2xl font-bold">{filteredBuckets.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Allocation Status</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalAllocated === 100 ? 'Complete' : isOverAllocated ? 'Over' : 'Partial'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
