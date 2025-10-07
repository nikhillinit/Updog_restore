/**
 * Capital Allocation Calculations
 *
 * Pure functions for calculating capital distribution across initial and follow-on investments.
 * Integrates with sector profiles to model graduation flow and reserve requirements.
 *
 * @module capital-allocation-calculations
 */

import type {
  SectorProfile,
  StageAllocation,
  PacingPeriod,
  CapitalAllocationInput
} from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Calculated follow-on allocation for a specific stage transition
 */
export interface FollowOnCalculation extends StageAllocation {
  /** Number of companies graduating into this stage */
  graduatesIn: number;

  /** Number of follow-on investments (graduatesIn * participationRate) */
  followOnInvestments: number;

  /** Implied check size to maintain target ownership ($M) */
  impliedCheckSize: number;

  /** Total capital allocated to this stage ($M) */
  capitalAllocated: number;

  /** Post-money valuation at this stage ($M) */
  postMoneyValuation: number;

  /** Round size at this stage ($M) */
  roundSize: number;
}

/**
 * Investment pacing schedule with calculated amounts
 */
export interface PacingSchedule extends PacingPeriod {
  /** Starting date (calculated from vintage year) */
  startDate: string;

  /** Ending date (calculated from vintage year) */
  endDate: string;

  /** Initial capital deployed in this period ($M) */
  initialCapitalDeployed: number;

  /** Follow-on capital deployed in this period ($M) */
  followOnCapitalDeployed: number;

  /** Total capital deployed in this period ($M) */
  totalCapitalDeployed: number;
}

/**
 * Complete capital allocation calculations
 */
export interface CapitalAllocationCalculations {
  /** Weighted average round size across all sectors ($M) */
  avgRoundSize: number;

  /** Implied ownership from initial check size (%) */
  impliedOwnership: number;

  /** Total number of initial investments */
  estimatedDeals: number;

  /** Capital allocated to initial investments ($M) */
  initialCapitalAllocated: number;

  /** Follow-on calculations per stage */
  followOnAllocations: FollowOnCalculation[];

  /** Total follow-on capital required ($M) */
  totalFollowOnCapital: number;

  /** Total capital allocated (initial + follow-on) ($M) */
  totalCapitalAllocated: number;

  /** Available reserves (fund size * reserve ratio) ($M) */
  availableReserves: number;

  /** Remaining unallocated capital ($M) */
  remainingCapital: number;

  /** Pacing schedule with calculated amounts */
  pacingSchedule: PacingSchedule[];
}

/**
 * Validation result for capital allocation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

// ============================================================================
// INITIAL INVESTMENT CALCULATIONS
// ============================================================================

/**
 * Calculate weighted average round size across all sectors
 */
export function calculateWeightedAvgRoundSize(
  sectorProfiles: SectorProfile[]
): number {
  if (sectorProfiles.length === 0) return 0;

  let totalWeightedRoundSize = 0;
  let totalWeight = 0;

  for (const sector of sectorProfiles) {
    const allocation = sector.allocation / 100; // Convert to decimal

    // Get first stage round size (entry point)
    const entryStage = sector.stages[0];
    if (entryStage) {
      totalWeightedRoundSize += entryStage.roundSize * allocation;
      totalWeight += allocation;
    }
  }

  return totalWeight > 0 ? totalWeightedRoundSize / totalWeight : 0;
}

/**
 * Calculate implied ownership percentage from check size
 */
export function calculateImpliedOwnership(
  checkSize: number,
  avgRoundSize: number
): number {
  if (avgRoundSize === 0) return 0;
  return (checkSize / avgRoundSize) * 100;
}

/**
 * Calculate total number of initial investments over investment period
 */
export function calculateEstimatedDeals(
  investmentsPerYear: number,
  investmentPeriod: number
): number {
  return investmentsPerYear * investmentPeriod;
}

/**
 * Calculate total capital allocated to initial investments
 */
export function calculateInitialCapitalAllocated(
  checkSize: number,
  estimatedDeals: number
): number {
  return checkSize * estimatedDeals;
}

// ============================================================================
// FOLLOW-ON CALCULATIONS
// ============================================================================

/**
 * Calculate follow-on check size needed to maintain target ownership
 *
 * Formula accounts for:
 * - Dilution from new round
 * - ESOP expansion
 * - Existing ownership stake
 */
export function calculateFollowOnCheckForOwnership(
  currentOwnership: number,      // % (e.g., 15%)
  targetOwnership: number,       // % (e.g., 15% after dilution)
  newRoundSize: number,          // $ raised
  preMoneyValuation: number,     // $ before round
  esopExpansion: number = 0      // % allocated to option pool
): number {
  // Post-money valuation
  const postMoneyValuation = preMoneyValuation + newRoundSize;

  // Account for ESOP dilution
  const dilutionFactor = 1 / (1 - (esopExpansion / 100));

  // Current value of stake
  const currentValue = (currentOwnership / 100) * preMoneyValuation;

  // Required value to maintain target ownership
  const targetValue = (targetOwnership / 100) * postMoneyValuation * dilutionFactor;

  // Additional investment needed
  const requiredInvestment = Math.max(0, targetValue - currentValue);

  return requiredInvestment;
}

/**
 * Build stage graduation mapping from sector profiles
 * Returns map of stage -> number of companies at that stage
 */
function buildStagePopulationMap(
  sectorProfiles: SectorProfile[],
  estimatedDeals: number
): Map<string, number> {
  const stagePopulation = new Map<string, number>();

  for (const sector of sectorProfiles) {
    const sectorAllocation = sector.allocation / 100;
    const sectorDeals = Math.round(estimatedDeals * sectorAllocation);

    // Start with entry stage
    let currentPopulation = sectorDeals;

    for (let i = 0; i < sector.stages.length; i++) {
      const stage = sector.stages[i];
      if (!stage) continue;

      // Add to this stage's population
      const existingPopulation = stagePopulation.get(stage.stage) || 0;
      stagePopulation.set(stage.stage, existingPopulation + currentPopulation);

      // Calculate graduates to next stage
      const graduationRate = stage.graduationRate / 100;
      currentPopulation = Math.round(currentPopulation * graduationRate);
    }
  }

  return stagePopulation;
}

/**
 * Calculate follow-on allocations for all stages
 *
 * Models graduation flow from sector profiles and applies follow-on strategy
 */
export function calculateFollowOnCascade(
  sectorProfiles: SectorProfile[],
  followOnStrategy: { stageAllocations: StageAllocation[] },
  initialCheckSize: number,
  estimatedDeals: number
): FollowOnCalculation[] {
  if (sectorProfiles.length === 0 || estimatedDeals === 0) {
    return [];
  }

  // Build map of how many companies are at each stage
  const stagePopulation = buildStagePopulationMap(sectorProfiles, estimatedDeals);

  // Get stage metadata (round sizes, valuations) from sector profiles
  const stageMetadata = new Map<string, { roundSize: number; valuation: number; esop: number }>();
  for (const sector of sectorProfiles) {
    for (const stage of sector.stages) {
      if (!stageMetadata.has(stage.stage)) {
        stageMetadata.set(stage.stage, {
          roundSize: stage.roundSize,
          valuation: stage.valuation,
          esop: stage.esopPercentage
        });
      }
    }
  }

  const calculations: FollowOnCalculation[] = [];

  for (const allocation of followOnStrategy.stageAllocations) {
    const graduatesIn = stagePopulation.get(allocation.stageId) || 0;
    const participationRate = allocation.participationRate / 100;
    const followOnInvestments = Math.round(graduatesIn * participationRate);

    const metadata = stageMetadata.get(allocation.stageId);
    const roundSize = metadata?.roundSize || 0;
    const valuation = metadata?.valuation || 0;
    const esop = metadata?.esop || 0;

    // Calculate implied check size based on maintaining ownership
    const currentOwnership = calculateImpliedOwnership(initialCheckSize, roundSize);
    const targetOwnership = allocation.maintainOwnership;

    const impliedCheckSize = calculateFollowOnCheckForOwnership(
      currentOwnership,
      targetOwnership,
      roundSize,
      valuation - roundSize, // Pre-money = Post-money - round size
      esop
    );

    const capitalAllocated = followOnInvestments * impliedCheckSize;

    calculations.push({
      ...allocation,
      graduatesIn,
      followOnInvestments,
      impliedCheckSize,
      capitalAllocated,
      postMoneyValuation: valuation,
      roundSize
    });
  }

  return calculations;
}

// ============================================================================
// PACING SCHEDULE CALCULATIONS
// ============================================================================

/**
 * Format date from vintage year and month offset
 */
function formatDate(vintageYear: number, monthOffset: number): string {
  const year = vintageYear + Math.floor(monthOffset / 12);
  const month = monthOffset % 12;

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return `${monthNames[month]} ${year}`;
}

/**
 * Calculate pacing schedule with dollar amounts per period
 */
export function calculatePacingSchedule(
  pacingPeriods: PacingPeriod[],
  totalInitialCapital: number,
  totalFollowOnCapital: number,
  vintageYear: number
): PacingSchedule[] {
  const totalCapital = totalInitialCapital + totalFollowOnCapital;

  return pacingPeriods.map(period => {
    const allocationDecimal = period.allocationPercent / 100;
    const totalCapitalDeployed = totalCapital * allocationDecimal;

    // Assume 70/30 split between initial and follow-on within each period
    const initialCapitalDeployed = totalCapitalDeployed * 0.7;
    const followOnCapitalDeployed = totalCapitalDeployed * 0.3;

    return {
      ...period,
      startDate: formatDate(vintageYear, period.startMonth),
      endDate: formatDate(vintageYear, period.endMonth),
      initialCapitalDeployed,
      followOnCapitalDeployed,
      totalCapitalDeployed
    };
  });
}

/**
 * Generate default pacing periods based on deployment curve
 */
export function generateDefaultPacingPeriods(
  investmentPeriod: number,
  deploymentCurve: 'linear' | 'front-loaded' | 'back-loaded'
): PacingPeriod[] {
  const periods: PacingPeriod[] = [];
  const monthsPerPeriod = 12; // Annual periods

  const curveMultipliers: Record<string, number[]> = {
    'linear': [1, 1, 1, 1, 1],
    'front-loaded': [1.5, 1.3, 1.0, 0.7, 0.5],
    'back-loaded': [0.5, 0.7, 1.0, 1.3, 1.5]
  };

  const multipliers = curveMultipliers[deploymentCurve] || curveMultipliers['linear'];
  const periodsToGenerate = Math.min(investmentPeriod, multipliers.length);

  const totalMultiplier = multipliers.slice(0, periodsToGenerate).reduce((sum, m) => sum + m, 0);

  for (let i = 0; i < periodsToGenerate; i++) {
    const multiplier = multipliers[i] || 1;
    const allocationPercent = (multiplier / totalMultiplier) * 100;

    periods.push({
      id: `period-${i + 1}`,
      startMonth: i * monthsPerPeriod,
      endMonth: (i + 1) * monthsPerPeriod,
      allocationPercent
    });
  }

  return periods;
}

// ============================================================================
// COMPLETE CALCULATIONS
// ============================================================================

/**
 * Calculate all capital allocation metrics
 *
 * Main entry point for deriving all calculated fields from user inputs
 */
export function calculateCapitalAllocation(
  input: CapitalAllocationInput,
  sectorProfiles: SectorProfile[],
  fundSize: number,
  investmentPeriod: number,
  vintageYear: number
): CapitalAllocationCalculations {
  // Initial investment calculations
  const avgRoundSize = calculateWeightedAvgRoundSize(sectorProfiles);
  const impliedOwnership = calculateImpliedOwnership(input.initialCheckSize, avgRoundSize);
  const estimatedDeals = calculateEstimatedDeals(
    input.pacingModel.investmentsPerYear,
    investmentPeriod
  );
  const initialCapitalAllocated = calculateInitialCapitalAllocated(
    input.initialCheckSize,
    estimatedDeals
  );

  // Follow-on calculations
  const followOnAllocations = calculateFollowOnCascade(
    sectorProfiles,
    input.followOnStrategy,
    input.initialCheckSize,
    estimatedDeals
  );

  const totalFollowOnCapital = followOnAllocations.reduce(
    (sum, alloc) => sum + alloc.capitalAllocated,
    0
  );

  // Totals
  const totalCapitalAllocated = initialCapitalAllocated + totalFollowOnCapital;
  const availableReserves = fundSize * input.followOnStrategy.reserveRatio;
  const remainingCapital = fundSize - totalCapitalAllocated;

  // Pacing schedule
  const pacingSchedule = calculatePacingSchedule(
    input.pacingHorizon,
    initialCapitalAllocated,
    totalFollowOnCapital,
    vintageYear
  );

  return {
    avgRoundSize,
    impliedOwnership,
    estimatedDeals,
    initialCapitalAllocated,
    followOnAllocations,
    totalFollowOnCapital,
    totalCapitalAllocated,
    availableReserves,
    remainingCapital,
    pacingSchedule
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate capital allocation against fund constraints
 */
export function validateCapitalAllocation(
  calculations: CapitalAllocationCalculations,
  fundSize: number
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  // Error: Total allocation exceeds fund size
  if (calculations.totalCapitalAllocated > fundSize) {
    errors.push({
      field: 'totalCapitalAllocated',
      message: `Total capital allocation ($${calculations.totalCapitalAllocated.toFixed(1)}M) exceeds fund size ($${fundSize.toFixed(1)}M)`
    });
  }

  // Error: Follow-on capital exceeds available reserves
  if (calculations.totalFollowOnCapital > calculations.availableReserves) {
    errors.push({
      field: 'totalFollowOnCapital',
      message: `Follow-on capital required ($${calculations.totalFollowOnCapital.toFixed(1)}M) exceeds available reserves ($${calculations.availableReserves.toFixed(1)}M)`
    });
  }

  // Warning: Deploying >95% of fund
  if (calculations.totalCapitalAllocated > fundSize * 0.95) {
    warnings.push({
      field: 'totalCapitalAllocated',
      message: `Deploying ${((calculations.totalCapitalAllocated / fundSize) * 100).toFixed(1)}% of fund - limited room for opportunistic investments`
    });
  }

  // Warning: Very low remaining capital
  if (calculations.remainingCapital < fundSize * 0.05 && calculations.remainingCapital > 0) {
    warnings.push({
      field: 'remainingCapital',
      message: `Only $${calculations.remainingCapital.toFixed(1)}M remaining for opportunistic investments`
    });
  }

  // Warning: High implied ownership (may be difficult to achieve)
  if (calculations.impliedOwnership > 25) {
    warnings.push({
      field: 'impliedOwnership',
      message: `Implied ownership of ${calculations.impliedOwnership.toFixed(1)}% may be difficult to achieve at competitive prices`
    });
  }

  // Warning: Low implied ownership (limited influence)
  if (calculations.impliedOwnership < 5 && calculations.impliedOwnership > 0) {
    warnings.push({
      field: 'impliedOwnership',
      message: `Implied ownership of ${calculations.impliedOwnership.toFixed(1)}% may provide limited board influence`
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
