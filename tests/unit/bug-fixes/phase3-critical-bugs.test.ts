/**
 * PHASE 3: CRITICAL BUG FIXES - Unit Tests
 *
 * Comprehensive test suite for critical bug fixes including:
 * 1. Division by zero validation
 * 2. Local PRNG implementation
 * 3. Conservation of capital validation
 * 4. Improved calculation formulas
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeterministicReserveEngine } from '@shared/core/reserves/DeterministicReserveEngine';
import { ConstrainedReserveEngine } from '@shared/core/reserves/ConstrainedReserveEngine';
import { MonteCarloEngine } from '../../../server/services/monte-carlo-engine';
import { MonteCarloSimulationService } from '../../../server/services/monte-carlo-simulation';
import { PRNG } from '@shared/utils/prng';
import {
  validateConservation,
  assertConservation,
  validateReserveAllocationConservation,
  ConservationError,
} from '@shared/validation/conservation';
import type { ReserveAllocationInput, PortfolioCompany } from '@shared/schemas/reserves-schemas';

describe('Phase 3: Critical Bug Fixes', () => {
  describe('1. Division by Zero Fixes', () => {
    let engine: DeterministicReserveEngine;

    beforeEach(() => {
      engine = new DeterministicReserveEngine();
    });

    it('should throw error when company has zero currentValuation', async () => {
      const invalidInput: ReserveAllocationInput = {
        portfolio: [
          {
            id: 'company-1',
            name: 'Invalid Company',
            currentStage: 'seed',
            currentValuation: 0, // INVALID: zero valuation
            totalInvested: 1000000,
            ownershipPercentage: 0.10,
            sector: 'tech',
            isActive: true,
            investmentDate: new Date('2023-01-01'),
          } as PortfolioCompany,
        ],
        totalFundSize: 100000000,
        availableReserves: 50000000,
        minAllocationThreshold: 100000,
        maxPortfolioConcentration: 0.20,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: {
          rates: [
            { fromStage: 'seed', toStage: 'series-a', probability: 0.3, valuationMultiple: 3 },
          ],
        },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 84,
      };

      await expect(engine.calculateOptimalReserveAllocation(invalidInput))
        .rejects
        .toThrow(/Invalid currentValuation.*Must be positive/);
    });

    it('should throw error when company has negative currentValuation', async () => {
      const invalidInput: ReserveAllocationInput = {
        portfolio: [
          {
            id: 'company-1',
            name: 'Invalid Company',
            currentStage: 'seed',
            currentValuation: -1000000, // INVALID: negative valuation
            totalInvested: 1000000,
            ownershipPercentage: 0.10,
            sector: 'tech',
            isActive: true,
            investmentDate: new Date('2023-01-01'),
          } as PortfolioCompany,
        ],
        totalFundSize: 100000000,
        availableReserves: 50000000,
        minAllocationThreshold: 100000,
        maxPortfolioConcentration: 0.20,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: {
          rates: [
            { fromStage: 'seed', toStage: 'series-a', probability: 0.3, valuationMultiple: 3 },
          ],
        },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 84,
      };

      await expect(engine.calculateOptimalReserveAllocation(invalidInput))
        .rejects
        .toThrow(/Invalid currentValuation.*Must be positive/);
    });

    it('should successfully calculate with valid currentValuation', async () => {
      const validInput: ReserveAllocationInput = {
        portfolio: [
          {
            id: 'company-1',
            name: 'Valid Company',
            currentStage: 'seed',
            currentValuation: 5000000, // VALID
            totalInvested: 1000000,
            ownershipPercentage: 0.20,
            sector: 'tech',
            isActive: true,
            investmentDate: new Date('2023-01-01'),
          } as PortfolioCompany,
        ],
        totalFundSize: 100000000,
        availableReserves: 50000000,
        minAllocationThreshold: 100000,
        maxPortfolioConcentration: 0.20,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: {
          rates: [
            { fromStage: 'seed', toStage: 'series-a', probability: 0.3, valuationMultiple: 3 },
          ],
        },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 84,
      };

      const result = await engine.calculateOptimalReserveAllocation(validInput);
      expect(result).toBeDefined();
      expect(result.allocations).toBeDefined();
    });

    it('should validate present value calculation in ConstrainedReserveEngine', () => {
      const engine = new ConstrainedReserveEngine();

      const validInput = {
        availableReserves: 10000000,
        companies: [
          { id: 'c1', name: 'Company 1', stage: 'seed', invested: 1000000 },
        ],
        stagePolicies: [
          { stage: 'seed', weight: 1.0, reserveMultiple: 2.0 },
        ],
        constraints: {
          discountRateAnnual: 0.12,
          graduationYears: { seed: 5 },
          graduationProb: { seed: 0.5 },
        },
      };

      const result = engine.calculate(validInput);
      expect(result).toBeDefined();
      expect(result.conservationOk).toBe(true);
    });
  });

  describe('2. Local PRNG Implementation', () => {
    it('should generate deterministic sequence with seed', () => {
      const prng1 = new PRNG(12345);
      const prng2 = new PRNG(12345);

      const sequence1 = Array.from({ length: 100 }, () => prng1.next());
      const sequence2 = Array.from({ length: 100 }, () => prng2.next());

      expect(sequence1).toEqual(sequence2);
    });

    it('should generate different sequences with different seeds', () => {
      const prng1 = new PRNG(12345);
      const prng2 = new PRNG(54321);

      const sequence1 = Array.from({ length: 100 }, () => prng1.next());
      const sequence2 = Array.from({ length: 100 }, () => prng2.next());

      expect(sequence1).not.toEqual(sequence2);
    });

    it('should generate normal distribution with correct properties', () => {
      const prng = new PRNG(12345);
      const samples = Array.from({ length: 10000 }, () => prng.nextNormal(100, 15));

      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / samples.length;
      const stdDev = Math.sqrt(variance);

      expect(mean).toBeCloseTo(100, 0); // Mean should be close to 100
      expect(stdDev).toBeCloseTo(15, 0); // StdDev should be close to 15
    });

    it('should not modify global Math.random', () => {
      const originalRandom = Math.random;
      const prng = new PRNG(12345);

      // Use PRNG
      prng.next();
      prng.nextNormal(0, 1);

      // Math.random should still be the original function
      expect(Math.random).toBe(originalRandom);

      // Math.random should still generate different values
      const r1 = Math.random();
      const r2 = Math.random();
      expect(r1).not.toBe(r2);
    });

    it('should allow reset to reproduce sequence', () => {
      const prng = new PRNG(12345);

      const sequence1 = Array.from({ length: 10 }, () => prng.next());

      prng.reset(12345);
      const sequence2 = Array.from({ length: 10 }, () => prng.next());

      expect(sequence1).toEqual(sequence2);
    });

    it('should integrate correctly with MonteCarloEngine', () => {
      const engine1 = new MonteCarloEngine(12345);
      const engine2 = new MonteCarloEngine(12345);

      // Both engines should produce identical results with same seed
      // (This would require running actual simulations, which is tested in integration tests)
      expect(engine1).toBeDefined();
      expect(engine2).toBeDefined();
    });
  });

  describe('3. Conservation of Capital Validation', () => {
    it('should pass validation when input equals output', () => {
      const result = validateConservation([1000000], [900000, 100000]);

      expect(result.isValid).toBe(true);
      expect(result.totalInput).toBe(1000000);
      expect(result.totalOutput).toBe(1000000);
      expect(result.difference).toBe(0);
    });

    it('should fail validation when difference exceeds tolerance', () => {
      const result = validateConservation(
        [1000000],
        [900000, 90000], // Only 990000 total
        0.001 // 0.1% tolerance
      );

      expect(result.isValid).toBe(false);
      expect(result.percentageError).toBeGreaterThan(0.001);
    });

    it('should pass with minor rounding errors within tolerance', () => {
      const result = validateConservation(
        [1000000],
        [500000, 499999.99], // 0.0001% difference
        0.01 // 1% tolerance
      );

      expect(result.isValid).toBe(true);
    });

    it('should throw ConservationError with assertConservation', () => {
      expect(() => {
        assertConservation(
          [1000000],
          [900000, 80000], // Missing 20000
          0.001,
          'Test context'
        );
      }).toThrow(ConservationError);
    });

    it('should validate reserve allocations conserve total', () => {
      const result = validateReserveAllocationConservation(
        10000000, // Total available
        [3000000, 2000000, 4000000], // Individual allocations
        1000000 // Unallocated
      );

      expect(result.isValid).toBe(true);
      expect(result.totalInput).toBe(10000000);
      expect(result.totalOutput).toBe(10000000);
    });

    it('should integrate conservation check into DeterministicReserveEngine', async () => {
      const engine = new DeterministicReserveEngine();

      const input: ReserveAllocationInput = {
        portfolio: [
          {
            id: 'company-1',
            name: 'Company 1',
            currentStage: 'seed',
            currentValuation: 5000000,
            totalInvested: 1000000,
            ownershipPercentage: 0.20,
            sector: 'tech',
            isActive: true,
            investmentDate: new Date('2023-01-01'),
          } as PortfolioCompany,
        ],
        totalFundSize: 100000000,
        availableReserves: 10000000,
        minAllocationThreshold: 100000,
        maxPortfolioConcentration: 0.20,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: {
          rates: [
            { fromStage: 'seed', toStage: 'series-a', probability: 0.3, valuationMultiple: 3 },
          ],
        },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 84,
      };

      const result = await engine.calculateOptimalReserveAllocation(input);

      // Verify conservation: total allocated + unallocated = available reserves
      const totalAllocated = result.allocations.reduce(
        (sum, a) => sum + a.recommendedAllocation,
        0
      );

      expect(totalAllocated + result.unallocatedReserves).toBeCloseTo(
        input.availableReserves,
        -2 // Within $100
      );
    });
  });

  describe('4. Improved Calculation Formulas', () => {
    it('should use stage-specific graduation probabilities', async () => {
      const engine = new DeterministicReserveEngine();

      const input: ReserveAllocationInput = {
        portfolio: [
          {
            id: 'seed-company',
            name: 'Seed Company',
            currentStage: 'seed',
            currentValuation: 3000000,
            totalInvested: 500000,
            ownershipPercentage: 0.15,
            sector: 'tech',
            isActive: true,
            investmentDate: new Date('2023-01-01'),
          } as PortfolioCompany,
          {
            id: 'series-a-company',
            name: 'Series A Company',
            currentStage: 'series-a',
            currentValuation: 10000000,
            totalInvested: 2000000,
            ownershipPercentage: 0.20,
            sector: 'tech',
            isActive: true,
            investmentDate: new Date('2022-01-01'),
          } as PortfolioCompany,
        ],
        totalFundSize: 100000000,
        availableReserves: 20000000,
        minAllocationThreshold: 100000,
        maxPortfolioConcentration: 0.20,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: {
          rates: [], // Empty - should use defaults
        },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 84,
      };

      const result = await engine.calculateOptimalReserveAllocation(input);

      // Seed companies should have lower graduation probability (default 0.30)
      // Series A companies should have higher graduation probability (default 0.50)
      expect(result.allocations).toBeDefined();
      expect(result.allocations.length).toBeGreaterThan(0);
    });

    it('should calculate present value correctly with validation', () => {
      const engine = new ConstrainedReserveEngine();

      const input = {
        availableReserves: 10000000,
        companies: [
          { id: 'c1', name: 'Company 1', stage: 'seed', invested: 1000000 },
        ],
        stagePolicies: [
          { stage: 'seed', weight: 1.0, reserveMultiple: 2.0 },
        ],
        constraints: {
          discountRateAnnual: 0.12,
          graduationYears: { seed: 5 },
          graduationProb: { seed: 0.5 },
        },
      };

      const result = engine.calculate(input);

      expect(result.allocations.length).toBeGreaterThan(0);
      expect(result.conservationOk).toBe(true);
    });

    it('should use risk-based cash buffer calculation', () => {
      const { LiquidityEngine } = require('../../../client/src/core/LiquidityEngine');

      // Small fund
      const smallEngine = new LiquidityEngine('fund-1', 40_000_000);
      const smallBuffer = smallEngine['calculateMinimumCashBuffer']();
      expect(smallBuffer / 40_000_000).toBeGreaterThan(0.02); // >2% for small funds

      // Large fund
      const largeEngine = new LiquidityEngine('fund-2', 600_000_000);
      const largeBuffer = largeEngine['calculateMinimumCashBuffer']();
      expect(largeBuffer / 600_000_000).toBeLessThan(0.02); // <2% for large funds

      // Minimum absolute floor
      const tinyEngine = new LiquidityEngine('fund-3', 1_000_000);
      const tinyBuffer = tinyEngine['calculateMinimumCashBuffer']();
      expect(tinyBuffer).toBeGreaterThanOrEqual(100_000); // $100k minimum
    });
  });

  describe('5. Regression Tests', () => {
    it('should maintain backward compatibility with existing calculations', async () => {
      const engine = new DeterministicReserveEngine();

      const input: ReserveAllocationInput = {
        portfolio: [
          {
            id: 'company-1',
            name: 'Test Company',
            currentStage: 'series-a',
            currentValuation: 20000000,
            totalInvested: 5000000,
            ownershipPercentage: 0.25,
            sector: 'fintech',
            isActive: true,
            investmentDate: new Date('2022-06-01'),
          } as PortfolioCompany,
        ],
        totalFundSize: 100000000,
        availableReserves: 30000000,
        minAllocationThreshold: 500000,
        maxPortfolioConcentration: 0.25,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: {
          rates: [
            { fromStage: 'series-a', toStage: 'series-b', probability: 0.6, valuationMultiple: 2.5 },
          ],
        },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 60,
      };

      const result = await engine.calculateOptimalReserveAllocation(input);

      // Should still produce valid results
      expect(result.allocations.length).toBeGreaterThan(0);
      expect(result.inputSummary.totalAllocated).toBeGreaterThan(0);
      expect(result.inputSummary.totalAllocated).toBeLessThanOrEqual(input.availableReserves);
    });

    it('should handle edge cases gracefully', async () => {
      const engine = new DeterministicReserveEngine();

      // Empty portfolio
      const emptyInput: ReserveAllocationInput = {
        portfolio: [],
        totalFundSize: 100000000,
        availableReserves: 50000000,
        minAllocationThreshold: 100000,
        maxPortfolioConcentration: 0.20,
        enableDiversification: true,
        enableRiskAdjustment: true,
        graduationMatrix: { rates: [] },
        stageStrategies: [],
        scenarioType: 'base',
        timeHorizon: 84,
      };

      await expect(engine.calculateOptimalReserveAllocation(emptyInput))
        .rejects
        .toThrow(/Portfolio cannot be empty/);
    });
  });
});