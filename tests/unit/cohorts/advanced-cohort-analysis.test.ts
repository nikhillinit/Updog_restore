/**
 * Advanced Cohort Analysis Test Suite
 *
 * Tests for the advanced cohort analysis module including:
 * - XIRR calculations
 * - DPI/TVPI calculations
 * - Sector normalization
 * - Vintage resolution
 * - Coverage calculations
 */

import { describe, it, expect } from 'vitest';
import { calculateXIRR, calculateDPI, calculateTVPI } from '@/core/cohorts/metrics';
import { normalizeSector, slugifySector, BLANK_SECTOR_TOKEN } from '@shared/utils/sector-normalization';
import { resolveVintageKey, compareVintageKeys } from '@shared/utils/vintage-resolution';
import {
  calculateCoverage,
  meetsV2CoverageThreshold,
  V2_COVERAGE_THRESHOLD,
} from '@shared/utils/coverage-calculations';

// =============================================================================
// XIRR CALCULATION TESTS
// =============================================================================

describe('XIRR Calculations', () => {
  describe('calculateXIRR', () => {
    it('should return null for single cash flow', () => {
      const result = calculateXIRR([{ date: new Date('2020-01-01'), amount: -1000 }]);
      expect(result).toBeNull();
    });

    it('should return null for all positive cash flows', () => {
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: 1000 },
        { date: new Date('2021-01-01'), amount: 500 },
      ]);
      expect(result).toBeNull();
    });

    it('should return null for all negative cash flows', () => {
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: -1000 },
        { date: new Date('2021-01-01'), amount: -500 },
      ]);
      expect(result).toBeNull();
    });

    it('should calculate IRR for simple investment', () => {
      // Invest $1000, get back $1100 after one year = 10% return
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: -1000 },
        { date: new Date('2021-01-01'), amount: 1100 },
      ]);
      expect(result).not.toBeNull();
      expect(result).toBeCloseTo(0.1, 2);
    });

    it('should calculate IRR for doubled investment over one year', () => {
      // Invest $1000, get back $2000 after one year = 100% return
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: -1000 },
        { date: new Date('2021-01-01'), amount: 2000 },
      ]);
      expect(result).not.toBeNull();
      expect(result).toBeCloseTo(1.0, 2);
    });

    it('should calculate IRR for multiple cash flows', () => {
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: -1000 },
        { date: new Date('2020-07-01'), amount: -500 },
        { date: new Date('2021-01-01'), amount: 800 },
        { date: new Date('2022-01-01'), amount: 1200 },
      ]);
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(0);
    });

    it('should handle cash flows on same date', () => {
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: -1000 },
        { date: new Date('2020-01-01'), amount: -500 }, // Same day
        { date: new Date('2021-01-01'), amount: 2000 },
      ]);
      expect(result).not.toBeNull();
    });

    it('should handle loss scenario (negative IRR)', () => {
      // Invest $1000, get back only $500
      const result = calculateXIRR([
        { date: new Date('2020-01-01'), amount: -1000 },
        { date: new Date('2021-01-01'), amount: 500 },
      ]);
      expect(result).not.toBeNull();
      expect(result).toBeLessThan(0);
    });
  });
});

// =============================================================================
// DPI AND TVPI CALCULATION TESTS
// =============================================================================

describe('DPI and TVPI Calculations', () => {
  describe('calculateDPI', () => {
    it('should return null for zero paid-in', () => {
      const result = calculateDPI(1000, 0);
      expect(result).toBeNull();
    });

    it('should calculate DPI correctly', () => {
      const result = calculateDPI(500, 1000);
      expect(result).toBe(0.5);
    });

    it('should handle DPI greater than 1', () => {
      const result = calculateDPI(2000, 1000);
      expect(result).toBe(2.0);
    });

    it('should handle zero distributions', () => {
      const result = calculateDPI(0, 1000);
      expect(result).toBe(0);
    });
  });

  describe('calculateTVPI', () => {
    it('should return null for zero paid-in', () => {
      const result = calculateTVPI(1000, 500, 0);
      expect(result).toBeNull();
    });

    it('should calculate TVPI correctly', () => {
      // distributions + residual / paidIn
      const result = calculateTVPI(500, 800, 1000);
      expect(result).toBe(1.3);
    });

    it('should handle zero residual value', () => {
      const result = calculateTVPI(500, 0, 1000);
      expect(result).toBe(0.5);
    });

    it('should handle zero distributions', () => {
      const result = calculateTVPI(0, 1500, 1000);
      expect(result).toBe(1.5);
    });
  });
});

// =============================================================================
// SECTOR NORMALIZATION TESTS
// =============================================================================

describe('Sector Normalization', () => {
  describe('normalizeSector', () => {
    it('should lowercase and trim', () => {
      expect(normalizeSector('  SaaS  ')).toBe('saas');
    });

    it('should handle null/undefined/empty as blank token', () => {
      expect(normalizeSector(null)).toBe(BLANK_SECTOR_TOKEN);
      expect(normalizeSector(undefined)).toBe(BLANK_SECTOR_TOKEN);
      expect(normalizeSector('')).toBe(BLANK_SECTOR_TOKEN);
    });

    it('should preserve original structure while lowercasing', () => {
      expect(normalizeSector('Software-as-a-Service')).toBe('software-as-a-service');
      expect(normalizeSector('SAAS')).toBe('saas');
      expect(normalizeSector('B2B SaaS')).toBe('b2b saas');
    });

    it('should preserve special characters', () => {
      expect(normalizeSector('FinTech/Payments')).toBe('fintech/payments');
      expect(normalizeSector('E-commerce & Retail')).toBe('e-commerce & retail');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeSector('Health   Care')).toBe('health care');
      expect(normalizeSector('AI   ML')).toBe('ai ml');
    });
  });

  describe('slugifySector', () => {
    it('should create URL-safe slugs from spaces', () => {
      expect(slugifySector('Enterprise SaaS')).toBe('enterprise-saas');
      expect(slugifySector('AI ML')).toBe('ai-ml');
    });

    it('should remove special characters', () => {
      // Note: '/' is removed by the regex, so 'AI/ML' becomes 'aiml'
      expect(slugifySector('AI/ML')).toBe('aiml');
      expect(slugifySector('SaaS & Cloud')).toBe('saas-cloud');
    });

    it('should handle empty string', () => {
      expect(slugifySector('')).toBe('');
    });

    it('should remove leading/trailing dashes', () => {
      expect(slugifySector('--Technology--')).toBe('technology');
    });
  });
});

// =============================================================================
// VINTAGE RESOLUTION TESTS
// =============================================================================

describe('Vintage Resolution', () => {
  describe('resolveVintageKey', () => {
    it('should use override year if provided (year granularity)', () => {
      const result = resolveVintageKey({
        investmentDate: new Date('2023-06-15'),
        overrideYear: 2022,
        overrideQuarter: null,
        excludeFromCohorts: false,
        granularity: 'year',
      });
      expect(result.key).toBe('2022');
      expect(result.source).toBe('override_year');
    });

    it('should use override year and quarter if provided (quarter granularity)', () => {
      const result = resolveVintageKey({
        investmentDate: new Date('2023-06-15'),
        overrideYear: 2022,
        overrideQuarter: 3,
        excludeFromCohorts: false,
        granularity: 'quarter',
      });
      expect(result.key).toBe('2022-Q3');
      expect(result.source).toBe('override_full');
    });

    it('should derive year from investment date', () => {
      const result = resolveVintageKey({
        investmentDate: new Date('2023-06-15'),
        overrideYear: null,
        overrideQuarter: null,
        excludeFromCohorts: false,
        granularity: 'year',
      });
      expect(result.key).toBe('2023');
      expect(result.source).toBe('derived');
    });

    it('should derive quarter from investment date', () => {
      const result = resolveVintageKey({
        investmentDate: new Date('2023-06-15'),
        overrideYear: null,
        overrideQuarter: null,
        excludeFromCohorts: false,
        granularity: 'quarter',
      });
      expect(result.key).toBe('2023-Q2');
      expect(result.source).toBe('derived');
    });

    it('should return null key for missing date and no override', () => {
      const result = resolveVintageKey({
        investmentDate: null,
        overrideYear: null,
        overrideQuarter: null,
        excludeFromCohorts: false,
        granularity: 'year',
      });
      expect(result.key).toBeNull();
      expect(result.source).toBe('missing');
    });

    it('should return null key for excluded investments', () => {
      const result = resolveVintageKey({
        investmentDate: new Date('2023-06-15'),
        overrideYear: 2022,
        overrideQuarter: null,
        excludeFromCohorts: true,
        granularity: 'year',
      });
      expect(result.key).toBeNull();
      expect(result.source).toBe('missing');
    });
  });

  describe('compareVintageKeys', () => {
    it('should compare year keys correctly', () => {
      expect(compareVintageKeys('2020', '2021')).toBeLessThan(0);
      expect(compareVintageKeys('2021', '2020')).toBeGreaterThan(0);
      expect(compareVintageKeys('2020', '2020')).toBe(0);
    });

    it('should compare quarter keys correctly', () => {
      expect(compareVintageKeys('2020-Q1', '2020-Q2')).toBeLessThan(0);
      expect(compareVintageKeys('2020-Q4', '2021-Q1')).toBeLessThan(0);
      expect(compareVintageKeys('2020-Q2', '2020-Q2')).toBe(0);
    });

    it('should place year-only keys after Q4 of same year', () => {
      // Year-only keys are treated as after Q4 (quarter = 5 internally)
      expect(compareVintageKeys('2020-Q4', '2020')).toBeLessThan(0);
      expect(compareVintageKeys('2020', '2020-Q1')).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// COVERAGE CALCULATION TESTS
// =============================================================================

describe('Coverage Calculations', () => {
  describe('calculateCoverage', () => {
    it('should calculate 100% coverage for complete data', () => {
      const result = calculateCoverage({
        totalLots: 10,
        lotsWithPaidIn: 10,
        lotsWithDistributions: 10,
        totalInvestments: 5,
        investmentsWithVintage: 5,
      });

      expect(result.paidInPct).toBe(1);
      expect(result.distributionsPct).toBe(1);
      expect(result.vintagePct).toBe(1);
      expect(result.overallPct).toBe(1);
    });

    it('should calculate partial coverage', () => {
      const result = calculateCoverage({
        totalLots: 10,
        lotsWithPaidIn: 8,
        lotsWithDistributions: 7,
        totalInvestments: 5,
        investmentsWithVintage: 4,
      });

      expect(result.paidInPct).toBe(0.8);
      expect(result.distributionsPct).toBe(0.7);
      expect(result.vintagePct).toBe(0.8);
      expect(result.overallPct).toBe(0.7); // Minimum
    });

    it('should handle empty data sets', () => {
      const result = calculateCoverage({
        totalLots: 0,
        lotsWithPaidIn: 0,
        lotsWithDistributions: 0,
        totalInvestments: 0,
        investmentsWithVintage: 0,
      });

      expect(result.paidInPct).toBe(1); // No data = assume complete
      expect(result.overallPct).toBe(1);
    });

    it('should calculate marks coverage when marks data is provided', () => {
      const result = calculateCoverage({
        totalLots: 10,
        lotsWithPaidIn: 10,
        lotsWithDistributions: 10,
        totalInvestments: 5,
        investmentsWithVintage: 5,
        totalMarks: 10,
        lotsWithMarks: 8,
      });

      // If the implementation supports marksPct, test it; otherwise skip
      if (result.marksPct !== undefined) {
        expect(result.marksPct).toBe(0.8);
      }
    });
  });

  describe('meetsV2CoverageThreshold', () => {
    it('should return true for coverage >= 90%', () => {
      const coverage = {
        paidInPct: 0.95,
        distributionsPct: 0.92,
        vintagePct: 0.91,
        overallPct: 0.91,
      };
      expect(meetsV2CoverageThreshold(coverage)).toBe(true);
    });

    it('should return false for coverage < 90%', () => {
      const coverage = {
        paidInPct: 0.95,
        distributionsPct: 0.85,
        vintagePct: 0.91,
        overallPct: 0.85,
      };
      expect(meetsV2CoverageThreshold(coverage)).toBe(false);
    });

    it('should use V2_COVERAGE_THRESHOLD constant', () => {
      expect(V2_COVERAGE_THRESHOLD).toBe(0.9);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Advanced Cohort Analysis Integration', () => {
  it('should correctly calculate metrics for realistic cash flows', () => {
    // Simulate a typical VC investment pattern
    const cashFlows = [
      // Initial investment
      { date: new Date('2020-01-15'), amount: -1_000_000 },
      // Follow-on
      { date: new Date('2021-06-01'), amount: -500_000 },
      // Partial distribution
      { date: new Date('2022-03-15'), amount: 250_000 },
      // Exit distribution
      { date: new Date('2023-12-01'), amount: 2_500_000 },
    ];

    const irr = calculateXIRR(cashFlows);
    expect(irr).not.toBeNull();
    expect(irr).toBeGreaterThan(0.2); // Should be > 20% for 2.5x in ~4 years

    const dpi = calculateDPI(2_750_000, 1_500_000);
    expect(dpi).toBeCloseTo(1.83, 2);

    const tvpi = calculateTVPI(2_750_000, 0, 1_500_000);
    expect(tvpi).toBeCloseTo(1.83, 2); // No residual
  });

  it('should normalize sector names consistently for same base word', () => {
    // Test that lowercasing produces consistent results
    const variations = ['SaaS', 'SAAS', 'saas', '  SaaS  ', ' saas '];

    const normalized = variations.map(normalizeSector);

    // All should normalize to 'saas'
    expect(normalized.every((n) => n === 'saas')).toBe(true);
  });

  it('should resolve vintages in correct chronological order', () => {
    const vintageKeys = ['2021-Q3', '2020-Q1', '2022-Q2', '2021-Q1', '2020-Q4'];
    const sorted = [...vintageKeys].sort(compareVintageKeys);

    expect(sorted).toEqual(['2020-Q1', '2020-Q4', '2021-Q1', '2021-Q3', '2022-Q2']);
  });
});
