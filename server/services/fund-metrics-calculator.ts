import { storage } from '../storage';

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

  /** Internal Rate of Return (placeholder - requires distributions data) */
  irr: number;

  /** Multiple on Invested Capital (MOIC) */
  moic: number;

  /** Distributions to Paid-In capital (DPI) - requires distributions */
  dpi: number;

  /** Total Value to Paid-In capital (TVPI) */
  tvpi: number;

  /** Number of active portfolio companies */
  activeInvestments: number;

  /** Number of exited portfolio companies */
  exited: number;

  /** Average initial check size per company */
  avgCheckSize: number;
}

/**
 * Calculate comprehensive fund metrics for a given fund
 *
 * This function aggregates data from the fund, portfolio companies, and investments
 * to compute key venture capital performance metrics including MOIC, TVPI, deployment
 * rate, and portfolio statistics.
 *
 * @param fundId - The unique identifier of the fund
 * @returns Promise resolving to calculated fund metrics
 * @throws Error if fund is not found or calculations fail
 *
 * @example
 * ```typescript
 * const metrics = await calculateFundMetrics(1);
 * console.log(`Fund MOIC: ${metrics.moic.toFixed(2)}x`);
 * console.log(`Deployment Rate: ${metrics.deploymentRate.toFixed(1)}%`);
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
  // Returns 0 if no capital has been invested
  const moic = totalInvested > 0
    ? totalValue / totalInvested
    : 0;

  // Calculate deployment rate
  // Percentage of committed capital that has been deployed
  const deploymentRate = totalCommitted > 0
    ? (totalInvested / totalCommitted) * 100
    : 0;

  // Calculate remaining capital
  const remainingCapital = totalCommitted - totalInvested;

  // Placeholder metrics requiring distributions data
  // IRR calculation requires cash flow timeline (investments and distributions)
  // DPI calculation requires distributions data: DPI = Distributions / Paid-In Capital
  // For now, we return 0 and use TVPI as approximation of TVPI
  const irr = 0;  // TODO: Implement IRR calculation when distributions data is available
  const dpi = 0;  // TODO: Implement DPI calculation when distributions data is available

  // TVPI approximation
  // TVPI = (Distributions + Residual Value) / Paid-In Capital
  // Without distributions, we use MOIC as an approximation
  const tvpi = moic;

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
  };
}