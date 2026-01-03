/**
 * ProjectedMetricsCalculator
 *
 * Generates projected fund performance metrics using deterministic calculation engines.
 * This service orchestrates the Reserve, Pacing, and Cohort engines to produce
 * forward-looking forecasts.
 *
 * Engine Sources:
 * - DeterministicReserveEngine (follow-on reserve needs)
 * - PacingEngine (deployment timing and pacing analysis)
 * - CohortEngine (exit modeling and value progression)
 *
 * @module server/services/projected-metrics-calculator
 */

import type { ProjectedMetrics } from '@shared/types/metrics';
import type { Fund, PortfolioCompany } from '@shared/schema';
// TODO: Issue #309 - Move core engines to shared package
// These engines contain deterministic calculation logic used by both client and server
// For now, import from client (ESLint boundary violation - tracked for refactoring)
// eslint-disable-next-line no-restricted-imports
import { generateReserveSummary } from '../../client/src/core/reserves/ReserveEngine.js';
// eslint-disable-next-line no-restricted-imports
import { generatePacingSummary } from '../../client/src/core/pacing/PacingEngine.js';
// eslint-disable-next-line no-restricted-imports
import { generateCohortSummary } from '../../client/src/core/cohorts/CohortEngine.js';
import type {
  ReserveInput,
  ReserveSummary,
  PacingInput,
  PacingSummary,
  CohortInput,
  CohortSummary,
} from '@shared/types';
import { ConstructionForecastCalculator } from './construction-forecast-calculator';
import Decimal from 'decimal.js';

// Local interface for reserve calculation results used by this service
interface ReserveResults {
  totalReserves: number;
  allocatedReserves: number;
  reserveByCompany: Array<{ companyId: number; reserveAmount: number }>;
}

// Local interface for pacing calculation results
interface PacingResults {
  pace: 'ahead' | 'on-track' | 'behind';
  quartersRemaining: number;
  recommendedQuarterlyDeployment: number;
  projectedDeploymentSchedule: number[];
}

// Local interface for cohort calculation results
interface CohortResults {
  expectedTVPI: number;
  expectedIRR: number;
  expectedDPI: number;
  distributionSchedule: number[];
  navProgression: number[];
}

interface FundConfig {
  targetIRR?: number;
  targetTVPI?: number;
  investmentPeriodYears?: number;
  fundTermYears?: number;
  reserveRatio?: number;
  graduationMatrix?: unknown;
}

interface CalculationOptions {
  useConstructionForecast?: boolean;
}

export class ProjectedMetricsCalculator {
  /**
   * Calculate projected metrics using deterministic engines
   *
   * @param fund - Fund record
   * @param companies - Portfolio companies (minimal fields required)
   * @param config - Fund configuration and assumptions
   * @param options - Calculation options (e.g., construction forecast)
   * @returns Complete ProjectedMetrics object
   */
  async calculate(
    fund: Fund,
    companies: Pick<PortfolioCompany, 'id' | 'investmentAmount' | 'stage' | 'currentStage' | 'sector' | 'ownershipCurrentPct' | 'investmentDate'>[],
    config: FundConfig,
    options: CalculationOptions = {}
  ): Promise<ProjectedMetrics> {
    const asOfDate = new Date().toISOString();

    // Route to J-curve construction forecast if requested
    if (options.useConstructionForecast) {
      return this.calculateConstructionForecast(fund, config, asOfDate);
    }

    // Run engines in parallel for performance
    const [reserveResults, pacingResults, cohortResults] = await Promise.all([
      this.calculateReserves(fund, companies, config),
      this.calculatePacing(fund, companies, config),
      this.calculateCohorts(fund, companies, config),
    ]);

    // Build quarterly projection arrays
    const projectedDeployment = this.buildDeploymentProjection(pacingResults, reserveResults);
    const projectedDistributions = this.buildDistributionProjection(cohortResults);
    const projectedNAV = this.buildNAVProjection(cohortResults);

    // Extract expected performance
    const expectedTVPI = cohortResults?.expectedTVPI || config.targetTVPI || 2.5;
    const expectedIRR = cohortResults?.expectedIRR || config.targetIRR || 0.25;
    const expectedDPI = cohortResults?.expectedDPI || 1.0;

    // Extract reserve calculations
    const totalReserveNeeds = reserveResults?.totalReserves || 0;
    const allocatedReserves = reserveResults?.allocatedReserves || 0;
    const unallocatedReserves = Math.max(0, totalReserveNeeds - allocatedReserves);
    const reserveAllocationRate =
      totalReserveNeeds > 0 ? (allocatedReserves / totalReserveNeeds) * 100 : 0;

    // Extract pacing analysis
    const deploymentPace = this.determinePace(pacingResults);
    const quartersRemaining = pacingResults?.quartersRemaining || 0;
    const recommendedQuarterlyDeployment = pacingResults?.recommendedQuarterlyDeployment || 0;

    return {
      asOfDate,
      projectionDate: new Date().toISOString(),
      projectedDeployment,
      projectedDistributions,
      projectedNAV,
      expectedTVPI,
      expectedIRR,
      expectedDPI,
      totalReserveNeeds,
      allocatedReserves,
      unallocatedReserves,
      reserveAllocationRate,
      deploymentPace,
      quartersRemaining,
      recommendedQuarterlyDeployment,
    };
  }

  /**
   * Calculate reserve needs using DeterministicReserveEngine
   */
  private async calculateReserves(
    fund: Fund,
    companies: Pick<PortfolioCompany, 'id' | 'investmentAmount' | 'stage' | 'currentStage' | 'sector' | 'ownershipCurrentPct'>[],
    _config: FundConfig
  ): Promise<ReserveResults | null> {
    try {
      // Build input for reserve engine - each company is a separate ReserveInput
      const portfolio: ReserveInput[] = companies.map((c) => ({
        id: c.id,
        invested: parseFloat(c.investmentAmount?.toString() || '0'),
        stage: c.stage || c.currentStage || 'Seed',
        sector: c.sector || 'SaaS',
        ownership: parseFloat(c.ownershipCurrentPct?.toString() || '0.1'),
      }));

      const summary: ReserveSummary = generateReserveSummary(fund.id, portfolio);

      return {
        totalReserves: summary.totalAllocation,
        allocatedReserves: summary.totalAllocation * summary.avgConfidence,
        reserveByCompany: summary.allocations.map((a, i) => ({
          companyId: portfolio[i]?.id ?? i,
          reserveAmount: a.allocation,
        })),
      };
    } catch (error) {
      console.error('Reserve calculation failed:', error);
      return null;
    }
  }

  /**
   * Calculate deployment pacing using PacingEngine
   */
  private async calculatePacing(
    fund: Fund,
    _companies: Pick<PortfolioCompany, 'id'>[],
    config: FundConfig
  ): Promise<PacingResults | null> {
    try {
      const investmentPeriodYears = config.investmentPeriodYears || 3;
      const fundSize = parseFloat(fund.size.toString());
      const deployed = parseFloat(fund.deployedCapital?.toString() || '0');
      const fundAgeMonths = fund.establishmentDate
        ? this.monthsSince(new Date(fund.establishmentDate))
        : 0;

      // Calculate current deployment quarter
      const deploymentQuarter = Math.max(1, Math.floor(fundAgeMonths / 3) + 1);

      const pacingInput: PacingInput = {
        fundSize,
        deploymentQuarter,
        marketCondition: 'neutral', // Default to neutral market conditions
      };

      const summary: PacingSummary = generatePacingSummary(pacingInput);

      // Determine pace status based on actual vs expected deployment
      const expectedDeploymentRate = fundAgeMonths / (investmentPeriodYears * 12);
      const actualDeploymentRate = fundSize > 0 ? deployed / fundSize : 0;
      const deviation = actualDeploymentRate - expectedDeploymentRate;

      let pace: 'ahead' | 'on-track' | 'behind';
      if (deviation > 0.1) pace = 'ahead';
      else if (deviation < -0.1) pace = 'behind';
      else pace = 'on-track';

      const quartersRemaining = Math.max(
        0,
        investmentPeriodYears * 4 - Math.floor(fundAgeMonths / 3)
      );

      const remainingCapital = fundSize - deployed;
      const recommendedQuarterlyDeployment =
        quartersRemaining > 0 ? remainingCapital / quartersRemaining : 0;

      return {
        pace,
        quartersRemaining,
        recommendedQuarterlyDeployment,
        projectedDeploymentSchedule: summary.deployments.map((d) => d.deployment),
      };
    } catch (error) {
      console.error('Pacing calculation failed:', error);
      return null;
    }
  }

  /**
   * Calculate exit modeling and value progression using CohortEngine
   */
  private async calculateCohorts(
    fund: Fund,
    companies: Pick<PortfolioCompany, 'investmentDate'>[],
    config: FundConfig
  ): Promise<CohortResults | null> {
    try {
      // Use first company's investment date to determine vintage year
      const firstInvestmentDate = companies[0]?.investmentDate;
      const vintageYear = firstInvestmentDate
        ? new Date(firstInvestmentDate).getFullYear()
        : new Date().getFullYear();

      const cohortInput: CohortInput = {
        fundId: fund.id,
        vintageYear,
        cohortSize: companies.length || 10,
      };

      const summary: CohortSummary = generateCohortSummary(cohortInput);

      // Map engine output to expected format
      const fundTermYears = config.fundTermYears || 10;
      const quarters = fundTermYears * 4;

      return {
        expectedTVPI: summary.performance.multiple || config.targetTVPI || 2.5,
        expectedIRR: summary.performance.irr || config.targetIRR || 0.25,
        expectedDPI: summary.performance.dpi || 1.0,
        // Generate synthetic schedules based on performance data
        distributionSchedule: this.generateDistributionSchedule(summary, quarters),
        navProgression: this.generateNAVProgression(summary, quarters),
      };
    } catch (error) {
      console.error('Cohort calculation failed:', error);
      return null;
    }
  }

  /**
   * Generate distribution schedule from cohort summary
   */
  private generateDistributionSchedule(summary: CohortSummary, quarters: number): number[] {
    const totalValue = summary.avgValuation * summary.totalCompanies;
    const dpi = summary.performance.dpi;

    // J-curve pattern: minimal distributions early, increasing later
    return Array(quarters)
      .fill(0)
      .map((_, i) => {
        if (i < quarters * 0.4) return 0; // No distributions first 40% of fund life
        const progress = (i - quarters * 0.4) / (quarters * 0.6);
        return totalValue * dpi * progress * (1 / quarters);
      });
  }

  /**
   * Generate NAV progression from cohort summary
   */
  private generateNAVProgression(summary: CohortSummary, quarters: number): number[] {
    const startNAV = summary.avgValuation * summary.totalCompanies * 0.5;
    const endNAV = summary.avgValuation * summary.totalCompanies * summary.performance.multiple;

    return Array(quarters)
      .fill(0)
      .map((_, i) => {
        const progress = i / (quarters - 1);
        // J-curve shape: dip early, then growth
        const jCurveMultiplier = i < quarters * 0.25 ? 0.8 + 0.2 * (i / (quarters * 0.25)) : 1;
        return startNAV + (endNAV - startNAV) * progress * jCurveMultiplier;
      });
  }

  /**
   * Build quarterly deployment projection
   */
  private buildDeploymentProjection(
    pacingResults: { projectedDeploymentSchedule: number[] } | null,
    reserveResults: { totalReserves: number } | null
  ): number[] {
    if (pacingResults?.projectedDeploymentSchedule) {
      return pacingResults.projectedDeploymentSchedule;
    }

    // Fallback: simple linear projection
    const remainingCapital = reserveResults?.totalReserves || 0;
    const quarters = 12; // 3 years
    const perQuarter = remainingCapital / quarters;

    return Array(quarters).fill(perQuarter);
  }

  /**
   * Build quarterly distribution projection
   */
  private buildDistributionProjection(cohortResults: {
    distributionSchedule: number[];
  } | null): number[] {
    if (cohortResults?.distributionSchedule) {
      return cohortResults.distributionSchedule;
    }

    // Fallback: J-curve pattern (minimal distributions early, increasing later)
    return [0, 0, 0, 0, 0, 0, 0, 0, 1000000, 2000000, 5000000, 10000000];
  }

  /**
   * Build quarterly NAV projection
   */
  private buildNAVProjection(cohortResults: { navProgression: number[] } | null): number[] {
    if (cohortResults?.navProgression) {
      return cohortResults.navProgression;
    }

    // Fallback: linear growth
    const startNAV = 10000000;
    const endNAV = 50000000;
    const quarters = 40; // 10 years
    const increment = (endNAV - startNAV) / quarters;

    return Array(quarters)
      .fill(0)
      .map((_, i) => startNAV + increment * i);
  }

  /**
   * Determine deployment pace from pacing results
   */
  private determinePace(
    pacingResults: { pace: 'ahead' | 'on-track' | 'behind' } | null
  ): 'ahead' | 'on-track' | 'behind' {
    return pacingResults?.pace || 'on-track';
  }

  /**
   * Calculate months since a date
   */
  private monthsSince(date: Date): number {
    const now = new Date();
    const years = now.getFullYear() - date.getFullYear();
    const months = now.getMonth() - date.getMonth();
    return years * 12 + months;
  }

  /**
   * Calculate construction forecast using J-curve engine
   *
   * Used for funds with no investments yet (construction phase)
   *
   * @param fund - Fund record
   * @param config - Fund configuration
   * @param asOfDate - ISO timestamp for metrics
   * @returns ProjectedMetrics with J-curve based forecast
   */
  private async calculateConstructionForecast(
    fund: Fund,
    config: FundConfig,
    asOfDate: string
  ): Promise<ProjectedMetrics> {
    const fundSize = new Decimal(fund.size.toString());
    const targetTVPI = config.targetTVPI || 2.5;
    const investmentPeriodYears = config.investmentPeriodYears || 5;
    const fundLifeYears = config.fundTermYears || 10;

    // Ensure we have a valid establishment date
    const establishmentDate = fund.establishmentDate ?? fund.createdAt ?? new Date();

    // Generate J-curve construction forecast
    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize,
      establishmentDate,
      targetTVPI,
      investmentPeriodYears,
      fundLifeYears,
      navCalculationMode: 'standard',
      finalDistributionCoefficient: 0.7
    });

    // Convert J-curve path to quarterly arrays
    // JCurvePath has separate arrays: nav[], dpi[], calls[], etc.
    const numQuarters = fundLifeYears * 4;
    const projectedDeployment: number[] = [];
    const projectedDistributions: number[] = [];
    const projectedNAV: number[] = [];

    for (let i = 0; i < numQuarters; i++) {
      const nav = forecast.jCurvePath.nav[i];
      const dpi = forecast.jCurvePath.dpi[i];
      const calls = forecast.jCurvePath.calls[i];

      // Deployment based on calls (capital called)
      const inInvestmentPeriod = i < (investmentPeriodYears * 4);
      const deploymentAmount = inInvestmentPeriod && calls
        ? parseFloat(calls.toString())
        : (inInvestmentPeriod ? fundSize.div(investmentPeriodYears * 4).toNumber() : 0);
      projectedDeployment.push(deploymentAmount);

      // Use J-curve projections - DPI represents distributions as % of calls
      const navValue = nav ? parseFloat(nav.toString()) : 0;
      const dpiValue = dpi ? parseFloat(dpi.toString()) : 0;
      projectedDistributions.push(dpiValue * fundSize.toNumber());
      projectedNAV.push(navValue);
    }

    return {
      asOfDate,
      projectionDate: new Date().toISOString(),
      projectedDeployment,
      projectedDistributions,
      projectedNAV,
      expectedTVPI: forecast.projected.tvpi,
      expectedIRR: config.targetIRR || 0.25, // J-curve doesn't calculate IRR
      expectedDPI: forecast.projected.dpi,
      totalReserveNeeds: 0, // No reserves needed in construction phase
      allocatedReserves: 0,
      unallocatedReserves: 0,
      reserveAllocationRate: 0,
      deploymentPace: 'on-track', // Default for construction phase
      quartersRemaining: investmentPeriodYears * 4,
      recommendedQuarterlyDeployment: fundSize.div(investmentPeriodYears * 4).toNumber()
    };
  }
}
