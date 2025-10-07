/**
 * Unit tests for wizard-reserve-bridge
 *
 * Tests transformation functions that bridge wizard context
 * to DeterministicReserveEngine input format.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSyntheticPortfolio,
  buildGraduationMatrix,
  buildStageStrategies,
  transformWizardToReserveRequest
} from '../wizard-reserve-bridge';
import type { SectorProfile, StageAllocation, CapitalAllocationOutput } from '@/schemas/modeling-wizard.schemas';
import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';

// ============================================================================
// MOCK DATA
// ============================================================================

const mockSectorProfiles: SectorProfile[] = [
  {
    id: 'saas-1',
    name: 'SaaS',
    allocation: 60,
    description: 'Enterprise SaaS companies',
    stages: [
      {
        id: 'seed',
        stage: 'seed',
        roundSize: 3.0,
        valuation: 10.0,
        esopPercentage: 15,
        graduationRate: 60,
        exitRate: 10,
        failureRate: 30,
        exitValuation: 50.0,
        monthsToGraduate: 18,
        monthsToExit: 60
      },
      {
        id: 'series-a',
        stage: 'series-a',
        roundSize: 8.0,
        valuation: 30.0,
        esopPercentage: 12,
        graduationRate: 50,
        exitRate: 15,
        failureRate: 35,
        exitValuation: 120.0,
        monthsToGraduate: 24,
        monthsToExit: 72
      },
      {
        id: 'series-b',
        stage: 'series-b',
        roundSize: 20.0,
        valuation: 100.0,
        esopPercentage: 10,
        graduationRate: 0,
        exitRate: 60,
        failureRate: 40,
        exitValuation: 300.0,
        monthsToGraduate: 0,
        monthsToExit: 84
      }
    ]
  },
  {
    id: 'fintech-1',
    name: 'FinTech',
    allocation: 40,
    description: 'Financial technology companies',
    stages: [
      {
        id: 'seed',
        stage: 'seed',
        roundSize: 3.0,
        valuation: 12.0,
        esopPercentage: 15,
        graduationRate: 55,
        exitRate: 12,
        failureRate: 33,
        exitValuation: 60.0,
        monthsToGraduate: 20,
        monthsToExit: 66
      },
      {
        id: 'series-a',
        stage: 'series-a',
        roundSize: 10.0,
        valuation: 35.0,
        esopPercentage: 12,
        graduationRate: 45,
        exitRate: 18,
        failureRate: 37,
        exitValuation: 140.0,
        monthsToGraduate: 26,
        monthsToExit: 78
      },
      {
        id: 'series-b',
        stage: 'series-b',
        roundSize: 25.0,
        valuation: 120.0,
        esopPercentage: 10,
        graduationRate: 0,
        exitRate: 55,
        failureRate: 45,
        exitValuation: 350.0,
        monthsToGraduate: 0,
        monthsToExit: 90
      }
    ]
  }
];

const mockStageAllocations: StageAllocation[] = [
  {
    stageId: 'series-a',
    stageName: 'Series A',
    maintainOwnership: 12,
    participationRate: 80
  },
  {
    stageId: 'series-b',
    stageName: 'Series B',
    maintainOwnership: 10,
    participationRate: 70
  }
];

const mockCapitalAllocation: CapitalAllocationOutput = {
  entryStrategy: 'amount-based',
  initialCheckSize: 2.0,
  targetEntryOwnership: 15,
  followOnStrategy: {
    reserveRatio: 0.5,
    stageAllocations: mockStageAllocations
  },
  pacingModel: {
    investmentsPerYear: 10,
    deploymentCurve: 'linear'
  },
  pacingHorizon: [
    {
      id: 'period-1',
      startMonth: 0,
      endMonth: 12,
      allocationPercent: 100
    }
  ]
};

const mockWizardContext: ModelingWizardContext = {
  steps: {
    generalInfo: {
      fundName: 'Test Fund I',
      vintageYear: 2025,
      fundSize: 100,
      currency: 'USD',
      establishmentDate: '2025-01-01',
      isEvergreen: false,
      fundLife: 10,
      investmentPeriod: 5
    },
    sectorProfiles: {
      sectorProfiles: mockSectorProfiles.map(s => ({
        id: s.id,
        name: s.name,
        allocation: s.allocation,
        description: s.description
      })),
      stageAllocations: []
    },
    capitalAllocation: {
      initialCheckSize: 2.0,
      followOnStrategy: {
        reserveRatio: 0.5,
        followOnChecks: {
          A: 3.0,
          B: 5.0,
          C: 8.0
        }
      },
      pacingModel: {
        investmentsPerYear: 10,
        deploymentCurve: 'linear'
      }
    }
  },
  currentStep: 'capitalAllocation',
  currentStepIndex: 2,
  totalSteps: 7,
  completedSteps: new Set(['generalInfo', 'sectorProfiles']),
  visitedSteps: new Set(['generalInfo', 'sectorProfiles', 'capitalAllocation']),
  validationErrors: {
    generalInfo: [],
    sectorProfiles: [],
    capitalAllocation: [],
    feesExpenses: [],
    exitRecycling: [],
    waterfall: [],
    scenarios: []
  },
  isStepValid: {
    generalInfo: true,
    sectorProfiles: true,
    capitalAllocation: true,
    feesExpenses: false,
    exitRecycling: false,
    waterfall: false,
    scenarios: false
  },
  lastSaved: null,
  isDirty: false,
  submissionError: null,
  submissionRetryCount: 0,
  skipOptionalSteps: false,
  autoSaveInterval: 30000
};

// ============================================================================
// TESTS
// ============================================================================

describe('wizard-reserve-bridge', () => {
  describe('generateSyntheticPortfolio', () => {
    it('should create the correct number of companies', () => {
      const portfolio = generateSyntheticPortfolio(
        mockSectorProfiles,
        2.0,
        50
      );

      expect(portfolio).toHaveLength(50);
    });

    it('should distribute companies proportionally across sectors', () => {
      const portfolio = generateSyntheticPortfolio(
        mockSectorProfiles,
        2.0,
        100
      );

      const saasCompanies = portfolio.filter(c => c.sector === 'SaaS');
      const fintechCompanies = portfolio.filter(c => c.sector === 'FinTech');

      // 60% SaaS, 40% FinTech
      expect(saasCompanies.length).toBe(60);
      expect(fintechCompanies.length).toBe(40);
    });

    it('should use entry stage for all companies', () => {
      const portfolio = generateSyntheticPortfolio(
        mockSectorProfiles,
        2.0,
        50
      );

      // All companies should be at seed stage (entry stage)
      expect(portfolio.every(c => c.currentStage === 'seed')).toBe(true);
    });

    it('should calculate implied ownership correctly', () => {
      const portfolio = generateSyntheticPortfolio(
        mockSectorProfiles,
        2.0,
        10
      );

      // Check size = 2.0, entry round size = 3.0
      // Implied ownership = 2.0 / 3.0 = 0.667
      const saasCompany = portfolio.find(c => c.sector === 'SaaS');
      expect(saasCompany?.ownershipPercentage).toBeCloseTo(0.667, 2);
    });

    it('should clamp ownership to 100%', () => {
      const portfolio = generateSyntheticPortfolio(
        mockSectorProfiles,
        10.0, // Large check size
        10
      );

      // No ownership should exceed 100% (1.0)
      expect(portfolio.every(c => c.ownershipPercentage <= 1.0)).toBe(true);
    });

    it('should set investment details correctly', () => {
      const portfolio = generateSyntheticPortfolio(
        mockSectorProfiles,
        2.0,
        10
      );

      const company = portfolio[0];
      expect(company?.totalInvested).toBe(2.0);
      expect(company?.liquidationPreference).toBe(2.0);
      expect(company?.isActive).toBe(true);
    });
  });

  describe('buildGraduationMatrix', () => {
    it('should extract all stage transitions', () => {
      const matrix = buildGraduationMatrix(mockSectorProfiles);

      // Should have transitions: seed->series_a, series_a->series_b
      expect(matrix.rates.length).toBeGreaterThanOrEqual(2);
    });

    it('should convert graduation rates to decimals', () => {
      const matrix = buildGraduationMatrix(mockSectorProfiles);

      // All probabilities should be 0-1 range
      expect(matrix.rates.every(r => r.probability >= 0 && r.probability <= 1)).toBe(true);
    });

    it('should calculate valuation multiples correctly', () => {
      const matrix = buildGraduationMatrix(mockSectorProfiles);

      const seedToA = matrix.rates.find(
        r => r.fromStage === 'seed' && r.toStage === 'series_a'
      );

      // Valuation multiple from seed (10M) to Series A (30M) = 3x
      // Averaged across SaaS and FinTech
      expect(seedToA?.valuationMultiple).toBeGreaterThan(2.5);
      expect(seedToA?.valuationMultiple).toBeLessThan(3.5);
    });

    it('should average rates from multiple sectors', () => {
      const matrix = buildGraduationMatrix(mockSectorProfiles);

      const seedToA = matrix.rates.find(
        r => r.fromStage === 'seed' && r.toStage === 'series_a'
      );

      // SaaS: 60%, FinTech: 55% → Average: 57.5%
      expect(seedToA?.probability).toBeCloseTo(0.575, 2);
    });
  });

  describe('buildStageStrategies', () => {
    it('should create strategies for all stage allocations', () => {
      const strategies = buildStageStrategies(
        mockStageAllocations,
        mockSectorProfiles,
        2.0
      );

      expect(strategies.length).toBe(mockStageAllocations.length);
    });

    it('should convert target ownership to decimals', () => {
      const strategies = buildStageStrategies(
        mockStageAllocations,
        mockSectorProfiles,
        2.0
      );

      // 12% maintainOwnership → 0.12 targetOwnership
      const seriesA = strategies.find(s => s.stage === 'series_a');
      expect(seriesA?.targetOwnership).toBeCloseTo(0.12, 2);
    });

    it('should calculate investment bounds correctly', () => {
      const strategies = buildStageStrategies(
        mockStageAllocations,
        mockSectorProfiles,
        2.0
      );

      const seriesA = strategies.find(s => s.stage === 'series_a');

      // Implied check = 2.0 * (12/100) = 0.24
      // Max = 0.24 * 3 = 0.72
      // Min = 0.24 * 0.1 = 0.024
      expect(seriesA?.maxInvestment).toBeCloseTo(0.72, 2);
      expect(seriesA?.minInvestment).toBeCloseTo(0.024, 3);
    });

    it('should convert participation rate to probability', () => {
      const strategies = buildStageStrategies(
        mockStageAllocations,
        mockSectorProfiles,
        2.0
      );

      const seriesA = strategies.find(s => s.stage === 'series_a');
      expect(seriesA?.followOnProbability).toBeCloseTo(0.8, 2);
    });

    it('should calculate failure rate from graduation and exit rates', () => {
      const strategies = buildStageStrategies(
        mockStageAllocations,
        mockSectorProfiles,
        2.0
      );

      const seriesA = strategies.find(s => s.stage === 'series_a');

      // Using SaaS Series A: graduation 50%, exit 15% → failure 35%
      expect(seriesA?.failureRate).toBeCloseTo(0.35, 2);
    });
  });

  describe('transformWizardToReserveRequest', () => {
    it('should require full sector profile data', () => {
      expect(() => {
        transformWizardToReserveRequest(mockWizardContext);
      }).toThrow('Full sector profile data');
    });

    it('should require full capital allocation data', () => {
      expect(() => {
        transformWizardToReserveRequest(
          mockWizardContext,
          mockSectorProfiles,
          undefined
        );
      }).toThrow('Full capital allocation data');
    });

    it('should transform wizard context successfully', () => {
      const input = transformWizardToReserveRequest(
        mockWizardContext,
        mockSectorProfiles,
        mockCapitalAllocation
      );

      expect(input).toBeDefined();
      expect(input.portfolio.length).toBeGreaterThan(0);
      expect(input.graduationMatrix.rates.length).toBeGreaterThan(0);
      expect(input.stageStrategies.length).toBeGreaterThan(0);
    });

    it('should calculate available reserves correctly', () => {
      const input = transformWizardToReserveRequest(
        mockWizardContext,
        mockSectorProfiles,
        mockCapitalAllocation
      );

      // Fund size: 100, reserve ratio: 0.5 → 50
      expect(input.availableReserves).toBe(50);
    });

    it('should set fund size correctly', () => {
      const input = transformWizardToReserveRequest(
        mockWizardContext,
        mockSectorProfiles,
        mockCapitalAllocation
      );

      expect(input.totalFundSize).toBe(100);
    });

    it('should set time horizon from fund life', () => {
      const input = transformWizardToReserveRequest(
        mockWizardContext,
        mockSectorProfiles,
        mockCapitalAllocation
      );

      // Fund life: 10 years → 120 months
      expect(input.timeHorizon).toBe(120);
    });

    it('should enable all feature flags by default', () => {
      const input = transformWizardToReserveRequest(
        mockWizardContext,
        mockSectorProfiles,
        mockCapitalAllocation
      );

      expect(input.enableDiversification).toBe(true);
      expect(input.enableRiskAdjustment).toBe(true);
      expect(input.enableLiquidationPreferences).toBe(true);
    });

    it('should set reasonable constraint defaults', () => {
      const input = transformWizardToReserveRequest(
        mockWizardContext,
        mockSectorProfiles,
        mockCapitalAllocation
      );

      // Max single allocation: 15% of fund
      expect(input.maxSingleAllocation).toBe(15);

      // Min allocation threshold: $25k
      expect(input.minAllocationThreshold).toBe(25000);

      // Max concentration: 15%
      expect(input.maxPortfolioConcentration).toBe(0.15);
    });
  });
});
