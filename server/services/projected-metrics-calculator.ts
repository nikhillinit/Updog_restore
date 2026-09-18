/**
 * ProjectedMetricsCalculator
 *
 * Generates projected fund performance metrics using deterministic calculation engines.
 * This service orchestrates the Reserve and Pacing engines to produce
 * forward-looking deployment and reserve forecasts. Performance projections
 * (TVPI, IRR, DPI, distributions, NAV) are null on the standard path: no
 * deterministic engine provides them since CohortEngine was deleted (P0 Task 1),
 * and MetricsAggregator reports `_status.engines.projected === 'partial'`.
 * Substituting config targets or synthesized curves here would present
 * fabricated numbers as projections.
 *
 * Engine Sources:
 * - DeterministicReserveEngine (follow-on reserve needs)
 * - PacingEngine (deployment timing and pacing analysis)
 *
 * @module server/services/projected-metrics-calculator
 */

import type { ProjectedMetrics } from '@shared/types/metrics';
import type { Fund, PortfolioCompany } from '@shared/schema';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';
import { generatePacingSummary } from '@shared/core/pacing/PacingEngine';
import type {
  ReserveCompanyInput,
  ReserveSummary,
  PacingInput,
  PacingSummary,
} from '@shared/types';
import { ConstructionForecastCalculator } from './construction-forecast-calculator';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import { monthsSince } from '../lib/date-helpers';

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

interface FundConfig {
  targetIRR?: number;
  targetTVPI?: number;
  targetDPI?: number;
  investmentPeriodYears?: number;
  fundTermYears?: number;
  reserveRatio?: number;
  targetCompanyCount?: number;
  graduationMatrix?: unknown;
}

interface CalculationOptions {
  useConstructionForecast?: boolean;
}

export class ProjectedMetricsCalculator {
  /**
   * Calculate projected metrics using deterministic engines
   */
  async calculate(
    fund: Fund,
    companies: Pick<
      PortfolioCompany,
      | 'id'
      | 'investmentAmount'
      | 'stage'
      | 'currentStage'
      | 'sector'
      | 'ownershipCurrentPct'
      | 'investmentDate'
    >[],
    config: FundConfig,
    options: CalculationOptions = {}
  ): Promise<ProjectedMetrics> {
    const asOfDate = new Date().toISOString();

    if (options.useConstructionForecast) {
      return this.calculateConstructionForecast(fund, config, asOfDate);
    }

    const [reserveResults, pacingResults] = await Promise.all([
      this.calculateReserves(fund, companies, config),
      this.calculatePacing(fund, companies, config),
    ]);

    const projectedDeployment = this.buildDeploymentProjection(pacingResults, reserveResults);

    // No engine produces performance projections on this path. Explicit
    // unavailability, never a config target or a synthesized curve.
    const projectedDistributions: number[] | null = null;
    const projectedNAV: number[] | null = null;
    const expectedTVPI: number | null = null;
    const expectedIRR: number | null = null;
    const expectedDPI: number | null = null;

    const totalReserveNeeds = reserveResults?.totalReserves || 0;
    const allocatedReserves = reserveResults?.allocatedReserves || 0;
    const unallocatedReserves = Math.max(0, totalReserveNeeds - allocatedReserves);
    const reserveAllocationRate =
      totalReserveNeeds > 0 ? (allocatedReserves / totalReserveNeeds) * 100 : 0;

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
    companies: Pick<
      PortfolioCompany,
      'id' | 'investmentAmount' | 'stage' | 'currentStage' | 'sector' | 'ownershipCurrentPct'
    >[],
    _config: FundConfig
  ): Promise<ReserveResults | null> {
    try {
      const portfolio: ReserveCompanyInput[] = companies.map((c) => {
        const invested = toDecimal(c.investmentAmount?.toString() || '0');
        // Ownership is never defaulted (ADR-054): absent -> null, which the engine treats as neutral.
        const ownership =
          c.ownershipCurrentPct == null
            ? null
            : toDecimal(c.ownershipCurrentPct.toString()).toNumber();

        return {
          id: c.id,
          invested: invested.toNumber(),
          stage: c.stage || c.currentStage || 'Seed',
          sector: c.sector || 'SaaS',
          ownership,
        };
      });

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
      const investmentPeriodYears = config.investmentPeriodYears ?? 3;
      const fundSize = toDecimal(fund.size.toString());
      const deployed = toDecimal(fund.deployedCapital?.toString() || '0');
      const fundAgeMonths = fund.establishmentDate
        ? monthsSince(new Date(fund.establishmentDate))
        : 0;

      const deploymentQuarter = Math.max(1, Math.floor(fundAgeMonths / 3) + 1);

      const pacingInput: PacingInput = {
        fundSize: fundSize.toNumber(),
        deploymentQuarter,
        marketCondition: 'neutral',
      };

      const summary: PacingSummary = generatePacingSummary(pacingInput);

      const expectedDeploymentRate = toDecimal(fundAgeMonths).div(investmentPeriodYears * 12);
      const actualDeploymentRate = fundSize.lte(0) ? new Decimal(0) : deployed.div(fundSize);
      const deviation = actualDeploymentRate.minus(expectedDeploymentRate);

      let pace: 'ahead' | 'on-track' | 'behind';
      if (deviation.gt(0.1)) pace = 'ahead';
      else if (deviation.lt(-0.1)) pace = 'behind';
      else pace = 'on-track';

      const quartersRemaining = Math.max(
        0,
        investmentPeriodYears * 4 - Math.floor(fundAgeMonths / 3)
      );

      const remainingCapital = fundSize.minus(deployed);
      const recommendedQuarterlyDeployment =
        quartersRemaining > 0 ? remainingCapital.div(quartersRemaining) : new Decimal(0);

      return {
        pace,
        quartersRemaining,
        recommendedQuarterlyDeployment: recommendedQuarterlyDeployment.toNumber(),
        projectedDeploymentSchedule: summary.deployments.map((d) => d.deployment),
      };
    } catch (error) {
      console.error('Pacing calculation failed:', error);
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

    const remainingCapital = reserveResults?.totalReserves || 0;
    const quarters = 12;
    const perQuarter = remainingCapital / quarters;

    return Array<number>(quarters).fill(perQuarter);
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
   * Calculate construction forecast using J-curve engine
   */
  private async calculateConstructionForecast(
    fund: Fund,
    config: FundConfig,
    asOfDate: string
  ): Promise<ProjectedMetrics> {
    const fundSize = toDecimal(fund.size.toString());
    const targetTVPI = config.targetTVPI ?? 2.5;
    const investmentPeriodYears = config.investmentPeriodYears ?? 5;
    const fundLifeYears = config.fundTermYears ?? 10;

    const establishmentDate = fund.establishmentDate ?? fund.createdAt ?? new Date();

    const forecast = ConstructionForecastCalculator.generateForecast({
      fundSize,
      establishmentDate,
      targetTVPI,
      investmentPeriodYears,
      fundLifeYears,
      navCalculationMode: 'standard',
      finalDistributionCoefficient: 0.7,
    });

    const numQuarters = fundLifeYears * 4;
    const projectedDeployment: number[] = [];
    const projectedDistributions: number[] = [];
    const projectedNAV: number[] = [];
    let previousCumulativeDistributions = new Decimal(0);

    for (let i = 0; i < numQuarters; i++) {
      const nav = forecast.jCurvePath.nav[i];
      const dpi = forecast.jCurvePath.dpi[i];
      const calls = forecast.jCurvePath.calls[i];

      const inInvestmentPeriod = i < investmentPeriodYears * 4;
      const callsValue = calls ? toDecimal(calls) : null;
      const deploymentAmount = inInvestmentPeriod
        ? callsValue
          ? fundSize.times(callsValue)
          : fundSize.div(investmentPeriodYears * 4)
        : new Decimal(0);
      projectedDeployment.push(deploymentAmount.toNumber());

      const navValue = nav ? fundSize.times(toDecimal(nav)) : new Decimal(0);
      const cumulativeDistributions = dpi ? fundSize.times(toDecimal(dpi)) : new Decimal(0);
      const quarterlyDistributions = Decimal.max(
        new Decimal(0),
        cumulativeDistributions.minus(previousCumulativeDistributions)
      );
      previousCumulativeDistributions = cumulativeDistributions;
      projectedDistributions.push(quarterlyDistributions.toNumber());
      projectedNAV.push(navValue.toNumber());
    }

    return {
      asOfDate,
      projectionDate: new Date().toISOString(),
      projectedDeployment,
      projectedDistributions,
      projectedNAV,
      expectedTVPI: forecast.projected.tvpi,
      expectedIRR: config.targetIRR ?? 0.25,
      expectedDPI: forecast.projected.dpi ?? config.targetDPI ?? 1.0,
      totalReserveNeeds: 0,
      allocatedReserves: 0,
      unallocatedReserves: 0,
      reserveAllocationRate: 0,
      deploymentPace: 'on-track',
      quartersRemaining: investmentPeriodYears * 4,
      recommendedQuarterlyDeployment: fundSize.div(investmentPeriodYears * 4).toNumber(),
    };
  }
}
