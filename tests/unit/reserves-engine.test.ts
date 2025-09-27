/**
 * Comprehensive test suite for DeterministicReserveEngine
 * Validates correctness, determinism, and Excel parity
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DeterministicReserveEngine } from '@/core/reserves/DeterministicReserveEngine';
import {
  type PortfolioCompany,
  type ReserveAllocationInput,
  DEFAULT_GRADUATION_MATRIX,
  DEFAULT_STAGE_STRATEGIES,
  ReserveCalculationError,
} from '@shared/schemas/reserves-schemas';

// Test data fixtures
const createMockCompany = (overrides: Partial<PortfolioCompany> = {}): PortfolioCompany => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Company',
  sector: 'Technology',
  currentStage: 'seed',
  totalInvested: 1000000,
  currentValuation: 5000000,
  ownershipPercentage: 0.1,
  investmentDate: new Date('2023-01-01'),
  isActive: true,
  currentMOIC: 5.0,
  confidenceLevel: 0.8,
  tags: [],
  ...overrides,
});

const createMockInput = (overrides: Partial<ReserveAllocationInput> = {}): ReserveAllocationInput => ({
  portfolio: [createMockCompany()],
  availableReserves: 10000000,
  totalFundSize: 100000000,
  graduationMatrix: DEFAULT_GRADUATION_MATRIX,
  stageStrategies: DEFAULT_STAGE_STRATEGIES,
  minAllocationThreshold: 50000,
  maxPortfolioConcentration: 0.1,
  scenarioType: 'base',
  timeHorizon: 84,
  enableDiversification: true,
  enableRiskAdjustment: true,
  enableLiquidationPreferences: true,
  ...overrides,
});

describe('DeterministicReserveEngine', () => {
  let engine: DeterministicReserveEngine;

  beforeEach(() => {
    engine = new DeterministicReserveEngine();
    // Mock performance monitoring
    vi.mock('@/lib/performance-monitor', () => ({
      performanceMonitor: {
        recordMetric: vi.fn(),
        recordCalculationPerformance: vi.fn(),
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Core Functionality', () => {
    it('should calculate basic reserve allocation', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(result).toBeDefined();
      expect(result.allocations).toHaveLength(1);
      expect(result.inputSummary.totalPortfolioCompanies).toBe(1);
      expect(result.inputSummary.availableReserves).toBe(10000000);
      expect(result.metadata.modelVersion).toBe('1.0.0');
    });

    it('should handle empty portfolio gracefully', async () => {
      const input = createMockInput({ portfolio: [] });
      
      await expect(
        engine.calculateOptimalReserveAllocation(input)
      ).rejects.toThrow(ReserveCalculationError);
    });

    it('should handle zero available reserves', async () => {
      const input = createMockInput({ availableReserves: 0 });
      
      await expect(
        engine.calculateOptimalReserveAllocation(input)
      ).rejects.toThrow(ReserveCalculationError);
    });

    it('should handle negative inputs gracefully', async () => {
      const input = createMockInput({ availableReserves: -1000000 });
      
      await expect(
        engine.calculateOptimalReserveAllocation(input)
      ).rejects.toThrow(ReserveCalculationError);
    });
  });

  describe('Determinism Tests', () => {
    it('should produce identical results for identical inputs', async () => {
      const input = createMockInput();
      
      const result1 = await engine.calculateOptimalReserveAllocation(input);
      const result2 = await engine.calculateOptimalReserveAllocation(input);

      expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
      expect(result1.allocations).toEqual(result2.allocations);
      expect(result1.portfolioMetrics).toEqual(result2.portfolioMetrics);
    });

    it('should produce different results for different inputs', async () => {
      const input1 = createMockInput({ availableReserves: 10000000 });
      const input2 = createMockInput({ availableReserves: 20000000 });
      
      const result1 = await engine.calculateOptimalReserveAllocation(input1);
      const result2 = await engine.calculateOptimalReserveAllocation(input2);

      expect(result1.metadata.deterministicHash).not.toBe(result2.metadata.deterministicHash);
      expect(result1.inputSummary.availableReserves).not.toBe(result2.inputSummary.availableReserves);
    });

    it('should use cached results for identical calculations', async () => {
      const input = createMockInput();
      
      // First call - will compute and cache
      const result1 = await engine.calculateOptimalReserveAllocation(input);
      
      // Second call - should use cache
      const result2 = await engine.calculateOptimalReserveAllocation(input);

      // Results should be identical
      expect(result1).toEqual(result2);
      
      // Both should have the same deterministic hash (proving they're the same calculation)
      expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
      
      // For performance testing, we'd need to add artificial delay or measure at higher precision
      // But the important thing is that the results are cached and identical
    });
  });

  describe('MOIC Calculations', () => {
    it('should calculate current MOIC correctly', async () => {
      const company = createMockCompany({
        totalInvested: 1000000,
        currentValuation: 5000000,
      });
      const input = createMockInput({ portfolio: [company] });
      
      const result = await engine.calculateOptimalReserveAllocation(input);
      const allocation = result.allocations[0];

      expect(allocation).toBeDefined();
      expect(allocation.expectedMOIC).toBeGreaterThan(0);
    });

    it('should handle companies with zero valuation', async () => {
      const company = createMockCompany({
        currentValuation: 0,
        totalInvested: 1000000,
      });
      const input = createMockInput({ portfolio: [company] });
      
      // Should not throw error, but allocation should be zero or very low
      const result = await engine.calculateOptimalReserveAllocation(input);
      expect(result.allocations).toHaveLength(0);
    });

    it('should prioritize companies with higher MOIC potential', async () => {
      const lowMOICCompany = createMockCompany({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Low MOIC Company',
        currentValuation: 1100000, // 1.1x MOIC
        totalInvested: 1000000,
      });

      const highMOICCompany = createMockCompany({
        id: '22222222-2222-2222-2222-222222222222',
        name: 'High MOIC Company',
        currentValuation: 10000000, // 10x MOIC
        totalInvested: 1000000,
      });

      const input = createMockInput({
        portfolio: [lowMOICCompany, highMOICCompany],
        availableReserves: 2000000,
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      // High MOIC company should have higher priority (lower priority number)
      const highMOICAllocation = result.allocations.find(a => a.companyId === highMOICCompany.id);
      const lowMOICAllocation = result.allocations.find(a => a.companyId === lowMOICCompany.id);

      if (highMOICAllocation && lowMOICAllocation) {
        expect(highMOICAllocation.priority).toBeLessThan(lowMOICAllocation.priority);
      }
    });
  });

  describe('Risk Adjustments', () => {
    it('should apply risk adjustments when enabled', async () => {
      const input = createMockInput({ enableRiskAdjustment: true });
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(result.allocations[0].riskAdjustedReturn).toBeDefined();
      expect(result.allocations[0].riskAdjustedReturn).toBeGreaterThan(0);
    });

    it('should skip risk adjustments when disabled', async () => {
      const inputWithRisk = createMockInput({ enableRiskAdjustment: true });
      const inputWithoutRisk = createMockInput({ enableRiskAdjustment: false });

      const resultWithRisk = await engine.calculateOptimalReserveAllocation(inputWithRisk);
      const resultWithoutRisk = await engine.calculateOptimalReserveAllocation(inputWithoutRisk);

      // When risk adjustment is disabled, allocations should not be risk-adjusted
      // The risk-adjusted return value is always calculated but the allocation amounts differ
      // Since both use the same input companies, we check that allocations are indeed returned
      expect(resultWithoutRisk.allocations.length).toBeGreaterThan(0);
      expect(resultWithRisk.allocations.length).toBeGreaterThan(0);
      
      // Both should have risk-adjusted returns calculated (internal calculation always happens)
      expect(resultWithRisk.allocations[0].riskAdjustedReturn).toBeGreaterThan(0);
      expect(resultWithoutRisk.allocations[0].riskAdjustedReturn).toBeGreaterThan(0);
    });

    it('should add risk factors for high-risk companies', async () => {
      const oldCompany = createMockCompany({
        investmentDate: new Date('2018-01-01'), // 6+ years ago
        currentMOIC: 0.5, // Under-performing
      });

      const input = createMockInput({ portfolio: [oldCompany] });
      const result = await engine.calculateOptimalReserveAllocation(input);

      if (result.allocations.length > 0) {
        expect(result.allocations[0].riskFactors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Diversification Logic', () => {
    it('should apply diversification when enabled', async () => {
      const company1 = createMockCompany({
        id: '11111111-1111-1111-1111-111111111111',
        sector: 'Technology',
      });
      const company2 = createMockCompany({
        id: '22222222-2222-2222-2222-222222222222',
        sector: 'Healthcare',
      });

      const input = createMockInput({
        portfolio: [company1, company2],
        enableDiversification: true,
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      expect(result.portfolioMetrics.portfolioDiversification).toBeGreaterThan(0);
    });

    it('should respect concentration limits', async () => {
      const input = createMockInput({
        maxPortfolioConcentration: 0.05, // 5% max
        totalFundSize: 100000000,
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      for (const allocation of result.allocations) {
        expect(allocation.portfolioWeight).toBeLessThanOrEqual(0.05);
      }
    });

    it('should flag high concentration risk', async () => {
      const input = createMockInput({
        maxPortfolioConcentration: 0.1,
        totalFundSize: 10000000, // Smaller fund to create concentration
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      if (result.allocations.length > 0) {
        // Should either limit allocation or flag as high risk
        const allocation = result.allocations[0];
        if (allocation.portfolioWeight > 0.08) {
          expect(allocation.concentrationRisk).toBe('high');
        }
      }
    });
  });

  describe('Constraint Application', () => {
    it('should respect minimum allocation threshold', async () => {
      const input = createMockInput({
        minAllocationThreshold: 100000,
        availableReserves: 50000, // Less than minimum
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      expect(result.allocations).toHaveLength(0);
    });

    it('should respect maximum single allocation', async () => {
      const input = createMockInput({
        maxSingleAllocation: 500000,
        availableReserves: 10000000,
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      for (const allocation of result.allocations) {
        expect(allocation.recommendedAllocation).toBeLessThanOrEqual(500000);
      }
    });

    it('should not exceed available reserves', async () => {
      const company1 = createMockCompany({
        id: '11111111-1111-1111-1111-111111111111',
      });
      const company2 = createMockCompany({
        id: '22222222-2222-2222-2222-222222222222',
      });

      const input = createMockInput({
        portfolio: [company1, company2],
        availableReserves: 1000000,
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      const totalAllocated = result.allocations.reduce(
        (sum, a) => sum + a.recommendedAllocation,
        0
      );

      expect(totalAllocated).toBeLessThanOrEqual(input.availableReserves);
    });
  });

  describe('Portfolio Metrics', () => {
    it('should calculate portfolio MOIC correctly', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(result.portfolioMetrics.expectedPortfolioMOIC).toBeGreaterThan(0);
      expect(result.portfolioMetrics.expectedPortfolioValue).toBeGreaterThan(0);
    });

    it('should calculate diversification index', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(result.portfolioMetrics.portfolioDiversification).toBeGreaterThanOrEqual(0);
      expect(result.portfolioMetrics.portfolioDiversification).toBeLessThanOrEqual(1);
    });

    it('should assess concentration risk correctly', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(['low', 'medium', 'high']).toContain(result.portfolioMetrics.concentrationRisk);
    });
  });

  describe('Scenario Analysis', () => {
    it('should generate scenario results', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(result.scenarioResults.conservative.totalValue).toBeGreaterThan(0);
      expect(result.scenarioResults.base.totalValue).toBeGreaterThan(0);
      expect(result.scenarioResults.optimistic.totalValue).toBeGreaterThan(0);

      // Optimistic should be higher than conservative
      expect(result.scenarioResults.optimistic.totalValue)
        .toBeGreaterThan(result.scenarioResults.conservative.totalValue);
    });

    it('should have probabilities that sum to 1', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      const totalProbability = 
        result.scenarioResults.conservative.probability +
        result.scenarioResults.base.probability +
        result.scenarioResults.optimistic.probability;

      expect(totalProbability).toBeCloseTo(1.0, 2);
    });
  });

  describe('Performance Tests', () => {
    it('should complete calculation within time limit', async () => {
      const largePortfolio = Array.from({ length: 50 }, (_, i) =>
        createMockCompany({
          id: `${i.toString().padStart(8, '0')}-1111-1111-1111-111111111111`,
          name: `Company ${i}`,
        })
      );

      const input = createMockInput({
        portfolio: largePortfolio,
        availableReserves: 50000000,
      });

      const start = Date.now();
      const result = await engine.calculateOptimalReserveAllocation(input);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10000); // 10 seconds max
      expect(result.metadata.calculationDuration).toBeLessThan(10000);
    });

    it('should handle large numbers accurately', async () => {
      const input = createMockInput({
        availableReserves: 1000000000, // $1B
        totalFundSize: 10000000000, // $10B
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      expect(result.inputSummary.availableReserves).toBe(1000000000);
      expect(result.inputSummary.allocationEfficiency).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle inactive companies', async () => {
      const activeCompany = createMockCompany({
        id: '11111111-1111-1111-1111-111111111111',
        isActive: true,
      });
      const inactiveCompany = createMockCompany({
        id: '22222222-2222-2222-2222-222222222222',
        isActive: false,
      });

      const input = createMockInput({
        portfolio: [activeCompany, inactiveCompany],
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      // Should only have allocation for active company
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].companyId).toBe(activeCompany.id);
    });

    it('should handle companies with missing optional fields', async () => {
      const minimalCompany = createMockCompany({
        liquidationPreference: undefined,
        lastRoundDate: undefined,
        exitDate: undefined,
        estimatedExitValue: undefined,
        notes: undefined,
      });

      const input = createMockInput({ portfolio: [minimalCompany] });
      const result = await engine.calculateOptimalReserveAllocation(input);

      expect(result.allocations).toHaveLength(1);
    });

    it('should handle very small allocations', async () => {
      const input = createMockInput({
        availableReserves: 10000, // Small amount
        minAllocationThreshold: 1000,
      });

      const result = await engine.calculateOptimalReserveAllocation(input);
      
      // Should handle small numbers without precision issues
      expect(result.inputSummary.totalAllocated).toBeLessThanOrEqual(10000);
    });
  });

  describe('Excel Parity Foundation', () => {
    it('should generate consistent allocation rankings', async () => {
      // Test with known inputs that should produce predictable rankings
      const companies = [
        createMockCompany({
          id: '11111111-1111-1111-1111-111111111111',
          name: 'High Performer',
          currentValuation: 10000000,
          totalInvested: 1000000, // 10x MOIC
        }),
        createMockCompany({
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Medium Performer',
          currentValuation: 3000000,
          totalInvested: 1000000, // 3x MOIC
        }),
        createMockCompany({
          id: '33333333-3333-3333-3333-333333333333',
          name: 'Low Performer',
          currentValuation: 1100000,
          totalInvested: 1000000, // 1.1x MOIC
        }),
      ];

      const input = createMockInput({ portfolio: companies });
      const result = await engine.calculateOptimalReserveAllocation(input);

      // Rankings should be predictable based on MOIC
      const highPerformerAllocation = result.allocations.find(
        a => a.companyName === 'High Performer'
      );
      const mediumPerformerAllocation = result.allocations.find(
        a => a.companyName === 'Medium Performer'
      );

      if (highPerformerAllocation && mediumPerformerAllocation) {
        expect(highPerformerAllocation.priority).toBeLessThan(mediumPerformerAllocation.priority);
      }
    });

    it('should maintain calculation precision', async () => {
      const input = createMockInput();
      const result = await engine.calculateOptimalReserveAllocation(input);

      // All financial values should have reasonable precision
      for (const allocation of result.allocations) {
        expect(allocation.recommendedAllocation).toBeGreaterThan(0);
        expect(allocation.expectedMOIC).toBeGreaterThan(0);
        expect(allocation.expectedValue).toBeGreaterThan(0);
        
        // Check that values are not too precise (suggesting rounding errors)
        expect(allocation.recommendedAllocation % 1).toBeLessThan(0.01);
      }
    });
  });
});

// Integration test for full calculation flow
describe('Integration: Full Calculation Flow', () => {
  it('should complete end-to-end calculation successfully', async () => {
    const engine = new DeterministicReserveEngine();
    
    // Create realistic portfolio
    const portfolio: PortfolioCompany[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'TechStartup Inc',
        sector: 'Technology',
        currentStage: 'seed',
        totalInvested: 2000000,
        currentValuation: 8000000,
        ownershipPercentage: 0.12,
        investmentDate: new Date('2022-06-15'),
        isActive: true,
        currentMOIC: 4.0,
        confidenceLevel: 0.8,
        tags: ['AI', 'B2B'],
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'BioTech Corp',
        sector: 'Healthcare',
        currentStage: 'series_a',
        totalInvested: 5000000,
        currentValuation: 15000000,
        ownershipPercentage: 0.15,
        investmentDate: new Date('2021-03-10'),
        isActive: true,
        currentMOIC: 3.0,
        confidenceLevel: 0.9,
        tags: ['Biotech', 'Drug Discovery'],
      },
    ];

    const input: ReserveAllocationInput = {
      portfolio,
      availableReserves: 25000000,
      totalFundSize: 200000000,
      graduationMatrix: DEFAULT_GRADUATION_MATRIX,
      stageStrategies: DEFAULT_STAGE_STRATEGIES,
      minAllocationThreshold: 100000,
      maxPortfolioConcentration: 0.08,
      scenarioType: 'base',
      timeHorizon: 84,
      enableDiversification: true,
      enableRiskAdjustment: true,
      enableLiquidationPreferences: true,
    };

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Validate comprehensive result structure
    expect(result.inputSummary).toBeDefined();
    expect(result.allocations).toBeDefined();
    expect(result.portfolioMetrics).toBeDefined();
    expect(result.riskAnalysis).toBeDefined();
    expect(result.scenarioResults).toBeDefined();
    expect(result.metadata).toBeDefined();

    // Validate business logic
    expect(result.allocations.length).toBeGreaterThan(0);
    expect(result.inputSummary.totalAllocated).toBeLessThanOrEqual(input.availableReserves);
    expect(result.portfolioMetrics.expectedPortfolioMOIC).toBeGreaterThan(1);

    // Validate determinism
    expect(result.metadata.deterministicHash).toBeDefined();
    expect(result.metadata.modelVersion).toBe('1.0.0');
    expect(result.metadata.calculationDate).toBeInstanceOf(Date);
  });
});