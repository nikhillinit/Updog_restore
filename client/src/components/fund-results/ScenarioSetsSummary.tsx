/**
 * ScenarioSetsSummary - Read-only fund scenario result cards.
 *
 * PR E intentionally renders summaries only. Scenario set cards are not
 * clickable until scenario drill-down is explicitly scoped.
 *
 * @module client/components/fund-results/ScenarioSetsSummary
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  FundScenarioResultStalenessStateV1,
  ScenariosSectionPayloadV1,
  ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export interface ScenarioSetsSummaryProps {
  payload: ScenariosSectionPayloadV1;
}

const STALENESS_LABELS: Record<FundScenarioResultStalenessStateV1, string> = {
  CURRENT: 'Current',
  STALE_PUBLISH: 'Needs recalculation',
  STALE_CONFIG: 'Review overrides',
};

const STALENESS_BADGES: Record<FundScenarioResultStalenessStateV1, string> = {
  CURRENT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  STALE_PUBLISH: 'border-amber-200 bg-amber-50 text-amber-700',
  STALE_CONFIG: 'border-red-200 bg-red-50 text-red-700',
};

function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value));
}

function variantCountLabel(count: number): string {
  return count === 1 ? '1 variant' : `${count} variants`;
}

function topTvpiVariant(set: ScenarioSetResultSummaryV1) {
  return set.variants.reduce((top, variant) =>
    variant.economicsSummary.finalTvpi > top.economicsSummary.finalTvpi ? variant : top
  );
}

export function ScenarioSetsSummary({ payload }: ScenarioSetsSummaryProps) {
  return (
    <div className="space-y-4" data-testid="scenario-sets-summary">
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className={cn('border text-xs font-medium', STALENESS_BADGES[payload.aggregateStaleness])}
        >
          {STALENESS_LABELS[payload.aggregateStaleness]}
        </Badge>
        <span className="font-poppins text-sm text-charcoal-500">
          {payload.sets.length === 1 ? '1 scenario set' : `${payload.sets.length} scenario sets`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {payload.sets.map((set) => {
          const topVariant = topTvpiVariant(set);

          return (
            <article
              key={set.scenarioSetId}
              className="rounded-md border border-beige-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-inter text-base font-semibold text-charcoal">{set.name}</h3>
                  <p className="mt-1 font-poppins text-sm text-charcoal-500">
                    {variantCountLabel(set.variantCount)} · Source config v{set.sourceConfigVersion}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 border text-xs font-medium',
                    STALENESS_BADGES[set.staleness]
                  )}
                >
                  {STALENESS_LABELS[set.staleness]}
                </Badge>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <p className="font-poppins text-xs uppercase text-charcoal-400">Best TVPI</p>
                  <p className="mt-1 font-inter text-2xl font-semibold text-charcoal">
                    {formatMultiple(topVariant.economicsSummary.finalTvpi)}
                  </p>
                  <p className="mt-1 font-poppins text-xs text-charcoal-500">{topVariant.name}</p>
                </div>
                <div>
                  <p className="font-poppins text-xs uppercase text-charcoal-400">Calculated</p>
                  <p className="mt-1 font-poppins text-sm text-charcoal">
                    {formatDate(set.calculatedAt)}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
