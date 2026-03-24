/**
 * Pure config-backed mappers for richer fund result sections.
 *
 * @module server/services/fund-results-rich-mappers
 */

import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import type {
  ScorecardPayload,
  WaterfallSetupSection,
} from '@shared/contracts/fund-results-v1.contract';

/** Fund identity fields needed by scorecard */
export interface FundIdentity {
  name: string;
  vintageYear: number;
  size: number;
}

/**
 * Assemble scorecard overview from already-loaded evidence.
 * No new DB queries -- pure derivation from fund identity, loaded sections, and lifecycle.
 */
export function mapScorecardFromEvidence(
  fund: FundIdentity,
  reserveSection: { status: string; payload?: { reserveRatio: number; avgConfidence: number } },
  pacingSection: { status: string; payload?: { yearsToFullDeploy: number } },
  lastCalculatedAt: string | null
): ScorecardPayload {
  const payload: ScorecardPayload = {
    fundName: { value: fund.name, source: 'funds' },
    fundSize: { value: fund.size, source: 'funds' },
    ...(fund.vintageYear != null && {
      vintageYear: { value: fund.vintageYear, source: 'funds' as const },
    }),
  };

  if (reserveSection.status === 'available' && reserveSection.payload) {
    payload.reserveRatio = { value: reserveSection.payload.reserveRatio, source: 'fund_snapshots' };
    payload.avgConfidence = {
      value: reserveSection.payload.avgConfidence,
      source: 'fund_snapshots',
    };
  }

  if (pacingSection.status === 'available' && pacingSection.payload) {
    payload.yearsToFullDeploy = {
      value: pacingSection.payload.yearsToFullDeploy,
      source: 'fund_snapshots',
    };
  }

  if (lastCalculatedAt) {
    payload.lastCalculatedAt = { value: lastCalculatedAt, source: 'fund_state' };
  }

  return payload;
}

/**
 * Project published draft config into a truthful waterfall setup summary.
 * Returns null when the published config does not contain a coherent waterfall setup.
 */
export function mapPublishedConfigToWaterfallSetup(
  config: FundDraftWriteV1
): WaterfallSetupSection | null {
  if (!config.waterfallType || !config.waterfallTiers || config.waterfallTiers.length === 0) {
    return null;
  }

  return {
    view: 'setup-summary',
    type: config.waterfallType,
    tierCount: config.waterfallTiers.length,
    tiers: config.waterfallTiers.map((tier) => ({
      name: tier.name,
      preferredReturn: tier.preferredReturn ?? null,
      catchUp: tier.catchUp ?? null,
      gpSplit: tier.gpSplit,
      lpSplit: tier.lpSplit,
      condition: tier.condition ?? null,
      conditionValue: tier.conditionValue ?? null,
    })),
    recyclingEnabled: config.recyclingEnabled ?? null,
    recyclingType: config.recyclingType ?? null,
    recyclingCap: config.recyclingCap ?? null,
    recyclingPeriod: config.recyclingPeriod ?? null,
    exitRecyclingRate: config.exitRecyclingRate ?? null,
    mgmtFeeRecyclingRate: config.mgmtFeeRecyclingRate ?? null,
    allowFutureRecycling: config.allowFutureRecycling ?? null,
  };
}
