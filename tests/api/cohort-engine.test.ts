import { describe, it, expect, beforeEach } from 'vitest';
import { CohortEngine, generateCohortSummary, compareCohorts } from '../../client/src/core/cohorts/CohortEngine';
import type { CohortInput, CohortOutput } from '../../shared/types';

describe('CohortEngine', () => {
  beforeEach(() => {
    // Reset environment variables for each test
    delete process.env.ALG_COHORT;
    delete process.env.NODE_ENV;
  });

  describe('Basic Functionality', () => {
    const mockCohortInput: CohortInput = {
      fundId: 1,
      vintageYear: 2022,
      cohortSize: 12
    };

    it('should return cohort analysis for valid input', () => {
      const result = CohortEngine(mockCohortInput);
      
      expect(result).toHaveProperty('cohortId');
      expect(result).toHaveProperty('vintageYear', 2022);
      expect(result).toHaveProperty('performance');
      expect(result).toHaveProperty('companies');
      expect(result.companies).toHaveLength(12);
      
      // Validate performance metrics
      expect(result.performance.irr).toBeTypeOf('number');
      expect(result.performance.multiple).toBeGreaterThanOrEqual(0);
      expect(result.performance.dpi).toBeGreaterThanOrEqual(0);
    });

    it('should generate companies with required properties', () => {
      const result = CohortEngine(mockCohortInput);
      
      result.companies.forEach(company => {
        expect(company).toHaveProperty('id');
        expect(company).toHaveProperty('name');
        expect(company).toHaveProperty('stage');
        expect(company).toHaveProperty('valuation');
        
        expect(company.id).toBeGreaterThan(0);
        expect(company.name).toBeTypeOf('string');
        expect(company.name.length).toBeGreaterThan(0);
        expect(company.valuation).toBeGreaterThan(0);
      });
    });

    it('should handle different vintage years appropriately', () => {
      const recentVintage: CohortInput = { ...mockCohortInput, vintageYear: 2023 };
      const olderVintage: CohortInput = { ...mockCohortInput, vintageYear: 2020 };
      
      const recentResult = CohortEngine(recentVintage);
      const olderResult = CohortEngine(olderVintage);
      
      expect(recentResult.vintageYear).toBe(2023);
      expect(olderResult.vintageYear).toBe(2020);
      
      // Older vintage should generally have higher realized performance
      // (though this can vary due to randomness in mock data)
      expect(olderResult.performance).toBeDefined();
      expect(recentResult.performance).toBeDefined();
    });

    it('should handle algorithm mode configuration', () => {
      process.env.ALG_COHORT = 'true';
      
      const result = CohortEngine(mockCohortInput);
      
      expect(result).toBeDefined();
      expect(result.companies).toHaveLength(mockCohortInput.cohortSize);
    });
  });

  describe('Input Validation', () => {
    it('should throw error for invalid cohort input', () => {
      const invalidInput = {
        fundId: 'invalid',
        vintageYear: 'not-a-year',
        cohortSize: -5
      };
      
      expect(() => CohortEngine(invalidInput as any)).toThrow();
    });

    it('should throw error for missing required fields', () => {
      const incompleteInput = {
        fundId: 1
        // Missing vintageYear and cohortSize
      };
      
      expect(() => CohortEngine(incompleteInput as any)).toThrow();
    });

    it('should throw error for invalid vintage year', () => {
      const invalidVintageInput: CohortInput = {
        fundId: 1,
        vintageYear: 1999, // Too old
        cohortSize: 5
      };
      
      expect(() => CohortEngine(invalidVintageInput)).toThrow();
    });

    it('should throw error for invalid cohort size', () => {
      const invalidSizeInput: CohortInput = {
        fundId: 1,
        vintageYear: 2022,
        cohortSize: 0 // Must be positive
      };
      
      expect(() => CohortEngine(invalidSizeInput)).toThrow();
    });
  });

  describe('generateCohortSummary', () => {
    const mockInput: CohortInput = {
      fundId: 1,
      vintageYear: 2021,
      cohortSize: 8
    };

    it('should generate comprehensive cohort summary', () => {
      const summary = generateCohortSummary(mockInput);
      
      expect(summary).toHaveProperty('cohortId');
      expect(summary).toHaveProperty('vintageYear', 2021);
      expect(summary).toHaveProperty('totalCompanies', 8);
      expect(summary).toHaveProperty('performance');
      expect(summary).toHaveProperty('avgValuation');
      expect(summary).toHaveProperty('stageDistribution');
      expect(summary).toHaveProperty('companies');
      expect(summary).toHaveProperty('generatedAt');
      expect(summary).toHaveProperty('metadata');
      
      // Validate metadata
      expect(summary.metadata?.algorithmMode).toMatch(/^(rule-based|ml-enhanced)$/);
      expect(summary.metadata?.yearsActive).toBeGreaterThanOrEqual(0);
      expect(summary.metadata?.maturityLevel).toBeGreaterThanOrEqual(0);
      expect(summary.metadata?.maturityLevel).toBeLessThanOrEqual(1);
    });

    it('should calculate stage distribution correctly', () => {
      const summary = generateCohortSummary(mockInput);
      
      expect(summary.stageDistribution).toBeTypeOf('object');
      
      const totalInDistribution = Object.values(summary.stageDistribution)
        .reduce((sum, count) => sum + count, 0);
        
      expect(totalInDistribution).toBe(summary.totalCompanies);
    });

    it('should calculate average valuation correctly', () => {
      const summary = generateCohortSummary(mockInput);
      
      const calculatedAvg = summary.companies.reduce((sum, company) => sum + company.valuation, 0) / summary.companies.length;
      
      expect(summary.avgValuation).toBeCloseTo(calculatedAvg, -1); // Allow for rounding differences
    });
  });

  describe('compareCohorts', () => {
    const cohortInputs: CohortInput[] = [
      { fundId: 1, vintageYear: 2020, cohortSize: 10 },
      { fundId: 1, vintageYear: 2021, cohortSize: 12 },
      { fundId: 1, vintageYear: 2022, cohortSize: 8 }
    ];

    it('should compare multiple cohorts successfully', () => {
      const comparison = compareCohorts(cohortInputs);
      
      expect(comparison).toHaveProperty('cohorts');
      expect(comparison).toHaveProperty('comparison');
      
      expect(comparison.cohorts).toHaveLength(3);
      expect(comparison.comparison.bestPerforming).toBeTypeOf('string');
      expect(comparison.comparison.avgIRR).toBeTypeOf('number');
      expect(comparison.comparison.avgMultiple).toBeTypeOf('number');
      expect(comparison.comparison.totalCompanies).toBe(30); // 10 + 12 + 8
    });

    it('should identify best performing cohort', () => {
      const comparison = compareCohorts(cohortInputs);
      
      const bestCohortId = comparison.comparison.bestPerforming;
      const bestCohort = comparison.cohorts.find(c => c.cohortId === bestCohortId);
      
      expect(bestCohort).toBeDefined();
      
      // Best cohort should have the highest IRR among all cohorts
      comparison.cohorts.forEach(cohort => {
        if (cohort.cohortId !== bestCohortId) {
          expect(bestCohort!.performance.irr).toBeGreaterThanOrEqual(cohort.performance.irr);
        }
      });
    });

    it('should calculate aggregate metrics correctly', () => {
      const comparison = compareCohorts(cohortInputs);
      
      const manualAvgIRR = comparison.cohorts.reduce((sum, c) => sum + c.performance.irr, 0) / comparison.cohorts.length;
      const manualAvgMultiple = comparison.cohorts.reduce((sum, c) => sum + c.performance.multiple, 0) / comparison.cohorts.length;
      
      expect(comparison.comparison.avgIRR).toBeCloseTo(manualAvgIRR, 4);
      expect(comparison.comparison.avgMultiple).toBeCloseTo(manualAvgMultiple, 2);
    });

    it('should throw error for empty cohort array', () => {
      expect(() => compareCohorts([])).toThrow('At least one cohort required for comparison');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small cohort sizes', () => {
      const smallCohort: CohortInput = {
        fundId: 1,
        vintageYear: 2023,
        cohortSize: 1
      };
      
      const result = CohortEngine(smallCohort);
      expect(result.companies).toHaveLength(1);
      
      const summary = generateCohortSummary(smallCohort);
      expect(summary.totalCompanies).toBe(1);
    });

    it('should handle large cohort sizes', () => {
      const largeCohort: CohortInput = {
        fundId: 1,
        vintageYear: 2021,
        cohortSize: 100
      };
      
      const startTime = performance.now();
      const result = CohortEngine(largeCohort);
      const endTime = performance.now();
      
      expect(result.companies).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle current year vintage', () => {
      const currentYear = new Date().getFullYear();
      const currentVintage: CohortInput = {
        fundId: 1,
        vintageYear: currentYear,
        cohortSize: 5
      };
      
      const result = CohortEngine(currentVintage);
      expect(result.vintageYear).toBe(currentYear);
      
      const summary = generateCohortSummary(currentVintage);
      expect(summary.metadata?.yearsActive).toBe(0);
      expect(summary.metadata?.maturityLevel).toBe(0);
    });
  });

  describe('Performance and Consistency', () => {
    it('should maintain consistent performance with repeated calls', () => {
      const input: CohortInput = {
        fundId: 1,
        vintageYear: 2022,
        cohortSize: 20
      };
      
      const results: CohortOutput[] = [];
      
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        const result = CohortEngine(input);
        const endTime = performance.now();
        
        expect(endTime - startTime).toBeLessThan(50); // Each call under 50ms
        results.push(result);
      }
      
      // All results should have the same basic structure
      results.forEach(result => {
        expect(result.cohortId).toBe(results[0].cohortId);
        expect(result.vintageYear).toBe(2022);
        expect(result.companies).toHaveLength(20);
      });
    });
  });
});