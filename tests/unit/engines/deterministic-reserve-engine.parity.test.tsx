// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeterministicReserveEngine as ClientDeterministicReserveEngine } from '@/core/reserves/DeterministicReserveEngine';
import { transformWizardToReserveRequest } from '@/lib/wizard-reserve-bridge';
import type {
  CapitalAllocationOutput,
  SectorProfile,
} from '@/schemas/modeling-wizard.schemas';
import type { SharedWizardComputationContext } from '@/lib/wizard-computation-context';
import { DeterministicReserveEngine as SharedDeterministicReserveEngine } from '@shared/core/reserves/DeterministicReserveEngine';
import type {
  FeatureFlags,
  GraduationMatrix,
  PortfolioCompany,
  ReserveAllocationInput,
  ReserveCalculationResult,
  StageStrategy,
} from '@shared/schemas/reserves-schemas';

const FIXED_NOW = new Date('2026-03-29T12:00:00.000Z');

const PARITY_FLAGS: FeatureFlags = {
  enableNewReserveEngine: true,
  enableParityTesting: true,
  enableRiskAdjustments: true,
  enableScenarioAnalysis: true,
  enableAdvancedDiversification: false,
  enableLiquidationPreferences: true,
  enablePerformanceLogging: false,
  maxCalculationTimeMs: 5000,
};

const round = (value: number, digits: number = 6): number => Number(value.toFixed(digits));

function createCompany(overrides: Partial<PortfolioCompany> = {}): PortfolioCompany {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Alpha Systems',
    currentStage: 'series_a',
    sector: 'SaaS',
    totalInvested: 1_000_000,
    currentValuation: 5_000_000,
    ownershipPercentage: 0.15,
    liquidationPreference: 1_000_000,
    investmentDate: new Date('2023-01-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 5.0,
    ...overrides,
  };
}

function createGraduationMatrix(rates?: GraduationMatrix['rates']): GraduationMatrix {
  return {
    name: 'Parity Matrix',
    description: 'Fixture for reserve parity testing',
    rates:
      rates ??
      [
        {
          fromStage: 'seed',
          toStage: 'series_a',
          probability: 0.4,
          timeToGraduation: 18,
          valuationMultiple: 3.0,
        },
        {
          fromStage: 'series_a',
          toStage: 'series_b',
          probability: 0.5,
          timeToGraduation: 24,
          valuationMultiple: 2.5,
        },
        {
          fromStage: 'series_b',
          toStage: 'series_c',
          probability: 0.6,
          timeToGraduation: 24,
          valuationMultiple: 2.0,
        },
      ],
  };
}

function createStageStrategies(): StageStrategy[] {
  return [
    {
      stage: 'seed',
      minInvestment: 100_000,
      maxInvestment: 500_000,
      targetOwnership: 0.15,
      expectedMOIC: 10.0,
      expectedTimeToExit: 96,
      failureRate: 0.7,
      followOnProbability: 0.5,
      reserveMultiple: 2.0,
      maxConcentration: 0.15,
      diversificationWeight: 0.5,
    },
    {
      stage: 'series_a',
      minInvestment: 500_000,
      maxInvestment: 2_000_000,
      targetOwnership: 0.12,
      expectedMOIC: 5.0,
      expectedTimeToExit: 72,
      failureRate: 0.5,
      followOnProbability: 0.6,
      reserveMultiple: 1.5,
      maxConcentration: 0.15,
      diversificationWeight: 0.5,
    },
    {
      stage: 'series_b',
      minInvestment: 1_000_000,
      maxInvestment: 5_000_000,
      targetOwnership: 0.1,
      expectedMOIC: 3.0,
      expectedTimeToExit: 60,
      failureRate: 0.3,
      followOnProbability: 0.7,
      reserveMultiple: 1.25,
      maxConcentration: 0.15,
      diversificationWeight: 0.5,
    },
  ];
}

function createAllocationInput(
  overrides: Partial<ReserveAllocationInput> = {}
): ReserveAllocationInput {
  return {
    portfolio: [
      createCompany(),
      createCompany({
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Beta Fintech',
        currentStage: 'seed',
        sector: 'FinTech',
        totalInvested: 750_000,
        currentValuation: 2_500_000,
        ownershipPercentage: 0.18,
        liquidationPreference: 750_000,
        investmentDate: new Date('2024-01-01T00:00:00.000Z'),
        currentMOIC: 3.333333,
      }),
    ],
    graduationMatrix: createGraduationMatrix(),
    stageStrategies: createStageStrategies(),
    availableReserves: 10_000_000,
    totalFundSize: 50_000_000,
    scenarioType: 'base',
    timeHorizon: 60,
    minAllocationThreshold: 100_000,
    maxSingleAllocation: 5_000_000,
    maxPortfolioConcentration: 0.2,
    enableDiversification: true,
    enableRiskAdjustment: true,
    enableLiquidationPreferences: true,
    ...overrides,
  };
}

function createWizardFixtures(scale = 1): {
  context: SharedWizardComputationContext;
  sectorProfiles: SectorProfile[];
  capitalAllocation: CapitalAllocationOutput;
} {
  const sectorProfiles: SectorProfile[] = [
    {
      id: 'saas-1',
      name: 'SaaS',
      allocation: 60,
      description: 'Enterprise SaaS companies',
      stages: [
        {
          id: 'seed',
          stage: 'seed',
          roundSize: 3.0 * scale,
          valuation: 10.0 * scale,
          esopPercentage: 15,
          graduationRate: 60,
          exitRate: 10,
          failureRate: 30,
          exitValuation: 50.0 * scale,
          monthsToGraduate: 18,
          monthsToExit: 60,
        },
        {
          id: 'series-a',
          stage: 'series-a',
          roundSize: 8.0 * scale,
          valuation: 30.0 * scale,
          esopPercentage: 12,
          graduationRate: 50,
          exitRate: 15,
          failureRate: 35,
          exitValuation: 120.0 * scale,
          monthsToGraduate: 24,
          monthsToExit: 72,
        },
      ],
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
          roundSize: 3.0 * scale,
          valuation: 12.0 * scale,
          esopPercentage: 15,
          graduationRate: 55,
          exitRate: 12,
          failureRate: 33,
          exitValuation: 60.0 * scale,
          monthsToGraduate: 20,
          monthsToExit: 66,
        },
        {
          id: 'series-a',
          stage: 'series-a',
          roundSize: 10.0 * scale,
          valuation: 35.0 * scale,
          esopPercentage: 12,
          graduationRate: 45,
          exitRate: 18,
          failureRate: 37,
          exitValuation: 140.0 * scale,
          monthsToGraduate: 26,
          monthsToExit: 78,
        },
      ],
    },
  ];

  const capitalAllocation = {
    entryStrategy: 'amount-based',
    initialCheckSize: 2.0 * scale,
    targetEntryOwnership: 15,
    followOnStrategy: {
      reserveRatio: 0.5,
      stageAllocations: [
        {
          stageId: 'series-a',
          stageName: 'Series A',
          maintainOwnership: 12,
          participationRate: 80,
        },
      ],
    },
    pacingModel: {
      investmentsPerYear: 10,
      deploymentCurve: 'linear',
    },
    pacingHorizon: [
      {
        id: 'period-1',
        startMonth: 0,
        endMonth: 12,
        allocationPercent: 100,
      },
    ],
  } as CapitalAllocationOutput;

  const context = {
    steps: {
      generalInfo: {
        fundName: 'Parity Fund I',
        vintageYear: 2026,
        fundSize: 100 * scale,
        currency: 'USD',
        establishmentDate: '2026-01-01',
        isEvergreen: false,
        fundLife: 10,
        investmentPeriod: 5,
      },
      sectorProfiles: {
        sectorProfiles: sectorProfiles.map((sector) => ({
          id: sector.id,
          name: sector.name,
          allocation: sector.allocation,
          description: sector.description,
        })),
        stageAllocations: [],
      },
      capitalAllocation: {
        initialCheckSize: 2.0 * scale,
        followOnStrategy: {
          reserveRatio: 0.5,
          followOnChecks: {
            A: 3.0 * scale,
            B: 5.0 * scale,
            C: 8.0 * scale,
          },
        },
        pacingModel: {
          investmentsPerYear: 10,
          deploymentCurve: 'linear',
        },
      },
    },
  } as SharedWizardComputationContext;

  return { context, sectorProfiles, capitalAllocation };
}

function normalizeResult(result: ReserveCalculationResult) {
  return {
    inputSummary: {
      totalPortfolioCompanies: result.inputSummary.totalPortfolioCompanies,
      availableReserves: round(result.inputSummary.availableReserves, 4),
      totalAllocated: round(result.inputSummary.totalAllocated, 4),
      allocationEfficiency: round(result.inputSummary.allocationEfficiency, 8),
    },
    unallocatedReserves: round(result.unallocatedReserves, 4),
    portfolioMetrics: {
      expectedPortfolioMOIC: round(result.portfolioMetrics.expectedPortfolioMOIC, 8),
      expectedPortfolioValue: round(result.portfolioMetrics.expectedPortfolioValue, 4),
      portfolioDiversification: round(result.portfolioMetrics.portfolioDiversification, 8),
      concentrationRisk: result.portfolioMetrics.concentrationRisk,
      averageTimeToExit: round(result.portfolioMetrics.averageTimeToExit, 6),
    },
    riskAnalysis: {
      portfolioRisk: result.riskAnalysis.portfolioRisk,
      keyRiskFactors: [...result.riskAnalysis.keyRiskFactors].sort(),
      riskMitigationActions: [...result.riskAnalysis.riskMitigationActions].sort(),
      stressTestResults: {
        downside10: round(result.riskAnalysis.stressTestResults.downside10, 4),
        upside90: round(result.riskAnalysis.stressTestResults.upside90, 4),
        expectedValue: round(result.riskAnalysis.stressTestResults.expectedValue, 4),
      },
    },
    scenarioResults: {
      conservative: {
        totalValue: round(result.scenarioResults.conservative.totalValue, 4),
        portfolioMOIC: round(result.scenarioResults.conservative.portfolioMOIC, 6),
        probability: round(result.scenarioResults.conservative.probability, 6),
      },
      base: {
        totalValue: round(result.scenarioResults.base.totalValue, 4),
        portfolioMOIC: round(result.scenarioResults.base.portfolioMOIC, 6),
        probability: round(result.scenarioResults.base.probability, 6),
      },
      optimistic: {
        totalValue: round(result.scenarioResults.optimistic.totalValue, 4),
        portfolioMOIC: round(result.scenarioResults.optimistic.portfolioMOIC, 6),
        probability: round(result.scenarioResults.optimistic.probability, 6),
      },
    },
    allocations: [...result.allocations]
      .sort((a, b) => a.companyId.localeCompare(b.companyId))
      .map((allocation) => ({
        companyId: allocation.companyId,
        priority: allocation.priority,
        recommendedAllocation: round(allocation.recommendedAllocation, 4),
        expectedMOIC: round(allocation.expectedMOIC, 8),
        expectedValue: round(allocation.expectedValue, 4),
        riskAdjustedReturn: round(allocation.riskAdjustedReturn, 8),
        newOwnership: round(allocation.newOwnership, 8),
        portfolioWeight: round(allocation.portfolioWeight, 8),
        concentrationRisk: allocation.concentrationRisk,
        recommendedStage: allocation.recommendedStage,
        timeToDeployment: allocation.timeToDeployment,
        followOnPotential: round(allocation.followOnPotential, 8),
        riskFactors: [...allocation.riskFactors].sort(),
        mitigationStrategies: [...allocation.mitigationStrategies].sort(),
        calculationMetadata: {
          graduationProbability: round(allocation.calculationMetadata.graduationProbability, 8),
          expectedExitMultiple: round(allocation.calculationMetadata.expectedExitMultiple, 8),
          timeToExit: allocation.calculationMetadata.timeToExit,
          diversificationBonus: round(allocation.calculationMetadata.diversificationBonus, 8),
          liquidationPrefImpact:
            allocation.calculationMetadata.liquidationPrefImpact === undefined
              ? undefined
              : round(allocation.calculationMetadata.liquidationPrefImpact, 8),
        },
      })),
  };
}

async function runBoth(input: ReserveAllocationInput) {
  const clientEngine = new ClientDeterministicReserveEngine(PARITY_FLAGS);
  const sharedEngine = new SharedDeterministicReserveEngine(PARITY_FLAGS);

  const [clientResult, sharedResult] = await Promise.all([
    clientEngine.calculateOptimalReserveAllocation(input),
    sharedEngine.calculateOptimalReserveAllocation(input),
  ]);

  return {
    client: normalizeResult(clientResult),
    shared: normalizeResult(sharedResult),
  };
}

async function captureErrorMessage(
  engine: ClientDeterministicReserveEngine | SharedDeterministicReserveEngine,
  input: ReserveAllocationInput
): Promise<string> {
  try {
    await engine.calculateOptimalReserveAllocation(input);
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('DeterministicReserveEngine parity harness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('strict parity', () => {
    it('matches for canonical direct engine inputs', async () => {
      const input = createAllocationInput();

      const { client, shared } = await runBoth(input);

      expect(shared).toEqual(client);
    });

    it('matches for wizard-transformed reserve requests that currently produce zero allocations', async () => {
      const { context, sectorProfiles, capitalAllocation } = createWizardFixtures();
      const input = transformWizardToReserveRequest(context, sectorProfiles, capitalAllocation);

      const { client, shared } = await runBoth(input);

      expect(client.allocations).toHaveLength(0);
      expect(shared).toEqual(client);
    });

    it('matches for wizard-transformed reserve requests that clear allocation thresholds', async () => {
      const { context, sectorProfiles, capitalAllocation } = createWizardFixtures(1_000_000);
      const input = transformWizardToReserveRequest(context, sectorProfiles, capitalAllocation);

      const { client, shared } = await runBoth(input);

      expect(client.allocations.length).toBeGreaterThan(0);
      expect(shared).toEqual(client);
    });
  });

  describe('shared-authority validation parity', () => {
    it('matches explicit validation for zero currentValuation', async () => {
      const input = createAllocationInput({
        portfolio: [createCompany({ currentValuation: 0 })],
      });

      const clientMessage = await captureErrorMessage(
        new ClientDeterministicReserveEngine(PARITY_FLAGS),
        input
      );
      const sharedMessage = await captureErrorMessage(
        new SharedDeterministicReserveEngine(PARITY_FLAGS),
        input
      );

      expect(clientMessage).toBe(sharedMessage);
      expect(sharedMessage).toMatch(/Invalid currentValuation .* Must be positive/);
    });

    it('matches explicit validation for zero totalInvested', async () => {
      const input = createAllocationInput({
        portfolio: [createCompany({ totalInvested: 0 })],
      });

      const clientMessage = await captureErrorMessage(
        new ClientDeterministicReserveEngine(PARITY_FLAGS),
        input
      );
      const sharedMessage = await captureErrorMessage(
        new SharedDeterministicReserveEngine(PARITY_FLAGS),
        input
      );

      expect(clientMessage).toBe(sharedMessage);
      expect(sharedMessage).toMatch(/Invalid totalInvested .* Must be positive/);
    });

    it('matches canonical stage fallback defaults with empty matrices', async () => {
      const input = createAllocationInput({
        portfolio: [createCompany({ currentStage: 'series_a' })],
        graduationMatrix: createGraduationMatrix([]),
        minAllocationThreshold: 10_000,
        enableDiversification: false,
        enableRiskAdjustment: false,
      });

      const { client, shared } = await runBoth(input);

      expect(shared.allocations[0]?.calculationMetadata.graduationProbability).toBe(0.5);
      expect(shared).toEqual(client);
    });
  });
});
