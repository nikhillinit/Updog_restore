/**
 * Recharts Props Utilities
 *
 * Pre-configured props objects for Recharts components that implement
 * the Press On Ventures brand theme. Use these to ensure consistent
 * styling across all charts.
 *
 * Usage:
 * ```tsx
 * import { rechartsProps } from '@/lib/chart-theme';
 *
 * <LineChart data={data}>
 *   <CartesianGrid {...rechartsProps.cartesianGrid} />
 *   <XAxis {...rechartsProps.xAxis} />
 *   <YAxis {...rechartsProps.yAxis} />
 *   <Tooltip {...rechartsProps.tooltip()} />
 *   <Legend {...rechartsProps.legend} />
 *   <Line {...rechartsProps.line(0)} />
 *   <Line {...rechartsProps.line(1)} />
 * </LineChart>
 * ```
 */

import { colors, chart as chartTokens } from '@/lib/brand-tokens';

/**
 * Brand color palette for chart lines/bars
 */
export const CHART_COLORS = [
  colors.dark, // #292929
  colors.beige, // #E0D8D1
  '#666666',
  '#999999',
  '#CCCCCC',
] as const;

/**
 * Status colors for indicators
 */
export const STATUS_COLORS = {
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
} as const;

/**
 * Get chart color by index (wraps around)
 */
export function getChartColor(index: number): string {
  const colorIndex = index % CHART_COLORS.length;
  return CHART_COLORS[colorIndex] ?? colors.dark;
}

/**
 * All allowed brand colors (for compliance checking)
 */
const ALLOWED_COLORS = new Set([
  ...CHART_COLORS,
  ...Object.values(STATUS_COLORS),
  colors.dark,
  colors.beige,
  colors.white,
  colors.light,
  colors.darkMuted,
]);

/**
 * Check if a color is in the brand palette
 */
export function isColorCompliant(color: string): boolean {
  const normalized = color.toLowerCase();
  // Check both the exact value and common variations
  for (const allowed of ALLOWED_COLORS) {
    if (allowed.toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

/**
 * CartesianGrid props for brand consistency
 */
export const cartesianGridProps = {
  stroke: chartTokens.grid.color,
  strokeDasharray: chartTokens.grid.dashArray,
  vertical: false as const,
};

/**
 * XAxis props for brand consistency
 */
export const xAxisProps = {
  stroke: chartTokens.axis.color,
  fontSize: chartTokens.axis.fontSize,
  tickLine: { stroke: chartTokens.axis.color },
  axisLine: { stroke: chartTokens.axis.color },
};

/**
 * YAxis props for brand consistency
 */
export const yAxisProps = {
  stroke: chartTokens.axis.color,
  fontSize: chartTokens.axis.fontSize,
  tickLine: { stroke: chartTokens.axis.color },
  axisLine: { stroke: chartTokens.axis.color },
};

/**
 * Tooltip content style for brand consistency
 */
export function tooltipProps(options?: {
  backgroundColor?: string;
  borderColor?: string;
}) {
  const bg = options?.backgroundColor ?? chartTokens.tooltip.background;
  const border = options?.borderColor ?? colors.beige;

  return {
    contentStyle: {
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: chartTokens.tooltip.borderRadius,
      color: chartTokens.tooltip.textColor,
      fontFamily: 'Inter, sans-serif',
      fontSize: '12px',
    },
    labelStyle: {
      color: colors.dark,
      fontWeight: 600,
      marginBottom: '4px',
    },
  };
}

/**
 * Legend props for brand consistency
 */
export const legendProps = {
  wrapperStyle: {
    color: chartTokens.legend.color,
    fontSize: chartTokens.legend.fontSize,
  },
};

/**
 * Line props factory for brand colors
 */
export function lineProps(index: number, options?: {
  type?: 'monotone' | 'linear' | 'step';
  strokeWidth?: number;
  dot?: boolean;
  activeDot?: boolean | object;
}) {
  const color = getChartColor(index);
  return {
    type: options?.type ?? ('monotone' as const),
    stroke: color,
    strokeWidth: options?.strokeWidth ?? 2,
    dot: options?.dot ?? false,
    activeDot: options?.activeDot ?? { r: 6, stroke: color, strokeWidth: 2, fill: colors.white },
  };
}

/**
 * Area props factory for brand colors
 */
export function areaProps(index: number, options?: {
  type?: 'monotone' | 'linear' | 'step';
  fillOpacity?: number;
}) {
  const color = getChartColor(index);
  return {
    type: options?.type ?? ('monotone' as const),
    stroke: color,
    fill: color,
    fillOpacity: options?.fillOpacity ?? 0.1,
  };
}

/**
 * Bar props factory for brand colors
 */
export function barProps(index: number, options?: {
  radius?: [number, number, number, number];
}) {
  const color = getChartColor(index);
  return {
    fill: color,
    radius: options?.radius ?? ([2, 2, 0, 0] as [number, number, number, number]),
  };
}

/**
 * Pie/Cell props factory for brand colors
 */
export function pieProps(options?: {
  innerRadius?: number;
  outerRadius?: number;
}) {
  return {
    innerRadius: options?.innerRadius ?? 0,
    outerRadius: options?.outerRadius ?? 80,
    dataKey: 'value',
  };
}

/**
 * Get array of cell colors for Pie charts
 */
export function getCellColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => getChartColor(i));
}

/**
 * Reference line props for brand consistency
 */
export const referenceLineProps = {
  stroke: colors.beige,
  strokeDasharray: '5 5',
  strokeWidth: 1,
};

/**
 * ReferenceLine for zero/baseline
 */
export const baselineReferenceLineProps = {
  stroke: colors.dark,
  strokeWidth: 1,
};

/**
 * Aggregated props object for easy import
 */
export const rechartsProps = {
  cartesianGrid: cartesianGridProps,
  xAxis: xAxisProps,
  yAxis: yAxisProps,
  tooltip: tooltipProps,
  legend: legendProps,
  line: lineProps,
  area: areaProps,
  bar: barProps,
  pie: pieProps,
  getCellColors,
  referenceLine: referenceLineProps,
  baselineLine: baselineReferenceLineProps,
  getColor: getChartColor,
  colors: CHART_COLORS,
  statusColors: STATUS_COLORS,
} as const;

/**
 * Apply theme to a Recharts component
 *
 * Helper to migrate existing charts by providing themed props.
 *
 * @example
 * ```tsx
 * // Before
 * <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
 *
 * // After
 * <CartesianGrid {...applyTheme('grid')} />
 * ```
 */
export function applyTheme(
  component: 'grid' | 'xAxis' | 'yAxis' | 'tooltip' | 'legend'
): Record<string, unknown> {
  switch (component) {
    case 'grid':
      return cartesianGridProps;
    case 'xAxis':
      return xAxisProps;
    case 'yAxis':
      return yAxisProps;
    case 'tooltip':
      return tooltipProps();
    case 'legend':
      return legendProps;
    default:
      return {};
  }
}

export default rechartsProps;
