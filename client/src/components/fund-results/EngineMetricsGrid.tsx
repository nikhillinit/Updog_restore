/**
 * EngineMetricsGrid - Expandable engine analysis sections
 *
 * Three collapsible panels for Pacing, Cohort, and Waterfall engine
 * outputs. Uses Radix Collapsible with CSS transition for open/close.
 *
 * @module client/components/fund-results/EngineMetricsGrid
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, TrendingUp, Users, Wallet } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface EngineMetricsGridProps {
  pacing: { deploymentRate: number; yearsToFullDeploy: number } | null;
  cohort: { averageCohortSize: number; topQuartileReturn: number } | null;
  waterfall: {
    gpCarry: number;
    lpReturn: number;
    totalDistributed: number;
  } | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDollars(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// ============================================================================
// METRIC DISPLAY
// ============================================================================

interface MetricCellProps {
  label: string;
  value: string;
}

function MetricCell({ label, value }: MetricCellProps) {
  return (
    <div className="space-y-1">
      <p className="font-poppins text-xs uppercase tracking-wider text-charcoal-500">{label}</p>
      <p className="font-inter font-bold text-xl text-charcoal tabular-nums">{value}</p>
    </div>
  );
}

// ============================================================================
// COLLAPSIBLE SECTION
// ============================================================================

interface EngineSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isEmpty: boolean;
}

function EngineSection({ title, icon, children, isEmpty }: EngineSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <div
        className={cn(
          'rounded-lg border border-beige-200 bg-white transition-shadow',
          isOpen && 'shadow-card'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between p-5 text-left hover:bg-beige-50/50 transition-colors rounded-lg focus-visible-ring"
            aria-expanded={isOpen}
          >
            <div className="flex items-center gap-3">
              <div className="text-charcoal-500">{icon}</div>
              <span className="font-inter font-bold text-base text-charcoal">{title}</span>
            </div>
            <ChevronDown
              className={cn(
                'h-5 w-5 text-charcoal-400 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 pt-1 border-t border-beige-100">
            {isEmpty ? (
              <p className="font-poppins text-sm text-charcoal-400 italic py-2">
                No data available for this engine.
              </p>
            ) : (
              children
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

/** Three expandable engine panels: Pacing, Cohort, and Waterfall */
export function EngineMetricsGrid({ pacing, cohort, waterfall }: EngineMetricsGridProps) {
  return (
    <section aria-label="Engine metrics">
      <h2 className="font-inter font-bold text-lg text-charcoal mb-6">Engine Analysis</h2>

      <div className="space-y-4">
        {/* Pacing Analysis */}
        <EngineSection
          title="Pacing Analysis"
          icon={<TrendingUp className="h-5 w-5" />}
          isEmpty={pacing == null}
        >
          {pacing != null && (
            <div className="grid grid-cols-2 gap-6 pt-2">
              <MetricCell label="Deployment Rate" value={`${pacing.deploymentRate.toFixed(1)}%`} />
              <MetricCell
                label="Years to Full Deploy"
                value={`${pacing.yearsToFullDeploy.toFixed(1)} yrs`}
              />
            </div>
          )}
        </EngineSection>

        {/* Cohort Analysis */}
        <EngineSection
          title="Cohort Analysis"
          icon={<Users className="h-5 w-5" />}
          isEmpty={cohort == null}
        >
          {cohort != null && (
            <div className="grid grid-cols-2 gap-6 pt-2">
              <MetricCell label="Avg Cohort Size" value={`${cohort.averageCohortSize}`} />
              <MetricCell
                label="Top Quartile Return"
                value={`${cohort.topQuartileReturn.toFixed(1)}x`}
              />
            </div>
          )}
        </EngineSection>

        {/* Waterfall Distribution */}
        <EngineSection
          title="Waterfall Distribution"
          icon={<Wallet className="h-5 w-5" />}
          isEmpty={waterfall == null}
        >
          {waterfall != null && (
            <div className="grid grid-cols-3 gap-6 pt-2">
              <MetricCell label="GP Carry" value={formatDollars(waterfall.gpCarry)} />
              <MetricCell label="LP Return" value={formatDollars(waterfall.lpReturn)} />
              <MetricCell
                label="Total Distributed"
                value={formatDollars(waterfall.totalDistributed)}
              />
            </div>
          )}
        </EngineSection>
      </div>
    </section>
  );
}
