/**
 * Coverage Indicator Component
 *
 * Displays data coverage metrics for cohort analysis.
 * Shows mapping coverage percentage with V2 threshold indicator.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import type { CoverageSummaryType } from '@shared/types';

interface CoverageIndicatorProps {
  /** Coverage data */
  coverage: CoverageSummaryType;
  /** Whether this is for the entire analysis or a specific cohort */
  scope?: 'analysis' | 'cohort';
  /** Compact mode for inline display */
  compact?: boolean;
}

const V2_THRESHOLD = 0.9; // 90% coverage required for V2 mode

/**
 * Gets the status color based on coverage percentage
 */
function getCoverageStatus(percentage: number): {
  color: string;
  icon: typeof CheckCircle;
  label: string;
} {
  if (percentage >= V2_THRESHOLD) {
    return { color: 'text-green-600', icon: CheckCircle, label: 'V2 Ready' };
  }
  if (percentage >= 0.7) {
    return { color: 'text-yellow-600', icon: AlertTriangle, label: 'Partial' };
  }
  if (percentage >= 0.5) {
    return { color: 'text-orange-600', icon: AlertTriangle, label: 'Limited' };
  }
  return { color: 'text-red-600', icon: XCircle, label: 'Low' };
}

export function CoverageIndicator({
  coverage,
  scope = 'analysis',
  compact = false,
}: CoverageIndicatorProps) {
  const overallCoverage = coverage.overallPct;
  const status = getCoverageStatus(overallCoverage);
  const StatusIcon = status.icon;

  // Calculate lowest coverage category for display
  const lowestCategory = useMemo(() => {
    const categories = [
      { name: 'Paid-In', pct: coverage.paidInPct },
      { name: 'Distributions', pct: coverage.distributionsPct },
      { name: 'Vintage', pct: coverage.vintagePct },
    ];
    if (coverage.marksPct !== undefined) {
      categories.push({ name: 'Marks', pct: coverage.marksPct });
    }
    return categories.sort((a, b) => a.pct - b.pct)[0];
  }, [coverage]);

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-4 w-4 ${status.color}`} />
              <span className="text-sm font-medium">
                {(overallCoverage * 100).toFixed(0)}%
              </span>
              <Badge
                variant={overallCoverage >= V2_THRESHOLD ? 'default' : 'secondary'}
                className="text-xs"
              >
                {status.label}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              <div>Paid-In: {(coverage.paidInPct * 100).toFixed(1)}%</div>
              <div>Distributions: {(coverage.distributionsPct * 100).toFixed(1)}%</div>
              <div>Vintage: {(coverage.vintagePct * 100).toFixed(1)}%</div>
              {coverage.marksPct !== undefined && (
                <div>Marks: {(coverage.marksPct * 100).toFixed(1)}%</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4 text-gray-400" />
            Data Coverage
          </span>
          <Badge
            variant={overallCoverage >= V2_THRESHOLD ? 'default' : 'secondary'}
          >
            {status.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Overall Coverage</span>
            <span className={`font-medium ${status.color}`}>
              {(overallCoverage * 100).toFixed(1)}%
            </span>
          </div>
          <Progress
            value={overallCoverage * 100}
            className="h-2"
          />
          {overallCoverage < V2_THRESHOLD && (
            <p className="text-xs text-gray-500">
              {((V2_THRESHOLD - overallCoverage) * 100).toFixed(1)}% more needed for
              V2 mode ({(V2_THRESHOLD * 100).toFixed(0)}% threshold)
            </p>
          )}
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-4">
          {/* Paid-In Coverage */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Paid-In Data</span>
              <span className="font-medium">{(coverage.paidInPct * 100).toFixed(0)}%</span>
            </div>
            <Progress value={coverage.paidInPct * 100} className="h-1" />
          </div>

          {/* Distributions Coverage */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Distributions</span>
              <span className="font-medium">{(coverage.distributionsPct * 100).toFixed(0)}%</span>
            </div>
            <Progress value={coverage.distributionsPct * 100} className="h-1" />
          </div>

          {/* Vintage Coverage */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Vintage Data</span>
              <span className="font-medium">{(coverage.vintagePct * 100).toFixed(0)}%</span>
            </div>
            <Progress value={coverage.vintagePct * 100} className="h-1" />
          </div>

          {/* Marks Coverage (if available) */}
          {coverage.marksPct !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Marks Data</span>
                <span className="font-medium">{(coverage.marksPct * 100).toFixed(0)}%</span>
              </div>
              <Progress value={coverage.marksPct * 100} className="h-1" />
            </div>
          )}
        </div>

        {/* Warning for lowest category */}
        {lowestCategory && lowestCategory.pct < 0.9 && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              {lowestCategory.name} coverage is only {(lowestCategory.pct * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Simple inline coverage badge
 */
export function CoverageBadge({
  coverage,
}: {
  coverage: CoverageSummaryType;
}) {
  const overall = coverage.overallPct;
  const status = getCoverageStatus(overall);

  return (
    <Badge
      variant={overall >= V2_THRESHOLD ? 'default' : 'outline'}
      className="text-xs"
    >
      {(overall * 100).toFixed(0)}% coverage
    </Badge>
  );
}

export default CoverageIndicator;
