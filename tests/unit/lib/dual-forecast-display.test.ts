import { describe, expect, it } from 'vitest';
import type { DualForecastPoint } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import {
  buildForecastChartPoints,
  describeDriftDirection,
  formatForecastSeriesName,
  formatMillionValue,
  formatSignedMillion,
  formatSignedPercent,
  getLatestForecastDrift,
} from '@/lib/dual-forecast-display';

// All fixtures are inline -- not shared with dual-forecast-dashboard.test.tsx

const M = 1_000_000;

function metrics(nav: number, calledCapital: number) {
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
  return {
    quarterIndex: qi,
    label,
    date: '2026-01-01T00:00:00.000Z',
    construction: metrics(constructionNav, constructionCalled),
    actual: metrics(actualNav, actualCalled),
    currentMode: 'actual',
    current: metrics(actualNav, actualCalled),
  };
}

function forecastPoint(
  label: string,
  qi: number,
  constructionNav: number,
  constructionCalled: number,
  currentNav: number,
  currentCalled: number
): DualForecastPoint {
  return {
    quarterIndex: qi,
    label,
    date: '2026-01-01T00:00:00.000Z',
    construction: metrics(constructionNav, constructionCalled),
    actual: null,
    currentMode: 'forecast',
    current: metrics(currentNav, currentCalled),
  };
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

  it('sets delta fields to null for actual points', () => {
    const [point] = buildForecastChartPoints([
      actualPoint('Q1 2026', 0, 20 * M, 15 * M, 21 * M, 15 * M),
    ]);
    expect(point.navDelta).toBeNull();
    expect(point.navDeltaPct).toBeNull();
    expect(point.calledCapitalDelta).toBeNull();
    expect(point.calledCapitalDeltaPct).toBeNull();
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
