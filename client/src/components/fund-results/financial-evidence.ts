/**
 * financial-evidence -- the shared evidence value object rendered by
 * FinancialEvidenceDrawer, the two-axis forecast view-state model, and the
 * pure adapters that map source contracts onto FinancialEvidence.
 *
 * Adapters follow the Plan 9 Wave 9A Adapter Mapping Policy: every field is
 * either mapped verbatim from the source contract's own vocabulary or set to
 * null/[] -- nothing is invented. This module knows NOTHING about the MOIC
 * domain (see no-moic-imports.test.tsx); the MOIC adapter accepts a local
 * structural slice instead of the MOIC contract type.
 *
 * @module client/components/fund-results/financial-evidence
 */

import {
  DUAL_FORECAST_CONTRACT_VERSION,
  type DualForecastResponse,
  type DualForecastTrustCounts,
} from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import type {
  FundScenarioComparisonV1,
  ScenarioComparisonStalenessV1,
} from '@shared/contracts/fund-scenario-comparison-v1.contract';
import type { StructuredWarning } from '@shared/contracts/provenance-envelope.contract';
import { comparisonEvidenceState } from './scenario-comparison-evidence';

export interface FinancialEvidence {
  source: string;
  asOfDate: string | null;
  contractVersion: string;
  sourceVersion: string | null;
  factsInputHash: string | null;
  assumptionsHash: string | null;
  trustState: string;
  currencyStatus: string | null;
  warnings: StructuredWarning[];
}

export type ForecastBasis = 'construction' | 'current';
export type ScenarioOverlay =
  | { kind: 'none' }
  | {
      kind: 'saved';
      scenarioSetId: string;
      variantId: string | null;
      name: string;
      baseBasis: ForecastBasis;
      baseInputHash: string;
      baseAsOfDate: string;
    };
export interface FundResultsViewState {
  basis: ForecastBasis;
  overlay: ScenarioOverlay;
}

/**
 * Validating factory for FundResultsViewState. Encodes the D-E invariant
 * `overlay.kind === 'saved' ? basis === overlay.baseBasis : true` at the one
 * construction point (review P2-3); throws on a mismatched saved overlay.
 * The plain interface stays exported for backward-compatible 9B use.
 */
export function createFundResultsViewState(
  basis: ForecastBasis,
  overlay: ScenarioOverlay
): FundResultsViewState {
  if (overlay.kind === 'saved' && overlay.baseBasis !== basis) {
    throw new Error(
      `FundResultsViewState invariant violated: basis '${basis}' must equal ` +
        `overlay.baseBasis '${overlay.baseBasis}' while a saved scenario overlay is applied`
    );
  }
  return { basis, overlay };
}

const TRUST_STATE_WORST_FIRST = ['FAILED', 'UNAVAILABLE', 'PARTIAL', 'LIVE'] as const;

function worstTrustState(counts: DualForecastTrustCounts): string {
  for (const state of TRUST_STATE_WORST_FIRST) {
    if (counts[state] > 0) {
      return state;
    }
  }
  // AMENDMENT 8: an all-zero count map is a valid empty facts universe with
  // no trusted dataset, pinned to UNAVAILABLE.
  return 'UNAVAILABLE';
}

/**
 * Maps a dual-forecast response onto FinancialEvidence. Without a companyId
 * the trust state is worst-state-wins over the ADR-030 counts rollup; with a
 * companyId it is that company's own dataset trust state. The top-level
 * string[] warnings are deliberately excluded -- only StructuredWarning-typed
 * warnings at the mapped level are carried.
 */
export function evidenceFromDualForecast(
  response: DualForecastResponse,
  companyId?: number
): FinancialEvidence {
  const facts = response.actualsFacts;
  const base = {
    source: response.config.source,
    asOfDate: response.asOfDate,
    contractVersion: String(DUAL_FORECAST_CONTRACT_VERSION),
    sourceVersion: response.config.version === null ? null : String(response.config.version),
    assumptionsHash: null,
    currencyStatus: null,
  };

  if (companyId !== undefined) {
    const company = facts?.companies.find((entry) => entry.companyId === companyId);
    if (facts === null || company === undefined) {
      // AMENDMENT 6 ratified fallback: no matching facts entry for the company.
      return { ...base, factsInputHash: null, trustState: 'UNAVAILABLE', warnings: [] };
    }
    return {
      ...base,
      factsInputHash: facts.inputHash,
      trustState: company.trustState,
      currencyStatus: company.currencyStatus,
      warnings: company.warnings,
    };
  }

  // AMENDMENT 6 ratified fallback: navAnchoring null is the contract-documented
  // facts-fetch-failure case and reads FAILED.
  const trustState =
    response.navAnchoring === null
      ? 'FAILED'
      : worstTrustState(response.navAnchoring.countsByTrustState);
  return {
    ...base,
    factsInputHash: facts === null ? null : facts.inputHash,
    trustState,
    warnings: facts === null ? [] : facts.warnings,
  };
}

/**
 * Maps a scenario comparison onto FinancialEvidence. Exposes the evidence
 * state and source config version only; asOfDate and hashes stay null per the
 * Adapter Mapping Policy. The explicit staleness argument overrides the
 * comparison's own staleness when provided (callers normally pass
 * `comparison.staleness`), reusing the shipped comparisonEvidenceState so the
 * surfaces never drift.
 */
export function evidenceFromScenarioComparison(
  comparison: FundScenarioComparisonV1,
  staleness: ScenarioComparisonStalenessV1 | null
): FinancialEvidence {
  const trustState = comparisonEvidenceState(
    staleness === null ? comparison : { ...comparison, staleness }
  );
  return {
    source: 'scenario_comparison',
    asOfDate: null,
    contractVersion: 'fund-scenario-comparison-v1',
    sourceVersion: String(comparison.scenarioSet.sourceConfigVersion),
    factsInputHash: null,
    assumptionsHash: null,
    trustState,
    currencyStatus: null,
    warnings: [],
  };
}

/**
 * Structural slice of the MOIC facts basis needed for evidence mapping.
 * Deliberately NOT imported from the MOIC contract: fund-results primitives
 * stay decoupled from the MOIC domain (no-moic-imports.test.tsx enforces
 * this). FundMoicFactsBasisV1 is structurally assignable to this shape.
 */
export interface MoicBasisEvidenceSource {
  rankability: 'actionable' | 'indicative' | 'not_actionable';
  /** FundCompanyActualsCurrencyStatusSchema vocabulary, restated structurally (review P3-7). */
  currencyStatus: 'base_currency' | 'mismatch_blocked' | 'unknown';
  factsInputHash: string | null;
  warnings: StructuredWarning[];
}

/**
 * Maps a MOIC facts basis onto FinancialEvidence. trustState is the basis
 * contract's own rankability state, verbatim. The basis carries no top-level
 * as-of date (the valuation anchor's asOfDate is anchor-specific), so asOfDate
 * is null per the Adapter Mapping Policy.
 */
export function evidenceFromMoicBasis(basis: MoicBasisEvidenceSource): FinancialEvidence {
  return {
    source: 'fund_moic_facts',
    asOfDate: null,
    contractVersion: 'fund-moic-v1',
    sourceVersion: null,
    factsInputHash: basis.factsInputHash,
    assumptionsHash: null,
    trustState: basis.rankability,
    currencyStatus: basis.currencyStatus,
    warnings: basis.warnings,
  };
}
