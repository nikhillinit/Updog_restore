import type {
  DualForecastActualsFacts,
  DualForecastActualsFactsCompany,
  DualForecastNavAnchor,
  DualForecastNavAnchoring,
  DualForecastPoint,
  DualForecastTrustCounts,
} from '@shared/contracts/dual-forecast/dual-forecast-response.contract';

type NameType = string | number;
type ValueType = string | number | Array<string | number>;

export type ForecastMetricKey = 'nav' | 'calledCapital';

export interface ForecastChartPoint {
  label: string;
  constructionNav: number;
  actualNav: number | null;
  currentForecastNav: number | null;
  constructionCalledCapital: number;
  actualCalledCapital: number | null;
  currentForecastCalledCapital: number | null;
  navDelta: number | null;
  navDeltaPct: number | null;
  calledCapitalDelta: number | null;
  calledCapitalDeltaPct: number | null;
}

export interface ForecastMetricDrift {
  label: string;
  delta: number;
  deltaPct: number | null;
  constructionValue: number;
  currentValue: number;
}

export interface ForecastDriftSummary {
  label: string;
  nav: ForecastMetricDrift | null;
  calledCapital: ForecastMetricDrift | null;
}

const MILLION = 1_000_000;

const FORECAST_SERIES_LABELS: Record<string, string> = {
  constructionNav: 'Construction Plan NAV',
  actualNav: 'Actual NAV',
  currentForecastNav: 'Current Forecast NAV',
  constructionCalledCapital: 'Construction Plan Called Capital',
  actualCalledCapital: 'Actual Called Capital',
  currentForecastCalledCapital: 'Current Forecast Called Capital',
};

function toRoundedMillions(value: number): number {
  return Math.round(value / MILLION);
}

function toRoundedDisplayNumber(value: number): number {
  return Math.round(value);
}

function toPercentOfConstruction(delta: number, constructionValue: number): number | null {
  if (constructionValue === 0) {
    return null;
  }

  return delta / constructionValue;
}

function buildMetricDrift(
  point: ForecastChartPoint,
  metric: ForecastMetricKey
): ForecastMetricDrift | null {
  if (metric === 'nav') {
    if (point.currentForecastNav == null || point.navDelta == null) {
      return null;
    }

    return {
      label: point.label,
      delta: point.navDelta,
      deltaPct: point.navDeltaPct,
      constructionValue: point.constructionNav,
      currentValue: point.currentForecastNav,
    };
  }

  if (point.currentForecastCalledCapital == null || point.calledCapitalDelta == null) {
    return null;
  }

  return {
    label: point.label,
    delta: point.calledCapitalDelta,
    deltaPct: point.calledCapitalDeltaPct,
    constructionValue: point.constructionCalledCapital,
    currentValue: point.currentForecastCalledCapital,
  };
}

/**
 * Chart points consume the contract's per-quarter `variance` verbatim (PRD
 * #1020 PR-3): money deltas are the server's current-minus-construction, and
 * they render on BOTH forecast and actual quarters (D3). The percent is a
 * display derivation of the server delta against the construction baseline,
 * not a client recompute of the delta itself.
 */
export function buildForecastChartPoints(series: DualForecastPoint[]): ForecastChartPoint[] {
  return series.map((point) => {
    const isForecast = point.currentMode === 'forecast';

    return {
      label: point.label,
      constructionNav: toRoundedMillions(point.construction.nav),
      actualNav: point.actual ? toRoundedMillions(point.actual.nav) : null,
      currentForecastNav: isForecast ? toRoundedMillions(point.current.nav) : null,
      constructionCalledCapital: toRoundedMillions(point.construction.calledCapital),
      actualCalledCapital: point.actual ? toRoundedMillions(point.actual.calledCapital) : null,
      currentForecastCalledCapital: isForecast
        ? toRoundedMillions(point.current.calledCapital)
        : null,
      navDelta: toRoundedMillions(point.variance.nav),
      navDeltaPct: toPercentOfConstruction(point.variance.nav, point.construction.nav),
      calledCapitalDelta: toRoundedMillions(point.variance.calledCapital),
      calledCapitalDeltaPct: toPercentOfConstruction(
        point.variance.calledCapital,
        point.construction.calledCapital
      ),
    };
  });
}

export function getLatestForecastDrift(points: ForecastChartPoint[]): ForecastDriftSummary | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (!point) {
      continue;
    }

    const nav = buildMetricDrift(point, 'nav');
    const calledCapital = buildMetricDrift(point, 'calledCapital');

    if (nav || calledCapital) {
      return {
        label: point.label,
        nav,
        calledCapital,
      };
    }
  }

  return null;
}

export function formatMillionValue(value: ValueType | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `$${toRoundedDisplayNumber(parsed)}M` : `${value}`;
  }

  return '';
}

export function formatSignedMillion(value: number): string {
  const rounded = toRoundedDisplayNumber(value);

  if (rounded === 0) {
    return '$0M';
  }

  const prefix = rounded > 0 ? '+' : '-';
  return `${prefix}$${Math.abs(rounded)}M`;
}

export function formatSignedPercent(value: number | null): string | null {
  if (value == null) {
    return null;
  }

  const magnitude = Math.abs(value * 100).toFixed(1);
  return `${magnitude}% ${describeDriftDirection(value)}`;
}

export function formatForecastSeriesName(name: NameType | undefined): string {
  if (name == null) {
    return '';
  }

  const key = String(name);
  return FORECAST_SERIES_LABELS[key] ?? key;
}

export function describeDriftDirection(value: number): 'above' | 'below' | 'in line with' {
  if (value > 0) {
    return 'above';
  }

  if (value < 0) {
    return 'below';
  }

  return 'in line with';
}

// ---------------------------------------------------------------------------
// Trust disclosure (PRD #1020 PR-3, ADR-029/030)
// ---------------------------------------------------------------------------

export type DatasetTrustState = DualForecastActualsFactsCompany['trustState'];
export type StructuredWarning = DualForecastActualsFactsCompany['warnings'][number];

/** Chip/filter key: the four server trust states plus the client-derived
 * "No facts" bucket (D2) so chip totals equal attribution rows. */
export type TrustFilterKey = DatasetTrustState | 'NO_FACTS';

export const TRUST_FILTER_KEYS: readonly TrustFilterKey[] = [
  'LIVE',
  'PARTIAL',
  'UNAVAILABLE',
  'FAILED',
  'NO_FACTS',
] as const;

export interface AttributionRow {
  companyId: number;
  companyName: string;
  inNavUniverse: boolean;
  trustState: DatasetTrustState | null;
  anchor: DualForecastNavAnchor | null;
  contribution: string | null;
  warnings: StructuredWarning[];
}

function attributionSortGroup(row: AttributionRow): number {
  if (!row.inNavUniverse) {
    return 3;
  }

  if (row.trustState === null) {
    return 1;
  }

  if (row.trustState === 'LIVE') {
    return 2;
  }

  return 0;
}

/**
 * Pure join of the two disclosure blocks. navAnchoring is the authoritative
 * universe (facts-only companies are excluded); its name/trustState win;
 * first entry wins on duplicate companyId. Sort: non-LIVE facts rows first,
 * then trustState:null ("no facts"), then LIVE, then inNavUniverse:false
 * (exited) — stable by companyName within each group.
 */
export function buildAttributionRows(
  navAnchoring: DualForecastNavAnchoring | null,
  actualsFacts: DualForecastActualsFacts | null
): AttributionRow[] {
  if (!navAnchoring) {
    return [];
  }

  const factsById = new Map<number, DualForecastActualsFactsCompany>();
  for (const company of actualsFacts?.companies ?? []) {
    if (!factsById.has(company.companyId)) {
      factsById.set(company.companyId, company);
    }
  }

  const seen = new Set<number>();
  const rows: AttributionRow[] = [];
  for (const company of navAnchoring.companies) {
    if (seen.has(company.companyId)) {
      continue;
    }
    seen.add(company.companyId);

    rows.push({
      companyId: company.companyId,
      companyName: company.companyName,
      inNavUniverse: company.inNavUniverse,
      trustState: company.trustState,
      anchor: company.anchor,
      contribution: company.contribution,
      warnings: factsById.get(company.companyId)?.warnings ?? [],
    });
  }

  return rows.sort(
    (a, b) =>
      attributionSortGroup(a) - attributionSortGroup(b) ||
      a.companyName.localeCompare(b.companyName)
  );
}

export function countNoFactsRows(rows: AttributionRow[]): number {
  return rows.filter((row) => row.trustState === null).length;
}

export function filterAttributionRows(
  rows: AttributionRow[],
  filter: TrustFilterKey | null
): AttributionRow[] {
  if (filter === null) {
    return rows;
  }

  if (filter === 'NO_FACTS') {
    return rows.filter((row) => row.trustState === null);
  }

  return rows.filter((row) => row.trustState === filter);
}

// ---------------------------------------------------------------------------
// Disclosure copy map (canonical strings — tests assert these constants)
// ---------------------------------------------------------------------------

export const TRUST_STATE_COPY: Record<TrustFilterKey, { label: string; description: string }> = {
  LIVE: {
    label: 'Live',
    description: 'Fully verified actuals; blended without qualification.',
  },
  PARTIAL: {
    label: 'Partial',
    description:
      'Evidence on file but not fully verified — expected while Planning FMV marks are being entered. Included in the blend and flagged.',
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    description:
      'Monetary values withheld due to a currency mismatch; round identity still disclosed.',
  },
  FAILED: {
    label: 'Failed',
    description:
      'The actuals feed failed for this company; no facts-derived value is used. Review before LP sharing.',
  },
  NO_FACTS: {
    label: 'No facts',
    description: 'No actuals record; valued from legacy sources.',
  },
};

export const ANCHOR_RUNG_COPY: Record<DualForecastNavAnchor, { label: string; tooltip: string }> = {
  planning_fmv: {
    label: 'Planning FMV',
    tooltip: 'Anchored to the latest approved Planning FMV mark.',
  },
  planning_fmv_stale: {
    label: 'Planning FMV (stale)',
    tooltip: 'Anchored to a Planning FMV mark past its freshness window — disclosed, not hidden.',
  },
  legacy_current_valuation: {
    label: 'Recorded valuation (legacy)',
    tooltip: 'Anchored to the recorded valuation, which has no provenance trail.',
  },
  legacy_current_valuation_ownership_scaled: {
    label: 'Recorded valuation x recorded ownership (legacy)',
    tooltip:
      'Company-level recorded valuation scaled by the explicitly recorded ownership percentage; used only when ownership is recorded and positive; never estimated or defaulted (ADR-054).',
  },
  none: {
    label: 'None (zero)',
    tooltip: 'No usable valuation source; contributes zero to NAV rather than a silent fill.',
  },
};

export const BLENDED_NAV_LABEL = 'Blended NAV';
export const EXITED_ROW_COPY = 'Exited — not in NAV universe';

export const CURRENT_PROJECTION_NOTICE_COPY = {
  headline: 'Current-forecast quarters are using default projections',
  body: 'The engine could not produce fund-specific values.',
  reasonPrefix: 'Reason: ',
  nullReason: 'No further detail was reported.',
  escalation: 'Review before LP sharing.',
} as const;

export const FACTS_UNAVAILABLE_NOTICE_COPY = {
  headline: 'Verified actuals unavailable',
  body: 'Showing unblended legacy NAV. Forecast charts remain live.',
} as const;

/** CP1: dashboard-summary failure degrades the header cards AND Portfolio
 * Allocation together behind this one notice; the forecast region stays live. */
export const SUMMARY_UNAVAILABLE_NOTICE_COPY = {
  headline: 'Fund summary unavailable',
  body: 'Header metrics and Portfolio Allocation are degraded until the dashboard summary recovers. Forecast and trust disclosure below remain live.',
} as const;

export const EMPTY_UNIVERSE_COPY =
  'No portfolio companies in the NAV universe yet. Trust attribution appears once companies are added.';

export const PARTIAL_DOMINATED_COPY =
  'Most companies are awaiting Planning FMV marks — partial trust is the expected state until marks are entered.';

export const REVIEW_ROWS_FIRST_COPY = 'Review Failed and Unavailable rows first.';

export const CLEAR_FILTER_LABEL = 'Clear filter';
export const FILTER_EMPTY_COPY = 'No companies currently in this state';

/**
 * Visible summary line above the attribution table; doubles as the
 * screen-reader summary. Returns the PARTIAL-dominated expected-state copy
 * when PARTIAL covers at least half the universe, appending the review
 * escalation only when a blocked or failed row exists.
 */
export function buildAttributionSummary(
  counts: DualForecastTrustCounts,
  totalRows: number
): string | null {
  if (totalRows === 0 || counts.PARTIAL * 2 < totalRows) {
    return null;
  }

  if (counts.FAILED + counts.UNAVAILABLE > 0) {
    return `${PARTIAL_DOMINATED_COPY} ${REVIEW_ROWS_FIRST_COPY}`;
  }

  return PARTIAL_DOMINATED_COPY;
}

export function formatFilterStatus(shown: number, total: number): string {
  return `Showing ${shown} of ${total} companies`;
}

export function formatChipAriaLabel(count: number, key: TrustFilterKey): string {
  return `Filter to ${count} ${TRUST_STATE_COPY[key].label.toLowerCase()} companies`;
}

export function formatFactsFreshness(asOfDate: string, inputHash: string): string {
  return `Facts as of ${asOfDate} · input ${inputHash.slice(0, 8)}`;
}

/**
 * Decimal-string money (blendedNav, contribution) through the parse-guard
 * pattern: never raw parseFloat display. Null and unparseable render an em
 * dash placeholder.
 */
export function formatDecimalMillions(value: string | null): string {
  if (value == null) {
    return '—';
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return '—';
  }

  return formatMillionValue(parsed / MILLION);
}
