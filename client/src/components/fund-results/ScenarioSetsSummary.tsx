/**
 * ScenarioSetsSummary - Read-only fund scenario result cards.
 *
 * PR E intentionally renders summaries only. Scenario set cards are not
 * clickable until scenario drill-down is explicitly scoped.
 *
 * @module client/components/fund-results/ScenarioSetsSummary
 */

import React from 'react';
import { ScenarioEvidenceHeader } from '@/components/results/ScenarioEvidenceHeader';
import {
  aggregateScenarioEvidenceCopy,
  aggregateScenarioEvidenceState,
  scenarioEvidenceFromSet,
  type ScenarioEvidenceSourceV1,
} from '@/components/results/scenario-evidence';
import type {
  ScenariosSectionPayloadV1,
  ScenarioSetVariantResultSummaryV1,
  ScenarioSetResultSummaryV1,
} from '@shared/contracts/fund-scenario-sets-v1.contract';

export interface ScenarioSetsSummaryProps {
  payload: ScenariosSectionPayloadV1;
}

interface ScenarioSetCardProps {
  set: ScenarioSetResultSummaryV1;
}

type EconomicsScenarioVariant = Extract<
  ScenarioSetVariantResultSummaryV1,
  { overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology' }
>;

function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatCurrencyFromCents(value: number): string {
  const sign = value < 0 ? '-' : '';
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.abs(value) / 100);
  return `${sign}${formatted}`;
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

function hasEconomicsSummary(
  variant: ScenarioSetVariantResultSummaryV1
): variant is EconomicsScenarioVariant {
  return (
    variant.overrideType === 'fee_profile' ||
    variant.overrideType === 'allocation' ||
    variant.overrideType === 'sector_profile' ||
    variant.overrideType === 'methodology'
  );
}

function topTvpiVariant(set: ScenarioSetResultSummaryV1) {
  const economicsVariants = set.variants.filter(hasEconomicsSummary);
  const first = economicsVariants[0];
  if (!first) {
    return null;
  }

  return economicsVariants
    .slice(1)
    .reduce(
      (top, variant) =>
        variant.economicsSummary.finalTvpi > top.economicsSummary.finalTvpi ? variant : top,
      first
    );
}

function ScenarioSetsHeader({
  payload,
  aggregateEvidence,
}: ScenarioSetsSummaryProps & { aggregateEvidence: ScenarioEvidenceSourceV1 | null }) {
  return (
    <div className="space-y-3">
      <span className="font-poppins text-sm text-charcoal-500">
        {payload.sets.length === 1 ? '1 scenario set' : `${payload.sets.length} scenario sets`}
      </span>
      {aggregateEvidence ? (
        <ScenarioEvidenceHeader evidence={aggregateEvidence} testId="scenario-evidence-aggregate" />
      ) : null}
    </div>
  );
}

function EconomicsScenarioMetrics({ set }: { set: ScenarioSetResultSummaryV1 }) {
  const topVariant = topTvpiVariant(set);
  if (!topVariant) {
    return null;
  }

  return (
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
        <p className="mt-1 font-poppins text-sm text-charcoal">{formatDate(set.calculatedAt)}</p>
      </div>
    </div>
  );
}

function ReserveScenarioMetrics({ set }: { set: ScenarioSetResultSummaryV1 }) {
  const reserveVariant = set.variants.find(
    (
      variant
    ): variant is Extract<
      ScenarioSetVariantResultSummaryV1,
      { overrideType: 'reserve_allocation' }
    > => variant.overrideType === 'reserve_allocation'
  );

  if (!reserveVariant) {
    return null;
  }

  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <div>
        <p className="font-poppins text-xs uppercase text-charcoal-400">
          Total scenario allocation
        </p>
        <p className="mt-1 font-inter text-2xl font-semibold text-charcoal">
          {formatCurrencyFromCents(reserveVariant.reserveSummary.totalScenarioAllocationCents)}
        </p>
      </div>
      <div>
        <p className="font-poppins text-xs uppercase text-charcoal-400">Allocation delta</p>
        <p className="mt-1 font-inter text-2xl font-semibold text-charcoal">
          {formatCurrencyFromCents(reserveVariant.reserveSummary.totalAllocationDeltaCents)}
        </p>
      </div>
      <div>
        <p className="font-poppins text-xs uppercase text-charcoal-400">Avg confidence</p>
        <p className="mt-1 font-poppins text-sm text-charcoal">
          {(reserveVariant.reserveSummary.avgConfidence * 100).toFixed(0)}%
        </p>
      </div>
      <div>
        <p className="font-poppins text-xs uppercase text-charcoal-400">High-confidence count</p>
        <p className="mt-1 font-poppins text-sm text-charcoal">
          {reserveVariant.reserveSummary.highConfidenceCount}
        </p>
      </div>
      <div>
        <p className="font-poppins text-xs uppercase text-charcoal-400">Warnings</p>
        <p className="mt-1 font-poppins text-sm text-charcoal">
          {reserveVariant.reserveSummary.warningCount}
        </p>
      </div>
    </div>
  );
}

function ScenarioSetCard({ set }: ScenarioSetCardProps) {
  const evidence = scenarioEvidenceFromSet(set);
  const primaryType = set.variants[0]?.overrideType;

  return (
    <article className="rounded-md border border-beige-200 bg-white p-4">
      <div className="space-y-3">
        <div>
          <h3 className="font-inter text-base font-semibold text-charcoal">{set.name}</h3>
          <p className="mt-1 font-poppins text-sm text-charcoal-500">
            {variantCountLabel(set.variantCount)} · Source config v{set.sourceConfigVersion}
          </p>
        </div>
        <ScenarioEvidenceHeader
          evidence={evidence}
          testId={`scenario-evidence-${set.scenarioSetId}`}
        />
      </div>

      {primaryType === 'reserve_allocation' ? (
        <ReserveScenarioMetrics set={set} />
      ) : (
        <EconomicsScenarioMetrics set={set} />
      )}
    </article>
  );
}

export function ScenarioSetsSummary({ payload }: ScenarioSetsSummaryProps) {
  const evidenceItems = payload.sets.map(scenarioEvidenceFromSet);
  const aggregateState = aggregateScenarioEvidenceState(evidenceItems.map((item) => item.state));
  const latestCalculatedAt =
    evidenceItems
      .map((item) => item.calculatedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .reverse()[0] ?? null;
  const aggregateEvidence: ScenarioEvidenceSourceV1 | null =
    aggregateState === 'CURRENT'
      ? null
      : {
          scenarioSetId: null,
          scenarioSetName: null,
          calculationMode: null,
          sourceConfigVersion: null,
          currentPublishedConfigVersion: null,
          calculatedAt: latestCalculatedAt,
          source: 'fund_snapshots',
          state: aggregateState,
          reason: aggregateScenarioEvidenceCopy(aggregateState),
        };

  return (
    <div className="space-y-4" data-testid="scenario-sets-summary">
      <ScenarioSetsHeader payload={payload} aggregateEvidence={aggregateEvidence} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {payload.sets.map((set) => (
          <ScenarioSetCard key={set.scenarioSetId} set={set} />
        ))}
      </div>
    </div>
  );
}
