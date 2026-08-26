/**
 * Shared fixtures for the DeterministicReserveEngine substrate tranche
 * (Tranche 4, ADR-045).
 *
 * All fixtures are schema-valid under ReserveAllocationInputSchema (canonical
 * snake_case stages, uuid ids, strict graduation-matrix and stage-strategy
 * shapes) so the SAME inputs drive both the legacy-engine characterization
 * suite and the substrate adapter suite.
 *
 * Frozen instants:
 * - T1/T2 are one year apart. BETA_BIO's investmentDate (2021-09-01) sits
 *   ~52.8 engine-months (30-day months) before T1 and ~64.9 before T2, so the
 *   age>60 risk multiplier (0.9) applies at T2 but not at T1. That single
 *   crossing is the wall-clock-dependence proof: identical input, different
 *   frozen instant, different allocations.
 * - Every other company stays under 60 engine-months at both instants.
 *
 * PORTFOLIO_TWO deliberately matches PORTFOLIO_ONE on every field of the
 * PRE-FIX cache key (portfolio length 3 and identical availableReserves /
 * totalFundSize / scenarioType / timeHorizon scalars) while containing
 * entirely different companies. It exists to pin, and then prove fixed, the
 * cache-identity collision.
 */

import type {
  GraduationMatrix,
  PortfolioCompany,
  ReserveAllocationInput,
  StageStrategy,
} from '../../../shared/schemas/reserves-schemas';

export const T1_ISO = '2026-01-01T00:00:00.000Z';
export const T2_ISO = '2027-01-01T00:00:00.000Z';
export const T1_MS = Date.parse(T1_ISO);
export const T2_MS = Date.parse(T2_ISO);

export const ALPHA_ID = '11111111-1111-4111-8111-111111111111';
export const BETA_ID = '22222222-2222-4222-8222-222222222222';
export const GAMMA_ID = '33333333-3333-4333-8333-333333333333';
export const DELTA_ID = '44444444-4444-4444-8444-444444444444';
export const EPSILON_ID = '55555555-5555-4555-8555-555555555555';
export const ZETA_ID = '66666666-6666-4666-8666-666666666666';

function alphaAnalytics(): PortfolioCompany {
  return {
    id: ALPHA_ID,
    name: 'Alpha Analytics',
    sector: 'Analytics',
    currentStage: 'seed',
    totalInvested: 1_000_000,
    currentValuation: 4_000_000,
    ownershipPercentage: 0.12,
    investmentDate: new Date('2024-03-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 4,
    confidenceLevel: 0.5,
    tags: [],
  };
}

/** The age-threshold-crossing company: <60 engine-months at T1, >60 at T2. */
function betaBio(): PortfolioCompany {
  return {
    id: BETA_ID,
    name: 'Beta Bio',
    sector: 'Healthcare',
    currentStage: 'series_a',
    totalInvested: 2_000_000,
    currentValuation: 10_000_000,
    ownershipPercentage: 0.08,
    investmentDate: new Date('2021-09-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 5,
    confidenceLevel: 0.5,
    tags: [],
  };
}

function gammaGrid(): PortfolioCompany {
  return {
    id: GAMMA_ID,
    name: 'Gamma Grid',
    sector: 'Infrastructure',
    currentStage: 'series_b',
    totalInvested: 3_000_000,
    currentValuation: 9_000_000,
    ownershipPercentage: 0.1,
    investmentDate: new Date('2023-06-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 3,
    confidenceLevel: 0.5,
    tags: [],
  };
}

function deltaDevices(): PortfolioCompany {
  return {
    id: DELTA_ID,
    name: 'Delta Devices',
    sector: 'Robotics',
    currentStage: 'seed',
    totalInvested: 800_000,
    currentValuation: 3_200_000,
    ownershipPercentage: 0.09,
    investmentDate: new Date('2024-05-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 4,
    confidenceLevel: 0.5,
    tags: [],
  };
}

function epsilonEnergy(): PortfolioCompany {
  return {
    id: EPSILON_ID,
    name: 'Epsilon Energy',
    sector: 'Fintech',
    currentStage: 'series_a',
    totalInvested: 1_500_000,
    currentValuation: 9_000_000,
    ownershipPercentage: 0.07,
    investmentDate: new Date('2022-11-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 6,
    confidenceLevel: 0.5,
    tags: [],
  };
}

function zetaZip(): PortfolioCompany {
  return {
    id: ZETA_ID,
    name: 'Zeta Zip',
    sector: 'SaaS',
    currentStage: 'series_b',
    totalInvested: 2_500_000,
    currentValuation: 7_500_000,
    ownershipPercentage: 0.11,
    investmentDate: new Date('2023-02-01T00:00:00.000Z'),
    isActive: true,
    currentMOIC: 3,
    confidenceLevel: 0.5,
    tags: [],
  };
}

export function graduationMatrix(): GraduationMatrix {
  return {
    name: 'Tranche 4 fixture matrix',
    rates: [
      {
        fromStage: 'seed',
        toStage: 'series_a',
        probability: 0.5,
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
        probability: 0.4,
        timeToGraduation: 30,
        valuationMultiple: 2.0,
      },
    ],
  };
}

export function stageStrategies(): StageStrategy[] {
  return [
    {
      stage: 'seed',
      targetOwnership: 0.1,
      maxInvestment: 2_000_000,
      minInvestment: 100_000,
      followOnProbability: 0.7,
      reserveMultiple: 2,
      failureRate: 0.6,
      expectedMOIC: 10,
      expectedTimeToExit: 84,
      maxConcentration: 0.1,
      diversificationWeight: 0.5,
    },
    {
      stage: 'series_a',
      targetOwnership: 0.08,
      maxInvestment: 4_000_000,
      minInvestment: 250_000,
      followOnProbability: 0.8,
      reserveMultiple: 1.5,
      failureRate: 0.4,
      expectedMOIC: 6,
      expectedTimeToExit: 72,
      maxConcentration: 0.12,
      diversificationWeight: 0.6,
    },
    {
      stage: 'series_b',
      targetOwnership: 0.06,
      maxInvestment: 6_000_000,
      minInvestment: 500_000,
      followOnProbability: 0.85,
      reserveMultiple: 1.2,
      failureRate: 0.3,
      expectedMOIC: 4,
      expectedTimeToExit: 60,
      maxConcentration: 0.15,
      diversificationWeight: 0.7,
    },
  ];
}

export function portfolioOne(): PortfolioCompany[] {
  return [alphaAnalytics(), betaBio(), gammaGrid()];
}

export function portfolioTwo(): PortfolioCompany[] {
  return [deltaDevices(), epsilonEnergy(), zetaZip()];
}

export function baseInput(overrides: Partial<ReserveAllocationInput> = {}): ReserveAllocationInput {
  return {
    portfolio: portfolioOne(),
    availableReserves: 10_000_000,
    totalFundSize: 100_000_000,
    graduationMatrix: graduationMatrix(),
    stageStrategies: stageStrategies(),
    minAllocationThreshold: 50_000,
    maxPortfolioConcentration: 0.1,
    scenarioType: 'base',
    timeHorizon: 84,
    enableDiversification: true,
    enableRiskAdjustment: true,
    enableLiquidationPreferences: true,
    ...overrides,
  };
}

/** Same pre-fix cache-key scalars as baseInput, entirely different companies. */
export function collidingInput(): ReserveAllocationInput {
  return baseInput({ portfolio: portfolioTwo() });
}
