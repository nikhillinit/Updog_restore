/**
 * Bridge between wizard context and DeterministicReserveEngine
 *
 * Transforms wizard data (dollars/percentages) to engine format and provides
 * bidirectional integration between Capital Allocation step and reserve calculations.
 *
 * ## Data Flow:
 * 1. Wizard Context → ReserveAllocationInput (via transformWizardToReserveRequest)
 * 2. Sector Profiles → Synthetic Portfolio (via generateSyntheticPortfolio)
 * 3. DeterministicReserveEngine → Allocations (via calculateEngineComparison)
 * 4. Engine Results → Wizard Format (via legacy calculateReservesForWizard)
 *
 * ## Unit Conventions:
 * - Wizard: Dollars (float), Percentages 0-100 (float), Decimals 0-1 (float)
 * - Engine: Dollars (float via Decimal.js), Percentages 0-1 (float)
 *
 * @module wizard-reserve-bridge
 */

import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';
import type {
  SectorProfile,
  InvestmentStageCohort,
  CapitalAllocationOutput,
  StageAllocation,
} from '@/schemas/modeling-wizard.schemas';
import type {
  ReserveAllocationInput,
  PortfolioCompany,
  GraduationMatrix,
  GraduationRate,
  StageStrategy,
  ReserveCalculationResult,
} from '@shared/schemas/reserves-schemas';
import { DeterministicReserveEngine } from '@/core/reserves/DeterministicReserveEngine';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

// ============================================================================
// LEGACY TYPES (Backward Compatibility)
// ============================================================================

/**
 * Reserve allocation output format (wizard-friendly)
 */
export interface ReserveAllocation {
  totalPlanned: number; // dollars
  optimalMOIC: number; // decimal multiple (e.g., 2.8)
  companiesSupported: number;
  avgFollowOnSize: number; // dollars
  allocations: Array<{
    companyId: string;
    companyName: string;
    plannedReserve: number; // dollars
    exitMOIC: number; // decimal multiple
  }>;
}

/**
 * Synthetic portfolio company (wizard format)
 */
export interface WizardPortfolioCompany {
  id: string;
  name: string;
  investedAmount: number; // dollars
  currentValuation: number; // dollars
  currentStage: string;
  ownershipPercent: number; // percentage (0-100)
  sector: string;
}

// ============================================================================
// STAGE MAPPING (Wizard → Engine)
// ============================================================================

/**
 * Map wizard investment stage names to engine stage schema
 */
const STAGE_MAP: Record<
  string,
  'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'series_c' | 'series_d' | 'growth' | 'late_stage'
> = {
  'pre-seed': 'pre_seed',
  seed: 'seed',
  'series-a': 'series_a',
  'series-b': 'series_b',
  'series-c': 'series_c',
  'series-d': 'series_d',
  'series-e-plus': 'late_stage',
  growth: 'growth',
  'late-stage': 'late_stage',
};

/**
 * Convert wizard stage to engine stage enum
 */
function mapWizardStageToEngine(
  wizardStage: string
):
  | 'pre_seed'
  | 'seed'
  | 'series_a'
  | 'series_b'
  | 'series_c'
  | 'series_d'
  | 'growth'
  | 'late_stage' {
  const normalized = wizardStage.toLowerCase().trim();
  return STAGE_MAP[normalized] || 'seed';
}

// ============================================================================
// SYNTHETIC PORTFOLIO GENERATION
// ============================================================================

/**
 * Generate synthetic portfolio companies from sector profiles
 *
 * Creates representative portfolio companies based on:
 * - Sector allocation percentages
 * - Initial check size
 * - Entry stage characteristics
 * - Estimated deal count
 *
 * @param sectorProfiles - Sector configuration with stage cohorts
 * @param initialCheckSize - Initial investment amount per deal ($M)
 * @param estimatedDeals - Total number of initial investments
 * @returns Array of synthetic portfolio companies
 *
 * @example
 * ```ts
 * const portfolio = generateSyntheticPortfolio(
 *   sectorProfiles,
 *   2.0, // $2M check size
 *   30   // 30 deals
 * );
 * // Returns 30 companies distributed across sectors
 * ```
 */
export function generateSyntheticPortfolio(
  sectorProfiles: SectorProfile[],
  initialCheckSize: number,
  estimatedDeals: number
): PortfolioCompany[] {
  const companies: PortfolioCompany[] = [];
  const now = new Date();

  for (const sector of sectorProfiles) {
    // Calculate number of companies for this sector
    const sectorAllocation = sector.allocation / 100;
    const sectorDeals = Math.round(estimatedDeals * sectorAllocation);

    // Get entry stage (first stage in cohort)
    const entryStage = sector.stages[0];
    if (!entryStage) continue;

    // Create companies for this sector
    for (let i = 0; i < sectorDeals; i++) {
      const companyId = uuidv4();
      const impliedOwnership = initialCheckSize / entryStage.roundSize;

      companies.push({
        id: companyId,
        name: `${sector.name} Portfolio ${i + 1}`,
        sector: sector.name,
        currentStage: mapWizardStageToEngine(entryStage.stage),

        // Investment details
        totalInvested: initialCheckSize,
        currentValuation: entryStage.valuation,
        ownershipPercentage: Math.min(impliedOwnership, 1.0), // Clamp to 100%
        liquidationPreference: initialCheckSize,

        // Timeline (stagger investments over investment period)
        investmentDate: new Date(now.getFullYear(), now.getMonth() - i, 1),
        lastRoundDate: new Date(now.getFullYear(), now.getMonth() - i, 1),
        isActive: true,

        // Performance metrics
        currentMOIC: entryStage.valuation / initialCheckSize,
        estimatedExitValue: entryStage.exitValuation,
        confidenceLevel: 0.5,

        // Metadata
        tags: [sector.name, entryStage.stage],
        notes: `Synthetic company for ${sector.name} sector modeling`,
      });
    }
  }

  logger.debug('Generated synthetic portfolio', {
    totalCompanies: companies.length,
    estimatedDeals,
    sectorCount: sectorProfiles.length,
  });

  return companies;
}

// ============================================================================
// GRADUATION MATRIX CONSTRUCTION
// ============================================================================

/**
 * Build graduation matrix from sector profiles
 *
 * Extracts stage transition probabilities and valuation multiples
 * from sector-specific stage cohorts.
 *
 * @param sectorProfiles - Sector configuration with stage cohorts
 * @returns Graduation matrix for DeterministicReserveEngine
 *
 * @example
 * ```ts
 * const matrix = buildGraduationMatrix(sectorProfiles);
 * // matrix.rates[0]: { fromStage: 'seed', toStage: 'series_a', probability: 0.6, ... }
 * ```
 */
export function buildGraduationMatrix(sectorProfiles: SectorProfile[]): GraduationMatrix {
  const rates: GraduationRate[] = [];

  // Extract graduation rates from each sector's stage progression
  for (const sector of sectorProfiles) {
    for (let i = 0; i < sector.stages.length - 1; i++) {
      const currentStage = sector.stages[i];
      const nextStage = sector.stages[i + 1];

      if (!currentStage || !nextStage) continue;

      const fromStage = mapWizardStageToEngine(currentStage.stage);
      const toStage = mapWizardStageToEngine(nextStage.stage);

      // Check if rate already exists (use average if multiple sectors)
      const existingRate = rates.find((r) => r.fromStage === fromStage && r.toStage === toStage);

      const graduationProbability = currentStage.graduationRate / 100; // Convert to decimal
      const valuationMultiple = nextStage.valuation / currentStage.valuation;

      if (existingRate) {
        // Average with existing rate
        existingRate.probability = (existingRate.probability + graduationProbability) / 2;
        existingRate.valuationMultiple = (existingRate.valuationMultiple + valuationMultiple) / 2;
      } else {
        rates.push({
          fromStage,
          toStage,
          probability: graduationProbability,
          timeToGraduation: currentStage.monthsToGraduate,
          valuationMultiple,
        });
      }
    }
  }

  return {
    name: 'Wizard Portfolio Graduation Matrix',
    description: 'Derived from sector profile stage progressions',
    rates,
  };
}

// ============================================================================
// STAGE STRATEGY CONSTRUCTION
// ============================================================================

/**
 * Build stage strategies from capital allocation configuration
 *
 * Converts wizard follow-on strategy to engine-compatible StageStrategy array.
 *
 * @param stageAllocations - Per-stage follow-on allocation config
 * @param sectorProfiles - Sector profiles for round size/valuation context
 * @param initialCheckSize - Initial investment size for baseline
 * @returns Array of stage strategies for DeterministicReserveEngine
 *
 * @example
 * ```ts
 * const strategies = buildStageStrategies(
 *   capitalAllocation.followOnStrategy.stageAllocations,
 *   sectorProfiles,
 *   2.0
 * );
 * ```
 */
export function buildStageStrategies(
  stageAllocations: StageAllocation[],
  sectorProfiles: SectorProfile[],
  initialCheckSize: number
): StageStrategy[] {
  const strategies: StageStrategy[] = [];

  // Create map of stage metadata from sector profiles
  const stageMetadata = new Map<string, InvestmentStageCohort>();
  for (const sector of sectorProfiles) {
    for (const stage of sector.stages) {
      if (!stageMetadata.has(stage.stage)) {
        stageMetadata.set(stage.stage, stage);
      }
    }
  }

  // Build strategy for each stage allocation
  for (const allocation of stageAllocations) {
    const stageMeta = stageMetadata.get(allocation.stageId);
    if (!stageMeta) continue;

    const engineStage = mapWizardStageToEngine(stageMeta.stage);

    // Calculate investment bounds
    const impliedCheck = initialCheckSize * (allocation.maintainOwnership / 100);
    const maxInvestment = impliedCheck * 3; // Allow 3x initial for follow-on
    const minInvestment = impliedCheck * 0.1; // Min 10% of implied check

    // Extract failure rate (implied by graduation + exit rates)
    const failureRate = Math.max(0, 1 - stageMeta.graduationRate / 100 - stageMeta.exitRate / 100);

    strategies.push({
      stage: engineStage,

      // Investment strategy
      targetOwnership: allocation.maintainOwnership / 100, // Convert to decimal
      maxInvestment,
      minInvestment,

      // Timing strategy
      followOnProbability: allocation.participationRate / 100, // Convert to decimal
      reserveMultiple: 2.0, // Default 2x initial investment reserved

      // Risk parameters
      failureRate,
      expectedMOIC: stageMeta.exitValuation / initialCheckSize,
      expectedTimeToExit: stageMeta.monthsToExit,

      // Portfolio construction
      maxConcentration: 0.15, // Default 15% max concentration
      diversificationWeight: 0.5, // Moderate diversification preference
    });
  }

  return strategies;
}

// ============================================================================
// WIZARD → ENGINE TRANSFORMATION
// ============================================================================

/**
 * Transform wizard context to ReserveAllocationInput for DeterministicReserveEngine
 *
 * Main transformation function that bridges wizard data structure to engine format.
 *
 * NOTE: This function requires that sectorProfiles contain full SectorProfile[] data
 * with stage cohorts, not just the simplified machine state format. The full schema
 * data must be passed separately or stored in the context.
 *
 * @param ctx - Complete wizard context with all steps
 * @param fullSectorProfiles - Optional full sector profile data with stage cohorts
 * @returns ReserveAllocationInput ready for DeterministicReserveEngine
 *
 * @throws Error if required wizard steps are incomplete or sector profiles lack stage data
 *
 * @example
 * ```ts
 * // With full schema data in context
 * const engineInput = transformWizardToReserveRequest(wizardContext, fullSectorProfiles);
 * const engine = new DeterministicReserveEngine();
 * const result = await engine.calculateOptimalReserveAllocation(engineInput);
 * ```
 */
export function transformWizardToReserveRequest(
  ctx: ModelingWizardContext,
  fullSectorProfiles?: SectorProfile[],
  fullCapitalAllocation?: CapitalAllocationOutput
): ReserveAllocationInput {
  // Validate required steps
  const generalInfo = ctx.steps.generalInfo;
  const sectorProfiles = ctx.steps.sectorProfiles;
  const capitalAllocation = ctx.steps.capitalAllocation;

  if (!generalInfo || !sectorProfiles || !capitalAllocation) {
    throw new Error(
      'Missing required wizard steps: generalInfo, sectorProfiles, or capitalAllocation'
    );
  }

  // Check if we have full schema data
  if (!fullSectorProfiles || fullSectorProfiles.length === 0) {
    throw new Error(
      'Full sector profile data with stage cohorts is required for reserve engine integration. ' +
        'The simplified machine state does not contain enough detail.'
    );
  }

  if (!fullCapitalAllocation?.followOnStrategy?.stageAllocations) {
    throw new Error(
      'Full capital allocation data with stage allocations is required for reserve engine integration. ' +
        'The simplified machine state does not contain enough detail.'
    );
  }

  // Calculate estimated deals
  const investmentPeriod = generalInfo.investmentPeriod || 5;
  const estimatedDeals = capitalAllocation.pacingModel.investmentsPerYear * investmentPeriod;

  // Generate synthetic portfolio using full schema data
  const portfolio = generateSyntheticPortfolio(
    fullSectorProfiles,
    capitalAllocation.initialCheckSize,
    estimatedDeals
  );

  // Build graduation matrix
  const graduationMatrix = buildGraduationMatrix(fullSectorProfiles);

  // Build stage strategies
  const stageStrategies = buildStageStrategies(
    fullCapitalAllocation.followOnStrategy.stageAllocations,
    fullSectorProfiles,
    capitalAllocation.initialCheckSize
  );

  // Calculate available reserves
  const fundSize = generalInfo.fundSize;
  const reserveRatio = capitalAllocation.followOnStrategy.reserveRatio;
  const availableReserves = fundSize * reserveRatio;

  // Build engine input
  const input: ReserveAllocationInput = {
    // Portfolio context
    portfolio,
    availableReserves,
    totalFundSize: fundSize,

    // Strategy parameters
    graduationMatrix,
    stageStrategies,

    // Constraints
    maxSingleAllocation: fundSize * 0.15, // Max 15% per company
    minAllocationThreshold: 25000, // $25k minimum
    maxPortfolioConcentration: 0.15, // 15% concentration limit

    // Scenario parameters
    scenarioType: 'base',
    timeHorizon: (generalInfo.fundLife || 10) * 12, // Convert years to months

    // Feature flags
    enableDiversification: true,
    enableRiskAdjustment: true,
    enableLiquidationPreferences: true,
  };

  logger.info('Transformed wizard context to reserve engine input', {
    portfolioSize: portfolio.length,
    availableReserves,
    totalFundSize: fundSize,
    stageStrategiesCount: stageStrategies.length,
  });

  return input;
}

// ============================================================================
// ENGINE COMPARISON (New Capability)
// ============================================================================

/**
 * Calculate reserve allocations using DeterministicReserveEngine
 *
 * Provides comparison between wizard projections and engine recommendations.
 *
 * @param ctx - Complete wizard context
 * @param fullSectorProfiles - Full sector profile data with stage cohorts
 * @param fullCapitalAllocation - Full capital allocation data with stage allocations
 * @returns Engine calculation result with detailed allocations
 *
 * @example
 * ```ts
 * const engineResult = await calculateEngineComparison(
 *   wizardContext,
 *   fullSectorProfiles,
 *   fullCapitalAllocation
 * );
 * console.log('Engine recommends:', engineResult.allocations);
 * console.log('Expected MOIC:', engineResult.portfolioMetrics.expectedPortfolioMOIC);
 * ```
 */
export async function calculateEngineComparison(
  ctx: ModelingWizardContext,
  fullSectorProfiles: SectorProfile[],
  fullCapitalAllocation: CapitalAllocationOutput
): Promise<ReserveCalculationResult> {
  // Transform wizard data to engine format
  const engineInput = transformWizardToReserveRequest(
    ctx,
    fullSectorProfiles,
    fullCapitalAllocation
  );

  // Initialize engine
  const engine = new DeterministicReserveEngine({
    enableNewReserveEngine: true,
    enableParityTesting: true,
    enableRiskAdjustments: true,
    enableScenarioAnalysis: true,
    enableAdvancedDiversification: true,
    enableLiquidationPreferences: true,
    enablePerformanceLogging: true,
    maxCalculationTimeMs: 10000, // 10 second timeout
  });

  // Run calculation
  const result = await engine.calculateOptimalReserveAllocation(engineInput);

  logger.info('Engine comparison completed', {
    allocationsGenerated: result.allocations.length,
    totalAllocated: result.inputSummary.totalAllocated,
    expectedMOIC: result.portfolioMetrics.expectedPortfolioMOIC,
    concentrationRisk: result.portfolioMetrics.concentrationRisk,
  });

  return result;
}

// ============================================================================
// LEGACY ADAPTER INTEGRATION (Backward Compatibility)
// ============================================================================

/**
 * Convert wizard portfolio to legacy adapter format.
 * TODO: Migrate callers to transformWizardToReserveRequest + DeterministicReserveEngine
 */
function wizardPortfolioToAdapterFormat(portfolio: WizardPortfolioCompany[]) {
  return portfolio.map((company) => {
    const moic =
      company.investedAmount > 0 ? company.currentValuation / company.investedAmount : 1.0;

    return {
      id: company.id,
      name: company.name,
      investedAmount: company.investedAmount,
      invested: company.investedAmount,
      exitMultiple: moic,
      targetMoic: moic,
      stage: company.currentStage,
      sector: company.sector,
      ownershipPercentage:
        company.ownershipPercent > 1 ? company.ownershipPercent : company.ownershipPercent * 100,
      ownership:
        company.ownershipPercent > 1 ? company.ownershipPercent / 100 : company.ownershipPercent,
    };
  });
}

/**
 * Calculate reserves using legacy reserves-v11 adapter.
 * TODO: Migrate callers to transformWizardToReserveRequest + DeterministicReserveEngine
 */
export async function calculateReservesForWizard(
  ctx: ModelingWizardContext,
  portfolio: WizardPortfolioCompany[]
): Promise<ReserveAllocation> {
  const general = ctx.steps.generalInfo;
  const capital = ctx.steps.capitalAllocation;

  if (!general || !capital) {
    throw new Error('Required wizard data not available for reserve calculation');
  }

  const adapterCompanies = wizardPortfolioToAdapterFormat(portfolio);

  const fundInput = {
    id: `fund-${Date.now()}`,
    fundSize: general.fundSize,
    totalCommitted: general.fundSize,
    companies: adapterCompanies,
    portfolio: adapterCompanies,
    reservePercentage: capital.followOnStrategy.reserveRatio,
    reserveRatio: capital.followOnStrategy.reserveRatio,
  };

  const configOptions = {
    reservePercentage: capital.followOnStrategy.reserveRatio,
    reserveRatio: capital.followOnStrategy.reserveRatio,
    enableRemainPass: false,
    capPercent: 0.5,
    auditLevel: 'basic' as const,
  };

  const { adaptFundToReservesInput, adaptReservesConfig, adaptReservesResult } =
    await import('@/adapters/reserves-adapter');

  const reservesInput = adaptFundToReservesInput(fundInput);
  const reservesConfig = adaptReservesConfig(configOptions);

  const { calculateReservesSafe } = await import('@shared/lib/reserves-v11');
  const result = await calculateReservesSafe(reservesInput, reservesConfig);

  const companiesMap = new Map(
    portfolio.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        investedAmount: c.investedAmount,
      },
    ])
  );

  const adaptedResult = adaptReservesResult(result, companiesMap);

  if (!adaptedResult.success) {
    throw new Error(`Reserve calculation failed: ${adaptedResult.errors?.join(', ')}`);
  }

  let totalInvested = 0;
  let totalValue = 0;
  for (const alloc of adaptedResult.allocations) {
    const company = portfolio.find((p) => p.id === alloc.companyId);
    if (company) {
      const invested = company.investedAmount + alloc.plannedReserve;
      totalInvested += invested;
      totalValue += company.currentValuation;
    }
  }
  const optimalMOIC = totalInvested > 0 ? totalValue / totalInvested : 0;

  return {
    totalPlanned: adaptedResult.totalReserve,
    optimalMOIC,
    companiesSupported: adaptedResult.companiesFunded,
    avgFollowOnSize:
      adaptedResult.companiesFunded > 0
        ? adaptedResult.totalReserve / adaptedResult.companiesFunded
        : 0,
    allocations: adaptedResult.allocations
      .map((alloc) => {
        const company = portfolio.find((p) => p.id === alloc.companyId);
        const currentValuation = company?.currentValuation || 0;
        const investedAmount = company?.investedAmount || 0;
        const totalInvested = investedAmount + alloc.plannedReserve;
        const exitMOIC = totalInvested > 0 ? currentValuation / totalInvested : 0;

        return {
          companyId: alloc.companyId,
          companyName: alloc.companyName || company?.name || 'Unknown',
          plannedReserve: alloc.plannedReserve,
          exitMOIC,
        };
      })
      .sort((a, b) => b.exitMOIC - a.exitMOIC),
  };
}
