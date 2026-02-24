/**
 * FundModelScorecard - Premium hero card with animated fund metrics
 *
 * Full-width dark card displaying fund identity and 4 key metrics
 * with staggered count-up animations (ease-out cubic, 1.2s each).
 *
 * @module client/components/fund-results/FundModelScorecard
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// TYPES
// ============================================================================

export interface FundModelScorecardProps {
  fundName: string;
  vintageYear: number;
  fundSize: number;
  expectedMOIC: number;
  reserveRatio: number;
  concentrationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  netIRR: number | null;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Animates a numeric value from 0 to target with ease-out cubic easing.
 * Supports staggered starts via the delay parameter.
 */
function useCountUp(target: number, duration = 1200, delay = 0) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const start = performance.now();
      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic: 1 - (1 - t)^3
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(target * eased);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, delay);

    return () => clearTimeout(timer);
  }, [target, duration, delay]);

  return value;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  }
  return `$${value.toLocaleString()}`;
}

const RISK_STYLES: Record<string, string> = {
  LOW: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  HIGH: 'bg-red-500/20 text-red-300 border-red-500/30',
};

// ============================================================================
// COMPONENT
// ============================================================================

/** Premium dark hero card with fund identity and animated KPI metrics */
export function FundModelScorecard({
  fundName,
  vintageYear,
  fundSize,
  expectedMOIC,
  reserveRatio,
  concentrationRisk,
  netIRR,
}: FundModelScorecardProps) {
  // Staggered count-up: each metric delayed 200ms after the previous
  const animatedMOIC = useCountUp(expectedMOIC, 1200, 0);
  const animatedReserve = useCountUp(reserveRatio, 1200, 200);
  const animatedIRR = useCountUp(netIRR ?? 0, 1200, 400);

  return (
    <section
      className="w-full rounded-lg bg-pov-charcoal p-8 shadow-elevated"
      aria-label="Fund model scorecard"
    >
      {/* Header row: fund identity */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-8">
        <h1 className="font-inter font-bold text-2xl text-white tracking-tight">{fundName}</h1>
        <span className="font-poppins text-sm text-white/60">Vintage {vintageYear}</span>
        <span className="font-poppins text-sm text-white/60">{formatCurrency(fundSize)}</span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Expected MOIC */}
        <div className="space-y-1">
          <p className="font-poppins text-xs uppercase tracking-wider text-white/50">
            Expected MOIC
          </p>
          <p className="font-inter font-bold text-3xl text-white tabular-nums">
            {animatedMOIC.toFixed(1)}x
          </p>
        </div>

        {/* Reserve Ratio */}
        <div className="space-y-1">
          <p className="font-poppins text-xs uppercase tracking-wider text-white/50">
            Reserve Ratio
          </p>
          <p className="font-inter font-bold text-3xl text-white tabular-nums">
            {animatedReserve.toFixed(0)}%
          </p>
        </div>

        {/* Concentration Risk */}
        <div className="space-y-1">
          <p className="font-poppins text-xs uppercase tracking-wider text-white/50">
            Concentration Risk
          </p>
          <div className="pt-1">
            <Badge
              className={cn(
                'text-sm font-inter font-bold px-3 py-1 border',
                RISK_STYLES[concentrationRisk]
              )}
            >
              {concentrationRisk}
            </Badge>
          </div>
        </div>

        {/* Net IRR */}
        <div className="space-y-1">
          <p className="font-poppins text-xs uppercase tracking-wider text-white/50">Net IRR</p>
          <p className="font-inter font-bold text-3xl text-white tabular-nums">
            {netIRR != null ? `${animatedIRR.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>
    </section>
  );
}
