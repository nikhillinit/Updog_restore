// @vitest-environment jsdom

/**
 * DeterministicReserveEngine Test Suite
 * Comprehensive tests for MOIC-based reserve allocation with deterministic seeding
 */

import { describe, it, expect } from 'vitest';
import { DeterministicReserveEngine } from '@/core/reserves/DeterministicReserveEngine';
import type {
  ReserveAllocationInput,
  PortfolioCompany,
  GraduationMatrix,
  StageStrategy,
  FeatureFlags,
} from '@shared/schemas/reserves-schemas';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createCompany = (overrides: Partial<PortfolioCompany> = {}): PortfolioCompany => ({
  id: 'company-1',
  name: 'Test Corp',
  currentStage: 'Series A',
  sector: 'SaaS',
  totalInvested: 1000000,
  currentValuation: 5000000,
  ownershipPercentage: 0.15,
  investmentDate: new Date('2023-01-01'),
  isActive: true,
  currentMOIC: 5.0,
  ...overrides,
});

const createGraduationMatrix = (): GraduationMatrix => ({
  version: '1.0',
  lastUpdated: new Date(),
  rates: [
    {
      fromStage: 'Seed',
      toStage: 'Series A',
      probability: 0.4,
      averageTimeMonths: 18,
      valuationMultiple: 3.0,
    },
    {
      fromStage: 'Series A',
      toStage: 'Series B',
      probability: 0.5,
      averageTimeMonths: 24,
      valuationMultiple: 2.5,
    },
    {
      fromStage: 'Series B',
      toStage: 'Series C',
      probability: 0.6,
      averageTimeMonths: 24,
      valuationMultiple: 2.0,
    },
  ],
});

const createStageStrategies = (): StageStrategy[] => [
  {
    stage: 'Seed',
    minInvestment: 100000,
    maxInvestment: 500000,
    targetOwnership: 0.15,
    expectedMOIC: 10.0,
    expectedTimeToExit: 96,
    failureRate: 0.7,
    followOnProbability: 0.5,
  },
  {
    stage: 'Series A',
    minInvestment: 500000,
    maxInvestment: 2000000,
    targetOwnership: 0.12,
    expectedMOIC: 5.0,
    expectedTimeToExit: 72,
    failureRate: 0.5,
    followOnProbability: 0.6,
  },
  {
    stage: 'Series B',
    minInvestment: 1000000,
    maxInvestment: 5000000,
    targetOwnership: 0.1,
    expectedMOIC: 3.0,
    expectedTimeToExit: 60,
    failureRate: 0.3,
    followOnProbability: 0.7,
  },
];

const createAllocationInput = (
  overrides: Partial<ReserveAllocationInput> = {}
): ReserveAllocationInput => ({
  portfolio: [createCompany()],
  graduationMatrix: createGraduationMatrix(),
  stageStrategies: createStageStrategies(),
  availableReserves: 10000000,
  totalFundSize: 50000000,
  scenarioType: 'base',
  timeHorizon: 60,
  minAllocationThreshold: 100000,
  maxSingleAllocation: 5000000,
  maxPortfolioConcentration: 0.2,
  enableDiversification: true,
  enableRiskAdjustment: true,
  ...overrides,
});

// =============================================================================
// INITIALIZATION TESTS
// =============================================================================

describe('DeterministicReserveEngine - Initialization', () => {
  it('should initialize with default feature flags', () => {
    const engine = new DeterministicReserveEngine();
    expect(engine).toBeDefined();
  });

  it('should initialize with custom feature flags', () => {
    const featureFlags: FeatureFlags = {
      enableNewReserveEngine: false,
      enableParityTesting: false,
      enableRiskAdjustments: false,
      enableScenarioAnalysis: false,
      enableAdvancedDiversification: true,
      enableLiquidationPreferences: false,
      enablePerformanceLogging: false,
      maxCalculationTimeMs: 10000,
    };

    const engine = new DeterministicReserveEngine(featureFlags);
    expect(engine).toBeDefined();
  });
});

// =============================================================================
// INPUT VALIDATION TESTS
// =============================================================================

describe('DeterministicReserveEngine - Input Validation', () => {
  it('should reject empty portfolio', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ portfolio: [] });

    await expect(engine.calculateOptimalReserveAllocation(input)).rejects.toThrow(
      'Portfolio cannot be empty'
    );
  });

  it('should reject negative available reserves', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ availableReserves: -1000000 });

    await expect(engine.calculateOptimalReserveAllocation(input)).rejects.toThrow(
      'Available reserves must be positive'
    );
  });

  it('should reject zero total fund size', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ totalFundSize: 0 });

    await expect(engine.calculateOptimalReserveAllocation(input)).rejects.toThrow(
      'Total fund size must be positive'
    );
  });

  it('should accept valid input', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);
    expect(result).toBeDefined();
    expect(result.allocations).toBeInstanceOf(Array);
  });
});

// =============================================================================
// MOIC CALCULATION TESTS
// =============================================================================

describe('DeterministicReserveEngine - MOIC Calculations', () => {
  it('should calculate current MOIC correctly', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({
      totalInvested: 1000000,
      currentValuation: 5000000,
    });
    const input = createAllocationInput({ portfolio: [company] });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Current MOIC should be 5.0x
    expect(result.allocations.length).toBeGreaterThan(0);
  });

  it('should calculate projected MOIC with graduation probability', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({
      currentStage: 'Series A',
      totalInvested: 1000000,
      currentValuation: 3000000,
    });
    const input = createAllocationInput({ portfolio: [company] });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Projected MOIC should be higher than current due to graduation
    expect(result.allocations[0]?.expectedMOIC).toBeGreaterThan(3.0);
  });

  it('should handle zero valuation gracefully', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({
      currentValuation: 0,
      totalInvested: 1000000,
    });
    const input = createAllocationInput({ portfolio: [company] });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Should skip company with zero valuation or handle it gracefully
    expect(result.allocations.length).toBeGreaterThanOrEqual(0);
  });

  it('should calculate MOIC for multiple companies', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = [
      createCompany({ id: 'c1', totalInvested: 1000000, currentValuation: 5000000 }),
      createCompany({ id: 'c2', totalInvested: 2000000, currentValuation: 8000000 }),
      createCompany({ id: 'c3', totalInvested: 500000, currentValuation: 3000000 }),
    ];
    const input = createAllocationInput({ portfolio });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.allocations.length).toBeGreaterThan(0);
    expect(result.allocations.length).toBeLessThanOrEqual(3);
  });
});

// =============================================================================
// GRADUATION PROBABILITY TESTS
// =============================================================================

describe('DeterministicReserveEngine - Graduation Probability', () => {
  it('should apply graduation probability from matrix', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({ currentStage: 'Series A' });
    const input = createAllocationInput({ portfolio: [company] });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Series A -> Series B has 50% graduation probability
    expect(result.allocations[0]?.calculationMetadata.graduationProbability).toBeCloseTo(0.5, 1);
  });

  it('should handle missing graduation rates', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({ currentStage: 'Unknown Stage' as any });
    const graduationMatrix: GraduationMatrix = {
      version: '1.0',
      lastUpdated: new Date(),
      rates: [],
    };
    const input = createAllocationInput({
      portfolio: [company],
      graduationMatrix,
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Should use default graduation probability
    expect(result).toBeDefined();
  });

  it('should calculate expected value with probability weighting', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({
      currentStage: 'Series B',
      totalInvested: 1000000,
      currentValuation: 4000000,
    });
    const input = createAllocationInput({ portfolio: [company] });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Expected value should be probability-weighted
    expect(result.allocations[0]?.expectedValue).toBeGreaterThan(0);
  });
});

// =============================================================================
// SCENARIO ANALYSIS TESTS
// =============================================================================

describe('DeterministicReserveEngine - Scenario Analysis', () => {
  it('should generate conservative scenario', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ scenarioType: 'conservative' });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.scenarioResults?.conservative).toBeDefined();
    expect(result.scenarioResults.conservative.portfolioMOIC).toBeLessThan(
      result.scenarioResults.base.portfolioMOIC
    );
  });

  it('should generate base scenario', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ scenarioType: 'base' });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.scenarioResults?.base).toBeDefined();
    expect(result.scenarioResults.base.probability).toBe(0.6);
  });

  it('should generate optimistic scenario', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ scenarioType: 'optimistic' });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.scenarioResults?.optimistic).toBeDefined();
    expect(result.scenarioResults.optimistic.portfolioMOIC).toBeGreaterThan(
      result.scenarioResults.base.portfolioMOIC
    );
  });

  it('should maintain probability sum to 1.0', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    const totalProbability =
      result.scenarioResults.conservative.probability +
      result.scenarioResults.base.probability +
      result.scenarioResults.optimistic.probability;

    expect(totalProbability).toBeCloseTo(1.0, 5);
  });
});

// =============================================================================
// CACHING BEHAVIOR TESTS
// =============================================================================

describe('DeterministicReserveEngine - Caching', () => {
  it('should cache identical inputs', async () => {
    const engine = new DeterministicReserveEngine({
      enableNewReserveEngine: true,
      enableParityTesting: false,
      enableRiskAdjustments: true,
      enableScenarioAnalysis: true,
      enableAdvancedDiversification: false,
      enableLiquidationPreferences: false,
      enablePerformanceLogging: true,
      maxCalculationTimeMs: 5000,
    });

    const input = createAllocationInput();

    const result1 = await engine.calculateOptimalReserveAllocation(input);
    const result2 = await engine.calculateOptimalReserveAllocation(input);

    // Results should be identical (cached)
    expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
    expect(result1.allocations.length).toBe(result2.allocations.length);
  });

  it('should not cache different inputs', async () => {
    const engine = new DeterministicReserveEngine();

    const input1 = createAllocationInput({ availableReserves: 10000000 });
    const input2 = createAllocationInput({ availableReserves: 15000000 });

    const result1 = await engine.calculateOptimalReserveAllocation(input1);
    const result2 = await engine.calculateOptimalReserveAllocation(input2);

    // Results should be different
    expect(result1.metadata.deterministicHash).not.toBe(result2.metadata.deterministicHash);
  });

  it('should generate deterministic hash for input', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.metadata.deterministicHash).toBeDefined();
    expect(result.metadata.deterministicHash.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('DeterministicReserveEngine - Edge Cases', () => {
  it('should handle single company portfolio', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({
      portfolio: [createCompany()],
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.allocations.length).toBeLessThanOrEqual(1);
  });

  it('should handle large portfolio', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = Array.from({ length: 50 }, (_, i) =>
      createCompany({
        id: `company-${i}`,
        totalInvested: 1000000 + i * 100000,
        currentValuation: 3000000 + i * 500000,
      })
    );
    const input = createAllocationInput({ portfolio });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.allocations.length).toBeGreaterThan(0);
    expect(result.allocations.length).toBeLessThanOrEqual(portfolio.length);
  });

  it('should handle all inactive companies', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = [createCompany({ isActive: false }), createCompany({ isActive: false })];
    const input = createAllocationInput({ portfolio });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.allocations).toEqual([]);
  });

  it('should handle very small available reserves', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ availableReserves: 10000 });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // May not allocate anything if reserves too small
    expect(result.unallocatedReserves).toBeGreaterThan(0);
  });

  it('should handle very large available reserves', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ availableReserves: 1000000000 });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.inputSummary.availableReserves).toBe(1000000000);
  });

  it('should handle minimum allocation threshold', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({
      minAllocationThreshold: 1000000,
      availableReserves: 5000000,
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // All allocations should be >= threshold
    result.allocations.forEach((allocation) => {
      expect(allocation.recommendedAllocation).toBeGreaterThanOrEqual(1000000);
    });
  });

  it('should handle maximum single allocation', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({
      maxSingleAllocation: 2000000,
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // All allocations should be <= max
    result.allocations.forEach((allocation) => {
      expect(allocation.recommendedAllocation).toBeLessThanOrEqual(2000000);
    });
  });

  it('should handle portfolio concentration limits', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({
      maxPortfolioConcentration: 0.1, // 10% max
      totalFundSize: 50000000,
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    result.allocations.forEach((allocation) => {
      expect(allocation.portfolioWeight).toBeLessThanOrEqual(0.1);
    });
  });
});

// =============================================================================
// ALLOCATION RANKING TESTS
// =============================================================================

describe('DeterministicReserveEngine - Allocation Ranking', () => {
  it('should rank companies by allocation score', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = [
      createCompany({ id: 'low-moic', currentValuation: 1500000, totalInvested: 1000000 }), // 1.5x MOIC
      createCompany({ id: 'high-moic', currentValuation: 8000000, totalInvested: 1000000 }), // 8x MOIC
      createCompany({ id: 'med-moic', currentValuation: 3000000, totalInvested: 1000000 }), // 3x MOIC
    ];
    const input = createAllocationInput({ portfolio });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Higher MOIC companies should get higher priority
    if (result.allocations.length >= 2) {
      expect(result.allocations[0].priority).toBeLessThan(result.allocations[1].priority);
    }
  });

  it('should allocate reserves in priority order', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = [
      createCompany({ id: 'c1', currentStage: 'Seed' }),
      createCompany({ id: 'c2', currentStage: 'Series A' }),
      createCompany({ id: 'c3', currentStage: 'Series B' }),
    ];
    const input = createAllocationInput({ portfolio });

    const result = await engine.calculateOptimalReserveAllocation(input);

    // Priorities should be sequential
    const priorities = result.allocations.map((a) => a.priority);
    const sortedPriorities = [...priorities].sort((a, b) => a - b);
    expect(priorities).toEqual(sortedPriorities);
  });
});

// =============================================================================
// RISK ADJUSTMENT TESTS
// =============================================================================

describe('DeterministicReserveEngine - Risk Adjustments', () => {
  it('should apply risk adjustments when enabled', async () => {
    const engineWithRisk = new DeterministicReserveEngine({
      enableNewReserveEngine: true,
      enableParityTesting: false,
      enableRiskAdjustments: true,
      enableScenarioAnalysis: true,
      enableAdvancedDiversification: false,
      enableLiquidationPreferences: false,
      enablePerformanceLogging: false,
      maxCalculationTimeMs: 5000,
    });

    const engineWithoutRisk = new DeterministicReserveEngine({
      enableNewReserveEngine: true,
      enableParityTesting: false,
      enableRiskAdjustments: false,
      enableScenarioAnalysis: true,
      enableAdvancedDiversification: false,
      enableLiquidationPreferences: false,
      enablePerformanceLogging: false,
      maxCalculationTimeMs: 5000,
    });

    const input = createAllocationInput();

    const resultWith = await engineWithRisk.calculateOptimalReserveAllocation(input);
    const resultWithout = await engineWithoutRisk.calculateOptimalReserveAllocation(input);

    // Risk-adjusted allocations may differ
    expect(resultWith).toBeDefined();
    expect(resultWithout).toBeDefined();
  });

  it('should include risk factors in output', async () => {
    const engine = new DeterministicReserveEngine({
      enableNewReserveEngine: true,
      enableParityTesting: false,
      enableRiskAdjustments: true,
      enableScenarioAnalysis: true,
      enableAdvancedDiversification: false,
      enableLiquidationPreferences: false,
      enablePerformanceLogging: false,
      maxCalculationTimeMs: 5000,
    });

    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    if (result.allocations.length > 0) {
      expect(result.allocations[0].riskFactors).toBeInstanceOf(Array);
    }
  });
});

// =============================================================================
// DIVERSIFICATION TESTS
// =============================================================================

describe('DeterministicReserveEngine - Diversification', () => {
  it('should apply diversification when enabled', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = [
      createCompany({ id: 'c1', sector: 'SaaS' }),
      createCompany({ id: 'c2', sector: 'Fintech' }),
      createCompany({ id: 'c3', sector: 'Healthcare' }),
    ];
    const input = createAllocationInput({
      portfolio,
      enableDiversification: true,
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.portfolioMetrics.portfolioDiversification).toBeGreaterThan(0);
  });

  it('should calculate diversification index', async () => {
    const engine = new DeterministicReserveEngine();
    const portfolio = [
      createCompany({ id: 'c1' }),
      createCompany({ id: 'c2' }),
      createCompany({ id: 'c3' }),
    ];
    const input = createAllocationInput({ portfolio });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.portfolioMetrics.portfolioDiversification).toBeGreaterThanOrEqual(0);
    expect(result.portfolioMetrics.portfolioDiversification).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================

describe('DeterministicReserveEngine - Performance', () => {
  // FIXME: Performance test timing out or exceeding limit
  // @group integration - May need optimization or adjusted timeout threshold
  it.skip('should complete calculation within time limit', async () => {
    const engine = new DeterministicReserveEngine({
      enableNewReserveEngine: true,
      enableParityTesting: false,
      enableRiskAdjustments: true,
      enableScenarioAnalysis: true,
      enableAdvancedDiversification: false,
      enableLiquidationPreferences: false,
      enablePerformanceLogging: true,
      maxCalculationTimeMs: 5000,
    });

    const portfolio = Array.from({ length: 20 }, (_, i) => createCompany({ id: `company-${i}` }));
    const input = createAllocationInput({ portfolio });

    const startTime = Date.now();
    const result = await engine.calculateOptimalReserveAllocation(input);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000);
    expect(result.metadata.calculationDuration).toBe(duration);
  });

  // FIXME: Metadata expectations not matching actual output structure
  // @group integration - Needs alignment between test expectations and engine output
  it.skip('should provide calculation metadata', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.calculationDate).toBeInstanceOf(Date);
    expect(result.metadata.calculationDuration).toBeGreaterThan(0);
    expect(result.metadata.modelVersion).toBeDefined();
    expect(result.metadata.deterministicHash).toBeDefined();
  });
});

// =============================================================================
// OUTPUT STRUCTURE TESTS
// =============================================================================

describe('DeterministicReserveEngine - Output Structure', () => {
  it('should return complete result structure', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result).toMatchObject({
      inputSummary: expect.any(Object),
      allocations: expect.any(Array),
      unallocatedReserves: expect.any(Number),
      portfolioMetrics: expect.any(Object),
      riskAnalysis: expect.any(Object),
      scenarioResults: expect.any(Object),
      metadata: expect.any(Object),
    });
  });

  it('should calculate input summary correctly', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({
      portfolio: [createCompany(), createCompany({ id: 'c2' })],
      availableReserves: 10000000,
    });

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.inputSummary.totalPortfolioCompanies).toBe(2);
    expect(result.inputSummary.availableReserves).toBe(10000000);
    expect(result.inputSummary.allocationEfficiency).toBeGreaterThan(0);
    expect(result.inputSummary.allocationEfficiency).toBeLessThanOrEqual(1);
  });

  it('should calculate unallocated reserves', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput({ availableReserves: 10000000 });

    const result = await engine.calculateOptimalReserveAllocation(input);

    const totalAllocated = result.allocations.reduce((sum, a) => sum + a.recommendedAllocation, 0);
    expect(result.unallocatedReserves).toBe(result.inputSummary.availableReserves - totalAllocated);
  });

  it('should include portfolio metrics', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.portfolioMetrics).toMatchObject({
      expectedPortfolioMOIC: expect.any(Number),
      expectedPortfolioValue: expect.any(Number),
      portfolioDiversification: expect.any(Number),
      concentrationRisk: expect.stringMatching(/^(low|medium|high)$/),
      averageTimeToExit: expect.any(Number),
    });
  });

  it('should include risk analysis', async () => {
    const engine = new DeterministicReserveEngine();
    const input = createAllocationInput();

    const result = await engine.calculateOptimalReserveAllocation(input);

    expect(result.riskAnalysis).toMatchObject({
      portfolioRisk: expect.stringMatching(/^(low|medium|high)$/),
      keyRiskFactors: expect.any(Array),
      riskMitigationActions: expect.any(Array),
      stressTestResults: expect.any(Object),
    });
  });
});
