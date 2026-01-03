/**
 * Chart Theme Tests
 *
 * Tests for brand chart theming utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  BRAND_CHART_THEME_LIGHT,
  BRAND_CHART_THEME_DARK,
  CHART_THEMES,
  getChartColors,
  getChartColorAtIndex,
} from '../brand-chart-theme';
import {
  rechartsProps,
  CHART_COLORS,
  STATUS_COLORS,
  getChartColor,
  isColorCompliant,
} from '../recharts-props';
import { colors } from '@/lib/brand-tokens';

describe('Brand Chart Theme', () => {
  describe('Light Theme', () => {
    it('should have correct mode and scheme', () => {
      expect(BRAND_CHART_THEME_LIGHT.mode).toBe('light');
      expect(BRAND_CHART_THEME_LIGHT.scheme).toBe('press-on');
    });

    it('should have primary palette colors', () => {
      expect(BRAND_CHART_THEME_LIGHT.palette.primary.length).toBeGreaterThan(0);
      expect(BRAND_CHART_THEME_LIGHT.palette.primary[0].fill).toBe(colors.dark);
    });

    it('should have secondary palette colors', () => {
      expect(BRAND_CHART_THEME_LIGHT.palette.secondary).toBeDefined();
      expect(BRAND_CHART_THEME_LIGHT.palette.secondary?.length).toBeGreaterThan(0);
    });

    it('should have status colors', () => {
      expect(BRAND_CHART_THEME_LIGHT.palette.status).toBeDefined();
      expect(BRAND_CHART_THEME_LIGHT.palette.status?.success.fill).toBe('#10b981');
      expect(BRAND_CHART_THEME_LIGHT.palette.status?.error.fill).toBe('#ef4444');
    });

    it('should have Recharts config', () => {
      expect(BRAND_CHART_THEME_LIGHT.recharts).toBeDefined();
      expect(BRAND_CHART_THEME_LIGHT.recharts?.cartesianGrid.stroke).toBeDefined();
    });

    it('should have Nivo config', () => {
      expect(BRAND_CHART_THEME_LIGHT.nivo).toBeDefined();
      expect(BRAND_CHART_THEME_LIGHT.nivo?.background).toBe('#FFFFFF');
    });
  });

  describe('Dark Theme', () => {
    it('should have correct mode', () => {
      expect(BRAND_CHART_THEME_DARK.mode).toBe('dark');
    });

    it('should have inverted primary color', () => {
      expect(BRAND_CHART_THEME_DARK.palette.primary[0].fill).toBe('#FFFFFF');
    });

    it('should have dark Nivo background', () => {
      expect(BRAND_CHART_THEME_DARK.nivo?.background).toBe('#1a1a1a');
    });
  });

  describe('Theme Registry', () => {
    it('should have light and dark themes', () => {
      expect(CHART_THEMES.light).toBe(BRAND_CHART_THEME_LIGHT);
      expect(CHART_THEMES.dark).toBe(BRAND_CHART_THEME_DARK);
    });
  });

  describe('getChartColors', () => {
    it('should return array of color strings', () => {
      const colors = getChartColors(BRAND_CHART_THEME_LIGHT);
      expect(Array.isArray(colors)).toBe(true);
      expect(colors.length).toBeGreaterThan(0);
      expect(typeof colors[0]).toBe('string');
    });
  });

  describe('getChartColorAtIndex', () => {
    it('should return color at specific index', () => {
      const color = getChartColorAtIndex(BRAND_CHART_THEME_LIGHT, 0);
      expect(color).toBe(colors.dark);
    });

    it('should wrap around for large indices', () => {
      const color0 = getChartColorAtIndex(BRAND_CHART_THEME_LIGHT, 0);
      const color5 = getChartColorAtIndex(BRAND_CHART_THEME_LIGHT, 5);
      expect(color0).toBe(color5); // Should wrap to first color
    });

    it('should return fallback for negative index', () => {
      // Modulo with negative numbers should still work
      const color = getChartColorAtIndex(BRAND_CHART_THEME_LIGHT, -1);
      expect(typeof color).toBe('string');
    });
  });
});

describe('Recharts Props', () => {
  describe('CHART_COLORS', () => {
    it('should have 5 brand colors', () => {
      expect(CHART_COLORS.length).toBe(5);
    });

    it('should start with brand dark color', () => {
      expect(CHART_COLORS[0]).toBe(colors.dark);
    });

    it('should include brand beige', () => {
      expect(CHART_COLORS[1]).toBe(colors.beige);
    });
  });

  describe('STATUS_COLORS', () => {
    it('should have all status colors', () => {
      expect(STATUS_COLORS.success).toBe('#10b981');
      expect(STATUS_COLORS.warning).toBe('#f59e0b');
      expect(STATUS_COLORS.error).toBe('#ef4444');
      expect(STATUS_COLORS.info).toBe('#3b82f6');
    });
  });

  describe('getChartColor', () => {
    it('should return color at index', () => {
      expect(getChartColor(0)).toBe(colors.dark);
      expect(getChartColor(1)).toBe(colors.beige);
    });

    it('should wrap around', () => {
      expect(getChartColor(5)).toBe(getChartColor(0));
      expect(getChartColor(6)).toBe(getChartColor(1));
    });
  });

  describe('rechartsProps', () => {
    it('should have cartesianGrid props', () => {
      expect(rechartsProps.cartesianGrid.stroke).toBeDefined();
      expect(rechartsProps.cartesianGrid.strokeDasharray).toBeDefined();
      expect(rechartsProps.cartesianGrid.vertical).toBe(false);
    });

    it('should have xAxis props', () => {
      expect(rechartsProps.xAxis.stroke).toBeDefined();
      expect(rechartsProps.xAxis.fontSize).toBeDefined();
    });

    it('should have yAxis props', () => {
      expect(rechartsProps.yAxis.stroke).toBeDefined();
      expect(rechartsProps.yAxis.fontSize).toBeDefined();
    });

    it('should have tooltip function', () => {
      const tooltipProps = rechartsProps.tooltip();
      expect(tooltipProps.contentStyle).toBeDefined();
      expect(tooltipProps.contentStyle.backgroundColor).toBeDefined();
    });

    it('should have legend props', () => {
      expect(rechartsProps.legend.wrapperStyle).toBeDefined();
    });

    it('should have line function', () => {
      const lineProps = rechartsProps.line(0);
      expect(lineProps.stroke).toBe(colors.dark);
      expect(lineProps.type).toBe('monotone');
    });

    it('should have area function', () => {
      const areaProps = rechartsProps.area(1);
      expect(areaProps.stroke).toBe(colors.beige);
      expect(areaProps.fillOpacity).toBe(0.1);
    });

    it('should have bar function', () => {
      const barProps = rechartsProps.bar(0);
      expect(barProps.fill).toBe(colors.dark);
      expect(barProps.radius).toBeDefined();
    });

    it('should have getCellColors function', () => {
      const cellColors = rechartsProps.getCellColors(3);
      expect(cellColors.length).toBe(3);
      expect(cellColors[0]).toBe(colors.dark);
    });

    it('should have referenceLine props', () => {
      expect(rechartsProps.referenceLine.stroke).toBeDefined();
      expect(rechartsProps.referenceLine.strokeDasharray).toBe('5 5');
    });
  });
});

describe('Color Compliance', () => {
  it('should recognize brand colors as compliant', () => {
    expect(isColorCompliant('#292929')).toBe(true);
    expect(isColorCompliant('#E0D8D1')).toBe(true);
  });

  it('should recognize status colors as compliant', () => {
    expect(isColorCompliant('#10b981')).toBe(true);
    expect(isColorCompliant('#ef4444')).toBe(true);
  });

  it('should reject non-brand colors', () => {
    expect(isColorCompliant('#ff0000')).toBe(false);
    expect(isColorCompliant('#00ff00')).toBe(false);
  });
});
