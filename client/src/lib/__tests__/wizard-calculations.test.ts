/**
 * Comprehensive test suite for wizard-calculations.ts
 *
 * Tests financial calculation validations, metrics enrichment, and portfolio summaries
 * with proper mocking of the reserves bridge function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the bridge module BEFORE importing the module under test
vi.mock('../wizard-reserve-bridge', () => ({
  calculateReservesForWizard: vi.fn(),
}));

import {
  validateWizardPortfolio,
  enrichWizardMetrics,
  generatePortfolioSummary,
  calculateReservesForWizard,
  type WizardPortfolioCompany,
  type ReserveAllocation,
  type PortfolioValidationResult,
  type EnrichedReserveAllocation,
  type PortfolioSummary
} from '../wizard-calculations';
import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';
import * as bridgeModule from '../wizard-reserve-bridge';

// ============================================================================
// TEST FACTORIES
// ============================================================================

function createMockCompany(overrides?: Partial<WizardPortfolioCompany>): WizardPortfolioCompany {
  return {
    id: `company-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Company',
    investedAmount: 1000000, // $1M
    currentValuation: 3000000, // $3M (3x MOIC)
    currentStage: 'series-a',
    ownershipPercent: 15,
    sector: 'SaaS',
    ...overrides
  };
}

function createMockContext(overrides?: Partial<ModelingWizardContext>): ModelingWizardContext {
  return {
    steps: {
      generalInfo: {
        fundName: 'Test Fund',
        vintageYear: 2024,
        fundSize: 100000000, // $100M
        currency: 'USD',
        establishmentDate: '2024-01-01',
        isEvergreen: false,
        fundLife: 10,
        investmentPeriod: 5
      },
      capitalAllocation: {
        initialCheckSize: 500000,
        followOnStrategy: {
          reserveRatio: 0.5,
          followOnChecks: {
            A: 1000000,
            B: 2000000,
            C: 3000000
          }
        },
        pacingModel: {
          investmentsPerYear: 10,
          deploymentCurve: 'linear' as const
        }
      },
      sectorProfiles: {
        sectorProfiles: [],
        stageAllocations: []
      },
      feesExpenses: {
        managementFee: {
          rate: 2,
          basis: 'committed' as const
        },
        adminExpenses: {
          annualAmount: 500000,
          growthRate: 3
        }
      },
      exitRecycling: {
        enabled: false
      },
      waterfall: {
        type: 'american' as const,
        preferredReturn: 8,
        catchUp: 100,
        carriedInterest: 20
      },
      scenarios: {
        scenarioType: 'construction' as const,
        baseCase: {
          name: 'Base Case',
          assumptions: {}
        }
      }
    },
    currentStep: 'generalInfo',
    completedSteps: [],
    visitedSteps: [],
    skipOptionalSteps: false,
    ...overrides
  } as ModelingWizardContext;
}

function createMockAllocation(overrides?: Partial<ReserveAllocation>): ReserveAllocation {
  return {
    totalPlanned: 5000000,
    optimalMOIC: 2.8,
    companiesSupported: 10,
    avgFollowOnSize: 500000,
    allocations: [
      {
        companyId: 'company-1',
        companyName: 'Company 1',
        plannedReserve: 500000,
        exitMOIC: 3.0
      }
    ],
    ...overrides
  };
}

// ============================================================================
// A. validateWizardPortfolio TESTS (10 tests)
// ============================================================================

describe('validateWizardPortfolio', () => {
  it('should pass validation for a valid portfolio', () => {
    const portfolio = [
      createMockCompany({ id: 'c1', name: 'Company 1', investedAmount: 1000000, currentValuation: 2500000 }),
      createMockCompany({ id: 'c2', name: 'Company 2', investedAmount: 1500000, currentValuation: 4000000 })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty portfolio', () => {
    const result = validateWizardPortfolio([]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Portfolio must contain at least one company');
  });

  it('should detect duplicate company IDs', () => {
    const portfolio = [
      createMockCompany({ id: 'duplicate-id', name: 'Company 1' }),
      createMockCompany({ id: 'duplicate-id', name: 'Company 2' })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate company IDs'))).toBe(true);
  });

  it('should reject negative invested amounts', () => {
    const portfolio = [
      createMockCompany({ name: 'Test Co', investedAmount: -100000 })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invested amount must be positive'))).toBe(true);
  });

  it('should reject invalid ownership percentages (>100%)', () => {
    const portfolio = [
      createMockCompany({ name: 'Test Co', ownershipPercent: 150 })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Ownership must be between 0% and 100%'))).toBe(true);
  });

  it('should warn about unusually high MOIC (>10x)', () => {
    const portfolio = [
      createMockCompany({
        name: 'High MOIC Co',
        investedAmount: 1000000,
        currentValuation: 15000000 // 15x MOIC
      })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.warnings.some(w => w.includes('unusually high'))).toBe(true);
  });

  it('should warn about very low MOIC (<0.5x)', () => {
    const portfolio = [
      createMockCompany({
        name: 'Low MOIC Co',
        investedAmount: 1000000,
        currentValuation: 300000 // 0.3x MOIC
      })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.warnings.some(w => w.includes('very low'))).toBe(true);
  });

  it('should reject companies with missing ID', () => {
    const portfolio = [
      createMockCompany({ id: '', name: 'Test Co' })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ID is required'))).toBe(true);
  });

  it('should reject companies with missing name', () => {
    const portfolio = [
      createMockCompany({ id: 'c1', name: '' })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Name is required'))).toBe(true);
  });

  it('should reject companies with invalid stage', () => {
    const portfolio = [
      createMockCompany({ name: 'Test Co', currentStage: 'invalid-stage' as any })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid stage'))).toBe(true);
  });
});

// ============================================================================
// B. enrichWizardMetrics TESTS (10 tests)
// ============================================================================

describe('enrichWizardMetrics', () => {
  it('should calculate fund utilization metrics correctly', () => {
    const context = createMockContext();
    const mockAllocation = createMockAllocation({
      totalPlanned: 10000000 // $10M in reserves
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    expect(result.fundContext.fundSize).toBe(100000000);
    expect(result.fundContext.reservesDeployed).toBe(10000000);
    expect(result.insights.utilizationRate).toBeGreaterThan(0);
  });

  it('should calculate reserve efficiency correctly', () => {
    const context = createMockContext();
    const mockAllocation = createMockAllocation({
      optimalMOIC: 3.0 // 50% improvement over 2.0 baseline
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Reserve efficiency = ((3.0 - 2.0) / 2.0) * 100 = 50%
    expect(result.insights.reserveEfficiency).toBe(50);
  });

  it('should categorize concentration risk as Low', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        capitalAllocation: {
          ...createMockContext().steps.capitalAllocation!,
          initialCheckSize: 1000000 // $1M initial check
        }
      }
    });

    const mockAllocation = createMockAllocation({
      totalPlanned: 10000000,
      companiesSupported: 10, // $1M per company on average
      avgFollowOnSize: 1000000
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Concentration ratio = 1M / 1M = 1.0 < 1.5 (Low threshold)
    expect(result.insights.concentrationRisk).toBe('Low');
  });

  it('should categorize concentration risk as Medium', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        capitalAllocation: {
          ...createMockContext().steps.capitalAllocation!,
          initialCheckSize: 1000000
        }
      }
    });

    const mockAllocation = createMockAllocation({
      totalPlanned: 10000000,
      companiesSupported: 5, // $2M per company on average
      avgFollowOnSize: 2000000
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Concentration ratio = 2M / 1M = 2.0 (between 1.5 and 3.0)
    expect(result.insights.concentrationRisk).toBe('Medium');
  });

  it('should categorize concentration risk as High', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        capitalAllocation: {
          ...createMockContext().steps.capitalAllocation!,
          initialCheckSize: 1000000
        }
      }
    });

    const mockAllocation = createMockAllocation({
      totalPlanned: 10000000,
      companiesSupported: 3, // $3.33M per company on average
      avgFollowOnSize: 3333333
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Concentration ratio = 3.33M / 1M = 3.33 > 3.0
    expect(result.insights.concentrationRisk).toBe('High');
  });

  it('should categorize capital deployment as Conservative (<70%)', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        generalInfo: {
          ...createMockContext().steps.generalInfo!,
          fundSize: 100000000
        }
      }
    });

    const mockAllocation = createMockAllocation({
      totalPlanned: 5000000 // Low reserves deployment
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Total deployed = (500k * 10 * 5) + 5M = 30M, utilization = 30%
    expect(result.insights.capitalDeployment).toBe('Conservative');
  });

  it('should categorize capital deployment as Balanced (70-90%)', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        generalInfo: {
          ...createMockContext().steps.generalInfo!,
          fundSize: 100000000
        }
      }
    });

    const mockAllocation = createMockAllocation({
      totalPlanned: 50000000 // High reserves deployment
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Total deployed = (500k * 10 * 5) + 50M = 75M, utilization = 75%
    expect(result.insights.capitalDeployment).toBe('Balanced');
  });

  it('should categorize capital deployment as Aggressive (>90%)', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        generalInfo: {
          ...createMockContext().steps.generalInfo!,
          fundSize: 100000000
        }
      }
    });

    const mockAllocation = createMockAllocation({
      totalPlanned: 70000000 // Very high reserves deployment
    });

    const result = enrichWizardMetrics(mockAllocation, context);

    // Total deployed = (500k * 10 * 5) + 70M = 95M, utilization = 95%
    expect(result.insights.capitalDeployment).toBe('Aggressive');
  });

  it('should throw error if generalInfo is missing', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        generalInfo: undefined
      }
    });

    const mockAllocation = createMockAllocation();

    expect(() => enrichWizardMetrics(mockAllocation, context)).toThrow('Required wizard context not available');
  });

  it('should throw error if capitalAllocation is missing', () => {
    const context = createMockContext({
      steps: {
        ...createMockContext().steps,
        capitalAllocation: undefined
      }
    });

    const mockAllocation = createMockAllocation();

    expect(() => enrichWizardMetrics(mockAllocation, context)).toThrow('Required wizard context not available');
  });
});

// ============================================================================
// C. generatePortfolioSummary TESTS (7 tests)
// ============================================================================

describe('generatePortfolioSummary', () => {
  it('should generate basic statistics correctly', () => {
    const portfolio = [
      createMockCompany({ investedAmount: 1000000, currentValuation: 2000000 }),
      createMockCompany({ investedAmount: 2000000, currentValuation: 5000000 })
    ];

    const result = generatePortfolioSummary(portfolio);

    expect(result.totalInvested).toBe(3000000);
    expect(result.totalValuation).toBe(7000000);
    expect(result.averageMOIC).toBeCloseTo(2.33, 1);
    expect(result.totalCompanies).toBe(2);
  });

  it('should generate sector breakdown with invested amounts', () => {
    const portfolio = [
      createMockCompany({ sector: 'SaaS', investedAmount: 2000000 }),
      createMockCompany({ sector: 'SaaS', investedAmount: 1000000 }),
      createMockCompany({ sector: 'Fintech', investedAmount: 1000000 })
    ];

    const result = generatePortfolioSummary(portfolio);

    expect(result.sectorBreakdown['SaaS']).toBe(3000000);
    expect(result.sectorBreakdown['Fintech']).toBe(1000000);
  });

  it('should generate stage breakdown with invested amounts', () => {
    const portfolio = [
      createMockCompany({ currentStage: 'seed', investedAmount: 1000000 }),
      createMockCompany({ currentStage: 'series-a', investedAmount: 2000000 }),
      createMockCompany({ currentStage: 'series-a', investedAmount: 1000000 })
    ];

    const result = generatePortfolioSummary(portfolio);

    expect(result.stageBreakdown['seed']).toBe(1000000);
    expect(result.stageBreakdown['series-a']).toBe(3000000);
  });

  it('should handle empty portfolio', () => {
    const result = generatePortfolioSummary([]);

    expect(result.totalInvested).toBe(0);
    expect(result.totalValuation).toBe(0);
    expect(result.averageMOIC).toBe(0);
    expect(result.totalCompanies).toBe(0);
    expect(result.sectorBreakdown).toEqual({});
    expect(result.stageBreakdown).toEqual({});
  });

  it('should handle missing sector values as Unknown', () => {
    const portfolio = [
      createMockCompany({ sector: '', investedAmount: 1000000 }),
      createMockCompany({ sector: undefined as any, investedAmount: 500000 })
    ];

    const result = generatePortfolioSummary(portfolio);

    expect(result.sectorBreakdown['Unknown']).toBe(1500000);
  });

  it('should handle missing stage values as Unknown', () => {
    const portfolio = [
      createMockCompany({ currentStage: '', investedAmount: 1000000 }),
      createMockCompany({ currentStage: undefined as any, investedAmount: 500000 })
    ];

    const result = generatePortfolioSummary(portfolio);

    expect(result.stageBreakdown['Unknown']).toBe(1500000);
  });

  it('should calculate correct averageMOIC with multiple companies', () => {
    const portfolio = [
      createMockCompany({ investedAmount: 1000000, currentValuation: 2000000 }), // 2x
      createMockCompany({ investedAmount: 2000000, currentValuation: 8000000 }), // 4x
      createMockCompany({ investedAmount: 1000000, currentValuation: 3000000 })  // 3x
    ];

    const result = generatePortfolioSummary(portfolio);

    // Total: 4M invested, 13M valuation = 3.25x average
    expect(result.averageMOIC).toBeCloseTo(3.25, 2);
  });
});

// ============================================================================
// D. INTEGRATION TESTS (3 tests)
// ============================================================================

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete end-to-end workflow with mocked bridge', async () => {
    const context = createMockContext();
    const portfolio = [
      createMockCompany({ id: 'c1', name: 'Company 1', investedAmount: 1000000, currentValuation: 3000000 }),
      createMockCompany({ id: 'c2', name: 'Company 2', investedAmount: 1500000, currentValuation: 4000000 })
    ];

    const mockAllocation = createMockAllocation({
      totalPlanned: 2500000,
      optimalMOIC: 2.9,
      companiesSupported: 2,
      avgFollowOnSize: 1250000,
      allocations: [
        {
          companyId: 'c1',
          companyName: 'Company 1',
          plannedReserve: 1000000,
          exitMOIC: 3.0
        },
        {
          companyId: 'c2',
          companyName: 'Company 2',
          plannedReserve: 1500000,
          exitMOIC: 2.8
        }
      ]
    });

    // Mock the bridge function (not its output)
    vi.mocked(bridgeModule.calculateReservesForWizard).mockResolvedValue(mockAllocation);

    // Call the function under test
    const allocation = await calculateReservesForWizard(context, portfolio);

    // Verify the bridge was called correctly
    expect(bridgeModule.calculateReservesForWizard).toHaveBeenCalledWith(context, portfolio);
    expect(bridgeModule.calculateReservesForWizard).toHaveBeenCalledTimes(1);

    // Verify the result
    expect(allocation).toEqual(mockAllocation);
    expect(allocation.totalPlanned).toBe(2500000);
    expect(allocation.optimalMOIC).toBe(2.9);
  });

  it('should maintain consistent calculation patterns across functions', () => {
    const portfolio = [
      createMockCompany({ investedAmount: 1000000, currentValuation: 2500000 }),
      createMockCompany({ investedAmount: 1500000, currentValuation: 4000000 }),
      createMockCompany({ investedAmount: 2000000, currentValuation: 5000000 })
    ];

    const validation = validateWizardPortfolio(portfolio);
    const summary = generatePortfolioSummary(portfolio);

    // Both functions should work with the same portfolio structure
    expect(validation.valid).toBe(true);
    expect(summary.totalCompanies).toBe(3);
    expect(summary.totalInvested).toBe(4500000);
    expect(summary.totalValuation).toBe(11500000);
  });

  it('should support full wizard workflow: validate → calculate → enrich → summarize', async () => {
    const context = createMockContext();
    const portfolio = [
      createMockCompany({ id: 'c1', name: 'Company 1', investedAmount: 1000000, currentValuation: 3000000 }),
      createMockCompany({ id: 'c2', name: 'Company 2', investedAmount: 2000000, currentValuation: 5000000 })
    ];

    // Step 1: Validate
    const validation = validateWizardPortfolio(portfolio);
    expect(validation.valid).toBe(true);

    // Step 2: Calculate reserves (mocked)
    const mockAllocation = createMockAllocation({
      totalPlanned: 5000000,
      optimalMOIC: 2.8
    });
    vi.mocked(bridgeModule.calculateReservesForWizard).mockResolvedValue(mockAllocation);
    const allocation = await calculateReservesForWizard(context, portfolio);

    // Step 3: Enrich
    const enriched = enrichWizardMetrics(allocation, context);
    expect(enriched.insights).toBeDefined();
    expect(enriched.fundContext).toBeDefined();

    // Step 4: Summarize
    const summary = generatePortfolioSummary(portfolio);
    expect(summary.totalCompanies).toBe(2);
    expect(summary.totalInvested).toBe(3000000);
  });
});

// ============================================================================
// E. EDGE CASES & ERROR HANDLING (2 tests)
// ============================================================================

describe('Edge Cases & Error Handling', () => {
  it('should handle portfolio with zero invested amounts gracefully', () => {
    const portfolio = [
      createMockCompany({ investedAmount: 0, currentValuation: 1000000 })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invested amount must be positive'))).toBe(true);
  });

  it('should handle portfolio with negative valuations', () => {
    const portfolio = [
      createMockCompany({ investedAmount: 1000000, currentValuation: -500000 })
    ];

    const result = validateWizardPortfolio(portfolio);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Current valuation cannot be negative'))).toBe(true);
  });
});
