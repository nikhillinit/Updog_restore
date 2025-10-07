/**
 * ReserveMetricsDisplay Component
 *
 * Displays 4 key reserve metrics with badges and recommendations:
 * 1. Utilization - How much reserve capital is allocated
 * 2. Efficiency - Reserve capital per company
 * 3. Risk - Portfolio concentration risk (badge: low/medium/high)
 * 4. Deployment - Expected deployment timeline
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  TrendingUp,
  Target,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReserveMetrics {
  utilization: {
    allocated: number; // Amount allocated
    total: number; // Total reserve pool
    percentage: number; // 0-1
  };
  efficiency: {
    reservePerCompany: number;
    avgFollowOnSize: number;
    coverage: number; // How many follow-ons can be made
  };
  risk: {
    level: 'low' | 'medium' | 'high';
    concentrationScore: number; // 0-100
    topCompanyShare: number; // Percentage of largest allocation
  };
  deployment: {
    yearsToFullDeployment: number;
    monthlyBurnRate: number;
    nextMilestone: string;
  };
}

export interface Recommendation {
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface ReserveMetricsDisplayProps {
  metrics: ReserveMetrics;
  recommendations?: Recommendation[];
  className?: string;
}

export function ReserveMetricsDisplay({
  metrics,
  recommendations = [],
  className,
}: ReserveMetricsDisplayProps) {
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

  // Get risk badge variant
  const getRiskBadge = (level: 'low' | 'medium' | 'high') => {
    const badges = {
      low: {
        variant: 'secondary' as const,
        className: 'bg-green-100 text-green-700 border-green-200',
        label: 'Low Risk',
      },
      medium: {
        variant: 'secondary' as const,
        className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        label: 'Medium Risk',
      },
      high: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-700 border-red-200',
        label: 'High Risk',
      },
    };
    return badges[level];
  };

  // Get utilization status
  const getUtilizationStatus = (percentage: number) => {
    if (percentage >= 0.9) return { color: 'bg-red-500', label: 'High' };
    if (percentage >= 0.7) return { color: 'bg-yellow-500', label: 'Good' };
    if (percentage >= 0.5) return { color: 'bg-green-500', label: 'Healthy' };
    return { color: 'bg-blue-500', label: 'Low' };
  };

  const utilizationStatus = getUtilizationStatus(metrics.utilization.percentage);
  const riskBadge = getRiskBadge(metrics.risk.level);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Utilization Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Reserve Utilization
              </CardTitle>
              <Target className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-inter font-bold text-charcoal">
                  {formatPercent(metrics.utilization.percentage)}
                </span>
                <Badge variant="secondary" className={utilizationStatus.color}>
                  {utilizationStatus.label}
                </Badge>
              </div>
              <Progress
                value={metrics.utilization.percentage * 100}
                className="h-2"
              />
            </div>
            <div className="flex items-center justify-between text-xs font-poppins">
              <span className="text-charcoal/60">
                {formatCurrency(metrics.utilization.allocated)}M allocated
              </span>
              <span className="text-charcoal/60">
                of {formatCurrency(metrics.utilization.total)}M
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 2. Efficiency Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Capital Efficiency
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-inter font-bold text-charcoal">
              {formatCurrency(metrics.efficiency.reservePerCompany)}M
            </div>
            <div className="space-y-1 text-xs font-poppins">
              <div className="flex items-center justify-between">
                <span className="text-charcoal/60">Avg follow-on:</span>
                <span className="font-medium text-charcoal">
                  {formatCurrency(metrics.efficiency.avgFollowOnSize)}M
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-charcoal/60">Coverage:</span>
                <span className="font-medium text-charcoal">
                  {metrics.efficiency.coverage.toFixed(1)}x rounds
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Risk Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Portfolio Risk
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-inter font-bold text-charcoal">
                {metrics.risk.concentrationScore}
              </span>
              <Badge variant={riskBadge.variant} className={riskBadge.className}>
                {riskBadge.label}
              </Badge>
            </div>
            <div className="space-y-1 text-xs font-poppins">
              <div className="flex items-center justify-between">
                <span className="text-charcoal/60">Top allocation:</span>
                <span className="font-medium text-charcoal">
                  {formatPercent(metrics.risk.topCompanyShare)}
                </span>
              </div>
              <div className="text-charcoal/60">
                {metrics.risk.level === 'low' && 'Well diversified'}
                {metrics.risk.level === 'medium' && 'Moderate concentration'}
                {metrics.risk.level === 'high' && 'High concentration'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Deployment Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-poppins text-charcoal/70">
                Deployment Timeline
              </CardTitle>
              <Clock className="h-4 w-4 text-charcoal/50" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-inter font-bold text-charcoal">
              {metrics.deployment.yearsToFullDeployment.toFixed(1)}y
            </div>
            <div className="space-y-1 text-xs font-poppins">
              <div className="flex items-center justify-between">
                <span className="text-charcoal/60">Monthly rate:</span>
                <span className="font-medium text-charcoal">
                  {formatCurrency(metrics.deployment.monthlyBurnRate)}M
                </span>
              </div>
              <div className="text-charcoal/60">
                {metrics.deployment.nextMilestone}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations Panel */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-inter font-bold text-charcoal flex items-center gap-2">
              <Info className="h-5 w-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.map((rec, idx) => (
              <Alert
                key={idx}
                className={cn(
                  rec.type === 'success' &&
                    'border-green-500 bg-green-50 dark:bg-green-900/20',
                  rec.type === 'warning' &&
                    'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
                  rec.type === 'info' &&
                    'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                )}
              >
                {rec.type === 'success' && (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                {rec.type === 'warning' && (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
                {rec.type === 'info' && <Info className="h-4 w-4 text-blue-600" />}

                <AlertTitle
                  className={cn(
                    'font-inter font-bold',
                    rec.type === 'success' &&
                      'text-green-800 dark:text-green-200',
                    rec.type === 'warning' &&
                      'text-yellow-800 dark:text-yellow-200',
                    rec.type === 'info' && 'text-blue-800 dark:text-blue-200'
                  )}
                >
                  {rec.title}
                </AlertTitle>
                <AlertDescription
                  className={cn(
                    'font-poppins',
                    rec.type === 'success' &&
                      'text-green-700 dark:text-green-300',
                    rec.type === 'warning' &&
                      'text-yellow-700 dark:text-yellow-300',
                    rec.type === 'info' && 'text-blue-700 dark:text-blue-300'
                  )}
                >
                  {rec.message}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
