import type { DualForecastPoint } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';

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

function toPercentDelta(currentValue: number, constructionValue: number): number | null {
  if (constructionValue === 0) {
    return null;
  }

  return (currentValue - constructionValue) / constructionValue;
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

export function buildForecastChartPoints(series: DualForecastPoint[]): ForecastChartPoint[] {
  return series.map((point) => {
    const isForecast = point.currentMode === 'forecast';
    const navRawDelta = point.current.nav - point.construction.nav;
    const calledCapitalRawDelta = point.current.calledCapital - point.construction.calledCapital;

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
      navDelta: isForecast ? toRoundedMillions(navRawDelta) : null,
      navDeltaPct: isForecast ? toPercentDelta(point.current.nav, point.construction.nav) : null,
      calledCapitalDelta: isForecast ? toRoundedMillions(calledCapitalRawDelta) : null,
      calledCapitalDeltaPct: isForecast
        ? toPercentDelta(point.current.calledCapital, point.construction.calledCapital)
        : null,
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
