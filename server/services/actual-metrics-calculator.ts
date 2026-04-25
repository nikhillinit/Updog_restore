/**
 * ActualMetricsCalculator
 *
 * Calculates actual fund performance metrics from database records.
 * This service transforms raw DB data into the ActualMetrics type structure.
 *
 * Data Sources:
 * - funds table (fund size, establishment date)
 * - portfolio_companies table (valuations, status)
 * - investments table (capital deployed)
 * - capital_calls table (LP capital called)
 * - distributions table (cash returned to LPs)
 *
 * @module server/services/actual-metrics-calculator
 */

import { storage } from '../storage';
import type { ActualMetrics } from '@shared/types/metrics';
import type { PortfolioCompany } from '@shared/schema';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import { xirrNewtonBisection, type CashFlow as XirrCashFlow } from '@shared/lib/finance/xirr';
import { monthsSince } from '../lib/date-helpers';

export class ActualMetricsCalculator {
  /**
   * Calculate actual metrics from database records
   *
   * @param fundId - Fund identifier
   * @returns Complete ActualMetrics object
   */
  async calculate(fundId: number): Promise<ActualMetrics> {
    // Fetch all required data in parallel
    const [fund, companies, investments, capitalCalls, distributions] = await Promise.all([
      storage.getFund(fundId),
      storage.getPortfolioCompanies(fundId),
      this.getInvestments(fundId),
      this.getCapitalCalls(fundId),
      this.getDistributions(fundId),
    ]);

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    // Calculate capital structure
    const totalCommitted = this.parseDecimal(fund.size);
    const totalCalled = this.sumAmounts(capitalCalls);
    const totalDeployed = this.sumAmounts(investments);
    const totalUncalled = totalCommitted.minus(totalCalled);

    // Calculate portfolio value
    const currentNAV = this.calculateNAV(companies);
    const totalDistributions = this.sumAmounts(distributions);
    const totalValue = currentNAV.plus(totalDistributions);

    // Calculate performance metrics
    const irr = await this.calculateIRR(investments, distributions, currentNAV);
    const tvpi = totalCalled.gt(0) ? totalValue.div(totalCalled) : new Decimal(0);

    // DPI: null semantics when no distributions recorded (avoids misleading 0.00x)
    const dpi =
      totalCalled.gt(0) && totalDistributions.gt(0) ? totalDistributions.div(totalCalled) : null; // null = "N/A" in UI, not zero

    const rvpi = totalCalled.gt(0) ? currentNAV.div(totalCalled) : new Decimal(0);

    // Calculate portfolio composition
    const activeCompanies = companies.filter((c) => this.isLivePortfolioCompany(c)).length;
    const exitedCompanies = companies.filter((c) => this.isExitedCompany(c)).length;
    const writtenOffCompanies = companies.filter((c) => this.isWrittenOffCompany(c)).length;
    const totalCompanies = companies.length;

    // Calculate deployment metrics
    const deploymentRate = totalCommitted.gt(0)
      ? totalDeployed.div(totalCommitted).mul(100)
      : new Decimal(0);
    const averageCheckSize =
      totalCompanies > 0 ? totalDeployed.div(totalCompanies) : new Decimal(0);

    // Calculate fund age (approximate using vintage year)
    const fundAgeMonths = fund.vintageYear
      ? monthsSince(new Date(fund.vintageYear, 0, 1)) // Jan 1 of vintage year
      : undefined;

    return {
      asOfDate: new Date().toISOString(),
      totalCommitted: totalCommitted.toNumber(),
      totalCalled: totalCalled.toNumber(),
      totalDeployed: totalDeployed.toNumber(),
      totalUncalled: totalUncalled.toNumber(),
      currentNAV: currentNAV.toNumber(),
      totalDistributions: totalDistributions.toNumber(),
      totalValue: totalValue.toNumber(),
      irr: irr !== null ? irr.toNumber() : null, // null when XIRR cannot converge
      tvpi: tvpi.toNumber(),
      dpi: dpi !== null ? dpi.toNumber() : null, // null when no distributions
      rvpi: rvpi.toNumber(),
      activeCompanies,
      exitedCompanies,
      writtenOffCompanies,
      totalCompanies,
      deploymentRate: deploymentRate.toNumber(),
      averageCheckSize: averageCheckSize.toNumber(),
      ...(fundAgeMonths !== undefined && { fundAgeMonths }),
    };
  }

  /**
   * Calculate current Net Asset Value from portfolio companies
   * Only requires status and currentValuation fields
   */
  private calculateNAV(
    companies: Pick<PortfolioCompany, 'status' | 'currentValuation'>[]
  ): Decimal {
    return companies
      .filter((c) => this.isLivePortfolioCompany(c))
      .reduce((sum, company) => {
        const valuation = company.currentValuation
          ? this.parseDecimal(company.currentValuation)
          : new Decimal(0);
        return sum.plus(valuation);
      }, new Decimal(0));
  }

  private normalizeCompanyStatus(status: string | null | undefined): string {
    return (status ?? 'active')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
  }

  private isExitedCompany(company: Pick<PortfolioCompany, 'status'>): boolean {
    const status = this.normalizeCompanyStatus(company.status);
    return (
      status === 'exited' || status === 'exit' || status === 'realized' || status === 'realised'
    );
  }

  private isWrittenOffCompany(company: Pick<PortfolioCompany, 'status'>): boolean {
    const status = this.normalizeCompanyStatus(company.status);
    return (
      status === 'written-off' ||
      status === 'write-off' ||
      status === 'writtenoff' ||
      status === 'failed' ||
      status === 'lost' ||
      status === 'inactive'
    );
  }

  private isLivePortfolioCompany(company: Pick<PortfolioCompany, 'status'>): boolean {
    return !this.isExitedCompany(company) && !this.isWrittenOffCompany(company);
  }

  /**
   * Calculate Internal Rate of Return using XIRR algorithm
   *
   * XIRR calculates IRR for irregular cashflow intervals using Newton-Raphson method
   * Returns null when calculation cannot converge
   */
  private async calculateIRR(
    investments: Array<{ date: Date; amount: number }>,
    distributions: Array<{ date: Date; amount: number }>,
    currentNAV: Decimal
  ): Promise<Decimal | null> {
    // Build cashflow series and defer convergence rules to the shared canonical XIRR.
    const cashflows: XirrCashFlow[] = [
      ...investments.map((inv) => ({
        date: inv.date,
        amount: -Math.abs(inv.amount),
      })),
      ...distributions.map((dist) => ({
        date: dist.date,
        amount: Math.abs(dist.amount),
      })),
    ];

    if (currentNAV.gt(0)) {
      cashflows.push({
        date: new Date(),
        amount: currentNAV.toNumber(),
      });
    }

    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());

    const meaningful = cashflows.filter(
      (cashflow) => Number.isFinite(cashflow.amount) && cashflow.amount !== 0
    );
    if (meaningful.length < 2) {
      return null;
    }

    const hasContribution = meaningful.some((cashflow) => cashflow.amount < 0);
    const hasReturn = meaningful.some((cashflow) => cashflow.amount > 0);
    if (!hasContribution || !hasReturn) {
      return null;
    }

    const result = xirrNewtonBisection(meaningful);
    if (!result.converged || result.irr == null || !Number.isFinite(result.irr)) {
      return null;
    }

    return new Decimal(result.irr);
  }

  /**
   * Sum amounts from an array of records
   */
  private sumAmounts(records: Array<{ amount: number | string }>): Decimal {
    return records.reduce((sum, record) => {
      return sum.plus(this.parseDecimal(record.amount));
    }, new Decimal(0));
  }

  /**
   * Parse decimal value from number or string
   */
  private parseDecimal(value: number | string): Decimal {
    if (typeof value === 'string') {
      return new Decimal(value);
    }
    return new Decimal(value);
  }

  /**
   * Fetch investments for a fund
   * TODO: This should be added to storage interface
   */
  private async getInvestments(fundId: number): Promise<Array<{ date: Date; amount: number }>> {
    // For now, derive from portfolio companies
    // In production, this would query an investments table
    const companies = await storage.getPortfolioCompanies(fundId);
    return companies
      .filter((c) => c.createdAt) // Use createdAt as proxy for investment date
      .map((c) => ({
        date: new Date(c.createdAt!),
        amount: c.investmentAmount ? toDecimal(c.investmentAmount.toString()).toNumber() : 0,
      }));
  }

  /**
   * Fetch capital calls for a fund
   * TODO: This should be added to storage interface
   */
  private async getCapitalCalls(fundId: number): Promise<Array<{ amount: number }>> {
    // For now, assume all investments are capital calls
    // In production, this would query a capital_calls table
    const investments = await this.getInvestments(fundId);
    return investments.map((inv) => ({ amount: inv.amount }));
  }

  /**
   * Fetch distributions for a fund
   * TODO: This should be added to storage interface
   */
  private async getDistributions(_fundId: number): Promise<Array<{ date: Date; amount: number }>> {
    // For now, return empty array
    // In production, this would query a distributions table
    // TODO: Add distributions table to schema and storage layer
    return [];
  }
}
