export type DualForecastConfigSource =
  | 'published'
  | 'legacy_default_no_published_config'
  | 'legacy_default_invalid_config'
  | 'legacy_default_missing_target_metrics';

export interface DualForecastConfigMetadata {
  source: DualForecastConfigSource;
  version: number | null;
  publishedAt: string | null;
  fallbackReason: string | null;
}

export interface DualForecastSourceMetadata {
  construction: 'construction_forecast_jcurve';
  current: 'projected_metrics_calculator';
  actual: 'actual_metrics_calculator';
}

export interface DualForecastMetrics {
  nav: number;
  calledCapital: number;
  distributions: number;
  tvpi: number | null;
  dpi: number | null;
  rvpi: number | null;
  irr: number | null;
}

export interface DualForecastPoint {
  quarterIndex: number;
  label: string;
  date: string;
  construction: DualForecastMetrics;
  current: DualForecastMetrics;
}

export interface DualForecastResponse {
  fundId: number;
  fundName: string;
  asOfDate: string;
  series: DualForecastPoint[];
  sources: DualForecastSourceMetadata;
  config: DualForecastConfigMetadata;
  warnings: string[];
}
