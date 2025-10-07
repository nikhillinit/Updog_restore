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
import { generateReserveSummary } from '../../client/src/core/reserves/ReserveEngine.js';
import { generatePacingSummary } from '../../client/src/core/pacing/PacingEngine.js';
import { generateCohortSummary } from '../../client/src/core/cohorts/CohortEngine.js';
import type { ReserveInput, PacingInput, CohortInput } from '@shared/types';
import { ConstructionForecastCalculator } from './construction-forecast-calculator';
import Decimal from 'decimal.js';

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
   * @param companies - Portfolio companies
   * @param config - Fund configuration and assumptions
   * @param options - Calculation options (e.g., construction forecast)
   * @returns Complete ProjectedMetrics object
   */
  async calculate(
    fund: Fund,
    companies: PortfolioCompany[],
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
    companies: PortfolioCompany[],
    config: FundConfig
  ): Promise<{
    totalReserves: number;
    allocatedReserves: number;
    reserveByCompany: Array<{ companyId: number; reserveAmount: number }>;
  } | null> {
    try {
      // Build input for reserve engine
      const reserveInput: ReserveInput = {
        fundSize: parseFloat(fund.size.toString()),
        deployedCapital: parseFloat(fund.deployedCapital?.toString() || '0'),
        companies: companies.map((c) => ({
          id: c.id,
          name: c.name,
          currentStage: c.currentStage || 'seed',
          initialInvestment: parseFloat(c.initialInvestment?.toString() || '0'),
          currentValuation: parseFloat(c.currentValuation?.toString() || '0'),
          ownershipPercent: parseFloat(c.ownershipPercent?.toString() || '0'),
        })),
        reserveRatio: config.reserveRatio || 0.5,
        graduationMatrix: config.graduationMatrix,
      };

      const summary = await generateReserveSummary(reserveInput);

      return {
        totalReserves: summary.totalReserves,
        allocatedReserves: summary.allocatedReserves,
        reserveByCompany: summary.companyReserves || [],
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
    companies: PortfolioCompany[],
    config: FundConfig
  ): Promise<{
    pace: 'ahead' | 'on-track' | 'behind';
    quartersRemaining: number;
    recommendedQuarterlyDeployment: number;
    projectedDeploymentSchedule: number[];
  } | null> {
    try {
      const investmentPeriodYears = config.investmentPeriodYears || 3;
      const fundSize = parseFloat(fund.size.toString());
      const deployed = parseFloat(fund.deployedCapital?.toString() || '0');
      const fundAgeMonths = fund.establishmentDate
        ? this.monthsSince(new Date(fund.establishmentDate))
        : 0;

      const pacingInput: PacingInput = {
        fundSize,
        deployedCapital: deployed,
        investmentPeriodYears,
        currentFundAgeMonths: fundAgeMonths,
        targetCompanyCount: config.investmentPeriodYears ? Math.round(fundSize / 2000000) : 20,
      };

      const summary = await generatePacingSummary(pacingInput);

      // Determine pace status
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
        projectedDeploymentSchedule: summary.deploymentSchedule || [],
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
    companies: PortfolioCompany[],
    config: FundConfig
  ): Promise<{
    expectedTVPI: number;
    expectedIRR: number;
    expectedDPI: number;
    distributionSchedule: number[];
    navProgression: number[];
  } | null> {
    try {
      const cohortInput: CohortInput = {
        fundSize: parseFloat(fund.size.toString()),
        companies: companies.map((c) => ({
          id: c.id,
          name: c.name,
          cohort: new Date(c.investmentDate || new Date()).getFullYear(),
          currentStage: c.currentStage || 'seed',
          currentValuation: parseFloat(c.currentValuation?.toString() || '0'),
        })),
        fundTermYears: config.fundTermYears || 10,
      };

      const summary = await generateCohortSummary(cohortInput);

      return {
        expectedTVPI: summary.expectedTVPI || config.targetTVPI || 2.5,
        expectedIRR: summary.expectedIRR || config.targetIRR || 0.25,
        expectedDPI: summary.expectedDPI || 1.0,
        distributionSchedule: summary.distributionSchedule || [],
        navProgression: summary.navProgression || [],
      };
    } catch (error) {
      console.error('Cohort calculation failed:', error);
      return null;
    }
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

    // Generate J-curve construction forecast
    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize,
      establishmentDate: fund.establishmentDate || fund.createdAt,
      targetTVPI,
      investmentPeriodYears,
      fundLifeYears,
      navCalculationMode: 'standard',
      finalDistributionCoefficient: 0.7
    });

    // Convert J-curve path to quarterly arrays
    const numQuarters = fundLifeYears * 4;
    const projectedDeployment: number[] = [];
    const projectedDistributions: number[] = [];
    const projectedNAV: number[] = [];

    for (let i = 0; i < numQuarters; i++) {
      const point = forecast.jCurvePath.mainPath[i];
      if (point) {
        // Deployment decreases over investment period
        const inInvestmentPeriod = i < (investmentPeriodYears * 4);
        const deploymentAmount = inInvestmentPeriod
          ? fundSize.div(investmentPeriodYears * 4).toNumber()
          : 0;
        projectedDeployment.push(deploymentAmount);

        // Use J-curve projections
        projectedDistributions.push(parseFloat(point.distributions.toString()));
        projectedNAV.push(parseFloat(point.nav.toString()));
      }
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
