/**
 * Wizard Calculation Functions
 *
 * Provides validation, enrichment, and summary functions for wizard portfolio
 * calculations. Separate from XState machine to maintain clean separation of
 * concerns.
 */

import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';

// Re-export types from wizard-reserve-bridge for convenience
export type {
  ReserveAllocation,
  WizardPortfolioCompany
} from './wizard-reserve-bridge';

export { calculateReservesForWizard } from './wizard-reserve-bridge';

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface PortfolioValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PortfolioSummary {
  totalCompanies: number;
  totalInvested: number;
  totalValuation: number;
  averageMOIC: number;
  sectorBreakdown: Record<string, number>;
  stageBreakdown: Record<string, number>;
}

export interface EnrichedReserveAllocation {
  // Original allocation data
  totalPlanned: number;
  optimalMOIC: number;
  companiesSupported: number;
  avgFollowOnSize: number;

  // Enriched insights
  insights: {
    utilizationRate: number;        // % of fund used (including reserves)
    reserveEfficiency: number;       // MOIC improvement from reserves
    concentrationRisk: string;       // 'Low' | 'Medium' | 'High'
    capitalDeployment: string;       // 'Conservative' | 'Balanced' | 'Aggressive'
  };

  // Contextualized metrics
  fundContext: {
    fundSize: number;
    initialCapitalDeployed: number;
    reservesDeployed: number;
    remainingCapital: number;
  };
}

// ============================================================================
// PORTFOLIO VALIDATION
// ============================================================================

/**
 * Validate wizard portfolio for reserve calculation
 * Returns errors and warnings separately
 */
export function validateWizardPortfolio(
  portfolio: Array<{
    id: string;
    name: string;
    investedAmount: number;
    currentValuation: number;
    currentStage: string;
    ownershipPercent: number;
    sector: string;
  }>
): PortfolioValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Empty portfolio check
  if (portfolio.length === 0) {
    errors.push('Portfolio must contain at least one company');
    return { valid: false, errors, warnings };
  }

  // Validate individual companies
  portfolio.forEach((company, index) => {
    const prefix = `Company "${company.name || `#${index + 1}`}"`;

    // Required fields
    if (!company.id || company.id.trim().length === 0) {
      errors.push(`${prefix}: ID is required`);
    }

    if (!company.name || company.name.trim().length === 0) {
      errors.push(`${prefix}: Name is required`);
    }

    // Numeric validations
    if (company.investedAmount <= 0) {
      errors.push(`${prefix}: Invested amount must be positive`);
    }

    if (company.currentValuation < 0) {
      errors.push(`${prefix}: Current valuation cannot be negative`);
    }

    if (company.ownershipPercent <= 0 || company.ownershipPercent > 100) {
      errors.push(`${prefix}: Ownership must be between 0% and 100%`);
    }

    // Stage validation
    const validStages = ['seed', 'series-a', 'series-b', 'series-c', 'growth'];
    if (!validStages.includes(company.currentStage)) {
      errors.push(`${prefix}: Invalid stage "${company.currentStage}"`);
    }

    // Sector validation
    if (!company.sector || company.sector.trim().length === 0) {
      errors.push(`${prefix}: Sector is required`);
    }

    // Warnings for unusual values
    const moic = company.currentValuation / company.investedAmount;
    if (moic < 0.5) {
      warnings.push(`${prefix}: Current MOIC (${moic.toFixed(2)}x) is very low`);
    }

    if (moic > 10) {
      warnings.push(`${prefix}: Current MOIC (${moic.toFixed(2)}x) is unusually high`);
    }

    if (company.ownershipPercent < 5) {
      warnings.push(`${prefix}: Ownership (${company.ownershipPercent.toFixed(1)}%) is very low`);
    }

    if (company.ownershipPercent > 30) {
      warnings.push(`${prefix}: Ownership (${company.ownershipPercent.toFixed(1)}%) is unusually high`);
    }
  });

  // Check for duplicate IDs
  const ids = portfolio.map(c => c.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate company IDs: ${duplicateIds.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// PORTFOLIO SUMMARY
// ============================================================================

/**
 * Generate portfolio summary statistics
 */
export function generatePortfolioSummary(
  portfolio: Array<{
    investedAmount: number;
    currentValuation: number;
    sector: string;
    currentStage: string;
  }>
): PortfolioSummary {
  if (portfolio.length === 0) {
    return {
      totalCompanies: 0,
      totalInvested: 0,
      totalValuation: 0,
      averageMOIC: 0,
      sectorBreakdown: {},
      stageBreakdown: {}
    };
  }

  // Calculate totals
  const totalInvested = portfolio.reduce((sum, c) => sum + c.investedAmount, 0);
  const totalValuation = portfolio.reduce((sum, c) => sum + c.currentValuation, 0);
  const averageMOIC = totalInvested > 0 ? totalValuation / totalInvested : 0;

  // Sector breakdown (invested amount per sector)
  const sectorBreakdown: Record<string, number> = {};
  portfolio.forEach(company => {
    const sector = company.sector || 'Unknown';
    sectorBreakdown[sector] = (sectorBreakdown[sector] || 0) + company.investedAmount;
  });

  // Stage breakdown (invested amount per stage)
  const stageBreakdown: Record<string, number> = {};
  portfolio.forEach(company => {
    const stage = company.currentStage || 'Unknown';
    stageBreakdown[stage] = (stageBreakdown[stage] || 0) + company.investedAmount;
  });

  return {
    totalCompanies: portfolio.length,
    totalInvested,
    totalValuation,
    averageMOIC,
    sectorBreakdown,
    stageBreakdown
  };
}

// ============================================================================
// RESERVE ENRICHMENT
// ============================================================================

/**
 * Enrich reserve allocation with fund context and insights
 */
export function enrichWizardMetrics(
  allocation: {
    totalPlanned: number;
    optimalMOIC: number;
    companiesSupported: number;
    avgFollowOnSize: number;
  },
  wizardContext: ModelingWizardContext
): EnrichedReserveAllocation {
  const generalInfo = wizardContext.steps.generalInfo;
  const capitalAllocation = wizardContext.steps.capitalAllocation;

  if (!generalInfo || !capitalAllocation) {
    throw new Error('Required wizard context not available for enrichment');
  }

  const fundSize = generalInfo.fundSize;

  // Calculate initial capital deployed (simplified - would use full portfolio data)
  const initialCheckSize = capitalAllocation.initialCheckSize;
  const pacingModel = capitalAllocation.pacingModel;
  const investmentPeriod = generalInfo.investmentPeriod || 5;
  const investmentsPerYear = pacingModel.investmentsPerYear;
  const estimatedCompanies = investmentsPerYear * investmentPeriod;
  const initialCapitalDeployed = initialCheckSize * estimatedCompanies;

  // Fund utilization
  const reservesDeployed = allocation.totalPlanned;
  const totalDeployed = initialCapitalDeployed + reservesDeployed;
  const remainingCapital = fundSize - totalDeployed;
  const utilizationRate = (totalDeployed / fundSize) * 100;

  // Reserve efficiency (MOIC improvement)
  // Baseline MOIC without reserves would be lower
  const baselineMOIC = 2.0; // Simplified assumption
  const reserveEfficiency = ((allocation.optimalMOIC - baselineMOIC) / baselineMOIC) * 100;

  // Concentration risk assessment
  const companiesSupported = allocation.companiesSupported;
  const avgReservePerCompany = companiesSupported > 0
    ? allocation.totalPlanned / companiesSupported
    : 0;
  const concentrationRatio = avgReservePerCompany / initialCheckSize;

  let concentrationRisk: 'Low' | 'Medium' | 'High';
  if (concentrationRatio < 1.5) {
    concentrationRisk = 'Low';
  } else if (concentrationRatio < 3) {
    concentrationRisk = 'Medium';
  } else {
    concentrationRisk = 'High';
  }

  // Capital deployment strategy
  let capitalDeployment: 'Conservative' | 'Balanced' | 'Aggressive';
  if (utilizationRate < 70) {
    capitalDeployment = 'Conservative';
  } else if (utilizationRate < 90) {
    capitalDeployment = 'Balanced';
  } else {
    capitalDeployment = 'Aggressive';
  }

  return {
    totalPlanned: allocation.totalPlanned,
    optimalMOIC: allocation.optimalMOIC,
    companiesSupported: allocation.companiesSupported,
    avgFollowOnSize: allocation.avgFollowOnSize,

    insights: {
      utilizationRate,
      reserveEfficiency,
      concentrationRisk,
      capitalDeployment
    },

    fundContext: {
      fundSize,
      initialCapitalDeployed,
      reservesDeployed,
      remainingCapital
    }
  };
}
