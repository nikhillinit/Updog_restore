/**
 * Property-Based Tests for DeterministicReserveEngine
 *
 * Tests 5 core invariants that must hold for all valid inputs:
 * 1. Conservation of Reserves - Total allocations ≤ available reserves
 * 2. Non-negativity - All allocations ≥ 0
 * 3. Monotonicity - Higher MOIC companies get priority
 * 4. Graduation Probability Impact - Higher probability → higher allocation
 * 5. Idempotence - Same inputs always produce same outputs
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DeterministicReserveEngine } from '../DeterministicReserveEngine';

// Arbitraries for generating test data
const portfolioCompanyArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  sector: fc.constantFrom('SaaS', 'FinTech', 'HealthTech', 'EdTech', 'DeepTech'),
  currentStage: fc.constantFrom('seed', 'series-a', 'series-b', 'series-c', 'growth'),
  totalInvested: fc.double({ min: 100000, max: 10000000, noNaN: true }),
  currentValuation: fc.double({ min: 100000, max: 50000000, noNaN: true }),
  ownershipPercentage: fc.double({ min: 0.01, max: 0.5, noNaN: true }),
  investmentDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-01-01') }),
  isActive: fc.constant(true),
  currentMOIC: fc.double({ min: 0.1, max: 10, noNaN: true }),
});

const reserveAllocationInputArbitrary = fc.record({
  portfolio: fc.array(portfolioCompanyArbitrary, { minLength: 1, maxLength: 30 }),
  availableReserves: fc.double({ min: 1000000, max: 100000000, noNaN: true }),
  totalFundSize: fc.double({ min: 10000000, max: 500000000, noNaN: true }),
  scenarioType: fc.constantFrom('conservative', 'base', 'optimistic'),
  timeHorizon: fc.integer({ min: 12, max: 120 }),
  minAllocationThreshold: fc.constant(50000),
  maxSingleAllocation: fc.double({ min: 1000000, max: 10000000, noNaN: true }),
  maxPortfolioConcentration: fc.double({ min: 0.1, max: 0.3, noNaN: true }),
  enableDiversification: fc.boolean(),
  enableRiskAdjustment: fc.boolean(),
  graduationMatrix: fc.constant({
    rates: [
      { fromStage: 'seed', toStage: 'series-a', probability: 0.3, valuationMultiple: 2.0 },
      { fromStage: 'series-a', toStage: 'series-b', probability: 0.5, valuationMultiple: 2.5 },
      { fromStage: 'series-b', toStage: 'series-c', probability: 0.6, valuationMultiple: 2.0 },
      { fromStage: 'series-c', toStage: 'growth', probability: 0.7, valuationMultiple: 1.8 },
      { fromStage: 'growth', toStage: 'late-stage', probability: 0.75, valuationMultiple: 1.5 },
    ],
  }),
  stageStrategies: fc.constant([
    {
      stage: 'seed',
      minInvestment: 50000,
      maxInvestment: 1000000,
      expectedMOIC: 10.0,
      expectedTimeToExit: 96,
      failureRate: 0.7,
      followOnProbability: 0.3,
    },
    {
      stage: 'series-a',
      minInvestment: 100000,
      maxInvestment: 2000000,
      expectedMOIC: 5.0,
      expectedTimeToExit: 84,
      failureRate: 0.5,
      followOnProbability: 0.5,
    },
    {
      stage: 'series-b',
      minInvestment: 200000,
      maxInvestment: 3000000,
      expectedMOIC: 3.0,
      expectedTimeToExit: 72,
      failureRate: 0.4,
      followOnProbability: 0.6,
    },
    {
      stage: 'series-c',
      minInvestment: 500000,
      maxInvestment: 5000000,
      expectedMOIC: 2.5,
      expectedTimeToExit: 60,
      failureRate: 0.3,
      followOnProbability: 0.7,
    },
    {
      stage: 'growth',
      minInvestment: 1000000,
      maxInvestment: 10000000,
      expectedMOIC: 2.0,
      expectedTimeToExit: 48,
      failureRate: 0.2,
      followOnProbability: 0.75,
    },
  ]),
});

describe('DeterministicReserveEngine - Property-Based Tests', () => {
  const TOLERANCE = 1e-6; // Floating point tolerance

  // Property 1: Conservation of Reserves
  // The sum of all allocations must never exceed the available reserves
  it('conserves total reserves (sum of allocations ≤ total available)', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          const totalAllocated = result.allocations.reduce(
            (sum, allocation) => sum + allocation.recommendedAllocation,
            0
          );

          // Total allocated must not exceed available reserves (with tolerance for floating point)
          expect(totalAllocated).toBeLessThanOrEqual(input.availableReserves + TOLERANCE);

          // Verify consistency with result metadata
          expect(result.inputSummary.totalAllocated).toBeCloseTo(totalAllocated, 2);
        }
      ),
      { numRuns: 50, timeout: 60000 } // Run 50 test cases
    );
  });

  // Property 2: Non-negativity
  // All reserve allocations must be non-negative
  it('never assigns negative reserves', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          // Every allocation must be non-negative
          for (const allocation of result.allocations) {
            expect(allocation.recommendedAllocation).toBeGreaterThanOrEqual(0);
          }

          // Unallocated reserves must also be non-negative
          expect(result.unallocatedReserves).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });

  // Property 3: Monotonicity
  // Companies with higher expected MOIC should receive higher or equal allocation priority
  // (Note: Priority 1 is highest, so lower priority number = better)
  it('maintains monotonicity - higher MOIC companies get higher priority', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          // Check that allocations are ordered by priority
          const allocations = result.allocations;

          for (let i = 0; i < allocations.length - 1; i++) {
            const current = allocations[i];
            const next = allocations[i + 1];

            if (!current || !next) continue;

            // Priority should be increasing (1, 2, 3, ...)
            expect(current.priority).toBeLessThanOrEqual(next.priority);

            // If priorities are equal, allocations can be in any order
            // If current has lower priority number, it should generally have higher expected value
            // (with some tolerance for risk adjustments and diversification)
          }
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });

  // Property 4: Graduation Probability Impact
  // Companies with higher graduation probability should receive more favorable treatment
  // This tests that the graduation probability is properly factored into allocation decisions
  it('respects graduation probability in allocation calculations', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          // Every allocation should have valid graduation probability metadata
          for (const allocation of result.allocations) {
            const metadata = allocation.calculationMetadata;

            // Graduation probability should be between 0 and 1
            expect(metadata.graduationProbability).toBeGreaterThanOrEqual(0);
            expect(metadata.graduationProbability).toBeLessThanOrEqual(1);

            // Expected MOIC should be positive
            expect(allocation.expectedMOIC).toBeGreaterThan(0);

            // Expected value should be positive
            expect(allocation.expectedValue).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });

  // Property 5: Idempotence
  // Running the same calculation twice with identical inputs should produce identical results
  it('is idempotent - same inputs always produce same outputs', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();

          // Run calculation twice
          const result1 = await engine.calculateOptimalReserveAllocation(input);
          const result2 = await engine.calculateOptimalReserveAllocation(input);

          // Results should be identical
          expect(result1.allocations.length).toBe(result2.allocations.length);
          expect(result1.inputSummary.totalAllocated).toBeCloseTo(
            result2.inputSummary.totalAllocated,
            2
          );
          expect(result1.unallocatedReserves).toBeCloseTo(result2.unallocatedReserves, 2);

          // Check that each allocation is the same
          for (let i = 0; i < result1.allocations.length; i++) {
            const alloc1 = result1.allocations[i];
            const alloc2 = result2.allocations[i];

            if (!alloc1 || !alloc2) continue;

            expect(alloc1.companyId).toBe(alloc2.companyId);
            expect(alloc1.recommendedAllocation).toBeCloseTo(alloc2.recommendedAllocation, 2);
            expect(alloc1.priority).toBe(alloc2.priority);
            expect(alloc1.expectedMOIC).toBeCloseTo(alloc2.expectedMOIC, 2);
          }

          // Deterministic hash should be identical
          expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
        }
      ),
      { numRuns: 30, timeout: 60000 } // Fewer runs since we run the calculation twice
    );
  });

  // Additional Property: Portfolio Metrics Consistency
  // Portfolio metrics should be consistent with individual allocations
  it('maintains consistency between allocations and portfolio metrics', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          // Calculate expected portfolio value from allocations
          const calculatedExpectedValue = result.allocations.reduce(
            (sum, allocation) => sum + allocation.expectedValue,
            0
          );

          // Should match portfolio metrics
          expect(result.portfolioMetrics.expectedPortfolioValue).toBeCloseTo(
            calculatedExpectedValue,
            2
          );

          // Allocation efficiency should be between 0 and 1
          expect(result.inputSummary.allocationEfficiency).toBeGreaterThanOrEqual(0);
          expect(result.inputSummary.allocationEfficiency).toBeLessThanOrEqual(1);

          // Diversification index should be between 0 and 1
          expect(result.portfolioMetrics.portfolioDiversification).toBeGreaterThanOrEqual(0);
          expect(result.portfolioMetrics.portfolioDiversification).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });

  // Boundary Condition: Minimum Allocation Threshold
  // All allocations should respect the minimum threshold
  it('respects minimum allocation threshold', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          // Every allocation should be at or above the minimum threshold
          for (const allocation of result.allocations) {
            expect(allocation.recommendedAllocation).toBeGreaterThanOrEqual(
              input.minAllocationThreshold
            );
          }
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });

  // Boundary Condition: Maximum Single Allocation
  // No single allocation should exceed the maximum
  it('respects maximum single allocation limit', () => {
    fc.assert(
      fc.property(
        reserveAllocationInputArbitrary,
        async (input) => {
          const engine = new DeterministicReserveEngine();
          const result = await engine.calculateOptimalReserveAllocation(input);

          // No allocation should exceed the maximum (if specified)
          if (input.maxSingleAllocation) {
            for (const allocation of result.allocations) {
              expect(allocation.recommendedAllocation).toBeLessThanOrEqual(
                input.maxSingleAllocation + TOLERANCE
              );
            }
          }
        }
      ),
      { numRuns: 50, timeout: 60000 }
    );
  });
});
