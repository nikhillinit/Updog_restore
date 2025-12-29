/**
 * Press On Ventures Brand Design Tokens
 * Phase 3A: Foundation - Centralized design token system
 *
 * This module provides programmatic access to all brand values.
 * Use for PDF generation, chart theming, and dynamic styling.
 *
 * Related files:
 * - press-on-theme.ts - Tailwind class utilities
 * - styles/brand-tokens.css - CSS custom properties
 */

// =============================================================================
// Color Tokens
// =============================================================================

export const colors = {
  // Primary palette
  dark: '#292929',      // R41 G41 B41 - Primary text, headers
  beige: '#E0D8D1',     // R224 G216 B209 - Accent, highlights
  white: '#FFFFFF',     // Clean backgrounds
  light: '#F2F2F2',     // R242 G242 B242 - Subtle backgrounds

  // State colors (system)
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Opacity variants
  darkMuted: 'rgba(41, 41, 41, 0.7)',
  darkSubtle: 'rgba(41, 41, 41, 0.6)',
  darkDisabled: 'rgba(41, 41, 41, 0.4)',
  beigeLight: 'rgba(224, 216, 209, 0.2)',
} as const;

// =============================================================================
// Typography Tokens
// =============================================================================

export const typography = {
  fontFamily: {
    heading: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    body: '"Poppins", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  },

  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  fontSize: {
    // Scale in pixels
    xs: 11,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,

    // Print scale in points
    print: {
      body: 11,
      h4: 11,
      h3: 13,
      h2: 16,
      h1: 22,
      caption: 9,
    },
  },

  lineHeight: {
    tight: 1.2,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.6,
  },
} as const;

// =============================================================================
// Spacing Tokens
// =============================================================================

export const spacing = {
  // Base unit: 4px
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,

  // Logo safe zones
  logoSafeZone: 16,      // 1 logo-height equivalent
  iconSafeZone: 8,       // 1/2 icon size

  // Print spacing (points)
  print: {
    margin: 54,          // 0.75in page margin
    gutter: 12,
    section: 16,
  },
} as const;

// =============================================================================
// Border & Radius Tokens
// =============================================================================

export const borders = {
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },

  width: {
    thin: 1,
    medium: 2,
    thick: 4,
  },
} as const;

// =============================================================================
// Shadow Tokens
// =============================================================================

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 2px 12px rgba(0, 0, 0, 0.06)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
  card: '0 2px 12px rgba(0, 0, 0, 0.06)',
  cardHover: '0 8px 24px rgba(0, 0, 0, 0.12)',
  none: 'none',
} as const;

// =============================================================================
// Chart Tokens
// =============================================================================

export const chart = {
  // Sequential color palette for data visualization
  colors: [
    '#292929',  // Primary - most important data
    '#E0D8D1',  // Accent - secondary data
    '#666666',  // Tertiary
    '#999999',  // Quaternary
    '#CCCCCC',  // Quinary
  ],

  // Extended palette for more data series
  colorsExtended: [
    '#292929',
    '#E0D8D1',
    '#666666',
    '#999999',
    '#CCCCCC',
    '#4A4A4A',
    '#B8AFA8',
    '#7D7D7D',
    '#B3B3B3',
    '#D9D9D9',
  ],

  // Grid and axis styling
  grid: {
    color: '#F2F2F2',
    strokeWidth: 1,
    dashArray: '4 4',
  },

  axis: {
    color: '#292929',
    strokeWidth: 1,
    tickSize: 6,
    fontSize: 11,
  },

  // Tooltip styling
  tooltip: {
    background: '#292929',
    textColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
  },

  // Legend styling
  legend: {
    fontSize: 12,
    color: '#292929',
    iconSize: 12,
  },
} as const;

// =============================================================================
// PDF Export Tokens
// =============================================================================

export const pdf = {
  page: {
    width: 612,           // 8.5in in points
    height: 792,          // 11in in points
    marginTop: 54,        // 0.75in
    marginBottom: 54,
    marginLeft: 54,
    marginRight: 54,
  },

  header: {
    height: 60,
    logoWidth: 120,
    fontSize: 9,
  },

  footer: {
    height: 30,
    fontSize: 9,
  },

  content: {
    lineHeight: 1.4,
    paragraphSpacing: 12,
    sectionSpacing: 24,
  },
} as const;

// =============================================================================
// Animation Tokens
// =============================================================================

export const animation = {
  duration: {
    fast: 150,
    normal: 200,
    slow: 300,
  },

  easing: {
    default: 'ease-in-out',
    enter: 'ease-out',
    exit: 'ease-in',
  },
} as const;

// =============================================================================
// Breakpoints
// =============================================================================

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

// =============================================================================
// Combined Token Export
// =============================================================================

export const brandTokens = {
  colors,
  typography,
  spacing,
  borders,
  shadows,
  chart,
  pdf,
  animation,
  breakpoints,
} as const;

// Type exports for TypeScript consumers
export type BrandColors = typeof colors;
export type BrandTypography = typeof typography;
export type BrandSpacing = typeof spacing;
export type BrandBorders = typeof borders;
export type BrandShadows = typeof shadows;
export type BrandChart = typeof chart;
export type BrandPdf = typeof pdf;
export type BrandAnimation = typeof animation;
export type BrandBreakpoints = typeof breakpoints;
export type BrandTokens = typeof brandTokens;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get chart color by index (wraps around if index exceeds palette length)
 */
export function getChartColor(index: number, extended = false): string {
  const palette = extended ? chart.colorsExtended : chart.colors;
  return palette[index % palette.length];
}

/**
 * Convert pixel value to points (for PDF generation)
 * 1pt = 1/72 inch, 1px = 1/96 inch (at 96 DPI)
 * Therefore: 1pt = 96/72 px = 1.333px
 */
export function pxToPt(px: number): number {
  return px * 0.75;
}

/**
 * Convert points to pixels
 */
export function ptToPx(pt: number): number {
  return pt / 0.75;
}

/**
 * Get responsive value based on breakpoint
 */
export function getResponsiveValue<T>(
  values: { base: T; sm?: T; md?: T; lg?: T; xl?: T },
  width: number
): T {
  if (width >= breakpoints.xl && values.xl !== undefined) return values.xl;
  if (width >= breakpoints.lg && values.lg !== undefined) return values.lg;
  if (width >= breakpoints.md && values.md !== undefined) return values.md;
  if (width >= breakpoints.sm && values.sm !== undefined) return values.sm;
  return values.base;
}

// Default export
export default brandTokens;
