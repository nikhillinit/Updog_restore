/**
 * Brand Chart Theme Definitions
 *
 * Press On Ventures branded theme for all chart components.
 * Derives colors from brand-tokens.ts.
 */

import { colors, chart as chartTokens } from '@/lib/brand-tokens';
import type { BrandChartTheme, ChartPalette } from './types';

/**
 * Press On Ventures color palette for charts
 */
const POV_PALETTE: ChartPalette = {
  primary: [
    { fill: colors.dark, stroke: colors.dark },
    { fill: colors.beige, stroke: colors.beige },
    { fill: '#666666', stroke: '#666666' },
    { fill: '#999999', stroke: '#999999' },
    { fill: '#CCCCCC', stroke: '#CCCCCC' },
  ],
  secondary: [
    { fill: '#4A4A4A', stroke: '#4A4A4A' },
    { fill: '#B8AFA8', stroke: '#B8AFA8' },
    { fill: '#7D7D7D', stroke: '#7D7D7D' },
    { fill: '#B3B3B3', stroke: '#B3B3B3' },
    { fill: '#D9D9D9', stroke: '#D9D9D9' },
  ],
  status: {
    success: { fill: '#10b981', stroke: '#10b981' },
    warning: { fill: '#f59e0b', stroke: '#f59e0b' },
    error: { fill: '#ef4444', stroke: '#ef4444' },
    info: { fill: '#3b82f6', stroke: '#3b82f6' },
  },
};

/**
 * Light mode theme (default)
 */
export const BRAND_CHART_THEME_LIGHT: BrandChartTheme = {
  mode: 'light',
  scheme: 'press-on',
  palette: POV_PALETTE,

  recharts: {
    cartesianGrid: {
      stroke: chartTokens.grid.color,
      strokeDasharray: chartTokens.grid.dashArray,
    },
    xAxis: {
      stroke: chartTokens.axis.color,
      fontSize: chartTokens.axis.fontSize,
    },
    yAxis: {
      stroke: chartTokens.axis.color,
      fontSize: chartTokens.axis.fontSize,
    },
    tooltip: {
      backgroundColor: chartTokens.tooltip.background,
      textColor: chartTokens.tooltip.textColor,
      borderRadius: chartTokens.tooltip.borderRadius,
    },
    legend: {
      color: chartTokens.legend.color,
      fontSize: chartTokens.legend.fontSize,
    },
  },

  nivo: {
    background: '#FFFFFF',
    text: {
      fontSize: 12,
      color: colors.dark,
    },
    axis: {
      strokeWidth: 1,
      color: colors.dark,
    },
    grid: {
      stroke: chartTokens.grid.color,
      strokeDasharray: chartTokens.grid.dashArray,
    },
  },
};

/**
 * Dark mode theme
 */
export const BRAND_CHART_THEME_DARK: BrandChartTheme = {
  mode: 'dark',
  scheme: 'press-on',
  palette: {
    primary: [
      { fill: '#FFFFFF', stroke: '#FFFFFF' },
      { fill: colors.beige, stroke: colors.beige },
      { fill: '#AAAAAA', stroke: '#AAAAAA' },
      { fill: '#888888', stroke: '#888888' },
      { fill: '#666666', stroke: '#666666' },
    ],
    secondary: [
      { fill: '#4A4A4A', stroke: '#4A4A4A' },
      { fill: '#B8AFA8', stroke: '#B8AFA8' },
      { fill: '#7D7D7D', stroke: '#7D7D7D' },
      { fill: '#B3B3B3', stroke: '#B3B3B3' },
      { fill: '#D9D9D9', stroke: '#D9D9D9' },
    ],
    status: {
      success: { fill: '#10b981', stroke: '#10b981' },
      warning: { fill: '#f59e0b', stroke: '#f59e0b' },
      error: { fill: '#ef4444', stroke: '#ef4444' },
      info: { fill: '#3b82f6', stroke: '#3b82f6' },
    },
  },

  recharts: {
    cartesianGrid: {
      stroke: '#444444',
      strokeDasharray: chartTokens.grid.dashArray,
    },
    xAxis: {
      stroke: '#AAAAAA',
      fontSize: chartTokens.axis.fontSize,
    },
    yAxis: {
      stroke: '#AAAAAA',
      fontSize: chartTokens.axis.fontSize,
    },
    tooltip: {
      backgroundColor: '#1a1a1a',
      textColor: '#FFFFFF',
      borderRadius: chartTokens.tooltip.borderRadius,
    },
    legend: {
      color: '#FFFFFF',
      fontSize: chartTokens.legend.fontSize,
    },
  },

  nivo: {
    background: '#1a1a1a',
    text: {
      fontSize: 12,
      color: '#FFFFFF',
    },
    axis: {
      strokeWidth: 1,
      color: '#AAAAAA',
    },
    grid: {
      stroke: '#444444',
      strokeDasharray: chartTokens.grid.dashArray,
    },
  },
};

/**
 * Theme registry
 */
export const CHART_THEMES = {
  light: BRAND_CHART_THEME_LIGHT,
  dark: BRAND_CHART_THEME_DARK,
} as const;

/**
 * Get primary colors as simple string array (for Recharts/Nivo)
 */
export function getChartColors(theme: BrandChartTheme): string[] {
  return theme.palette.primary.map((token) => token.fill);
}

/**
 * Get color at specific index (wraps around)
 */
export function getChartColorAtIndex(theme: BrandChartTheme, index: number): string {
  const paletteColors = theme.palette.primary;
  if (paletteColors.length === 0) {
    return colors.dark; // Fallback to brand dark color
  }
  const token = paletteColors[index % paletteColors.length];
  return token?.fill ?? colors.dark;
}
