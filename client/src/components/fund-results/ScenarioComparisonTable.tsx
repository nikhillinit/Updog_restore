/**
 * ScenarioComparisonTable - Side-by-side scenario comparison cards
 *
 * Displays base/optimistic/pessimistic scenarios as adjacent cards
 * with delta badges relative to the base case (first scenario).
 *
 * @module client/components/fund-results/ScenarioComparisonTable
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// TYPES
// ============================================================================

export interface ScenarioComparisonTableProps {
  scenarios: Array<{
    name: string;
    moic: number;
    irr: number | null;
    reserveUtilization: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

// ============================================================================
// HELPERS
// ============================================================================

const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  HIGH: 'bg-red-100 text-red-700 border-red-200',
};

/** Returns card border color based on scenario position */
function getCardBorder(index: number): string {
  if (index === 0) return 'border-charcoal-300'; // Base
  if (index === 1) return 'border-emerald-300'; // Optimistic
  return 'border-amber-300'; // Pessimistic
}

function getCardAccent(index: number): string {
  if (index === 0) return 'bg-charcoal-50';
  if (index === 1) return 'bg-emerald-50/50';
  return 'bg-amber-50/50';
}

/** Format delta value with sign and color */
function DeltaBadge({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <span
      className={cn(
        'ml-2 text-xs font-poppins font-medium',
        isPositive ? 'text-emerald-600' : 'text-red-600'
      )}
    >
      {isPositive ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

/** Side-by-side scenario comparison with delta badges relative to base case */
export function ScenarioComparisonTable({ scenarios }: ScenarioComparisonTableProps) {
  const base = scenarios[0];

  return (
    <section aria-label="Scenario comparison">
      <h2 className="font-inter font-bold text-lg text-charcoal mb-6">Scenario Comparison</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {scenarios.map((scenario, index) => {
          const isBase = index === 0;
          const moicDelta = scenario.moic - (base?.moic ?? 0);
          const irrDelta = scenario.irr != null && base?.irr != null ? scenario.irr - base.irr : 0;
          const utilizationDelta = scenario.reserveUtilization - (base?.reserveUtilization ?? 0);

          return (
            <article
              key={scenario.name}
              className={cn(
                'rounded-lg border-2 p-6 font-poppins transition-shadow hover:shadow-elevated',
                getCardBorder(index),
                getCardAccent(index)
              )}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-inter font-bold text-base text-charcoal">{scenario.name}</h3>
                {isBase && (
                  <Badge className="bg-charcoal text-white text-[10px] border-0">BASE</Badge>
                )}
              </div>

              {/* Metrics rows */}
              <div className="space-y-4">
                {/* MOIC */}
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-charcoal-500">MOIC</span>
                  <div>
                    <span className="font-inter font-bold text-xl text-charcoal tabular-nums">
                      {scenario.moic.toFixed(1)}x
                    </span>
                    {!isBase && <DeltaBadge value={moicDelta} suffix="x" />}
                  </div>
                </div>

                {/* IRR */}
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-charcoal-500">IRR</span>
                  <div>
                    <span className="font-inter font-bold text-xl text-charcoal tabular-nums">
                      {scenario.irr != null ? `${scenario.irr.toFixed(1)}%` : 'N/A'}
                    </span>
                    {!isBase && irrDelta !== 0 && <DeltaBadge value={irrDelta} suffix="%" />}
                  </div>
                </div>

                {/* Reserve Utilization */}
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-charcoal-500">
                    Reserve Util.
                  </span>
                  <div>
                    <span className="font-inter font-bold text-xl text-charcoal tabular-nums">
                      {scenario.reserveUtilization.toFixed(0)}%
                    </span>
                    {!isBase && <DeltaBadge value={utilizationDelta} suffix="%" />}
                  </div>
                </div>

                {/* Risk Level */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs uppercase tracking-wider text-charcoal-500">
                    Risk Level
                  </span>
                  <Badge
                    className={cn(
                      'text-xs font-inter font-bold border',
                      RISK_COLORS[scenario.riskLevel]
                    )}
                  >
                    {scenario.riskLevel}
                  </Badge>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
