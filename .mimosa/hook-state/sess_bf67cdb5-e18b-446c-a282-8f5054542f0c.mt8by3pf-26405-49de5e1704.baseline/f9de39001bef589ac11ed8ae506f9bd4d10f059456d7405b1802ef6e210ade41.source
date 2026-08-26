/**
 * Chart Theme Hooks
 *
 * Custom hooks for accessing chart theme in components.
 */

import { useContext } from 'react';
import { ChartThemeContext } from './chart-theme-provider';
import type { ChartThemeContextValue, RechartsThemeConfig, NivoThemeConfig } from './types';

/**
 * Main hook for accessing chart theme
 *
 * @throws Error if used outside BrandChartThemeProvider
 */
export function useChartTheme(): ChartThemeContextValue {
  const context = useContext(ChartThemeContext);

  if (!context) {
    throw new Error('useChartTheme must be used within <BrandChartThemeProvider>');
  }

  return context;
}

/**
 * Convenience hook for Recharts-specific theming
 *
 * @example
 * ```tsx
 * function MyChart() {
 *   const { grid, xAxis, yAxis, tooltip, getColor } = useRechartsTheme();
 *
 *   return (
 *     <LineChart data={data}>
 *       <CartesianGrid {...grid} />
 *       <XAxis {...xAxis} />
 *       <YAxis {...yAxis} />
 *       <Tooltip contentStyle={tooltip} />
 *       <Line stroke={getColor(0)} dataKey="value" />
 *     </LineChart>
 *   );
 * }
 * ```
 */
export function useRechartsTheme(): {
  grid: RechartsThemeConfig['cartesianGrid'];
  xAxis: RechartsThemeConfig['xAxis'];
  yAxis: RechartsThemeConfig['yAxis'];
  tooltip: { backgroundColor: string; color: string; borderRadius: number } | undefined;
  legend: RechartsThemeConfig['legend'];
  getColor: (index: number) => string;
  colors: string[];
} {
  const { theme, getRechartsColor, getNivoColors } = useChartTheme();
  const rechartsTheme = theme.recharts;

  return {
    grid: rechartsTheme?.cartesianGrid,
    xAxis: rechartsTheme?.xAxis,
    yAxis: rechartsTheme?.yAxis,
    tooltip: rechartsTheme?.tooltip
      ? {
          backgroundColor: rechartsTheme.tooltip.backgroundColor,
          color: rechartsTheme.tooltip.textColor,
          borderRadius: rechartsTheme.tooltip.borderRadius,
        }
      : undefined,
    legend: rechartsTheme?.legend,
    getColor: getRechartsColor,
    colors: getNivoColors(), // Same colors work for both
  };
}

/**
 * Convenience hook for Nivo-specific theming
 *
 * @example
 * ```tsx
 * function MyNivoChart() {
 *   const { colors, theme } = useNivoTheme();
 *
 *   return (
 *     <ResponsiveLine
 *       colors={colors}
 *       theme={{
 *         background: theme.background,
 *         text: theme.text,
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function useNivoTheme(): {
  colors: string[];
  theme: NivoThemeConfig;
} {
  const { getNivoColors, getNivoTheme } = useChartTheme();

  return {
    colors: getNivoColors(),
    theme: getNivoTheme(),
  };
}

/**
 * Hook for getting status colors (success, warning, error, info)
 */
export function useStatusColors(): {
  success: string;
  warning: string;
  error: string;
  info: string;
} {
  const { theme } = useChartTheme();
  const status = theme.palette.status;

  return {
    success: status?.success.fill || '#10b981',
    warning: status?.warning.fill || '#f59e0b',
    error: status?.error.fill || '#ef4444',
    info: status?.info.fill || '#3b82f6',
  };
}
