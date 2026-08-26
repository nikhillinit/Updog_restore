/**
 * Chart Theme Types
 *
 * Unified type definitions for brand-consistent chart theming.
 */

export type ChartColorScheme = 'press-on' | 'neutral' | 'accent' | 'status';
export type ChartColorMode = 'light' | 'dark';

/**
 * Color token for a single data series
 */
export interface ChartColorToken {
  fill: string;
  stroke?: string;
  fillOpacity?: number;
  opacity?: number;
}

/**
 * Complete color palette for charts
 */
export interface ChartPalette {
  /** Primary colors for main data series */
  primary: ChartColorToken[];
  /** Secondary colors for additional series */
  secondary?: ChartColorToken[];
  /** Status colors for indicators */
  status?: {
    success: ChartColorToken;
    warning: ChartColorToken;
    error: ChartColorToken;
    info: ChartColorToken;
  };
}

/**
 * Recharts-specific theme configuration
 */
export interface RechartsThemeConfig {
  cartesianGrid?: {
    stroke: string;
    strokeDasharray?: string;
  };
  xAxis?: {
    stroke: string;
    fontSize: number;
  };
  yAxis?: {
    stroke: string;
    fontSize: number;
  };
  tooltip?: {
    backgroundColor: string;
    textColor: string;
    borderRadius: number;
  };
  legend?: {
    color: string;
    fontSize: number;
  };
}

/**
 * Nivo-specific theme configuration
 */
export interface NivoThemeConfig {
  background?: string;
  text?: {
    fontSize: number;
    color: string;
  };
  axis?: {
    strokeWidth: number;
    color: string;
  };
  grid?: {
    stroke: string;
    strokeDasharray: string;
  };
}

/**
 * Complete brand chart theme
 */
export interface BrandChartTheme {
  mode: ChartColorMode;
  scheme: ChartColorScheme;
  palette: ChartPalette;
  recharts?: RechartsThemeConfig;
  nivo?: NivoThemeConfig;
}

/**
 * Chart theme context value
 */
export interface ChartThemeContextValue {
  theme: BrandChartTheme;
  colorMode: ChartColorMode;
  scheme: ChartColorScheme;
  setColorMode: (mode: ChartColorMode) => void;
  setScheme: (scheme: ChartColorScheme) => void;
  /** Get color for Recharts components */
  getRechartsColor: (index: number) => string;
  /** Get colors array for Nivo */
  getNivoColors: () => string[];
  /** Get Recharts theme props */
  getRechartsTheme: () => RechartsThemeConfig;
  /** Get Nivo theme */
  getNivoTheme: () => NivoThemeConfig;
}
