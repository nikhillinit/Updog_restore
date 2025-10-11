// Single canonical chart shape for the app.
export type ChartPoint = { x: number | string; y: number; series?: string };

// Use this type in chart props to eliminate cross-component drift.
export type ChartDataInput = ChartPoint[];
