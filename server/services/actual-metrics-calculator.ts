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

import Decimal from 'decimal.js';
import { storage } from '../storage';
import type { ActualMetrics } from '@shared/types/metrics';
import type { PortfolioCompany } from '@shared/schema';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

interface CashFlow {
  date: Date;
  amount: number;
  type: 'investment' | 'distribution';
}

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
    const dpi = totalCalled.gt(0) && totalDistributions.gt(0)
      ? totalDistributions.div(totalCalled)
      : null; // null = "N/A" in UI, not zero

    const rvpi = totalCalled.gt(0) ? currentNAV.div(totalCalled) : new Decimal(0);

    // Calculate portfolio composition
    const activeCompanies = companies.filter((c) => c.status === 'active').length;
    const exitedCompanies = companies.filter((c) => c.status === 'exited').length;
    const writtenOffCompanies = companies.filter((c) => c.status === 'written-off').length;
    const totalCompanies = companies.length;

    // Calculate deployment metrics
    const deploymentRate = totalCommitted.gt(0)
      ? totalDeployed.div(totalCommitted).mul(100)
      : new Decimal(0);
    const averageCheckSize = totalCompanies > 0 ? totalDeployed.div(totalCompanies) : new Decimal(0);

    // Calculate fund age
    const fundAgeMonths = fund.establishmentDate
      ? this.calculateMonthsSince(new Date(fund.establishmentDate))
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
      irr: irr.toNumber(),
      tvpi: tvpi.toNumber(),
      dpi: dpi !== null ? dpi.toNumber() : null, // null when no distributions
      rvpi: rvpi.toNumber(),
      activeCompanies,
      exitedCompanies,
      writtenOffCompanies,
      totalCompanies,
      deploymentRate: deploymentRate.toNumber(),
      averageCheckSize: averageCheckSize.toNumber(),
      fundAgeMonths,
    };
  }

  /**
   * Calculate current Net Asset Value from portfolio companies
   */
  private calculateNAV(companies: PortfolioCompany[]): Decimal {
    return companies
      .filter((c) => c.status === 'active')
      .reduce((sum, company) => {
        const valuation = company.currentValuation
          ? this.parseDecimal(company.currentValuation)
          : new Decimal(0);
        return sum.plus(valuation);
      }, new Decimal(0));
  }

  /**
   * Calculate Internal Rate of Return using XIRR algorithm
   *
   * XIRR calculates IRR for irregular cashflow intervals using Newton-Raphson method
   */
  private async calculateIRR(
    investments: Array<{ date: Date; amount: number }>,
    distributions: Array<{ date: Date; amount: number }>,
    currentNAV: Decimal
  ): Promise<Decimal> {
    // Build cashflow series
    const cashflows: CashFlow[] = [
      ...investments.map((inv) => ({
        date: inv.date,
        amount: -Math.abs(inv.amount), // Investments are negative cashflows
        type: 'investment' as const,
      })),
      ...distributions.map((dist) => ({
        date: dist.date,
        amount: Math.abs(dist.amount), // Distributions are positive cashflows
        type: 'distribution' as const,
      })),
    ];

    // Add terminal value (current NAV) as final cashflow
    if (currentNAV.gt(0)) {
      cashflows.push({
        date: new Date(),
        amount: currentNAV.toNumber(),
        type: 'distribution',
      });
    }

    // Sort by date
    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate IRR using XIRR
    return this.xirr(cashflows);
  }

  /**
   * XIRR (Extended Internal Rate of Return) calculation
   *
   * Uses Newton-Raphson method to find the rate that makes NPV = 0
   */
  private xirr(cashflows: CashFlow[]): Decimal {
    if (cashflows.length < 2) {
      return new Decimal(0);
    }

    const baseDate = cashflows[0]!.date;
    const maxIterations = 100;
    const tolerance = new Decimal(0.0000001);

    // Initial guess: 10% annual return
    let rate = new Decimal(0.1);

    for (let i = 0; i < maxIterations; i++) {
      let npv = new Decimal(0);
      let dnpv = new Decimal(0);

      for (const cf of cashflows) {
        const years = this.yearsBetween(baseDate, cf.date);
        const factor = rate.plus(1).pow(years);

        npv = npv.plus(new Decimal(cf.amount).div(factor));
        dnpv = dnpv.minus(new Decimal(cf.amount).mul(years).div(factor.mul(rate.plus(1))));
      }

      const newRate = rate.minus(npv.div(dnpv));

      if (newRate.minus(rate).abs().lt(tolerance)) {
        return newRate;
      }

      rate = newRate;

      // Prevent infinite loops with unrealistic rates
      if (rate.lt(-0.99) || rate.gt(10)) {
        return new Decimal(0);
      }
    }

    return rate;
  }

  /**
   * Calculate years between two dates (fractional)
   */
  private yearsBetween(start: Date, end: Date): number {
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    return (end.getTime() - start.getTime()) / msPerYear;
  }

  /**
   * Calculate months since a given date
   */
  private calculateMonthsSince(date: Date): number {
    const now = new Date();
    const years = now.getFullYear() - date.getFullYear();
    const months = now.getMonth() - date.getMonth();
    return years * 12 + months;
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
      .filter((c) => c.investmentDate)
      .map((c) => ({
        date: new Date(c.investmentDate!),
        amount: c.initialInvestment ? parseFloat(c.initialInvestment.toString()) : 0,
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
  private async getDistributions(fundId: number): Promise<Array<{ date: Date; amount: number }>> {
    // For now, return empty array
    // In production, this would query a distributions table
    // TODO: Add distributions table to schema and storage layer
    return [];
  }
}
