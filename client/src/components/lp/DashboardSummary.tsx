/**
 * DashboardSummary Component
 *
 * Displays 4 summary metric cards for LP dashboard:
 * - Total Committed
 * - Total Called
 * - Total Distributed
 * - Current NAV
 *
 * @module client/components/lp/DashboardSummary
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, Wallet, ArrowDownToLine, PiggyBank } from 'lucide-react';
import type { LPSummaryMetrics } from '@shared/types/lp-api';

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface DashboardSummaryProps {
  metrics: LPSummaryMetrics;
  isLoading?: boolean;
}

export default function DashboardSummary({ metrics, isLoading }: DashboardSummaryProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
            <CardHeader className="pb-3">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const calledPercent = metrics.totalCommitted > 0
    ? metrics.totalCalled / metrics.totalCommitted
    : 0;

  const distributedPercent = metrics.totalCalled > 0
    ? metrics.totalDistributed / metrics.totalCalled
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Committed */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-[#292929]/70 font-poppins">
            <span>Total Committed</span>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-inter text-[#292929]">
            {formatCurrency(metrics.totalCommitted)}
          </div>
          <div className="text-xs text-[#292929]/50 font-poppins mt-1">
            Across {metrics.totalCommitted > 0 ? 'all funds' : 'no funds'}
          </div>
        </CardContent>
      </Card>

      {/* Total Called */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-[#292929]/70 font-poppins">
            <span>Total Called</span>
            <Wallet className="h-4 w-4 text-amber-600" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-inter text-[#292929]">
            {formatCurrency(metrics.totalCalled)}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#292929]/50 font-poppins mt-1">
            <span>{formatPercent(calledPercent)} of commitment</span>
            {calledPercent >= 0.8 && <TrendingUp className="h-3 w-3 text-amber-600" />}
          </div>
        </CardContent>
      </Card>

      {/* Total Distributed */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-[#292929]/70 font-poppins">
            <span>Total Distributed</span>
            <ArrowDownToLine className="h-4 w-4 text-green-600" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-inter text-[#292929]">
            {formatCurrency(metrics.totalDistributed)}
          </div>
          <div className="flex items-center gap-2 text-xs font-poppins mt-1">
            <span className="text-[#292929]/50">
              DPI: {metrics.dpi.toFixed(2)}x
            </span>
            {metrics.dpi >= 1 && <TrendingUp className="h-3 w-3 text-green-600" />}
          </div>
        </CardContent>
      </Card>

      {/* Current NAV */}
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium text-[#292929]/70 font-poppins">
            <span>Current NAV</span>
            <PiggyBank className="h-4 w-4 text-purple-600" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-inter text-[#292929]">
            {formatCurrency(metrics.currentNAV)}
          </div>
          <div className="flex items-center gap-2 text-xs font-poppins mt-1">
            <span className={metrics.unrealizedGain >= 0 ? 'text-green-600' : 'text-red-600'}>
              {metrics.unrealizedGain >= 0 ? '+' : ''}
              {formatCurrency(metrics.unrealizedGain)} unrealized
            </span>
            {metrics.unrealizedGain >= 0 ? (
              <TrendingUp className="h-3 w-3 text-green-600" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
