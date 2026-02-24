/**
 * Engine Recommendations Panel
 *
 * Collapsible panel that surfaces DeterministicReserveEngine analysis
 * alongside user-configured capital allocation inputs. Shows metric
 * cards for reserve ratio, expected MOIC, and concentration risk,
 * plus risk-assessment badges when thresholds are breached.
 *
 * Gated behind FLAGS.ENABLE_ENGINE_INTEGRATION at the mount site.
 */

import React from 'react';
import {
  TrendingUp,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { EngineComparisonState } from '@/hooks/useEngineComparison';

// ============================================================================
// PROPS
// ============================================================================

export interface EngineRecommendationsPanelProps {
  engineState: EngineComparisonState;
  userReserveRatio: number;
}

// ============================================================================
// HELPERS
// ============================================================================

type DeltaBand = 'aligned' | 'divergent' | 'significant';

function getDeltaBand(userValue: number, engineValue: number): DeltaBand {
  const delta = Math.abs(userValue - engineValue);
  if (delta <= 0.05) return 'aligned';
  if (delta <= 0.15) return 'divergent';
  return 'significant';
}

function deltaColorClasses(band: DeltaBand): string {
  switch (band) {
    case 'aligned':
      return 'text-emerald-700 border-emerald-300 bg-emerald-50';
    case 'divergent':
      return 'text-amber-700 border-amber-300 bg-amber-50';
    case 'significant':
      return 'text-red-700 border-red-300 bg-red-50';
  }
}

function concentrationLabel(risk: 'low' | 'medium' | 'high'): string {
  return risk.toUpperCase();
}

function concentrationBadgeClass(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'medium':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'high':
      return 'bg-red-100 text-red-800 border-red-200';
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMOIC(value: number): string {
  return `${value.toFixed(2)}x`;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="border border-charcoal-200">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-poppins">{message}</span>
          <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EngineRecommendationsPanel({
  engineState,
  userReserveRatio,
}: EngineRecommendationsPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  const { result, isCalculating, error, recalculate } = engineState;

  // Derive engine-recommended reserve ratio from allocation efficiency
  const engineReserveRatio = result ? result.inputSummary.allocationEfficiency : null;

  const deltaBand =
    engineReserveRatio != null ? getDeltaBand(userReserveRatio, engineReserveRatio) : null;

  // Risk assessment flags
  const reserveExhaustionRisk = result != null && result.inputSummary.allocationEfficiency > 0.9;
  const highConcentration = result != null && result.portfolioMetrics.concentrationRisk === 'high';
  const unrealisticReturns = result != null && result.portfolioMetrics.expectedPortfolioMOIC > 5;

  const hasRiskWarnings = reserveExhaustionRisk || highConcentration || unrealisticReturns;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="bg-charcoal-50 rounded-lg border-t-4 border-t-beige">
        {/* Header */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between p-6 pb-4 text-left"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-charcoal-600" />
              <h3 className="font-inter font-bold text-lg text-pov-charcoal">Engine Analysis</h3>
              {isCalculating && (
                <span className="text-xs font-poppins text-charcoal-600 ml-2">Calculating...</span>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-charcoal-600" />
            ) : (
              <ChevronDown className="h-4 w-4 text-charcoal-600" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-6 pb-6 space-y-4">
            {/* Loading state */}
            {isCalculating && <LoadingSkeleton />}

            {/* Error state */}
            {!isCalculating && error != null && (
              <ErrorState message={error} onRetry={recalculate} />
            )}

            {/* Results */}
            {!isCalculating && error == null && result != null && (
              <>
                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Recommended Reserve Ratio */}
                  <Card
                    className={cn(
                      'border-2',
                      deltaBand != null ? deltaColorClasses(deltaBand) : 'border-charcoal-200'
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Shield className="h-4 w-4 text-charcoal-600" />
                        <span className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide">
                          Recommended Reserve Ratio
                        </span>
                      </div>
                      <div className="font-inter font-bold text-2xl text-pov-charcoal">
                        {engineReserveRatio != null ? formatPercent(engineReserveRatio) : '--'}
                      </div>
                      <div className="mt-1 text-xs font-poppins text-charcoal-600">
                        Your setting:{' '}
                        <span
                          className={cn(
                            'font-bold',
                            deltaBand === 'aligned' && 'text-emerald-700',
                            deltaBand === 'divergent' && 'text-amber-700',
                            deltaBand === 'significant' && 'text-red-700'
                          )}
                        >
                          {formatPercent(userReserveRatio)}
                        </span>
                        {deltaBand != null && engineReserveRatio != null && (
                          <span className="ml-1">
                            (delta {formatPercent(Math.abs(userReserveRatio - engineReserveRatio))})
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 2: Expected Portfolio MOIC */}
                  <Card className="border border-charcoal-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp className="h-4 w-4 text-charcoal-600" />
                        <span className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide">
                          Expected Portfolio MOIC
                        </span>
                      </div>
                      <div
                        className={cn(
                          'font-inter font-bold text-2xl',
                          result.portfolioMetrics.expectedPortfolioMOIC > 5
                            ? 'text-red-700'
                            : 'text-pov-charcoal'
                        )}
                      >
                        {formatMOIC(result.portfolioMetrics.expectedPortfolioMOIC)}
                      </div>
                      <div className="mt-1 text-xs font-poppins text-charcoal-600">
                        Based on current allocation model
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Concentration Risk */}
                  <Card className="border border-charcoal-200">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <BarChart3 className="h-4 w-4 text-charcoal-600" />
                        <span className="text-xs font-poppins text-charcoal-600 uppercase tracking-wide">
                          Concentration Risk
                        </span>
                      </div>
                      <div className="mt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-sm font-inter font-bold',
                            concentrationBadgeClass(result.portfolioMetrics.concentrationRisk)
                          )}
                        >
                          {concentrationLabel(result.portfolioMetrics.concentrationRisk)}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs font-poppins text-charcoal-600">
                        Diversification:{' '}
                        {formatPercent(result.portfolioMetrics.portfolioDiversification)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Risk Assessment Section */}
                {hasRiskWarnings && (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <span className="font-inter font-bold text-sm text-amber-800">
                        Risk Assessment
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reserveExhaustionRisk && (
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-800 border-red-200 text-xs"
                        >
                          Reserve exhaustion risk (&gt;90% utilized)
                        </Badge>
                      )}
                      {highConcentration && (
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-800 border-amber-200 text-xs"
                        >
                          High portfolio concentration
                        </Badge>
                      )}
                      {unrealisticReturns && (
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-800 border-red-200 text-xs"
                        >
                          Projected MOIC exceeds 5x -- verify assumptions
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty state: flag on, no result yet, not loading, no error */}
            {!isCalculating && error == null && result == null && (
              <p className="text-sm font-poppins text-charcoal-600">
                Configure follow-on strategy to see engine analysis.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
