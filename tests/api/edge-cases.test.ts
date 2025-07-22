import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReserveEngine, generateReserveSummary } from '../../client/src/core/reserves/ReserveEngine';
import { PacingEngine, generatePacingSummary } from '../../client/src/core/pacing/PacingEngine';
import type { ReserveInput, PacingInput, ReserveSummary, PacingSummary } from '../../shared/types';

describe.skip('Edge Cases - ReserveEngine', () => {
  beforeEach(() => {
    // Reset environment variables for each test
    delete process.env.ALG_RESERVE;
    delete process.env.NODE_ENV;
  });

  describe('Zero and Empty Input Cases', () => {
    it('should handle completely empty portfolio', () => {
      const result = ReserveEngine([]);
      expect(result).toHaveLength(0);
    });

    it('should handle portfolio with zero investments', () => {
      const zeroPortfolio: ReserveInput[] = [
        { id: 1, invested: 0, ownership: 0.1, stage: 'Seed', sector: 'SaaS' }
      ];
      
      const result = ReserveEngine(zeroPortfolio);
      expect(result).toHaveLength(1);
      expect(result[0].allocation).toBe(0);
      expect(result[0].confidence).toBeGreaterThan(0);
    });

    it('should handle zero ownership percentage', () => {
      const zeroOwnership: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0, stage: 'Series A', sector: 'Analytics' }
      ];
      
      const result = ReserveEngine(zeroOwnership);
      expect(result).toHaveLength(1);
      expect(result[0].allocation).toBeGreaterThan(0);
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('should handle generateReserveSummary with empty portfolio', () => {
      const summary = generateReserveSummary(1, []);
      
      expect(summary).toMatchObject({
        fundId: 1,
        totalAllocation: 0,
        avgConfidence: 0,
        highConfidenceCount: 0,
        allocations: []
      });
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Invalid Data Validation', () => {
    it('should throw error for invalid portfolio company data', () => {
      const invalidData = [
        { id: 'invalid', invested: 'not-a-number', stage: 123 }
      ];
      
      expect(() => ReserveEngine(invalidData as any)).toThrow();
    });

    it('should throw error for negative investment amounts', () => {
      const negativeInvestment: ReserveInput[] = [
        { id: 1, invested: -500000, ownership: 0.1, stage: 'Seed', sector: 'SaaS' }
      ];
      
      expect(() => ReserveEngine(negativeInvestment)).toThrow();
    });

    it('should throw error for ownership > 100%', () => {
      const excessiveOwnership: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 1.5, stage: 'Seed', sector: 'SaaS' }
      ];
      
      expect(() => ReserveEngine(excessiveOwnership)).toThrow();
    });

    it('should throw error for empty stage or sector', () => {
      const emptyStage: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: '', sector: 'SaaS' }
      ];
      
      expect(() => ReserveEngine(emptyStage)).toThrow();
    });
  });

  describe('Extreme Value Cases', () => {
    it('should handle very large investment amounts', () => {
      const largeInvestment: ReserveInput[] = [
        { id: 1, invested: 1000000000, ownership: 0.1, stage: 'Growth', sector: 'Enterprise' }
      ];
      
      const result = ReserveEngine(largeInvestment);
      expect(result).toHaveLength(1);
      expect(result[0].allocation).toBeGreaterThan(0);
      expect(result[0].confidence).toBeGreaterThan(0);
    });

    it('should handle very small investment amounts', () => {
      const smallInvestment: ReserveInput[] = [
        { id: 1, invested: 1, ownership: 0.001, stage: 'Seed', sector: 'Analytics' }
      ];
      
      const result = ReserveEngine(smallInvestment);
      expect(result).toHaveLength(1);
      expect(result[0].allocation).toBeGreaterThanOrEqual(0);
    });

    it('should handle maximum ownership percentage', () => {
      const maxOwnership: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 1.0, stage: 'Series A', sector: 'Fintech' }
      ];
      
      const result = ReserveEngine(maxOwnership);
      expect(result[0].allocation).toBeGreaterThan(0);
      expect(result[0].confidence).toBeGreaterThan(0);
    });
  });

  describe('Unknown Stage and Sector Handling', () => {
    it('should handle unknown investment stages', () => {
      const unknownStage: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: 'Unknown Stage', sector: 'SaaS' }
      ];
      
      const result = ReserveEngine(unknownStage);
      expect(result).toHaveLength(1);
      expect(result[0].allocation).toBeGreaterThan(0);
      expect(result[0].rationale).toContain('Unknown Stage');
    });

    it('should handle unknown sectors', () => {
      const unknownSector: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: 'Series A', sector: 'Unknown Sector' }
      ];
      
      const result = ReserveEngine(unknownSector);
      expect(result).toHaveLength(1);
      expect(result[0].allocation).toBeGreaterThan(0);
      expect(result[0].rationale).toContain('Unknown Sector');
    });
  });

  describe('Algorithm Mode Edge Cases', () => {
    it('should handle cold-start mode with ALG_RESERVE=false', () => {
      process.env.ALG_RESERVE = 'false';
      
      const portfolio: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: 'Series A', sector: 'SaaS' }
      ];
      
      const result = ReserveEngine(portfolio);
      expect(result[0].rationale).toMatch(/(cold-start|enhanced rules)/i);
      expect(result[0].confidence).toBeLessThanOrEqual(0.7);
    });

    it('should handle ML mode with ALG_RESERVE=true', () => {
      process.env.ALG_RESERVE = 'true';
      
      // Mock Math.random to ensure predictable ML mode selection
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.3, should use rules
      
      const portfolio: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: 'Series A', sector: 'SaaS' }
      ];
      
      const result = ReserveEngine(portfolio);
      expect(result[0].allocation).toBeGreaterThan(0);
      
      mockRandom.mockRestore();
    });
  });

  describe('Large Portfolio Stress Tests', () => {
    it('should handle portfolio with 1000+ companies', () => {
      const largePortfolio: ReserveInput[] = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        invested: 100000 + (i * 1000),
        ownership: 0.05 + (i * 0.0001),
        stage: ['Seed', 'Series A', 'Series B'][i % 3],
        sector: ['SaaS', 'Fintech', 'Healthcare'][i % 3]
      }));
      
      const startTime = performance.now();
      const result = ReserveEngine(largePortfolio);
      const endTime = performance.now();
      
      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify all results have valid data
      result.forEach((allocation, index) => {
        expect(allocation.allocation).toBeGreaterThan(0);
        expect(allocation.confidence).toBeGreaterThan(0);
        expect(allocation.rationale).toBeDefined();
      });
    });
  });
});

describe.skip('Edge Cases - PacingEngine', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.ALG_PACING;
    delete process.env.NODE_ENV;
  });

  describe('Zero and Extreme Input Cases', () => {
    it('should handle zero fund size', () => {
      const zeroFundInput: PacingInput = {
        fundSize: 0,
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      const result = PacingEngine(zeroFundInput);
      expect(result).toHaveLength(8);
      result.forEach(deployment => {
        expect(deployment.deployment).toBe(0);
        expect(deployment.quarter).toBeGreaterThanOrEqual(1);
      });
    });

    it('should handle very large fund size', () => {
      const largeFundInput: PacingInput = {
        fundSize: 10000000000, // $10B fund
        deploymentQuarter: 1,
        marketCondition: 'bull'
      };
      
      const result = PacingEngine(largeFundInput);
      expect(result).toHaveLength(8);
      
      const totalDeployment = result.reduce((sum, item) => sum + item.deployment, 0);
      expect(totalDeployment).toBeGreaterThan(8000000000); // Within reasonable range
      expect(totalDeployment).toBeLessThan(12000000000);
    });

    it('should handle very high starting quarter', () => {
      const lateStartInput: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 100,
        marketCondition: 'neutral'
      };
      
      const result = PacingEngine(lateStartInput);
      expect(result[0].quarter).toBe(100);
      expect(result[7].quarter).toBe(107);
    });

    it('should handle generatePacingSummary with zero fund', () => {
      const zeroFundInput: PacingInput = {
        fundSize: 0,
        deploymentQuarter: 1,
        marketCondition: 'bear'
      };
      
      const summary = generatePacingSummary(zeroFundInput);
      
      expect(summary).toMatchObject({
        fundSize: 0,
        totalQuarters: 8,
        avgQuarterlyDeployment: 0,
        marketCondition: 'bear'
      });
      expect(summary.deployments).toHaveLength(8);
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Invalid Data Validation', () => {
    it('should throw error for invalid fund size', () => {
      const invalidInput = {
        fundSize: 'not-a-number',
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      expect(() => PacingEngine(invalidInput as any)).toThrow();
    });

    it('should throw error for negative fund size', () => {
      const negativeInput: PacingInput = {
        fundSize: -50000000,
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      expect(() => PacingEngine(negativeInput)).toThrow();
    });

    it('should throw error for invalid quarter', () => {
      const invalidQuarterInput: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 0, // Quarters should be >= 1
        marketCondition: 'neutral'
      };
      
      expect(() => PacingEngine(invalidQuarterInput)).toThrow();
    });

    it('should throw error for invalid market condition', () => {
      const invalidMarketInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'invalid-condition'
      };
      
      expect(() => PacingEngine(invalidMarketInput as any)).toThrow();
    });
  });

  describe('Market Condition Edge Cases', () => {
    it('should handle extreme bull market conditions', () => {
      const bullInput: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'bull'
      };
      
      const result = PacingEngine(bullInput);
      
      // Bull markets should front-load deployment
      const earlyQuartersSum = result.slice(0, 3).reduce((sum, q) => sum + q.deployment, 0);
      const lateQuartersSum = result.slice(5, 8).reduce((sum, q) => sum + q.deployment, 0);
      
      expect(earlyQuartersSum).toBeGreaterThan(lateQuartersSum);
      result.forEach(q => expect(q.note).toContain('bull'));
    });

    it('should handle extreme bear market conditions', () => {
      const bearInput: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'bear'
      };
      
      const result = PacingEngine(bearInput);
      
      // Bear markets should back-load deployment
      const earlyQuartersSum = result.slice(0, 3).reduce((sum, q) => sum + q.deployment, 0);
      const lateQuartersSum = result.slice(5, 8).reduce((sum, q) => sum + q.deployment, 0);
      
      expect(lateQuartersSum).toBeGreaterThan(earlyQuartersSum);
      result.forEach(q => expect(q.note).toContain('bear'));
    });
  });

  describe('Algorithm Mode Edge Cases', () => {
    it('should handle ML mode with ALG_PACING=true', () => {
      process.env.ALG_PACING = 'true';
      
      const input: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      const result = PacingEngine(input);
      expect(result).toHaveLength(8);
      result.forEach(item => {
        expect(item.note).toMatch(/(ML-optimized|trend analysis)/i);
      });
    });

    it('should handle development environment defaults', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ALG_PACING;
      
      const input: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      const result = PacingEngine(input);
      // In development mode, algorithm should be enabled by default
      expect(result).toHaveLength(8);
    });
  });

  describe('Performance and Consistency Tests', () => {
    it('should handle repeated calls with consistent results (rule-based)', () => {
      process.env.ALG_PACING = 'false';
      
      const input: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      // Mock Math.random to ensure consistent results
      const mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      
      const result1 = PacingEngine(input);
      const result2 = PacingEngine(input);
      
      expect(result1).toHaveLength(result2.length);
      result1.forEach((item, index) => {
        expect(item.quarter).toBe(result2[index].quarter);
        expect(item.deployment).toBeCloseTo(result2[index].deployment, 0); // Allow small variance
      });
      
      mockRandom.mockRestore();
    });

    it('should complete processing large fund within reasonable time', () => {
      const largeFundInput: PacingInput = {
        fundSize: 5000000000, // $5B fund
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      const startTime = performance.now();
      const result = PacingEngine(largeFundInput);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
      expect(result).toHaveLength(8);
    });
  });
});

describe('Integration Edge Cases', () => {
  describe('Type Safety Validation', () => {
    it('should maintain type safety in ReserveSummary generation', () => {
      const portfolio: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: 'Series A', sector: 'SaaS' }
      ];
      
      const summary: ReserveSummary = generateReserveSummary(1, portfolio);
      
      // Type assertions to ensure TypeScript compliance
      expect(typeof summary.fundId).toBe('number');
      expect(typeof summary.totalAllocation).toBe('number');
      expect(typeof summary.avgConfidence).toBe('number');
      expect(typeof summary.highConfidenceCount).toBe('number');
      expect(Array.isArray(summary.allocations)).toBe(true);
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });

    it('should maintain type safety in PacingSummary generation', () => {
      const input: PacingInput = {
        fundSize: 50000000,
        deploymentQuarter: 1,
        marketCondition: 'neutral'
      };
      
      const summary: PacingSummary = generatePacingSummary(input);
      
      // Type assertions
      expect(typeof summary.fundSize).toBe('number');
      expect(typeof summary.totalQuarters).toBe('number');
      expect(typeof summary.avgQuarterlyDeployment).toBe('number');
      expect(['bull', 'bear', 'neutral']).toContain(summary.marketCondition);
      expect(Array.isArray(summary.deployments)).toBe(true);
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Confidence Level Boundaries', () => {
    it('should respect confidence level constants', () => {
      const portfolio: ReserveInput[] = [
        { id: 1, invested: 500000, ownership: 0.1, stage: 'Series A', sector: 'SaaS' }
      ];
      
      const result = ReserveEngine(portfolio);
      
      result.forEach(allocation => {
        expect(allocation.confidence).toBeGreaterThanOrEqual(0.3); // COLD_START minimum
        expect(allocation.confidence).toBeLessThanOrEqual(0.95); // ML_ENHANCED maximum
      });
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory with repeated large operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform multiple large operations
      for (let i = 0; i < 100; i++) {
        const largePortfolio: ReserveInput[] = Array.from({ length: 50 }, (_, j) => ({
          id: j + 1,
          invested: 500000,
          ownership: 0.1,
          stage: 'Series A',
          sector: 'SaaS'
        }));
        
        ReserveEngine(largePortfolio);
        generateReserveSummary(i, largePortfolio);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});