/**
 * Bridge between wizard context and reserves adapter
 * Handles unit conversions and data transformation
 *
 * Wizard Format: Dollars (float), Decimals (0-1)
 * Adapter Format: Cents (int), Basis Points (int)
 */

import {
  dollarsToCents,
  centsToDollars,
  percentToBps,
  adaptCompany,
  adaptReservesResult,
  type AdaptedReservesResult
} from '@/adapters/reserves-adapter';
import type { ModelingWizardContext } from '@/machines/modeling-wizard.machine';

/**
 * Reserve allocation output format (wizard-friendly)
 */
export interface ReserveAllocation {
  totalPlanned: number;        // dollars
  optimalMOIC: number;          // decimal multiple (e.g., 2.8)
  companiesSupported: number;
  avgFollowOnSize: number;      // dollars
  allocations: Array<{
    companyId: string;
    companyName: string;
    plannedReserve: number;     // dollars
    exitMOIC: number;            // decimal multiple
  }>;
}

/**
 * Synthetic portfolio company (wizard format)
 */
export interface WizardPortfolioCompany {
  id: string;
  name: string;
  investedAmount: number;       // dollars
  currentValuation: number;     // dollars
  currentStage: string;
  ownershipPercent: number;     // percentage (0-100)
  sector: string;
}

/**
 * Convert wizard portfolio to adapter format
 */
function wizardPortfolioToAdapterFormat(portfolio: WizardPortfolioCompany[]) {
  return portfolio.map(company => {
    // Calculate MOIC from invested and current valuation
    const moic = company.investedAmount > 0
      ? company.currentValuation / company.investedAmount
      : 1.0;

    return {
      id: company.id,
      name: company.name,
      investedAmount: company.investedAmount,     // Adapter expects this in dollars
      invested: company.investedAmount,            // Fallback field name
      exitMultiple: moic,                          // Adapter expects decimal MOIC
      targetMoic: moic,                            // Fallback field name
      stage: company.currentStage,
      sector: company.sector,
      ownershipPercentage: company.ownershipPercent > 1
        ? company.ownershipPercent
        : company.ownershipPercent * 100,         // Normalize to 0-100 range
      ownership: company.ownershipPercent > 1
        ? company.ownershipPercent / 100
        : company.ownershipPercent                // Fallback: 0-1 range
    };
  });
}

/**
 * Calculate reserves for wizard context
 * Bridges wizard format (dollars/decimals) with adapter format (cents/bps)
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

  // Convert portfolio to adapter format
  const adapterCompanies = wizardPortfolioToAdapterFormat(portfolio);

  // Build fund input for adapter
  const fundInput = {
    id: `fund-${Date.now()}`,
    fundSize: general.fundSize,
    totalCommitted: general.fundSize,
    companies: adapterCompanies,
    portfolio: adapterCompanies,
    reservePercentage: capital.followOnStrategy.reserveRatio,
    reserveRatio: capital.followOnStrategy.reserveRatio
  };

  // Build config for adapter
  const configOptions = {
    reservePercentage: capital.followOnStrategy.reserveRatio,
    reserveRatio: capital.followOnStrategy.reserveRatio,
    enableRemainPass: false,
    capPercent: 0.5,
    auditLevel: 'basic' as const
  };

  // Import the adapter dynamically to use it
  const { adaptFundToReservesInput, adaptReservesConfig } = await import('@/adapters/reserves-adapter');

  const reservesInput = adaptFundToReservesInput(fundInput);
  const reservesConfig = adaptReservesConfig(configOptions);

  // Call reserves engine (import dynamically)
  const { calculateReservesSafe } = await import('@shared/lib/reserves-v11');
  const result = await calculateReservesSafe(reservesInput, reservesConfig);

  // Create company map for result conversion
  const companiesMap = new Map(
    portfolio.map(c => [c.id, {
      id: c.id,
      name: c.name,
      investedAmount: c.investedAmount
    }])
  );

  // Adapter already converts output to dollars
  const adaptedResult = adaptReservesResult(result, companiesMap);

  if (!adaptedResult.success) {
    throw new Error(`Reserve calculation failed: ${adaptedResult.errors?.join(', ')}`);
  }

  // Calculate optimal MOIC
  let totalInvested = 0;
  let totalValue = 0;
  for (const alloc of adaptedResult.allocations) {
    const company = portfolio.find(p => p.id === alloc.companyId);
    if (company) {
      const invested = company.investedAmount + alloc.plannedReserve;
      totalInvested += invested;
      totalValue += company.currentValuation;
    }
  }
  const optimalMOIC = totalInvested > 0 ? totalValue / totalInvested : 0;

  // Transform to wizard format
  return {
    totalPlanned: adaptedResult.totalReserve,
    optimalMOIC,
    companiesSupported: adaptedResult.companiesFunded,
    avgFollowOnSize: adaptedResult.companiesFunded > 0
      ? adaptedResult.totalReserve / adaptedResult.companiesFunded
      : 0,
    allocations: adaptedResult.allocations.map(alloc => {
      const company = portfolio.find(p => p.id === alloc.companyId);
      const currentValuation = company?.currentValuation || 0;
      const investedAmount = company?.investedAmount || 0;
      const totalInvested = investedAmount + alloc.plannedReserve;
      const exitMOIC = totalInvested > 0 ? currentValuation / totalInvested : 0;

      return {
        companyId: alloc.companyId,
        companyName: alloc.companyName || company?.name || 'Unknown',
        plannedReserve: alloc.plannedReserve,
        exitMOIC
      };
    }).sort((a, b) => b.exitMOIC - a.exitMOIC) // Sort by exit MOIC descending
  };
}
