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
import { fundDistributions, funds, type Fund, type PortfolioCompany } from '@shared/schema';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import { xirrNewtonBisection, type CashFlow as XirrCashFlow } from '@shared/lib/finance/xirr';
import { monthsSince } from '../lib/date-helpers';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';

type InvestmentAmountFact = { date: Date | null; amount: number };
type DatedAmountFact = { date: Date; amount: number };
type AmountLike = string | number | bigint;
type InvestmentFactRow = {
  investmentDate: Date | string | null | undefined;
  amount: AmountLike;
  companyId?: number | null;
};
type PortfolioCompanyFactRow = {
  id: number;
  investmentAmount: AmountLike;
  investmentDate?: Date | string | null;
};

export class ActualMetricsCalculator {
  /**
   * Calculate actual metrics from database records
   *
   * @param fundId - Fund identifier
   * @returns Complete ActualMetrics object
   */
  async calculate(fundId: number): Promise<ActualMetrics> {
    // Fetch all required data in parallel
    const [fund, companies, investmentRows, distributions] = await Promise.all([
      this.getFund(fundId),
      storage.getPortfolioCompanies(fundId),
      storage.getInvestments(fundId),
      this.getDistributions(fundId),
    ]);

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const investmentFacts = this.buildInvestmentFacts(investmentRows, companies);

    // Calculate capital structure
    const totalCommitted = this.parseDecimal(fund.size);
    const totalCalled = this.sumAmounts(investmentFacts);
    const totalDeployed = this.sumAmounts(investmentFacts);
    const totalUncalled = totalCommitted.minus(totalCalled);

    // Calculate portfolio value
    const currentNAV = this.calculateNAV(companies);
    const totalDistributions = this.sumAmounts(distributions);
    const totalValue = currentNAV.plus(totalDistributions);

    // Calculate performance metrics
    const datedInvestments = investmentFacts.filter(
      (fact): fact is DatedAmountFact => fact.date !== null
    );
    const irr = await this.calculateIRR(datedInvestments, distributions, currentNAV);
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

    const fundAgeStartDate = this.getFundAgeStartDate(fund);
    const fundAgeMonths =
      fundAgeStartDate !== undefined ? monthsSince(fundAgeStartDate) : undefined;

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
      availability: {
        irr:
          irr !== null
            ? {
                status: 'available',
                source: 'cashflows',
              }
            : {
                status: 'unavailable',
                source: 'cashflows',
                reason: 'insufficient_dated_cashflows',
                message: 'Insufficient cash-flow history',
              },
        dpi:
          dpi !== null
            ? {
                status: 'available',
                source: 'distributions',
              }
            : {
                status: 'unavailable',
                source: 'distributions',
                reason:
                  totalDistributions.gt(0) && totalCalled.lte(0)
                    ? 'paid_in_capital_unavailable'
                    : 'no_distributions_recorded',
                message:
                  totalDistributions.gt(0) && totalCalled.lte(0)
                    ? 'Paid-in capital unavailable'
                    : 'No distributions recorded',
              },
      },
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

  private buildInvestmentFacts(
    investmentRows: InvestmentFactRow[],
    companies: PortfolioCompanyFactRow[]
  ): InvestmentAmountFact[] {
    const companyIdsWithInvestmentRows = new Set<number>();
    let hasUnlinkedInvestmentRows = false;
    const directInvestments = investmentRows
      .map((investment) => {
        const fact = this.toAmountFact(investment.investmentDate, investment.amount, 'investment');
        if (fact !== null && typeof investment.companyId === 'number') {
          companyIdsWithInvestmentRows.add(investment.companyId);
        } else if (fact !== null) {
          hasUnlinkedInvestmentRows = true;
        }
        return fact;
      })
      .filter((record): record is InvestmentAmountFact => record !== null);

    if (hasUnlinkedInvestmentRows) {
      return directInvestments;
    }

    const legacyCompanyInvestments = companies
      .filter((company) => !companyIdsWithInvestmentRows.has(company.id))
      .map((company) => {
        return this.toAmountFact(
          company.investmentDate,
          company.investmentAmount,
          'portfolio company'
        );
      })
      .filter((record): record is InvestmentAmountFact => record !== null);

    return [...directInvestments, ...legacyCompanyInvestments];
  }

  private async getFund(fundId: number): Promise<Fund | undefined> {
    const storedFund = await storage.getFund(fundId);
    if (storedFund) {
      return {
        ...storedFund,
        establishmentDate: (storedFund as Partial<Fund>).establishmentDate ?? null,
        isActive: (storedFund as Partial<Fund>).isActive ?? true,
      } as Fund;
    }

    const [persistedFund] = await db.select().from(funds).where(eq(funds.id, fundId));
    return persistedFund
      ? ({
          ...persistedFund,
          establishmentDate: (persistedFund as Partial<Fund>).establishmentDate ?? null,
          isActive: (persistedFund as Partial<Fund>).isActive ?? true,
        } as Fund)
      : undefined;
  }

  private getFundAgeStartDate(fund: Fund): Date | undefined {
    const rawEstablishmentDate: unknown = fund.establishmentDate;
    if (rawEstablishmentDate) {
      const establishmentDate =
        rawEstablishmentDate instanceof Date
          ? rawEstablishmentDate
          : new Date(String(rawEstablishmentDate));
      if (!Number.isNaN(establishmentDate.getTime())) {
        return establishmentDate;
      }
    }

    return fund.vintageYear ? new Date(fund.vintageYear, 0, 1) : undefined;
  }

  /**
   * Fetch distributions for a fund
   * Fund distributions are read directly because the storage abstraction does not expose them.
   */
  private async getDistributions(fundId: number): Promise<Array<{ date: Date; amount: number }>> {
    try {
      const rows = await db
        .select({
          date: fundDistributions.distributionDate,
          amount: fundDistributions.amount,
        })
        .from(fundDistributions)
        .where(eq(fundDistributions.fundId, fundId));

      return rows
        .map((distribution) =>
          this.toDatedAmount(distribution.date, distribution.amount, 'distribution')
        )
        .filter((record): record is { date: Date; amount: number } => record !== null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/does not exist|relation .*fund_distributions/i.test(message)) {
        logger.debug(
          { fundId },
          '[actual-metrics] fund_distributions is unavailable; DPI remains unavailable'
        );
      } else {
        logger.warn(
          { fundId, error: message },
          '[actual-metrics] failed to read fund distributions; DPI remains unavailable'
        );
      }
      return [];
    }
  }

  private toDatedAmount(
    dateValue: Date | string | null | undefined,
    amountValue: AmountLike | null | undefined,
    source: string
  ): { date: Date; amount: number } | null {
    const fact = this.toAmountFact(dateValue, amountValue, source);
    if (fact === null || fact.date === null) {
      return null;
    }

    return { date: fact.date, amount: fact.amount };
  }

  private toAmountFact(
    dateValue: Date | string | null | undefined,
    amountValue: AmountLike | null | undefined,
    source: string
  ): InvestmentAmountFact | null {
    if (amountValue == null) {
      return null;
    }

    const date =
      dateValue == null ? null : dateValue instanceof Date ? dateValue : new Date(dateValue);
    const amount = toDecimal(amountValue.toString()).toNumber();
    if (!Number.isFinite(amount) || amount === 0) {
      logger.debug({ source }, '[actual-metrics] skipped invalid dated cash-flow fact');
      return null;
    }

    if (date !== null && !Number.isFinite(date.getTime())) {
      logger.debug({ source }, '[actual-metrics] accepted amount but ignored invalid date');
      return { date: null, amount };
    }

    return { date, amount };
  }
}
