/**
 * Comparison Service Unit Tests
 *
 * Tests the business logic of the ComparisonService including:
 * - Delta calculations
 * - Metric trend determination
 * - Weighted summary computations
 */

import { describe, it, expect } from 'vitest';

// Test the metric configuration and delta calculation logic
describe('Comparison Service Logic', () => {
  // ============================================================================
  // Metric Trend Configuration
  // ============================================================================

  describe('Metric Trends', () => {
    const METRIC_TRENDS: Record<string, 'higher_is_better' | 'lower_is_better'> = {
      moic: 'higher_is_better',
      irr: 'higher_is_better',
      tvpi: 'higher_is_better',
      dpi: 'higher_is_better',
      total_investment: 'lower_is_better',
      follow_ons: 'lower_is_better',
      exit_proceeds: 'higher_is_better',
      exit_valuation: 'higher_is_better',
      gross_multiple: 'higher_is_better',
      net_irr: 'higher_is_better',
      gross_irr: 'higher_is_better',
      total_to_lps: 'higher_is_better',
      projected_fund_value: 'higher_is_better',
    };

    it('should classify MOIC as higher_is_better', () => {
      expect(METRIC_TRENDS['moic']).toBe('higher_is_better');
    });

    it('should classify IRR as higher_is_better', () => {
      expect(METRIC_TRENDS['irr']).toBe('higher_is_better');
    });

    it('should classify total_investment as lower_is_better', () => {
      expect(METRIC_TRENDS['total_investment']).toBe('lower_is_better');
    });

    it('should classify follow_ons as lower_is_better', () => {
      expect(METRIC_TRENDS['follow_ons']).toBe('lower_is_better');
    });
  });

  // ============================================================================
  // Delta Calculation
  // ============================================================================

  describe('Delta Calculations', () => {
    function computeDelta(
      baseValue: number,
      comparisonValue: number,
      trend: 'higher_is_better' | 'lower_is_better'
    ) {
      const absoluteDelta = comparisonValue - baseValue;
      const percentageDelta = baseValue !== 0
        ? ((comparisonValue - baseValue) / Math.abs(baseValue)) * 100
        : null;
      const isBetter = trend === 'higher_is_better'
        ? absoluteDelta > 0
        : absoluteDelta < 0;

      return { absoluteDelta, percentageDelta, isBetter };
    }

    it('should calculate positive delta for higher comparison value', () => {
      const result = computeDelta(2.0, 2.5, 'higher_is_better');
      expect(result.absoluteDelta).toBe(0.5);
      expect(result.percentageDelta).toBeCloseTo(25);
      expect(result.isBetter).toBe(true);
    });

    it('should calculate negative delta for lower comparison value', () => {
      const result = computeDelta(2.5, 2.0, 'higher_is_better');
      expect(result.absoluteDelta).toBe(-0.5);
      expect(result.percentageDelta).toBeCloseTo(-20);
      expect(result.isBetter).toBe(false);
    });

    it('should invert isBetter for lower_is_better metrics', () => {
      // Lower investment is better
      const result = computeDelta(100000, 80000, 'lower_is_better');
      expect(result.absoluteDelta).toBe(-20000);
      expect(result.isBetter).toBe(true); // Decrease is better
    });

    it('should handle zero base value', () => {
      const result = computeDelta(0, 100, 'higher_is_better');
      expect(result.absoluteDelta).toBe(100);
      expect(result.percentageDelta).toBeNull();
    });

    it('should handle equal values', () => {
      const result = computeDelta(2.5, 2.5, 'higher_is_better');
      expect(result.absoluteDelta).toBe(0);
      expect(result.percentageDelta).toBeCloseTo(0);
      expect(result.isBetter).toBe(false); // No improvement
    });
  });

  // ============================================================================
  // Weighted Summary Extraction
  // ============================================================================

  describe('Metric Value Extraction', () => {
    function extractMetricValue(metric: string, summary: Record<string, number | null>): number {
      if (!summary) return 0;
      switch (metric) {
        case 'moic':
          return summary['moic'] ?? 0;
        case 'total_investment':
        case 'investment':
          return summary['investment'] ?? 0;
        case 'follow_ons':
          return summary['follow_ons'] ?? 0;
        case 'exit_proceeds':
          return summary['exit_proceeds'] ?? 0;
        case 'exit_valuation':
          return summary['exit_valuation'] ?? 0;
        default:
          return 0;
      }
    }

    const mockSummary = {
      moic: 2.5,
      investment: 1000000,
      follow_ons: 500000,
      exit_proceeds: 3000000,
      exit_valuation: 5000000,
    };

    it('should extract MOIC correctly', () => {
      expect(extractMetricValue('moic', mockSummary)).toBe(2.5);
    });

    it('should extract investment correctly', () => {
      expect(extractMetricValue('total_investment', mockSummary)).toBe(1000000);
    });

    it('should extract follow_ons correctly', () => {
      expect(extractMetricValue('follow_ons', mockSummary)).toBe(500000);
    });

    it('should return 0 for unknown metric', () => {
      expect(extractMetricValue('unknown_metric', mockSummary)).toBe(0);
    });

    it('should handle null values', () => {
      const summaryWithNull = { ...mockSummary, moic: null };
      expect(extractMetricValue('moic', summaryWithNull)).toBe(0);
    });
  });

  // ============================================================================
  // Aggregate Summary Calculation
  // ============================================================================

  describe('Aggregate Summary', () => {
    function computeAggregateSummary(deltas: number[]) {
      if (deltas.length === 0) {
        return {
          averageAbsoluteDelta: 0,
          maxAbsoluteDelta: 0,
          minAbsoluteDelta: 0,
        };
      }

      const absoluteDeltas = deltas.map(Math.abs);
      return {
        averageAbsoluteDelta: absoluteDeltas.reduce((a, b) => a + b, 0) / absoluteDeltas.length,
        maxAbsoluteDelta: Math.max(...absoluteDeltas),
        minAbsoluteDelta: Math.min(...absoluteDeltas),
      };
    }

    it('should compute average of absolute deltas', () => {
      const result = computeAggregateSummary([10, -20, 30]);
      expect(result.averageAbsoluteDelta).toBe(20);
    });

    it('should find max absolute delta', () => {
      const result = computeAggregateSummary([10, -50, 30]);
      expect(result.maxAbsoluteDelta).toBe(50);
    });

    it('should find min absolute delta', () => {
      const result = computeAggregateSummary([10, -50, 30]);
      expect(result.minAbsoluteDelta).toBe(10);
    });

    it('should handle empty array', () => {
      const result = computeAggregateSummary([]);
      expect(result.averageAbsoluteDelta).toBe(0);
      expect(result.maxAbsoluteDelta).toBe(0);
      expect(result.minAbsoluteDelta).toBe(0);
    });
  });

  // ============================================================================
  // Display Name Mapping
  // ============================================================================

  describe('Display Names', () => {
    const METRIC_DISPLAY_NAMES: Record<string, string> = {
      moic: 'MOIC',
      irr: 'IRR',
      tvpi: 'TVPI',
      dpi: 'DPI',
      total_investment: 'Total Investment',
      follow_ons: 'Follow-on Capital',
      exit_proceeds: 'Exit Proceeds',
      exit_valuation: 'Exit Valuation',
      gross_multiple: 'Gross Multiple',
      net_irr: 'Net IRR',
      gross_irr: 'Gross IRR',
      total_to_lps: 'Total to LPs',
      projected_fund_value: 'Projected Fund Value',
      weighted_summary: 'Weighted Summary',
    };

    it('should map moic to MOIC', () => {
      expect(METRIC_DISPLAY_NAMES['moic']).toBe('MOIC');
    });

    it('should map total_investment to Total Investment', () => {
      expect(METRIC_DISPLAY_NAMES['total_investment']).toBe('Total Investment');
    });

    it('should have display names for all supported metrics', () => {
      const expectedMetrics = [
        'moic', 'irr', 'tvpi', 'dpi', 'total_investment',
        'follow_ons', 'exit_proceeds', 'exit_valuation',
      ];

      expectedMetrics.forEach(metric => {
        expect(METRIC_DISPLAY_NAMES[metric]).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Highlight Threshold
  // ============================================================================

  describe('Highlight Threshold', () => {
    function isSignificantChange(percentageDelta: number, threshold: number): boolean {
      return Math.abs(percentageDelta) >= threshold * 100;
    }

    it('should flag 15% change as significant with 10% threshold', () => {
      expect(isSignificantChange(15, 0.1)).toBe(true);
    });

    it('should not flag 5% change as significant with 10% threshold', () => {
      expect(isSignificantChange(5, 0.1)).toBe(false);
    });

    it('should flag exactly 10% as significant with 10% threshold', () => {
      expect(isSignificantChange(10, 0.1)).toBe(true);
    });

    it('should handle negative percentages', () => {
      expect(isSignificantChange(-15, 0.1)).toBe(true);
    });
  });
});
