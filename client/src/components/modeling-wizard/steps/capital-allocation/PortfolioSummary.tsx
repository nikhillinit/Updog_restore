/**
 * PortfolioSummary Component
 *
 * Displays portfolio summary with:
 * - Summary statistics cards
 * - Sector breakdown chart
 * - Stage breakdown chart
 * - Key portfolio metrics
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { TrendingUp, Target, Layers, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectorAllocation {
  sector: string;
  percentage: number;
  amount: number;
}

export interface StageAllocation {
  stage: string;
  percentage: number;
  amount: number;
}

export interface PortfolioMetrics {
  totalCapital: number;
  deployedCapital: number;
  reserveCapital: number;
  numCompanies: number;
  avgCheckSize: number;
  deploymentRate: number;
}

export interface PortfolioSummaryProps {
  sectors: SectorAllocation[];
  stages: StageAllocation[];
  metrics: PortfolioMetrics;
  className?: string;
}

// Color palettes for charts
const SECTOR_COLORS = [
  '#1E40AF', // Blue
  '#7C3AED', // Purple
  '#DC2626', // Red
  '#059669', // Green
  '#D97706', // Orange
  '#DB2777', // Pink
];

const STAGE_COLORS = [
  '#10B981', // Green (Seed)
  '#3B82F6', // Blue (Series A)
  '#8B5CF6', // Purple (Series B)
  '#F59E0B', // Amber (Series C+)
];

export function PortfolioSummary({
  sectors,
  stages,
  metrics,
  className,
}: PortfolioSummaryProps) {
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  };

  // Format percentage
  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  // Prepare chart data
  const sectorData = sectors.map(s => ({
    name: s.sector,
    value: s.percentage * 100,
    amount: s.amount,
  }));

  const stageData = stages.map(s => ({
    name: s.stage,
    value: s.percentage * 100,
    amount: s.amount,
  }));

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Total Capital
              </CardTitle>
              <DollarSign className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {formatCurrency(metrics.totalCapital)}M
            </div>
            <p className="text-xs text-charcoal/60 mt-1 font-poppins">
              Fund size
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Deployed
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {formatCurrency(metrics.deployedCapital)}M
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs',
                  metrics.deploymentRate >= 0.7
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : metrics.deploymentRate >= 0.4
                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                )}
              >
                {formatPercent(metrics.deploymentRate)}
              </Badge>
              <span className="text-xs text-charcoal/60 font-poppins">deployed</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Reserves
              </CardTitle>
              <Target className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {formatCurrency(metrics.reserveCapital)}M
            </div>
            <p className="text-xs text-charcoal/60 mt-1 font-poppins">
              Available for follow-ons
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Portfolio
              </CardTitle>
              <Layers className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-inter font-bold text-charcoal">
              {metrics.numCompanies}
            </div>
            <p className="text-xs text-charcoal/60 mt-1 font-poppins">
              Avg check: {formatCurrency(metrics.avgCheckSize)}M
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sector Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="font-inter font-bold text-charcoal">
              Sector Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sectorData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${(value as number).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sectorData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined, props: any) => [
                    `${(value ?? 0).toFixed(1)}% (${formatCurrency(props.payload.amount)}M)`,
                    name ?? '',
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            {/* Sector List */}
            <div className="mt-4 space-y-2">
              {sectors.map((sector, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: SECTOR_COLORS[idx % SECTOR_COLORS.length] }}
                    />
                    <span className="font-poppins text-charcoal">{sector.sector}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-charcoal">
                      {formatCurrency(sector.amount)}M
                    </span>
                    <span className="text-charcoal/60 w-12 text-right">
                      {formatPercent(sector.percentage)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="font-inter font-bold text-charcoal">
              Stage Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={stageData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${(value as number).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stageData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STAGE_COLORS[index % STAGE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined, props: any) => [
                    `${(value ?? 0).toFixed(1)}% (${formatCurrency(props.payload.amount)}M)`,
                    name ?? '',
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>

            {/* Stage List */}
            <div className="mt-4 space-y-2">
              {stages.map((stage, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[idx % STAGE_COLORS.length] }}
                    />
                    <span className="font-poppins text-charcoal">{stage.stage}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-charcoal">
                      {formatCurrency(stage.amount)}M
                    </span>
                    <span className="text-charcoal/60 w-12 text-right">
                      {formatPercent(stage.percentage)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
