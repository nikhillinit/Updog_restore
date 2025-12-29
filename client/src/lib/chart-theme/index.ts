/**
 * Chart Theme - Public Exports
 */

// Provider
export { BrandChartThemeProvider, ChartThemeContext } from './chart-theme-provider';

// Hooks
export { useChartTheme, useRechartsTheme, useNivoTheme, useStatusColors } from './hooks';

// Theme definitions
export {
  BRAND_CHART_THEME_LIGHT,
  BRAND_CHART_THEME_DARK,
  CHART_THEMES,
  getChartColors,
  getChartColorAtIndex,
} from './brand-chart-theme';

// Types
export type {
  BrandChartTheme,
  ChartColorMode,
  ChartColorScheme,
  ChartColorToken,
  ChartPalette,
  ChartThemeContextValue,
  RechartsThemeConfig,
  NivoThemeConfig,
} from './types';

// Recharts props utilities
export {
  rechartsProps,
  CHART_COLORS,
  STATUS_COLORS,
  getChartColor,
  isColorCompliant,
  cartesianGridProps,
  xAxisProps,
  yAxisProps,
  tooltipProps,
  legendProps,
  lineProps,
  areaProps,
  barProps,
  pieProps,
  getCellColors,
  referenceLineProps,
  baselineReferenceLineProps,
  applyTheme,
} from './recharts-props';
