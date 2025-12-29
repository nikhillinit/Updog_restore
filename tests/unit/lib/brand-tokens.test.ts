/**
 * Brand Tokens Tests
 * Test suite for design token system and utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  colors,
  typography,
  spacing,
  borders,
  shadows,
  chart,
  pdf,
  animation,
  breakpoints,
  brandTokens,
  getChartColor,
  pxToPt,
  ptToPx,
  getResponsiveValue,
} from '@/lib/brand-tokens';

// ============================================================================
// TOKEN STRUCTURE
// ============================================================================

describe('Brand Token Structure', () => {
  it('exports all token categories', () => {
    expect(colors).toBeDefined();
    expect(typography).toBeDefined();
    expect(spacing).toBeDefined();
    expect(borders).toBeDefined();
    expect(shadows).toBeDefined();
    expect(chart).toBeDefined();
    expect(pdf).toBeDefined();
    expect(animation).toBeDefined();
    expect(breakpoints).toBeDefined();
  });

  it('exports combined brandTokens object', () => {
    expect(brandTokens).toBeDefined();
    expect(brandTokens.colors).toBe(colors);
    expect(brandTokens.typography).toBe(typography);
    expect(brandTokens.chart).toBe(chart);
  });
});

// ============================================================================
// COLORS
// ============================================================================

describe('Colors', () => {
  it('has correct brand primary colors', () => {
    expect(colors.dark).toBe('#292929');
    expect(colors.beige).toBe('#E0D8D1');
    expect(colors.white).toBe('#FFFFFF');
    expect(colors.light).toBe('#F2F2F2');
  });

  it('has state colors', () => {
    expect(colors.success).toBeDefined();
    expect(colors.warning).toBeDefined();
    expect(colors.error).toBeDefined();
    expect(colors.info).toBeDefined();
  });

  it('has opacity variants', () => {
    expect(colors.darkMuted).toContain('rgba');
    expect(colors.darkSubtle).toContain('rgba');
  });
});

// ============================================================================
// TYPOGRAPHY
// ============================================================================

describe('Typography', () => {
  it('has font families', () => {
    expect(typography.fontFamily.heading).toContain('Inter');
    expect(typography.fontFamily.body).toContain('Poppins');
  });

  it('has font weights', () => {
    expect(typography.fontWeight.regular).toBe(400);
    expect(typography.fontWeight.bold).toBe(700);
  });

  it('has font sizes in pixels', () => {
    expect(typography.fontSize.base).toBe(14);
    expect(typography.fontSize.sm).toBe(12);
  });

  it('has print font sizes in points', () => {
    expect(typography.fontSize.print.body).toBe(11);
    expect(typography.fontSize.print.h1).toBe(22);
  });
});

// ============================================================================
// CHART TOKENS
// ============================================================================

describe('Chart Tokens', () => {
  it('has color palette', () => {
    expect(chart.colors).toHaveLength(5);
    expect(chart.colors[0]).toBe('#292929');
  });

  it('has extended color palette', () => {
    expect(chart.colorsExtended).toHaveLength(10);
    expect(chart.colorsExtended[0]).toBe('#292929');
  });

  it('has grid styling', () => {
    expect(chart.grid.color).toBe('#F2F2F2');
    expect(chart.grid.strokeWidth).toBe(1);
  });

  it('has tooltip styling', () => {
    expect(chart.tooltip.background).toBe('#292929');
    expect(chart.tooltip.textColor).toBe('#FFFFFF');
  });
});

// ============================================================================
// PDF TOKENS
// ============================================================================

describe('PDF Tokens', () => {
  it('has page dimensions in points', () => {
    expect(pdf.page.width).toBe(612);  // 8.5in
    expect(pdf.page.height).toBe(792); // 11in
  });

  it('has margin settings', () => {
    expect(pdf.page.marginTop).toBe(54);
    expect(pdf.page.marginBottom).toBe(54);
  });

  it('has header/footer heights', () => {
    expect(pdf.header.height).toBe(60);
    expect(pdf.footer.height).toBe(30);
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('getChartColor', () => {
  it('returns color by index', () => {
    expect(getChartColor(0)).toBe('#292929');
    expect(getChartColor(1)).toBe('#E0D8D1');
  });

  it('wraps around for large indices', () => {
    expect(getChartColor(5)).toBe('#292929');  // Wraps to index 0
    expect(getChartColor(6)).toBe('#E0D8D1');  // Wraps to index 1
  });

  it('uses extended palette when specified', () => {
    expect(getChartColor(5, true)).toBe('#4A4A4A');
    expect(getChartColor(9, true)).toBe('#D9D9D9');
  });

  it('handles edge cases', () => {
    expect(getChartColor(0, false)).toBe('#292929');
    expect(getChartColor(100, false)).toBe('#292929'); // 100 % 5 = 0
  });
});

describe('pxToPt', () => {
  it('converts pixels to points', () => {
    expect(pxToPt(96)).toBe(72);    // 96px = 72pt
    expect(pxToPt(12)).toBe(9);     // 12px = 9pt
    expect(pxToPt(16)).toBe(12);    // 16px = 12pt
  });

  it('handles zero', () => {
    expect(pxToPt(0)).toBe(0);
  });

  it('handles decimals', () => {
    expect(pxToPt(10)).toBeCloseTo(7.5);
  });
});

describe('ptToPx', () => {
  it('converts points to pixels', () => {
    expect(ptToPx(72)).toBe(96);    // 72pt = 96px
    expect(ptToPx(9)).toBe(12);     // 9pt = 12px
    expect(ptToPx(12)).toBe(16);    // 12pt = 16px
  });

  it('handles zero', () => {
    expect(ptToPx(0)).toBe(0);
  });

  it('is inverse of pxToPt', () => {
    const original = 48;
    expect(ptToPx(pxToPt(original))).toBeCloseTo(original);
  });
});

describe('getResponsiveValue', () => {
  it('returns base value for small widths', () => {
    const values = { base: 'small', md: 'medium', lg: 'large' };
    expect(getResponsiveValue(values, 320)).toBe('small');
    expect(getResponsiveValue(values, 639)).toBe('small');
  });

  it('returns sm value at sm breakpoint', () => {
    const values = { base: 'base', sm: 'small', md: 'medium' };
    expect(getResponsiveValue(values, 640)).toBe('small');
    expect(getResponsiveValue(values, 767)).toBe('small');
  });

  it('returns md value at md breakpoint', () => {
    const values = { base: 'base', md: 'medium', lg: 'large' };
    expect(getResponsiveValue(values, 768)).toBe('medium');
    expect(getResponsiveValue(values, 1023)).toBe('medium');
  });

  it('returns lg value at lg breakpoint', () => {
    const values = { base: 'base', lg: 'large', xl: 'extra-large' };
    expect(getResponsiveValue(values, 1024)).toBe('large');
    expect(getResponsiveValue(values, 1279)).toBe('large');
  });

  it('returns xl value at xl breakpoint', () => {
    const values = { base: 'base', xl: 'extra-large' };
    expect(getResponsiveValue(values, 1280)).toBe('extra-large');
    expect(getResponsiveValue(values, 1920)).toBe('extra-large');
  });

  it('falls back to lower breakpoints when higher not defined', () => {
    const values = { base: 'base', md: 'medium' };
    expect(getResponsiveValue(values, 1280)).toBe('medium');
  });

  it('handles base-only values', () => {
    const values = { base: 'only-base' };
    expect(getResponsiveValue(values, 1920)).toBe('only-base');
  });
});

// ============================================================================
// BREAKPOINTS
// ============================================================================

describe('Breakpoints', () => {
  it('has standard breakpoint values', () => {
    expect(breakpoints.sm).toBe(640);
    expect(breakpoints.md).toBe(768);
    expect(breakpoints.lg).toBe(1024);
    expect(breakpoints.xl).toBe(1280);
    expect(breakpoints['2xl']).toBe(1536);
  });
});

// ============================================================================
// SPACING
// ============================================================================

describe('Spacing', () => {
  it('uses 4px base unit', () => {
    expect(spacing[1]).toBe(4);
    expect(spacing[2]).toBe(8);
    expect(spacing[4]).toBe(16);
  });

  it('has logo safe zones', () => {
    expect(spacing.logoSafeZone).toBe(16);
    expect(spacing.iconSafeZone).toBe(8);
  });

  it('has print spacing in points', () => {
    expect(spacing.print.margin).toBe(54);
    expect(spacing.print.gutter).toBe(12);
  });
});

// ============================================================================
// ANIMATION
// ============================================================================

describe('Animation', () => {
  it('has duration values in ms', () => {
    expect(animation.duration.fast).toBe(150);
    expect(animation.duration.normal).toBe(200);
    expect(animation.duration.slow).toBe(300);
  });

  it('has easing functions', () => {
    expect(animation.easing.default).toBe('ease-in-out');
    expect(animation.easing.enter).toBe('ease-out');
    expect(animation.easing.exit).toBe('ease-in');
  });
});
