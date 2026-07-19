import { describe, expect, it } from 'vitest';
import {
  DualForecastActualsFactsSchema,
  DualForecastNavAnchoringSchema,
  DualForecastPointSchema,
  type DualForecastActualsFacts,
  type DualForecastActualsFactsCompany,
  type DualForecastNavAnchorCompany,
  type DualForecastNavAnchoring,
  type DualForecastPoint,
  type DualForecastTrustCounts,
} from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import {
  ANCHOR_RUNG_COPY,
  buildAttributionRows,
  buildAttributionSummary,
  buildForecastChartPoints,
  countNoFactsRows,
  describeDriftDirection,
  filterAttributionRows,
  formatChipAriaLabel,
  formatDecimalMillions,
  formatFactsFreshness,
  formatFilterStatus,
  formatForecastSeriesName,
  formatMillionValue,
  formatSignedMillion,
  formatSignedPercent,
  getLatestForecastDrift,
  PARTIAL_DOMINATED_COPY,
  REVIEW_ROWS_FIRST_COPY,
  TRUST_STATE_COPY,
} from '@/lib/dual-forecast-display';

// All fixtures are inline -- not shared with dual-forecast-dashboard.test.tsx.
// Every builder round-trips through the contract schema (fixture guard):
// test files are not typechecked, so the parse is the only shape enforcement.

const M = 1_000_000;

function metrics(nav: number, calledCapital: number) {
  return { nav, calledCapital, distributions: 0, tvpi: null, dpi: null, rvpi: null, irr: null };
}

function variance(nav: number, calledCapital: number) {
  return { nav, calledCapital, distributions: 0, tvpi: null, dpi: null, rvpi: null, irr: null };
}

function actualPoint(
  label: string,
  qi: number,
  constructionNav: number,
  constructionCalled: number,
  actualNav: number,
  actualCalled: number
): DualForecastPoint {
  return DualForecastPointSchema.parse({
    quarterIndex: qi,
    label,
    date: '2026-01-01T00:00:00.000Z',
    construction: metrics(constructionNav, constructionCalled),
    actual: metrics(actualNav, actualCalled),
    currentMode: 'actual',
    current: metrics(actualNav, actualCalled),
    variance: variance(actualNav - constructionNav, actualCalled - constructionCalled),
  });
}

function forecastPoint(
  label: string,
  qi: number,
  constructionNav: number,
  constructionCalled: number,
  currentNav: number,
  currentCalled: number
): DualForecastPoint {
  return DualForecastPointSchema.parse({
    quarterIndex: qi,
    label,
    date: '2026-01-01T00:00:00.000Z',
    construction: metrics(constructionNav, constructionCalled),
    actual: null,
    currentMode: 'forecast',
    current: metrics(currentNav, currentCalled),
    variance: variance(currentNav - constructionNav, currentCalled - constructionCalled),
  });
}

// Q4 fixture: construction NAV $59M, current NAV $51M, construction called $34M, current called $39M
const Q4 = forecastPoint('Q4 2026', 3, 59 * M, 34 * M, 51 * M, 39 * M);

// ---------------------------------------------------------------------------
// buildForecastChartPoints
// ---------------------------------------------------------------------------

describe('buildForecastChartPoints', () => {
  it('maps actual points to actualNav and null currentForecastNav', () => {
    const [point] = buildForecastChartPoints([
      actualPoint('Q1 2026', 0, 20 * M, 15 * M, 21 * M, 15 * M),
    ]);
    expect(point.label).toBe('Q1 2026');
    expect(point.actualNav).toBe(21);
    expect(point.currentForecastNav).toBeNull();
    expect(point.constructionNav).toBe(20);
  });

  it('maps forecast points to currentForecastNav and null actualNav', () => {
    const [point] = buildForecastChartPoints([
      forecastPoint('Q2 2026', 1, 30 * M, 20 * M, 28 * M, 21 * M),
    ]);
    expect(point.actualNav).toBeNull();
    expect(point.currentForecastNav).toBe(28);
    expect(point.constructionNav).toBe(30);
  });

  it('renders server variance on actual points too (D3: tooltip-only on actual quarters)', () => {
    const [point] = buildForecastChartPoints([
      actualPoint('Q1 2026', 0, 20 * M, 15 * M, 21 * M, 15 * M),
    ]);
    expect(point.navDelta).toBe(1);
    expect(point.navDeltaPct).toBeCloseTo(1 / 20, 4);
    expect(point.calledCapitalDelta).toBe(0);
    expect(point.calledCapitalDeltaPct).toBeCloseTo(0, 4);
  });

  it('passes the server variance through verbatim, never recomputing it (adversarial proof)', () => {
    // variance.nav deliberately disagrees with current-minus-construction:
    // the chart must show the server value (-7M), not a client recompute (-8M).
    const point = DualForecastPointSchema.parse({
      quarterIndex: 0,
      label: 'Q1 2027',
      date: '2027-01-01T00:00:00.000Z',
      construction: metrics(59 * M, 34 * M),
      actual: null,
      currentMode: 'forecast',
      current: metrics(51 * M, 39 * M),
      variance: variance(-7 * M, 4 * M),
    });
    const [chartPoint] = buildForecastChartPoints([point]);
    expect(chartPoint.navDelta).toBe(-7);
    expect(chartPoint.calledCapitalDelta).toBe(4);
    expect(chartPoint.navDeltaPct).toBeCloseTo(-7 / 59, 4);
  });

  it('computes navDelta in millions for forecast points', () => {
    const [point] = buildForecastChartPoints([Q4]);
    // 51_000_000 - 59_000_000 = -8_000_000 → -8 millions
    expect(point.navDelta).toBe(-8);
    // 39_000_000 - 34_000_000 = 5_000_000 → +5 millions
    expect(point.calledCapitalDelta).toBe(5);
  });

  it('computes navDeltaPct as a fraction using raw dollar values', () => {
    const [point] = buildForecastChartPoints([Q4]);
    // (-8_000_000) / 59_000_000 ≈ -0.13559
    expect(point.navDeltaPct).toBeCloseTo(-8 / 59, 4);
    // 5_000_000 / 34_000_000 ≈ 0.14706
    expect(point.calledCapitalDeltaPct).toBeCloseTo(5 / 34, 4);
  });
});

// ---------------------------------------------------------------------------
// getLatestForecastDrift
// ---------------------------------------------------------------------------

describe('getLatestForecastDrift', () => {
  it('returns Q4 label when Q4 is the latest comparable forecast point', () => {
    const series = [
      actualPoint('Q1 2026', 0, 20 * M, 15 * M, 21 * M, 15 * M),
      forecastPoint('Q2 2026', 1, 30 * M, 20 * M, 28 * M, 21 * M),
      forecastPoint('Q3 2026', 2, 45 * M, 27 * M, 43 * M, 28 * M),
      Q4,
    ];
    const drift = getLatestForecastDrift(buildForecastChartPoints(series));
    expect(drift?.label).toBe('Q4 2026');
  });

  it('returns null when there are no forecast points', () => {
    const drift = getLatestForecastDrift(
      buildForecastChartPoints([actualPoint('Q1 2026', 0, 20 * M, 15 * M, 21 * M, 15 * M)])
    );
    expect(drift).toBeNull();
  });

  it('computes NAV delta of -8 for construction $59M vs current $51M', () => {
    const drift = getLatestForecastDrift(buildForecastChartPoints([Q4]));
    expect(drift?.nav?.delta).toBe(-8);
  });

  it('computes called-capital delta of +5 for construction $34M vs current $39M', () => {
    const drift = getLatestForecastDrift(buildForecastChartPoints([Q4]));
    expect(drift?.calledCapital?.delta).toBe(5);
  });

  it('formats NAV drift percent as 13.6% below', () => {
    const drift = getLatestForecastDrift(buildForecastChartPoints([Q4]));
    expect(formatSignedPercent(drift!.nav!.deltaPct)).toBe('13.6% below');
  });

  it('formats called-capital drift percent as 14.7% above', () => {
    const drift = getLatestForecastDrift(buildForecastChartPoints([Q4]));
    expect(formatSignedPercent(drift!.calledCapital!.deltaPct)).toBe('14.7% above');
  });
});

// ---------------------------------------------------------------------------
// Zero construction denominator
// ---------------------------------------------------------------------------

describe('zero construction denominator', () => {
  const ZERO_CONST = forecastPoint('Q0', 0, 0, 0, 5 * M, 3 * M);

  it('returns null navDeltaPct when construction nav is zero', () => {
    const [point] = buildForecastChartPoints([ZERO_CONST]);
    expect(point.navDeltaPct).toBeNull();
  });

  it('still returns the money delta when construction is zero', () => {
    const [point] = buildForecastChartPoints([ZERO_CONST]);
    expect(point.navDelta).toBe(5);
  });

  it('formatSignedPercent returns null for null input', () => {
    expect(formatSignedPercent(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Zero delta
// ---------------------------------------------------------------------------

describe('zero delta', () => {
  const FLAT = forecastPoint('Q0', 0, 10 * M, 8 * M, 10 * M, 8 * M);

  it('returns 0 navDelta for identical construction and current', () => {
    const [point] = buildForecastChartPoints([FLAT]);
    expect(point.navDelta).toBe(0);
  });

  it('formatSignedMillion returns $0M without sign prefix', () => {
    expect(formatSignedMillion(0)).toBe('$0M');
  });

  it('describeDriftDirection returns in line with for zero', () => {
    expect(describeDriftDirection(0)).toBe('in line with');
  });
});

// ---------------------------------------------------------------------------
// formatSignedMillion
// ---------------------------------------------------------------------------

describe('formatSignedMillion', () => {
  it('formats -8 as -$8M', () => {
    expect(formatSignedMillion(-8)).toBe('-$8M');
  });

  it('formats 5 as +$5M', () => {
    expect(formatSignedMillion(5)).toBe('+$5M');
  });

  it('formats 0 as $0M without sign prefix', () => {
    expect(formatSignedMillion(0)).toBe('$0M');
  });
});

// ---------------------------------------------------------------------------
// formatSignedPercent
// ---------------------------------------------------------------------------

describe('formatSignedPercent', () => {
  it('formats -0.136 as 13.6% below', () => {
    expect(formatSignedPercent(-0.136)).toBe('13.6% below');
  });

  it('formats 0.071 as 7.1% above', () => {
    expect(formatSignedPercent(0.071)).toBe('7.1% above');
  });

  it('returns null for null input', () => {
    expect(formatSignedPercent(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatForecastSeriesName
// ---------------------------------------------------------------------------

describe('formatForecastSeriesName', () => {
  it.each([
    ['constructionNav', 'Construction Plan NAV'],
    ['actualNav', 'Actual NAV'],
    ['currentForecastNav', 'Current Forecast NAV'],
    ['constructionCalledCapital', 'Construction Plan Called Capital'],
    ['actualCalledCapital', 'Actual Called Capital'],
    ['currentForecastCalledCapital', 'Current Forecast Called Capital'],
  ])('labels %s as %s', (key, label) => {
    expect(formatForecastSeriesName(key)).toBe(label);
  });

  it('falls back to String(name) for unknown string keys', () => {
    expect(formatForecastSeriesName('unknownKey')).toBe('unknownKey');
  });

  it('falls back to String(name) for numeric Recharts names', () => {
    expect(formatForecastSeriesName(42)).toBe('42');
  });

  it('returns empty string for undefined', () => {
    expect(formatForecastSeriesName(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// describeDriftDirection
// ---------------------------------------------------------------------------

describe('describeDriftDirection', () => {
  it('returns above for positive values', () => {
    expect(describeDriftDirection(5)).toBe('above');
  });

  it('returns below for negative values', () => {
    expect(describeDriftDirection(-3)).toBe('below');
  });

  it('returns in line with for zero', () => {
    expect(describeDriftDirection(0)).toBe('in line with');
  });
});

// ---------------------------------------------------------------------------
// formatMillionValue
// ---------------------------------------------------------------------------

describe('formatMillionValue', () => {
  it('formats a plain number as $NM', () => {
    expect(formatMillionValue(59)).toBe('$59M');
  });

  it('formats a string number as $NM', () => {
    expect(formatMillionValue('51')).toBe('$51M');
  });

  it('returns empty string for undefined', () => {
    expect(formatMillionValue(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildAttributionRows (ADR-029/030 disclosure join)
// ---------------------------------------------------------------------------

const INPUT_HASH = 'a'.repeat(64);

function factsCompany(
  overrides: Partial<DualForecastActualsFactsCompany> &
    Pick<DualForecastActualsFactsCompany, 'companyId' | 'companyName' | 'trustState'>
): DualForecastActualsFactsCompany {
  return {
    planningFmvStatus: 'active',
    currency: 'USD',
    currencyStatus: 'base_currency',
    activeRoundIds: [],
    supersedeLineage: [],
    latestRoundDate: null,
    latestRoundValuation: null,
    latestPlanningFmvDate: null,
    latestPlanningFmvValue: null,
    warnings: [],
    ...overrides,
  };
}

function anchorCompany(
  overrides: Partial<DualForecastNavAnchorCompany> &
    Pick<DualForecastNavAnchorCompany, 'companyId' | 'companyName'>
): DualForecastNavAnchorCompany {
  return {
    inNavUniverse: true,
    trustState: 'LIVE',
    anchor: 'planning_fmv',
    contribution: '1000000',
    ...overrides,
  };
}

function makeNavAnchoring(
  companies: DualForecastNavAnchorCompany[],
  counts?: Partial<DualForecastTrustCounts>
): DualForecastNavAnchoring {
  return DualForecastNavAnchoringSchema.parse({
    blendedNav: '47500000',
    countsByTrustState: { LIVE: 0, PARTIAL: 0, UNAVAILABLE: 0, FAILED: 0, ...counts },
    companies,
  });
}

function makeActualsFacts(companies: DualForecastActualsFactsCompany[]): DualForecastActualsFacts {
  return DualForecastActualsFactsSchema.parse({
    asOfDate: '2026-07-01',
    generatedAt: '2026-07-01T00:00:00.000Z',
    inputHash: INPUT_HASH,
    companies,
    warnings: [],
  });
}

// Adversarial PARTIAL: sparse-marks company (PLANNING_FMV_MISSING) — the
// dominant expected state on sparse funds.
const PARTIAL_FACTS = factsCompany({
  companyId: 2,
  companyName: 'Beta Health',
  trustState: 'PARTIAL',
  planningFmvStatus: 'none',
  warnings: [
    {
      code: 'PLANNING_FMV_MISSING',
      severity: 'warning',
      message: 'Planning FMV mark missing; descended to recorded valuation.',
    },
  ],
});

// Adversarial currency-blocked: monetary values refused, round identity and
// lineage still disclosed (ADR-032 decision 1).
const BLOCKED_FACTS = factsCompany({
  companyId: 3,
  companyName: 'Gamma Robotics',
  trustState: 'UNAVAILABLE',
  currency: 'EUR',
  currencyStatus: 'mismatch_blocked',
  activeRoundIds: [7],
  supersedeLineage: [{ roundId: 7, supersedesRoundId: null }],
  latestRoundDate: '2026-05-01',
  latestRoundValuation: '15000000',
  warnings: [
    {
      code: 'CURRENCY_MISMATCH_BLOCK',
      severity: 'blocking',
      message: 'EUR valuation blocked pending currency normalization.',
    },
  ],
});

describe('buildAttributionRows', () => {
  it('returns an empty array when navAnchoring is null', () => {
    expect(buildAttributionRows(null, makeActualsFacts([PARTIAL_FACTS]))).toEqual([]);
  });

  it('joins facts warnings onto navAnchoring rows by companyId', () => {
    const rows = buildAttributionRows(
      makeNavAnchoring([
        anchorCompany({ companyId: 2, companyName: 'Beta Health', trustState: 'PARTIAL' }),
      ]),
      makeActualsFacts([PARTIAL_FACTS])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.warnings.map((warning) => warning.code)).toEqual(['PLANNING_FMV_MISSING']);
  });

  it('navAnchoring name and trustState win over the facts entry', () => {
    const rows = buildAttributionRows(
      makeNavAnchoring([
        anchorCompany({ companyId: 2, companyName: 'Anchor Name', trustState: 'UNAVAILABLE' }),
      ]),
      makeActualsFacts([PARTIAL_FACTS])
    );
    expect(rows[0]?.companyName).toBe('Anchor Name');
    expect(rows[0]?.trustState).toBe('UNAVAILABLE');
  });

  it('excludes facts-only companies (navAnchoring is the authoritative universe)', () => {
    const rows = buildAttributionRows(
      makeNavAnchoring([anchorCompany({ companyId: 1, companyName: 'Alpha' })]),
      makeActualsFacts([PARTIAL_FACTS])
    );
    expect(rows.map((row) => row.companyId)).toEqual([1]);
  });

  it('first entry wins on duplicate companyId', () => {
    const rows = buildAttributionRows(
      makeNavAnchoring([
        anchorCompany({ companyId: 1, companyName: 'First', trustState: 'PARTIAL' }),
        anchorCompany({ companyId: 1, companyName: 'Second', trustState: 'FAILED' }),
      ]),
      null
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.companyName).toBe('First');
  });

  it('sorts non-LIVE first, then no-facts, then LIVE, then exited — stable by name', () => {
    const rows = buildAttributionRows(
      makeNavAnchoring([
        anchorCompany({ companyId: 1, companyName: 'Alpha', trustState: 'LIVE' }),
        anchorCompany({
          companyId: 4,
          companyName: 'Aaron Exited',
          inNavUniverse: false,
          trustState: null,
          anchor: null,
          contribution: null,
        }),
        anchorCompany({
          companyId: 5,
          companyName: 'Beta NoFacts',
          trustState: null,
          anchor: 'legacy_current_valuation',
        }),
        anchorCompany({ companyId: 6, companyName: 'Zed Partial', trustState: 'PARTIAL' }),
        anchorCompany({ companyId: 7, companyName: 'Ada Partial', trustState: 'PARTIAL' }),
      ]),
      null
    );
    expect(rows.map((row) => row.companyName)).toEqual([
      'Ada Partial',
      'Zed Partial',
      'Beta NoFacts',
      'Alpha',
      'Aaron Exited',
    ]);
  });

  it('handles the currency-blocked company with lineage disclosed and money withheld', () => {
    const rows = buildAttributionRows(
      makeNavAnchoring([
        anchorCompany({
          companyId: 3,
          companyName: 'Gamma Robotics',
          trustState: 'UNAVAILABLE',
          anchor: 'legacy_current_valuation',
        }),
      ]),
      makeActualsFacts([BLOCKED_FACTS])
    );
    expect(rows[0]?.trustState).toBe('UNAVAILABLE');
    expect(rows[0]?.warnings.map((warning) => warning.code)).toEqual(['CURRENCY_MISMATCH_BLOCK']);
  });
});

describe('filterAttributionRows and countNoFactsRows', () => {
  const rows = buildAttributionRows(
    makeNavAnchoring([
      anchorCompany({ companyId: 1, companyName: 'Alpha', trustState: 'LIVE' }),
      anchorCompany({ companyId: 2, companyName: 'Beta', trustState: 'PARTIAL' }),
      anchorCompany({
        companyId: 3,
        companyName: 'Gamma',
        trustState: null,
        anchor: 'legacy_current_valuation',
      }),
      anchorCompany({
        companyId: 4,
        companyName: 'Delta Exited',
        inNavUniverse: false,
        trustState: null,
        anchor: null,
        contribution: null,
      }),
    ]),
    null
  );

  it('returns all rows for a null filter', () => {
    expect(filterAttributionRows(rows, null)).toHaveLength(4);
  });

  it('filters by trust state value, not row index', () => {
    expect(filterAttributionRows(rows, 'PARTIAL').map((row) => row.companyName)).toEqual(['Beta']);
  });

  it('NO_FACTS matches every trustState:null row, including exited', () => {
    expect(filterAttributionRows(rows, 'NO_FACTS').map((row) => row.companyName)).toEqual([
      'Gamma',
      'Delta Exited',
    ]);
  });

  it('countNoFactsRows equals the NO_FACTS filter size (D2: chip totals equal rows)', () => {
    expect(countNoFactsRows(rows)).toBe(filterAttributionRows(rows, 'NO_FACTS').length);
  });
});

// ---------------------------------------------------------------------------
// Disclosure copy map
// ---------------------------------------------------------------------------

describe('disclosure copy map', () => {
  it('labels the five chip states in Title case, never the ALL-CAPS enum', () => {
    expect(TRUST_STATE_COPY.LIVE.label).toBe('Live');
    expect(TRUST_STATE_COPY.PARTIAL.label).toBe('Partial');
    expect(TRUST_STATE_COPY.UNAVAILABLE.label).toBe('Unavailable');
    expect(TRUST_STATE_COPY.FAILED.label).toBe('Failed');
    expect(TRUST_STATE_COPY.NO_FACTS.label).toBe('No facts');
  });

  it('escalates only FAILED to the LP-sharing review line', () => {
    expect(TRUST_STATE_COPY.FAILED.description).toContain('Review before LP sharing.');
    expect(TRUST_STATE_COPY.PARTIAL.description).not.toContain('Review before LP sharing.');
  });

  it('names the legacy rung "Recorded valuation (legacy)" — one name across surfaces', () => {
    expect(ANCHOR_RUNG_COPY.legacy_current_valuation.label).toBe('Recorded valuation (legacy)');
    expect(ANCHOR_RUNG_COPY.legacy_current_valuation_ownership_scaled.label).toBe(
      'Recorded valuation x recorded ownership (legacy)'
    );
    expect(ANCHOR_RUNG_COPY.legacy_current_valuation_ownership_scaled.tooltip).toContain(
      'never estimated or defaulted'
    );
    expect(ANCHOR_RUNG_COPY.planning_fmv_stale.label).toBe('Planning FMV (stale)');
    expect(ANCHOR_RUNG_COPY.none.label).toBe('None (zero)');
  });
});

describe('buildAttributionSummary', () => {
  const counts = (partial: number, unavailable = 0, failed = 0): DualForecastTrustCounts => ({
    LIVE: 0,
    PARTIAL: partial,
    UNAVAILABLE: unavailable,
    FAILED: failed,
  });

  it('returns the expected-state copy when PARTIAL covers at least half the universe', () => {
    expect(buildAttributionSummary(counts(2), 4)).toBe(PARTIAL_DOMINATED_COPY);
  });

  it('appends the review escalation only when a blocked or failed row exists', () => {
    expect(buildAttributionSummary(counts(2, 1), 4)).toBe(
      `${PARTIAL_DOMINATED_COPY} ${REVIEW_ROWS_FIRST_COPY}`
    );
  });

  it('returns null below the threshold and for an empty universe', () => {
    expect(buildAttributionSummary(counts(1), 4)).toBeNull();
    expect(buildAttributionSummary(counts(0), 0)).toBeNull();
  });
});

describe('disclosure formatters', () => {
  it('formatDecimalMillions parses decimal strings through the guard', () => {
    expect(formatDecimalMillions('47500000')).toBe('$48M');
    expect(formatDecimalMillions(null)).toBe('—');
    expect(formatDecimalMillions('not-a-number')).toBe('—');
  });

  it('formatFactsFreshness shows the asOfDate and an 8-char hash prefix', () => {
    expect(formatFactsFreshness('2026-07-01', INPUT_HASH)).toBe(
      'Facts as of 2026-07-01 · input aaaaaaaa'
    );
  });

  it('formatFilterStatus and formatChipAriaLabel compose the filter strings', () => {
    expect(formatFilterStatus(3, 12)).toBe('Showing 3 of 12 companies');
    expect(formatChipAriaLabel(9, 'PARTIAL')).toBe('Filter to 9 partial companies');
    expect(formatChipAriaLabel(2, 'NO_FACTS')).toBe('Filter to 2 no facts companies');
  });
});
