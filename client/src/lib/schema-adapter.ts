/**
 * Schema Adapter
 * Bridges ExtendedFundModelInputs (new schema system) with legacy FundModelInputs
 *
 * This adapter allows incremental migration:
 * 1. New UI uses ExtendedFundModelInputs
 * 2. Adapter converts to legacy format
 * 3. Existing engine runs unchanged
 * 4. Later: Refactor engine to use ExtendedFundModelInputs directly
 */

import { Decimal } from 'decimal.js';
import type { ExtendedFundModelInputs } from '@shared/schemas/extended-fund-model';
import type { FundModelInputs, Stage } from '@shared/schemas/fund-model';
import type { StageType } from '@shared/schemas/stage-profile';

/**
 * Convert ExtendedFundModelInputs to legacy FundModelInputs
 *
 * Maps new schema fields to legacy format for backward compatibility.
 * Uses first fee tier and stage profile to populate legacy fields.
 */
export function adaptToLegacySchema(extended: ExtendedFundModelInputs): FundModelInputs {
  // Map stage types (new enum → legacy enum)
  const stageMap: Record<StageType, Stage> = {
    pre_seed: 'seed',
    seed: 'seed',
    series_a: 'series_a',
    series_b: 'series_b',
    series_c: 'series_c',
    growth: 'growth',
    late_stage: 'growth'
  };

  // Extract stage allocations from StageProfile
  const stageAllocations = extended.stageProfile.stages.map(stage => {
    // Calculate allocation as % of total portfolio
    const roundCapital = stage.roundSize.times(extended.stageProfile.initialPortfolioSize);
    const totalCapital = extended.stageProfile.stages.reduce(
      (sum, s) => sum.plus(s.roundSize.times(extended.stageProfile.initialPortfolioSize)),
      new Decimal(0)
    );
    const allocationPct = roundCapital.div(totalCapital).toNumber();

    return {
      stage: stageMap[stage.stage],
      allocationPct
    };
  });

  // Extract average check sizes
  const averageCheckSizes: Record<Stage, number> = {} as any;
  extended.stageProfile.stages.forEach(stage => {
    const legacyStage = stageMap[stage.stage];
    averageCheckSizes[legacyStage] = stage.roundSize.toNumber();
  });

  // Extract graduation rates (convert from cumulative to per-period if needed)
  const graduationRates: Record<Stage, number> = {} as any;
  extended.stageProfile.stages.forEach(stage => {
    const legacyStage = stageMap[stage.stage];
    graduationRates[legacyStage] = stage.graduationRate.toNumber();
  });

  // Extract exit rates
  const exitRates: Record<Stage, number> = {} as any;
  extended.stageProfile.stages.forEach(stage => {
    const legacyStage = stageMap[stage.stage];
    exitRates[legacyStage] = stage.exitRate.toNumber();
  });

  // Extract months to graduate/exit
  const monthsToGraduate: Record<Stage, number> = {} as any;
  const monthsToExit: Record<Stage, number> = {} as any;
  extended.stageProfile.stages.forEach(stage => {
    const legacyStage = stageMap[stage.stage];
    monthsToGraduate[legacyStage] = stage.monthsToGraduate;
    monthsToExit[legacyStage] = stage.monthsToExit;
  });

  // Extract management fee from first tier (legacy only supports single rate)
  const firstFeeTier = extended.feeProfile.tiers[0];
  const managementFeeRate = firstFeeTier?.annualRatePercent.toNumber() ?? 0.02;

  // Calculate reserve pool % from stage profile assumptions
  const reservePoolPct = extended.stageProfile.assumptions?.reserveStrategy === 'pro_rata'
    ? 0.3 // Default 30% for pro-rata
    : 0.4; // Default 40% for winner-picking

  return {
    fundSize: extended.committedCapital.toNumber(),
    periodLengthMonths: 3, // Default to quarterly (legacy hardcoded)
    capitalCallMode: 'upfront', // Legacy only supports upfront
    managementFeeRate,
    managementFeeYears: 10, // Default (can extract from fee profile tiers if needed)
    stageAllocations,
    reservePoolPct,
    averageCheckSizes,
    graduationRates,
    exitRates,
    monthsToGraduate,
    monthsToExit
  };
}

/**
 * Validate that ExtendedFundModelInputs can be safely converted to legacy format
 *
 * Returns array of warnings for features that won't be preserved in legacy format.
 */
export function validateLegacyCompatibility(extended: ExtendedFundModelInputs): string[] {
  const warnings: string[] = [];

  // Check for multi-tier fees
  if (extended.feeProfile.tiers.length > 1) {
    const firstTier = extended.feeProfile.tiers[0];
    if (firstTier) {
      warnings.push(
        'Legacy engine only supports single fee tier. ' +
        `Only the first tier (${(firstTier.annualRatePercent.toNumber() * 100).toFixed(2)}%) will be used.`
      );
    }
  }

  // Check for non-upfront capital calls
  if (extended.capitalCallPolicy.mode !== 'upfront') {
    warnings.push(
      `Legacy engine only supports upfront capital calls. ` +
      `${extended.capitalCallPolicy.mode} policy will be ignored.`
    );
  }

  // Check for waterfall policies
  if (extended.waterfallPolicy.type === 'american') {
    warnings.push(
      'Legacy engine uses simple immediate distribution (Policy A). ' +
      'American waterfall will not be applied.'
    );
  }

  // Check for recycling policies
  if (extended.recyclingPolicy?.enabled) {
    warnings.push(
      'Legacy engine does not support exit proceeds recycling. ' +
      'Recycling policy will be ignored.'
    );
  }

  // Check for fee recycling
  if (extended.feeProfile.recyclingPolicy?.enabled) {
    warnings.push(
      'Legacy engine does not support fee recycling. ' +
      'Fee recycling policy will be ignored.'
    );
  }

  // Check for fractional company counts
  if (!extended.stageProfile.initialPortfolioSize.isInteger()) {
    warnings.push(
      `Portfolio size is fractional (${extended.stageProfile.initialPortfolioSize.toString()}). ` +
      'Legacy engine will floor to integer, losing deterministic precision.'
    );
  }

  return warnings;
}

/**
 * Create a minimal ExtendedFundModelInputs from legacy FundModelInputs
 *
 * Useful for testing and backward compatibility.
 * Creates sensible defaults for new schema fields.
 */
export function adaptFromLegacySchema(legacy: FundModelInputs): ExtendedFundModelInputs {
  // Reverse stage mapping
  const stageTypeMap: Record<Stage, StageType> = {
    seed: 'seed',
    series_a: 'series_a',
    series_b: 'series_b',
    series_c: 'series_c',
    growth: 'growth'
  };

  // Calculate initial portfolio size from allocations
  const totalCompanies = legacy.stageAllocations.reduce((sum, alloc) => {
    const stageCapital = legacy.fundSize * alloc.allocationPct * (1 - legacy.reservePoolPct);
    const avgCheck = legacy.averageCheckSizes[alloc.stage] ?? 0;
    const numCompanies = avgCheck > 0 ? Math.floor(stageCapital / avgCheck) : 0;
    return sum + numCompanies;
  }, 0);

  return {
    // Base fields
    id: `legacy-${Date.now()}`,
    name: 'Legacy Fund Model',
    committedCapital: new Decimal(legacy.fundSize),
    fundTermMonths: 120, // Default 10 years
    vintageYear: new Date().getFullYear(),

    // Stage profile
    stageProfile: {
      id: 'legacy-stages',
      name: 'Legacy Stage Profile',
      initialPortfolioSize: new Decimal(totalCompanies),
      recyclingEnabled: false,

      stages: legacy.stageAllocations.map(alloc => ({
        stage: stageTypeMap[alloc.stage],
        roundSize: new Decimal(legacy.averageCheckSizes[alloc.stage] ?? 0),
        postMoneyValuation: new Decimal(legacy.averageCheckSizes[alloc.stage] ?? 0).times(5), // Heuristic: 5x check
        esopPercent: new Decimal(0.15), // Default 15%
        graduationRate: new Decimal(legacy.graduationRates[alloc.stage] ?? 0),
        exitRate: new Decimal(legacy.exitRates[alloc.stage] ?? 0),
        monthsToGraduate: legacy.monthsToGraduate[alloc.stage] ?? 24,
        monthsToExit: legacy.monthsToExit[alloc.stage] ?? 60,
        exitMultiple: new Decimal(3), // Default 3x
        dilutionPerRound: new Decimal(0.2) // Default 20%
      }))
    },

    // Fee profile (single tier from legacy)
    feeProfile: {
      id: 'legacy-fees',
      name: 'Legacy Fee Profile',
      tiers: [{
        basis: 'committed_capital',
        annualRatePercent: new Decimal(legacy.managementFeeRate),
        startYear: 1,
        endYear: legacy.managementFeeYears
      }],
      recyclingPolicy: undefined
    },

    // Capital call policy (upfront)
    capitalCallPolicy: {
      id: 'legacy-calls',
      name: 'Upfront Capital Call',
      mode: 'upfront',
      percentage: new Decimal(1),
      noticePeriodDays: 0,
      fundingPeriodDays: 0
    },

    // Waterfall policy (simple European for Policy A)
    waterfallPolicy: {
      id: 'legacy-waterfall',
      name: 'Simple European (Policy A)',
      type: 'european',
      preferredReturnRate: new Decimal(0), // No hurdle in legacy
      tiers: [
        { tierType: 'return_of_capital', priority: 1 },
        { tierType: 'carry', priority: 2, rate: new Decimal(0) } // No carry in legacy
      ],
      hurdleRateBasis: 'committed',
      cumulativeCalculations: true
    },

    // No recycling in legacy
    recyclingPolicy: undefined,

    // Default assumptions
    assumptions: {
      defaultHoldingPeriod: 60,
      reinvestmentPeriod: 36,
      portfolioConcentrationLimit: new Decimal(0.2),
      liquidateAtTermEnd: false,
      liquidationDiscountPercent: new Decimal(0.3)
    },

    // Monte Carlo disabled (legacy is deterministic)
    monteCarloSettings: {
      enabled: false,
      numberOfSimulations: 1,
      confidenceInterval: new Decimal(0.95)
    }
  };
}
