import { storage } from '../storage';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { fundDistributions } from '@shared/schema';

/**
 * Calculated fund metrics interface
 * Provides comprehensive financial metrics for a venture capital fund
 */
export interface CalculatedFundMetrics {
  /** Total committed capital (fund size) */
  totalCommitted: number;

  /** Total capital invested across all portfolio companies */
  totalInvested: number;

  /** Current total value of all portfolio holdings */
  totalValue: number;

  /** Undeployed capital remaining */
  remainingCapital: number;

  /** Deployment rate as percentage of committed capital */
  deploymentRate: number;

  /** Internal Rate of Return */
  irr: number;

  /** Multiple on Invested Capital (MOIC) */
  moic: number;

  /** Distributions to Paid-In capital (DPI) */
  dpi: number;

  /** Total Value to Paid-In capital (TVPI) */
  tvpi: number;

  /** Number of active portfolio companies */
  activeInvestments: number;

  /** Number of exited portfolio companies */
  exited: number;

  /** Average initial check size per company */
  avgCheckSize: number;

  /** Total distributions returned to LPs */
  totalDistributions: number;
}

/**
 * Simple IRR approximation using modified Dietz method
 * This is a simplified calculation suitable for display purposes
 * For precise IRR, use the client-side xirrNewtonBisection function
 */
function calculateSimpleIRR(
  totalInvested: number,
  totalValue: number,
  totalDistributions: number,
  yearsInvested: number
): number {
  if (totalInvested <= 0 || yearsInvested <= 0) return 0;

  // Total return = (Current Value + Distributions - Initial Investment) / Initial Investment
  const totalReturn = (totalValue + totalDistributions - totalInvested) / totalInvested;

  // Annualized return (compound annual growth rate approximation)
  // IRR ≈ (1 + totalReturn)^(1/years) - 1
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / yearsInvested) - 1;

  // Cap at reasonable bounds (-50% to 200%)
  return Math.max(-0.5, Math.min(2.0, annualizedReturn));
}

/**
 * Calculate comprehensive fund metrics for a given fund
 *
 * This function aggregates data from the fund, portfolio companies, investments,
 * and distributions to compute key venture capital performance metrics.
 *
 * @param fundId - The unique identifier of the fund
 * @returns Promise resolving to calculated fund metrics
 * @throws Error if fund is not found or calculations fail
 *
 * @example
 * ```typescript
 * const metrics = await calculateFundMetrics(1);
 * console.log(`Fund MOIC: ${metrics.moic.toFixed(2)}x`);
 * console.log(`IRR: ${(metrics.irr * 100).toFixed(1)}%`);
 * console.log(`DPI: ${metrics.dpi.toFixed(2)}x`);
 * ```
 */
export async function calculateFundMetrics(fundId: number): Promise<CalculatedFundMetrics> {
  // Fetch fund data
  const fund = await storage.getFund(fundId);
  if (!fund) {
    throw new Error(`Fund with ID ${fundId} not found`);
  }

  // Fetch portfolio companies and investments
  const portfolioCompanies = await storage.getPortfolioCompanies(fundId);
  const investments = await storage.getInvestments(fundId);

  // Fetch distributions from database
  let distributions: Array<{ amount: string; distributionDate: Date }> = [];
  try {
    distributions = await db
      .select({
        amount: fundDistributions.amount,
        distributionDate: fundDistributions.distributionDate,
      })
      .from(fundDistributions)
      .where(eq(fundDistributions.fundId, fundId));
  } catch {
    // If table doesn't exist yet, use empty array
    distributions = [];
  }

  // Extract and validate fund size (handle decimal/string conversion)
  const totalCommitted = parseFloat(fund.size) || 0;

  // Calculate total invested capital
  // Sum all investment amounts across the portfolio
  const totalInvested = investments.reduce((sum, investment) => {
    const amount = parseFloat(investment.amount) || 0;
    return sum + amount;
  }, 0);

  // Calculate total current value
  // Sum current valuations of all portfolio companies
  const totalValue = portfolioCompanies.reduce((sum, company) => {
    const valuation = parseFloat(company.currentValuation || '0') || 0;
    return sum + valuation;
  }, 0);

  // Calculate total distributions
  const totalDistributions = distributions.reduce((sum, dist) => {
    return sum + (parseFloat(dist.amount) || 0);
  }, 0);

  // Count active investments
  // Active means company status is 'active', 'growing', 'scaling', etc. (not exited)
  const activeInvestments = portfolioCompanies.filter(company => {
    const status = company.status?.toLowerCase() || '';
    return status !== 'exited' && status !== 'closed' && status !== 'liquidated';
  }).length;

  // Count exited investments
  const exited = portfolioCompanies.filter(company => {
    const status = company.status?.toLowerCase() || '';
    return status === 'exited' || status === 'closed' || status === 'liquidated';
  }).length;

  // Calculate average check size
  // Average initial investment amount per company
  const avgCheckSize = portfolioCompanies.length > 0
    ? totalInvested / portfolioCompanies.length
    : 0;

  // Calculate Multiple on Invested Capital (MOIC)
  // MOIC = Total Value / Total Invested
  const moic = totalInvested > 0
    ? totalValue / totalInvested
    : 0;

  // Calculate DPI (Distributions to Paid-In)
  // DPI = Total Distributions / Total Invested (Paid-In Capital)
  const dpi = totalInvested > 0
    ? totalDistributions / totalInvested
    : 0;

  // Calculate TVPI (Total Value to Paid-In)
  // TVPI = (Total Distributions + Residual Value) / Paid-In Capital
  const tvpi = totalInvested > 0
    ? (totalDistributions + totalValue) / totalInvested
    : 0;

  // Calculate deployment rate
  // Percentage of committed capital that has been deployed
  const deploymentRate = totalCommitted > 0
    ? (totalInvested / totalCommitted) * 100
    : 0;

  // Calculate remaining capital
  const remainingCapital = totalCommitted - totalInvested;

  // Calculate IRR (approximation)
  // Get fund vintage year or creation date for time calculation
  const fundStartDate = fund.createdAt || new Date();
  const yearsInvested = Math.max(
    0.5, // Minimum 6 months to avoid division issues
    (Date.now() - new Date(fundStartDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  const irr = calculateSimpleIRR(totalInvested, totalValue, totalDistributions, yearsInvested);

  return {
    totalCommitted,
    totalInvested,
    totalValue,
    remainingCapital,
    deploymentRate,
    irr,
    moic,
    dpi,
    tvpi,
    activeInvestments,
    exited,
    avgCheckSize,
    totalDistributions,
  };
}
