/**
 * Chart Theme Provider
 *
 * React context provider for brand-consistent chart theming.
 */

import React, { createContext, useState, useCallback, useMemo } from 'react';
import { CHART_THEMES, getChartColors, getChartColorAtIndex } from './brand-chart-theme';
import type {
  BrandChartTheme,
  ChartColorMode,
  ChartColorScheme,
  ChartThemeContextValue,
  RechartsThemeConfig,
  NivoThemeConfig,
} from './types';

export const ChartThemeContext = createContext<ChartThemeContextValue | null>(null);

interface BrandChartThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ChartColorMode;
  defaultScheme?: ChartColorScheme;
}

export function BrandChartThemeProvider({
  children,
  defaultMode = 'light',
  defaultScheme = 'press-on',
}: BrandChartThemeProviderProps): React.ReactElement {
  const [colorMode, setColorMode] = useState<ChartColorMode>(defaultMode);
  const [scheme, setScheme] = useState<ChartColorScheme>(defaultScheme);

  const theme: BrandChartTheme = CHART_THEMES[colorMode];

  const getRechartsColor = useCallback(
    (index: number): string => {
      return getChartColorAtIndex(theme, index);
    },
    [theme]
  );

  const getNivoColors = useCallback((): string[] => {
    return getChartColors(theme);
  }, [theme]);

  const getRechartsTheme = useCallback((): RechartsThemeConfig => {
    return theme.recharts || {};
  }, [theme]);

  const getNivoTheme = useCallback((): NivoThemeConfig => {
    return theme.nivo || {};
  }, [theme]);

  const value = useMemo<ChartThemeContextValue>(
    () => ({
      theme,
      colorMode,
      scheme,
      setColorMode,
      setScheme,
      getRechartsColor,
      getNivoColors,
      getRechartsTheme,
      getNivoTheme,
    }),
    [theme, colorMode, scheme, getRechartsColor, getNivoColors, getRechartsTheme, getNivoTheme]
  );

  return <ChartThemeContext.Provider value={value}>{children}</ChartThemeContext.Provider>;
}

export default BrandChartThemeProvider;
