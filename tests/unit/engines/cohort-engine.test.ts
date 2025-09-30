/**
 * CohortEngine Test Suite
 * Comprehensive tests for vintage year cohort analysis
 */

import { describe, it, expect } from 'vitest';
import { CohortEngine, generateCohortSummary, compareCohorts } from '@/core/cohorts/CohortEngine';
import type { CohortInput } from '@shared/types';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createCohortInput = (overrides: Partial<CohortInput> = {}): CohortInput => ({
  fundId: 1,
  vintageYear: 2020,
  cohortSize: 10,
  ...overrides,
});

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('CohortEngine - Input Validation', () => {
  it('should validate and process correct input', () => {
    const input = createCohortInput();
    const result = CohortEngine(input);

    expect(result).toBeDefined();
    expect(result.cohortId).toContain('cohort-1-2020');
    expect(result.vintageYear).toBe(2020);
  });

  it('should reject invalid cohort input', () => {
    const invalidInput = { fundId: 1 } as any;
    expect(() => CohortEngine(invalidInput)).toThrow('Invalid cohort input');
  });

  it('should handle various vintage years', () => {
    const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

    years.forEach(year => {
      const input = createCohortInput({ vintageYear: year });
      const result = CohortEngine(input);
      expect(result.vintageYear).toBe(year);
    });
  });
});

// =============================================================================
// VINTAGE YEAR ANALYSIS TESTS
// =============================================================================

describe('CohortEngine - Vintage Year Analysis', () => {
  it('should apply vintage year adjustments', () => {
    const cohort2020 = CohortEngine(createCohortInput({ vintageYear: 2020 }));
    const cohort2021 = CohortEngine(createCohortInput({ vintageYear: 2021 }));

    // Different vintages should have different performance
    expect(cohort2020.performance.irr).not.toBe(cohort2021.performance.irr);
  });

  it('should reflect COVID impact on 2020 vintage', () => {
    const cohort2020 = CohortEngine(createCohortInput({ vintageYear: 2020 }));
    const cohort2019 = CohortEngine(createCohortInput({ vintageYear: 2019 }));

    // 2020 should show COVID impact (lower IRR)
    expect(cohort2020.performance.irr).toBeLessThan(cohort2019.performance.irr);
  });

  it('should reflect recovery boom in 2021', () => {
    const cohort2021 = CohortEngine(createCohortInput({ vintageYear: 2021 }));
    const cohort2020 = CohortEngine(createCohortInput({ vintageYear: 2020 }));

    // 2021 should show recovery (higher IRR)
    expect(cohort2021.performance.irr).toBeGreaterThan(cohort2020.performance.irr);
  });

  it('should apply maturity factor to performance', () => {
    const recentCohort = CohortEngine(createCohortInput({ vintageYear: 2023 }));
    const matureCohort = CohortEngine(createCohortInput({ vintageYear: 2018 }));

    // Mature cohorts should have higher realized performance
    expect(matureCohort.performance.dpi).toBeGreaterThan(recentCohort.performance.dpi);
  });
});

// =============================================================================
// PERFORMANCE METRICS TESTS
// =============================================================================

describe('CohortEngine - Performance Metrics', () => {
  it('should calculate IRR', () => {
    const cohort = CohortEngine(createCohortInput());

    expect(cohort.performance.irr).toBeDefined();
    expect(cohort.performance.irr).toBeGreaterThan(-1);
    expect(cohort.performance.irr).toBeLessThan(5); // Reasonable upper bound
  });

  it('should calculate Multiple (TVPI)', () => {
    const cohort = CohortEngine(createCohortInput());

    expect(cohort.performance.multiple).toBeDefined();
    expect(cohort.performance.multiple).toBeGreaterThan(0);
  });

  it('should calculate DPI', () => {
    const cohort = CohortEngine(createCohortInput());

    expect(cohort.performance.dpi).toBeDefined();
    expect(cohort.performance.dpi).toBeGreaterThanOrEqual(0);
    expect(cohort.performance.dpi).toBeLessThanOrEqual(cohort.performance.multiple);
  });

  it('should ensure DPI <= Multiple', () => {
    const cohort = CohortEngine(createCohortInput());

    expect(cohort.performance.dpi).toBeLessThanOrEqual(cohort.performance.multiple);
  });

  it('should round metrics to appropriate precision', () => {
    const cohort = CohortEngine(createCohortInput());

    // IRR to 4 decimal places
    expect(cohort.performance.irr.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(4);

    // Multiple and DPI to 2 decimal places
    expect(cohort.performance.multiple.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    expect(cohort.performance.dpi.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// COMPANY GENERATION TESTS
// =============================================================================

describe('CohortEngine - Company Generation', () => {
  it('should generate correct number of companies', () => {
    const cohort = CohortEngine(createCohortInput({ cohortSize: 15 }));

    expect(cohort.companies).toHaveLength(15);
  });

  it('should assign unique IDs to companies', () => {
    const cohort = CohortEngine(createCohortInput({ cohortSize: 10 }));

    const ids = cohort.companies.map(c => c.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should generate companies with valid data', () => {
    const cohort = CohortEngine(createCohortInput());

    cohort.companies.forEach(company => {
      expect(company).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        stage: expect.any(String),
        valuation: expect.any(Number),
      });

      expect(company.valuation).toBeGreaterThan(0);
    });
  });

  it('should distribute companies across stages', () => {
    const cohort = CohortEngine(createCohortInput({ cohortSize: 20 }));

    const stages = new Set(cohort.companies.map(c => c.stage));
    expect(stages.size).toBeGreaterThan(1); // Should have multiple stages
  });

  it('should generate realistic company valuations', () => {
    const cohort = CohortEngine(createCohortInput());

    cohort.companies.forEach(company => {
      expect(company.valuation).toBeGreaterThan(1000000); // > $1M
      expect(company.valuation).toBeLessThan(150000000); // < $150M for typical early-mid stage
    });
  });
});

// =============================================================================
// MULTI-COHORT COMPARISON TESTS
// =============================================================================

describe('compareCohorts', () => {
  it('should compare multiple cohorts', () => {
    const cohorts = [
      createCohortInput({ vintageYear: 2020 }),
      createCohortInput({ vintageYear: 2021 }),
      createCohortInput({ vintageYear: 2022 }),
    ];

    const comparison = compareCohorts(cohorts);

    expect(comparison.cohorts).toHaveLength(3);
    expect(comparison.comparison).toBeDefined();
  });

  it('should identify best performing cohort', () => {
    const cohorts = [
      createCohortInput({ vintageYear: 2020 }),
      createCohortInput({ vintageYear: 2021 }),
    ];

    const comparison = compareCohorts(cohorts);

    expect(comparison.comparison.bestPerforming).toBeDefined();
    expect(comparison.comparison.bestPerforming).toContain('cohort-');
  });

  it('should calculate average IRR across cohorts', () => {
    const cohorts = [
      createCohortInput({ vintageYear: 2020 }),
      createCohortInput({ vintageYear: 2021 }),
      createCohortInput({ vintageYear: 2022 }),
    ];

    const comparison = compareCohorts(cohorts);

    const manualAvgIRR = comparison.cohorts.reduce((sum, c) => sum + c.performance.irr, 0) / comparison.cohorts.length;

    expect(comparison.comparison.avgIRR).toBeCloseTo(manualAvgIRR, 4);
  });

  it('should calculate average Multiple across cohorts', () => {
    const cohorts = [
      createCohortInput({ vintageYear: 2020 }),
      createCohortInput({ vintageYear: 2021 }),
    ];

    const comparison = compareCohorts(cohorts);

    const manualAvgMultiple = comparison.cohorts.reduce((sum, c) => sum + c.performance.multiple, 0) / comparison.cohorts.length;

    expect(comparison.comparison.avgMultiple).toBeCloseTo(manualAvgMultiple, 2);
  });

  it('should calculate total companies across cohorts', () => {
    const cohorts = [
      createCohortInput({ cohortSize: 10 }),
      createCohortInput({ cohortSize: 15 }),
      createCohortInput({ cohortSize: 12 }),
    ];

    const comparison = compareCohorts(cohorts);

    expect(comparison.comparison.totalCompanies).toBe(37);
  });

  it('should reject empty cohort array', () => {
    expect(() => compareCohorts([])).toThrow('At least one cohort required');
  });
});

// =============================================================================
// COHORT SUMMARY TESTS
// =============================================================================

describe('generateCohortSummary', () => {
  it('should generate complete summary', () => {
    const input = createCohortInput();
    const summary = generateCohortSummary(input);

    expect(summary).toMatchObject({
      cohortId: expect.any(String),
      vintageYear: expect.any(Number),
      totalCompanies: expect.any(Number),
      performance: expect.any(Object),
      avgValuation: expect.any(Number),
      stageDistribution: expect.any(Object),
      companies: expect.any(Array),
      generatedAt: expect.any(Date),
      metadata: expect.any(Object),
    });
  });

  it('should calculate correct total companies', () => {
    const input = createCohortInput({ cohortSize: 15 });
    const summary = generateCohortSummary(input);

    expect(summary.totalCompanies).toBe(15);
    expect(summary.companies).toHaveLength(15);
  });

  it('should calculate average valuation', () => {
    const input = createCohortInput();
    const summary = generateCohortSummary(input);

    const manualAvg = summary.companies.reduce((sum, c) => sum + c.valuation, 0) / summary.companies.length;

    // Allow for rounding differences (within 1 unit)
    expect(Math.abs(summary.avgValuation - manualAvg)).toBeLessThan(1);
  });

  it('should include stage distribution', () => {
    const input = createCohortInput({ cohortSize: 20 });
    const summary = generateCohortSummary(input);

    expect(summary.stageDistribution).toBeDefined();

    // Count should match total companies
    const totalCount = Object.values(summary.stageDistribution).reduce((sum: number, count) => sum + (count as number), 0);
    expect(totalCount).toBe(summary.totalCompanies);
  });

  it('should include metadata with algorithm mode', () => {
    const input = createCohortInput();
    const summary = generateCohortSummary(input);

    expect(summary.metadata.algorithmMode).toMatch(/^(ml-enhanced|rule-based)$/);
  });

  it('should include metadata with years active', () => {
    const input = createCohortInput({ vintageYear: 2020 });
    const summary = generateCohortSummary(input);

    const expectedYears = new Date().getFullYear() - 2020;
    expect(summary.metadata.yearsActive).toBe(expectedYears);
  });

  it('should calculate maturity level', () => {
    const input = createCohortInput({ vintageYear: 2020 });
    const summary = generateCohortSummary(input);

    expect(summary.metadata.maturityLevel).toBeGreaterThanOrEqual(0);
    expect(summary.metadata.maturityLevel).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// OUTPUT STRUCTURE TESTS
// =============================================================================

describe('CohortEngine - Output Structure', () => {
  it('should return valid cohort output structure', () => {
    const input = createCohortInput();
    const result = CohortEngine(input);

    expect(result).toMatchObject({
      cohortId: expect.any(String),
      vintageYear: expect.any(Number),
      performance: {
        irr: expect.any(Number),
        multiple: expect.any(Number),
        dpi: expect.any(Number),
      },
      companies: expect.any(Array),
    });
  });

  it('should validate company structure', () => {
    const input = createCohortInput();
    const result = CohortEngine(input);

    result.companies.forEach(company => {
      expect(company).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        stage: expect.stringMatching(/^(Seed|Series A|Series B|Series C)$/),
        valuation: expect.any(Number),
      });
    });
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('CohortEngine - Edge Cases', () => {
  it('should handle very small cohorts', () => {
    const input = createCohortInput({ cohortSize: 1 });
    const result = CohortEngine(input);

    expect(result.companies).toHaveLength(1);
  });

  it('should handle large cohorts', () => {
    const input = createCohortInput({ cohortSize: 100 });
    const result = CohortEngine(input);

    expect(result.companies).toHaveLength(100);
  });

  it('should handle recent vintage years', () => {
    const currentYear = new Date().getFullYear();
    const input = createCohortInput({ vintageYear: currentYear });
    const result = CohortEngine(input);

    expect(result.performance.dpi).toBeGreaterThanOrEqual(0);
    expect(result.performance.dpi).toBeLessThan(0.2); // Very recent should have low DPI
  });

  it('should handle old vintage years', () => {
    const input = createCohortInput({ vintageYear: 2015 });
    const result = CohortEngine(input);

    expect(result.performance.dpi).toBeGreaterThan(0.5); // Mature cohort should have higher DPI
  });

  it('should maintain consistency for same inputs', () => {
    const input = createCohortInput();

    const result1 = CohortEngine(input);
    const result2 = CohortEngine(input);

    // Structure should be consistent (actual values may vary due to randomness)
    expect(result1.cohortId).toBe(result2.cohortId);
    expect(result1.vintageYear).toBe(result2.vintageYear);
    expect(result1.companies).toHaveLength(result2.companies.length);
  });
});