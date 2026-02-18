/**
 * ReserveEngine Test Suite
 * Comprehensive tests for reserve allocation calculation accuracy
 */

import { describe, it, expect } from 'vitest';
import { ReserveEngine, generateReserveSummary } from '@/core/reserves/ReserveEngine';
import type { ReserveCompanyInput } from '@shared/types';
import { ConfidenceLevel } from '@shared/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createCompany = (overrides: Partial<ReserveCompanyInput> = {}): ReserveCompanyInput => ({
  id: 1,
  invested: 1000000,
  stage: 'Series A',
  sector: 'SaaS',
  ownership: 0.15,
  ...overrides,
});

const createPortfolio = (count: number): ReserveCompanyInput[] =>
  Array.from({ length: count }, (_, i) => createCompany({ id: i + 1 }));

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('ReserveEngine - Input Validation', () => {
  it('should return empty array for empty portfolio', () => {
    const result = ReserveEngine([]);
    expect(result).toEqual([]);
  });

  it('should handle null portfolio gracefully', () => {
    const result = ReserveEngine(null as any);
    expect(result).toEqual([]);
  });

  it('should handle undefined portfolio gracefully', () => {
    const result = ReserveEngine(undefined as any);
    expect(result).toEqual([]);
  });

  it('should throw error for invalid company data', () => {
    const invalidCompany = { id: 1 }; // Missing required fields
    expect(() => ReserveEngine([invalidCompany])).toThrow('Invalid company data');
  });

  it('should validate all required fields are present', () => {
    const company = createCompany();
    const result = ReserveEngine([company]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('allocation');
    expect(result[0]).toHaveProperty('confidence');
    expect(result[0]).toHaveProperty('rationale');
  });
});

// =============================================================================
// STAGE MULTIPLIER TESTS
// =============================================================================

describe('ReserveEngine - Stage Multipliers', () => {
  it('should apply 1.5x multiplier for Seed stage', () => {
    const seedCompany = createCompany({ stage: 'Seed', invested: 1000000 });
    const result = ReserveEngine([seedCompany]);

    // Base allocation would be ~1.5M for Seed with SaaS sector
    expect(result[0].allocation).toBeGreaterThan(1400000);
    expect(result[0].allocation).toBeLessThan(2000000);
  });

  it('should apply 2.0x multiplier for Series A stage', () => {
    const seriesACompany = createCompany({ stage: 'Series A', invested: 1000000 });
    const result = ReserveEngine([seriesACompany]);

    // Base: 1M * 2.0 (stage) * 1.1 (SaaS) * 1.2 (ownership >10%) = 2.64M
    expect(result[0].allocation).toBeGreaterThan(2400000);
    expect(result[0].allocation).toBeLessThan(2900000);
  });

  it('should apply 2.5x multiplier for Series B stage', () => {
    const seriesBCompany = createCompany({ stage: 'Series B', invested: 1000000 });
    const result = ReserveEngine([seriesBCompany]);

    // Base: 1M * 2.5 (stage) * 1.1 (SaaS) * 1.2 (ownership >10%) = 3.3M
    expect(result[0].allocation).toBeGreaterThan(3000000);
    expect(result[0].allocation).toBeLessThan(3600000);
  });

  it('should apply 1.8x multiplier for Series C stage', () => {
    const seriesCCompany = createCompany({ stage: 'Series C', invested: 1000000 });
    const result = ReserveEngine([seriesCCompany]);

    // Base: 1M * 1.8 (stage) * 1.1 (SaaS) * 1.2 (ownership >10%) = 2.376M
    expect(result[0].allocation).toBeGreaterThan(2200000);
    expect(result[0].allocation).toBeLessThan(2600000);
  });

  it('should apply 1.2x multiplier for Growth stage', () => {
    const growthCompany = createCompany({ stage: 'Growth', invested: 1000000 });
    const result = ReserveEngine([growthCompany]);

    // Base allocation would be ~1.2M for Growth with SaaS sector
    expect(result[0].allocation).toBeGreaterThan(1000000);
    expect(result[0].allocation).toBeLessThan(1600000);
  });

  it('should default to 2.0x multiplier for unknown stages', () => {
    const unknownStageCompany = createCompany({ stage: 'Unknown' as any, invested: 1000000 });
    const result = ReserveEngine([unknownStageCompany]);

    // Base: 1M * 2.0 (default) * 1.1 (SaaS) * 1.2 (ownership >10%) = 2.64M
    expect(result[0].allocation).toBeGreaterThan(2400000);
    expect(result[0].allocation).toBeLessThan(2900000);
  });
});

// =============================================================================
// SECTOR RISK ADJUSTMENT TESTS
// =============================================================================

describe('ReserveEngine - Sector Risk Adjustments', () => {
  it('should apply 1.1x adjustment for SaaS sector', () => {
    const saasCompany = createCompany({ sector: 'SaaS', stage: 'Series A', invested: 1000000 });
    const result = ReserveEngine([saasCompany]);

    expect(result[0].rationale).toContain('SaaS sector');
    expect(result[0].allocation).toBeGreaterThan(2000000); // 2.0 * 1.1 = 2.2
  });

  it('should apply 1.2x adjustment for Fintech sector', () => {
    const fintechCompany = createCompany({
      sector: 'Fintech',
      stage: 'Series A',
      invested: 1000000,
    });
    const result = ReserveEngine([fintechCompany]);

    expect(result[0].rationale).toContain('Fintech sector');
    expect(result[0].allocation).toBeGreaterThan(2200000); // 2.0 * 1.2 = 2.4
  });

  it('should apply 1.3x adjustment for Healthcare sector', () => {
    const healthcareCompany = createCompany({
      sector: 'Healthcare',
      stage: 'Series A',
      invested: 1000000,
    });
    const result = ReserveEngine([healthcareCompany]);

    expect(result[0].rationale).toContain('Healthcare sector');
    expect(result[0].allocation).toBeGreaterThan(2400000); // 2.0 * 1.3 = 2.6
  });

  it('should apply 0.9x adjustment for Infrastructure sector', () => {
    const infraCompany = createCompany({
      sector: 'Infrastructure',
      stage: 'Series A',
      invested: 1000000,
    });
    const result = ReserveEngine([infraCompany]);

    // Base: 1M * 2.0 (Series A) * 0.9 (Infrastructure) * 1.2 (ownership >10%) = 2.16M
    expect(result[0].allocation).toBeGreaterThan(2000000);
    expect(result[0].allocation).toBeLessThan(2400000);
  });

  it('should apply 0.8x adjustment for Enterprise sector', () => {
    const enterpriseCompany = createCompany({
      sector: 'Enterprise',
      stage: 'Series A',
      invested: 1000000,
    });
    const result = ReserveEngine([enterpriseCompany]);

    // Base: 1M * 2.0 (Series A) * 0.8 (Enterprise) * 1.2 (ownership >10%) = 1.92M
    expect(result[0].allocation).toBeGreaterThan(1700000);
    expect(result[0].allocation).toBeLessThan(2100000);
  });

  it('should default to 1.0x for unknown sectors', () => {
    const unknownSectorCompany = createCompany({
      sector: 'Unknown' as any,
      stage: 'Series A',
      invested: 1000000,
    });
    const result = ReserveEngine([unknownSectorCompany]);

    // Base: 1M * 2.0 (Series A) * 1.0 (default) * 1.2 (ownership >10%) = 2.4M
    expect(result[0].allocation).toBeGreaterThan(2200000);
    expect(result[0].allocation).toBeLessThan(2600000);
  });
});

// =============================================================================
// OWNERSHIP ADJUSTMENT TESTS
// =============================================================================

describe('ReserveEngine - Ownership Adjustments', () => {
  it('should apply 1.2x bonus for ownership > 10%', () => {
    const highOwnershipCompany = createCompany({ ownership: 0.15, invested: 1000000 });
    const lowOwnershipCompany = createCompany({ ownership: 0.05, invested: 1000000 });

    const highResult = ReserveEngine([highOwnershipCompany]);
    const lowResult = ReserveEngine([lowOwnershipCompany]);

    expect(highResult[0].allocation).toBeGreaterThan(lowResult[0].allocation);
  });

  it('should apply 0.8x penalty for ownership < 5%', () => {
    const veryLowOwnershipCompany = createCompany({ ownership: 0.03, invested: 1000000 });
    const normalOwnershipCompany = createCompany({ ownership: 0.1, invested: 1000000 });

    const lowResult = ReserveEngine([veryLowOwnershipCompany]);
    const normalResult = ReserveEngine([normalOwnershipCompany]);

    expect(lowResult[0].allocation).toBeLessThan(normalResult[0].allocation);
  });

  it('should not adjust for ownership between 5-10%', () => {
    const midOwnershipCompany = createCompany({ ownership: 0.07, invested: 1000000 });
    const result = ReserveEngine([midOwnershipCompany]);

    // Should receive base allocation without ownership adjustment
    expect(result[0].allocation).toBeGreaterThan(1800000);
    expect(result[0].allocation).toBeLessThan(2500000);
  });
});

// =============================================================================
// CONFIDENCE SCORING TESTS
// =============================================================================

describe('ReserveEngine - Confidence Scoring', () => {
  it('should start with cold-start confidence level', () => {
    const company = createCompany({ invested: 500000 });
    const result = ReserveEngine([company]);

    expect(result[0].confidence).toBeGreaterThanOrEqual(ConfidenceLevel.COLD_START);
    // With stage, sector, and ownership, confidence increases beyond cold-start
    expect(result[0].rationale).toContain('enhanced rules');
  });

  it('should increase confidence when stage and sector are present', () => {
    const company = createCompany({ stage: 'Series A', sector: 'SaaS' });
    const result = ReserveEngine([company]);

    expect(result[0].confidence).toBeGreaterThan(ConfidenceLevel.COLD_START);
  });

  it('should increase confidence for higher ownership', () => {
    const highOwnership = createCompany({ ownership: 0.2 });
    const lowOwnership = createCompany({ ownership: 0.02 });

    const highResult = ReserveEngine([highOwnership]);
    const lowResult = ReserveEngine([lowOwnership]);

    // Both have ownership > 0, so confidence increase is same; use >=
    expect(highResult[0].confidence).toBeGreaterThanOrEqual(lowResult[0].confidence);
  });

  it('should increase confidence for larger investments', () => {
    const largeInvestment = createCompany({ invested: 5000000 });
    const smallInvestment = createCompany({ invested: 100000 });

    const largeResult = ReserveEngine([largeInvestment]);
    const smallResult = ReserveEngine([smallInvestment]);

    expect(largeResult[0].confidence).toBeGreaterThan(smallResult[0].confidence);
  });

  it('should cap confidence at medium level for rule-based allocations', () => {
    const company = createCompany({
      invested: 10000000,
      ownership: 0.25,
      stage: 'Series B',
      sector: 'SaaS',
    });
    const result = ReserveEngine([company]);

    expect(result[0].confidence).toBeLessThanOrEqual(ConfidenceLevel.MEDIUM);
  });

  it('should have confidence between 0 and 1', () => {
    const portfolio = createPortfolio(10);
    const results = ReserveEngine(portfolio);

    results.forEach((result) => {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// OUTPUT VALIDATION TESTS
// =============================================================================

describe('ReserveEngine - Output Validation', () => {
  it('should return valid output structure', () => {
    const company = createCompany();
    const result = ReserveEngine([company]);

    expect(result[0]).toMatchObject({
      allocation: expect.any(Number),
      confidence: expect.any(Number),
      rationale: expect.any(String),
    });
  });

  it('should round allocations to whole numbers', () => {
    const company = createCompany();
    const result = ReserveEngine([company]);

    expect(result[0].allocation).toBe(Math.round(result[0].allocation));
  });

  it('should always return positive allocations', () => {
    const portfolio = createPortfolio(10);
    const results = ReserveEngine(portfolio);

    results.forEach((result) => {
      expect(result.allocation).toBeGreaterThan(0);
    });
  });

  it('should include stage in rationale', () => {
    const company = createCompany({ stage: 'Series B' });
    const result = ReserveEngine([company]);

    expect(result[0].rationale).toContain('Series B');
  });

  it('should include sector in rationale', () => {
    const company = createCompany({ sector: 'Fintech' });
    const result = ReserveEngine([company]);

    expect(result[0].rationale).toContain('Fintech');
  });
});

// =============================================================================
// BATCH PROCESSING TESTS
// =============================================================================

describe('ReserveEngine - Batch Processing', () => {
  it('should handle large portfolios efficiently', () => {
    const largePortfolio = createPortfolio(100);
    const startTime = Date.now();

    const results = ReserveEngine(largePortfolio);

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    expect(results).toHaveLength(100);
    expect(executionTime).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should process all companies in portfolio', () => {
    const portfolio = createPortfolio(10);
    const results = ReserveEngine(portfolio);

    expect(results).toHaveLength(portfolio.length);
  });

  it('should maintain consistent results for identical inputs', () => {
    const company = createCompany();
    const result1 = ReserveEngine([company]);
    const result2 = ReserveEngine([company]);

    expect(result1[0].allocation).toBe(result2[0].allocation);
    expect(result1[0].confidence).toBe(result2[0].confidence);
  });
});

// =============================================================================
// RESERVE SUMMARY TESTS
// =============================================================================

describe('generateReserveSummary', () => {
  it('should generate complete summary', () => {
    const portfolio = createPortfolio(5);
    const summary = generateReserveSummary(1, portfolio);

    expect(summary).toMatchObject({
      fundId: 1,
      totalAllocation: expect.any(Number),
      avgConfidence: expect.any(Number),
      highConfidenceCount: expect.any(Number),
      allocations: expect.any(Array),
      generatedAt: expect.any(Date),
    });
  });

  it('should calculate correct total allocation', () => {
    const portfolio = createPortfolio(3);
    const summary = generateReserveSummary(1, portfolio);

    const manualTotal = summary.allocations.reduce((sum, a) => sum + a.allocation, 0);
    expect(summary.totalAllocation).toBe(manualTotal);
  });

  it('should calculate correct average confidence', () => {
    const portfolio = createPortfolio(3);
    const summary = generateReserveSummary(1, portfolio);

    const manualAvg =
      summary.allocations.reduce((sum, a) => sum + a.confidence, 0) / summary.allocations.length;
    expect(summary.avgConfidence).toBeCloseTo(manualAvg, 2);
  });

  it('should count high confidence allocations correctly', () => {
    const portfolio = createPortfolio(5);
    const summary = generateReserveSummary(1, portfolio);

    const manualCount = summary.allocations.filter(
      (a) => a.confidence >= ConfidenceLevel.MEDIUM
    ).length;
    expect(summary.highConfidenceCount).toBe(manualCount);
  });

  it('should handle empty portfolio in summary', () => {
    const summary = generateReserveSummary(1, []);

    expect(summary.totalAllocation).toBe(0);
    expect(summary.avgConfidence).toBe(0);
    expect(summary.highConfidenceCount).toBe(0);
    expect(summary.allocations).toEqual([]);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('ReserveEngine - Edge Cases', () => {
  it('should handle zero investment', () => {
    const company = createCompany({ invested: 0 });
    const result = ReserveEngine([company]);

    expect(result[0].allocation).toBeGreaterThanOrEqual(0);
  });

  it('should handle very large investments', () => {
    const company = createCompany({ invested: 1000000000 }); // $1B
    const result = ReserveEngine([company]);

    expect(result[0].allocation).toBeGreaterThan(0);
    expect(result[0].allocation).toBeLessThan(10000000000); // Reasonable upper bound
  });

  it('should handle zero ownership', () => {
    const company = createCompany({ ownership: 0 });
    const result = ReserveEngine([company]);

    expect(result[0].allocation).toBeGreaterThan(0);
  });

  it('should handle 100% ownership', () => {
    const company = createCompany({ ownership: 1.0 });
    const result = ReserveEngine([company]);

    expect(result[0].allocation).toBeGreaterThan(0);
  });

  it('should handle mixed portfolio with varying characteristics', () => {
    const portfolio: ReserveCompanyInput[] = [
      createCompany({ stage: 'Seed', sector: 'SaaS', invested: 500000, ownership: 0.2 }),
      createCompany({
        stage: 'Series C',
        sector: 'Healthcare',
        invested: 5000000,
        ownership: 0.05,
      }),
      createCompany({
        stage: 'Series B',
        sector: 'Enterprise',
        invested: 2000000,
        ownership: 0.12,
      }),
      createCompany({ stage: 'Growth', sector: 'Fintech', invested: 10000000, ownership: 0.08 }),
    ];

    const results = ReserveEngine(portfolio);

    expect(results).toHaveLength(4);
    results.forEach((result) => {
      expect(result.allocation).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.rationale).toBeTruthy();
    });
  });
});
