/**
 * Cross-surface readiness rollup derivation (Plan 9 Wave 9B2, D-H).
 *
 * Pure derivation from EXISTING read contracts onto the Summary page's
 * dominant object: five rows (Forecast, Portfolio Actuals, Reserves,
 * Scenarios, Reports), each carrying a generic DecisionState, its primary
 * blocker, an as-of date, and the workspace link. Fail-closed: a row never
 * renders a healthier state than its input proves; any fetch failure reads
 * not_actionable with the D-C "Facts unavailable" domain label; loading rows
 * stay not_actionable (excluded from blockedCount) and render as skeletons.
 *
 * The Reports row is an honest STATIC state (9B1 deviation 1, owner-accepted
 * pre-decision): no unfiltered latest-metric-run read exists, so the Summary
 * never presents export-readiness — qualification is verified on the Reports
 * surface itself.
 *
 * @module client/pages/fund-model-results/readiness-rollup
 */

import type { DecisionState } from '@/components/fund-results';
import type { AllocationsResponse } from '@/components/portfolio/tabs/types';
import type { DualForecastResponse } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import type { FundMoicRankingsResponseV2 } from '@shared/contracts/fund-moic-v2.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import type { FundScenarioSetSummaryV1 } from '@shared/contracts/fund-scenario-sets-v1.contract';
import { workspaceNavItems, type WorkspaceNavKey } from './workspace-nav';

/** The scenarios section envelope the results page already fetches. */
export type ScenariosSection = FundResultsReadV1['sections']['scenarios'];

export type ReadinessSourceInput<T> =
  { kind: 'loading' } | { kind: 'error'; message: string | null } | { kind: 'data'; data: T };

export type ReadinessRowKey = Exclude<WorkspaceNavKey, 'summary'>;

export interface ReadinessRollupRow {
  key: ReadinessRowKey;
  label: string;
  /** Skeleton row while the backing read is in flight (D-C loading state). */
  loading: boolean;
  /**
   * Loading rows also carry not_actionable so no consumer can ever read an
   * unproven row as healthy; they are excluded from blockedCount.
   */
  state: DecisionState;
  /** Domain label override for the badge (null = canonical D-A label). */
  stateLabel: string | null;
  primaryReason: string | null;
  asOfDate: string | null;
  href: string | null;
  hrefDisabledReason: string | null;
  /** Neutral counts summary (e.g. drift counts) rendered under the reason. */
  blockedSummary: string | null;
  /** Full warning copy behind the row-level disclosure (D-D). */
  details: readonly string[];
}

export interface ReadinessRollupInputs {
  /** Canonical positive-integer route fund id string, or null when unresolved. */
  fundId: string | null;
  forecast: ReadinessSourceInput<DualForecastResponse>;
  portfolioActuals: ReadinessSourceInput<AllocationsResponse>;
  reserves: ReadinessSourceInput<FundMoicRankingsResponseV2>;
  scenarios: ReadinessSourceInput<ScenariosSection>;
  /**
   * The scenario-set LIST (fix round F1): the results section only carries
   * sets with calculated snapshots, so the list is the completeness
   * authority — the Scenarios row may read actionable ONLY when every active
   * listed set is present and CURRENT in the results section.
   */
  scenarioSetList: ReadinessSourceInput<readonly FundScenarioSetSummaryV1[]>;
}

export interface ReadinessRollupModel {
  rows: readonly ReadinessRollupRow[];
  surfaceCount: number;
  /** Non-loading rows in not_actionable — the D-A blocked-count line. */
  blockedCount: number;
}

/** D-A domain label for fetch/facts failures (never a fourth generic state). */
const FACTS_UNAVAILABLE = 'Facts unavailable';

interface RowSeed {
  loading?: boolean;
  state: DecisionState;
  stateLabel?: string | null;
  primaryReason?: string | null;
  asOfDate?: string | null;
  blockedSummary?: string | null;
  details?: readonly string[];
}

const LOADING_SEED: RowSeed = { loading: true, state: 'not_actionable' };

function factsUnavailableSeed(cause: string | null): RowSeed {
  return { state: 'not_actionable', stateLabel: FACTS_UNAVAILABLE, primaryReason: cause };
}

/** Normalizes ISO datetimes to their date part for tabular as-of display. */
function isoDateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
}

function maxIsoDate(values: ReadonlyArray<string | null>): string | null {
  let max: string | null = null;
  for (const value of values) {
    if (value === null) continue;
    const date = isoDateOnly(value);
    if (max === null || date > max) {
      max = date;
    }
  }
  return max;
}

function deriveForecastSeed(input: ReadinessSourceInput<DualForecastResponse>): RowSeed {
  if (input.kind === 'loading') return LOADING_SEED;
  if (input.kind === 'error') {
    return factsUnavailableSeed(input.message ?? 'The forecast read failed');
  }

  const forecast = input.data;
  const asOfDate = isoDateOnly(forecast.asOfDate);
  const details = forecast.warnings;
  const firstWarning = forecast.warnings[0] ?? null;

  // Contract-documented facts-fetch failure: null facts/anchoring reads FAILED
  // (matches evidenceFromDualForecast, AMENDMENT 6).
  if (forecast.actualsFacts === null || forecast.navAnchoring === null) {
    return {
      state: 'not_actionable',
      stateLabel: FACTS_UNAVAILABLE,
      primaryReason: firstWarning ?? 'Company facts could not be resolved for this forecast',
      asOfDate,
      details,
    };
  }

  const counts = forecast.navAnchoring.countsByTrustState;
  const total = counts.LIVE + counts.PARTIAL + counts.UNAVAILABLE + counts.FAILED;

  if (counts.FAILED > 0) {
    return {
      state: 'not_actionable',
      stateLabel: FACTS_UNAVAILABLE,
      primaryReason: `${counts.FAILED} of ${total} companies have failed facts`,
      asOfDate,
      details,
    };
  }

  // Fail-closed: defaulted Current quarters are not decision-grade (D-C).
  if (forecast.currentProjection.status === 'fallback_default') {
    const fallbackReason = forecast.currentProjection.fallbackReason;
    return {
      state: 'not_actionable',
      primaryReason: 'Current projection unavailable — a default projection is substituted',
      asOfDate,
      details: fallbackReason === null ? details : [...details, fallbackReason],
    };
  }

  const belowLive = counts.PARTIAL + counts.UNAVAILABLE;

  // Fix round F3: zero LIVE companies — including AMENDMENT 8's all-zero
  // empty universe, pinned UNAVAILABLE — cannot anchor a decision-grade
  // forecast and fails closed. Mixed trust with some LIVE stays indicative.
  if (counts.LIVE === 0) {
    return {
      state: 'not_actionable',
      primaryReason:
        total === 0
          ? 'No company facts disclosed'
          : `${belowLive} of ${total} companies below live facts`,
      asOfDate,
      details,
    };
  }

  if (belowLive > 0) {
    return {
      state: 'indicative',
      primaryReason: `${belowLive} of ${total} companies below live facts`,
      asOfDate,
      details,
    };
  }

  if (forecast.warnings.length > 0) {
    return { state: 'indicative', primaryReason: firstWarning, asOfDate, details };
  }

  return { state: 'actionable', asOfDate, details };
}

function derivePortfolioActualsSeed(input: ReadinessSourceInput<AllocationsResponse>): RowSeed {
  if (input.kind === 'loading') return LOADING_SEED;
  if (input.kind === 'error') {
    return factsUnavailableSeed(input.message ?? 'The allocations read failed');
  }

  const summary = input.data.metadata.actuals_drift_summary;
  const asOfDate = isoDateOnly(summary.as_of_date);
  const parts: string[] = [];
  if (summary.drifted_company_count > 0) parts.push(`${summary.drifted_company_count} drifted`);
  if (summary.material_company_count > 0) parts.push(`${summary.material_company_count} material`);
  const blockedSummary = parts.length > 0 ? parts.join(', ') : null;

  if (summary.facts_status === 'failed') {
    return {
      state: 'not_actionable',
      stateLabel: FACTS_UNAVAILABLE,
      primaryReason: 'Company facts failed to resolve for allocations',
      asOfDate,
      blockedSummary,
    };
  }

  // Fix round F4: the endpoint pins 200 + companies_count 0 as a true-empty
  // state — the D-C empty idiom, consistent with reserves/scenarios.
  if (input.data.metadata.companies_count === 0) {
    return { state: 'not_actionable', primaryReason: 'No portfolio actuals disclosed', asOfDate };
  }

  if (summary.degraded_company_count > 0) {
    const count = summary.degraded_company_count;
    return {
      state: 'indicative',
      primaryReason: `${count} ${count === 1 ? 'company' : 'companies'} degraded`,
      asOfDate,
      blockedSummary,
    };
  }

  return { state: 'actionable', asOfDate, blockedSummary };
}

function deriveReservesSeed(input: ReadinessSourceInput<FundMoicRankingsResponseV2>): RowSeed {
  if (input.kind === 'loading') return LOADING_SEED;
  if (input.kind === 'error') {
    return factsUnavailableSeed(input.message ?? 'The reserve rankings read failed');
  }

  const rankings = input.data.rankings;
  const total = rankings.length;
  const asOfDate = maxIsoDate(
    rankings.map((ranking) => ranking.factsBasis?.valuationAnchor.asOfDate ?? null)
  );

  if (total === 0) {
    return { state: 'not_actionable', primaryReason: 'No reserve rankings disclosed', asOfDate };
  }

  // The rankability enum IS the DecisionState enum here — mapped 1:1; a null
  // facts basis reads not_actionable (the MOIC adapter's Facts unavailable).
  const states = rankings.map<DecisionState>(
    (ranking) => ranking.factsBasis?.rankability ?? 'not_actionable'
  );
  const notActionable = states.filter((state) => state === 'not_actionable').length;
  const indicative = states.filter((state) => state === 'indicative').length;

  if (notActionable === total) {
    return {
      state: 'not_actionable',
      primaryReason: `All ${total} rankings are not actionable`,
      asOfDate,
    };
  }
  if (notActionable > 0) {
    return {
      state: 'indicative',
      primaryReason: `${notActionable} of ${total} rankings not actionable`,
      asOfDate,
    };
  }
  if (indicative > 0) {
    return {
      state: 'indicative',
      primaryReason: `${indicative} of ${total} rankings indicative`,
      asOfDate,
    };
  }
  return { state: 'actionable', asOfDate };
}

function deriveScenariosSeed(
  input: ReadinessSourceInput<ScenariosSection>,
  listInput: ReadinessSourceInput<readonly FundScenarioSetSummaryV1[]>
): RowSeed {
  if (input.kind === 'loading') return LOADING_SEED;
  if (input.kind === 'error') {
    return factsUnavailableSeed(input.message ?? 'The results read failed');
  }

  const section = input.data;
  if (section.status !== 'available') {
    if (section.reasonCode === 'SCENARIOS_NONE_EXIST') {
      return { state: 'not_actionable', primaryReason: 'No scenario sets disclosed' };
    }
    if (section.reasonCode === 'SCENARIOS_NONE_CALCULATED') {
      return {
        state: 'not_actionable',
        primaryReason: 'Scenario sets exist but none have calculated results',
      };
    }
    return factsUnavailableSeed(section.reason);
  }

  const sets = section.payload.sets;
  const total = sets.length;
  const asOfDate = maxIsoDate(sets.map((set) => set.calculatedAt));
  const failed = sets.filter(
    (set) => set.staleness === 'FAILED' || set.staleness === 'UNAVAILABLE'
  ).length;
  const calculating = sets.filter((set) => set.staleness === 'CALCULATING').length;
  const stale = sets.filter(
    (set) => set.staleness === 'STALE_PUBLISH' || set.staleness === 'STALE_CONFIG'
  ).length;

  if (failed === total) {
    return {
      state: 'not_actionable',
      primaryReason: `All ${total} scenario sets failed`,
      asOfDate,
    };
  }
  if (failed > 0) {
    return {
      state: 'indicative',
      primaryReason: `${failed} of ${total} scenario sets failed`,
      asOfDate,
    };
  }
  if (calculating > 0) {
    return { state: 'indicative', primaryReason: 'Scenario calculation in progress', asOfDate };
  }
  if (stale > 0) {
    return {
      state: 'indicative',
      primaryReason: `${stale} of ${total} scenario sets stale against the published config`,
      asOfDate,
    };
  }

  // Fix round F1: every results-section set is CURRENT, but the section only
  // carries sets with calculated snapshots. The actionable claim additionally
  // requires the scenario-set LIST to prove completeness; unprovable
  // completeness NEVER reads actionable.
  if (listInput.kind === 'loading') {
    return LOADING_SEED;
  }
  if (listInput.kind === 'error') {
    return {
      state: 'indicative',
      primaryReason: 'Scenario set inventory unavailable',
      asOfDate,
    };
  }
  const activeSets = listInput.data.filter((set) => set.archivedAt === null);
  const calculatedIds = new Set(sets.map((set) => set.scenarioSetId));
  const missing = activeSets.filter((set) => !calculatedIds.has(set.id)).length;
  if (missing > 0) {
    return {
      state: 'indicative',
      primaryReason: `${missing} of ${activeSets.length} sets have no calculated results`,
      asOfDate,
    };
  }
  return { state: 'actionable', asOfDate };
}

/**
 * Honest static Reports state (pre-decided): the Summary NEVER presents
 * export-readiness; the D-C gated affordance points at the Reports surface.
 */
const REPORTS_SEED: RowSeed = {
  state: 'not_actionable',
  stateLabel: 'Not verified',
  primaryReason: 'Qualification is verified on the Reports surface',
};

export function deriveReadinessRollup(inputs: ReadinessRollupInputs): ReadinessRollupModel {
  const navByKey = new Map(workspaceNavItems(inputs.fundId).map((item) => [item.key, item]));
  const seeds: ReadonlyArray<[ReadinessRowKey, RowSeed]> = [
    ['forecast', deriveForecastSeed(inputs.forecast)],
    ['portfolio-actuals', derivePortfolioActualsSeed(inputs.portfolioActuals)],
    ['reserves', deriveReservesSeed(inputs.reserves)],
    ['scenarios', deriveScenariosSeed(inputs.scenarios, inputs.scenarioSetList)],
    ['reports', REPORTS_SEED],
  ];

  const rows: ReadinessRollupRow[] = seeds.map(([key, seed]) => {
    const navItem = navByKey.get(key);
    const href = navItem?.href ?? null;
    return {
      key,
      label: navItem?.label ?? key,
      loading: seed.loading ?? false,
      state: seed.state,
      stateLabel: seed.stateLabel ?? null,
      primaryReason: seed.primaryReason ?? null,
      asOfDate: seed.asOfDate ?? null,
      href,
      hrefDisabledReason: href === null ? (navItem?.disabledReason ?? null) : null,
      blockedSummary: seed.blockedSummary ?? null,
      details: seed.details ?? [],
    };
  });

  const blockedCount = rows.filter((row) => !row.loading && row.state === 'not_actionable').length;

  return { rows, surfaceCount: rows.length, blockedCount };
}
