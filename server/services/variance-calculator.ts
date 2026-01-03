/**
 * VarianceCalculator
 *
 * Calculates variance metrics by comparing actual performance against
 * projections and targets. This provides insight into whether the fund
 * is on track to meet its objectives.
 *
 * @module server/services/variance-calculator
 */

import type {
  ActualMetrics,
  ProjectedMetrics,
  TargetMetrics,
  VarianceMetrics,
} from '@shared/types/metrics';

export class VarianceCalculator {
  /**
   * Calculate all variance metrics
   *
   * @param actual - Actual performance metrics
   * @param projected - Projected performance metrics
   * @param target - Target performance metrics
   * @returns Complete VarianceMetrics object
   */
  calculate(
    actual: ActualMetrics,
    projected: ProjectedMetrics,
    target: TargetMetrics
  ): VarianceMetrics {
    return {
      deploymentVariance: this.calculateDeploymentVariance(actual, target),
      performanceVariance: this.calculatePerformanceVariance(actual, target),
      tvpiVariance: this.calculateTVPIVariance(actual, projected, target),
      paceVariance: this.calculatePaceVariance(actual, projected, target),
      portfolioVariance: this.calculatePortfolioVariance(actual, target),
    };
  }

  /**
   * Calculate deployment variance
   *
   * Compares actual deployment to expected deployment based on fund age
   */
  private calculateDeploymentVariance(
    actual: ActualMetrics,
    target: TargetMetrics
  ): VarianceMetrics['deploymentVariance'] {
    // Calculate expected deployment based on fund age
    const fundAgeYears = (actual.fundAgeMonths || 0) / 12;
    const investmentPeriodYears = target.targetDeploymentYears;

    // Expected deployment is proportional to time elapsed in investment period
    const timeElapsedRatio = Math.min(1, fundAgeYears / investmentPeriodYears);
    const expectedDeployment = target.targetFundSize * timeElapsedRatio;

    const actualDeployment = actual.totalDeployed;
    const variance = actualDeployment - expectedDeployment;
    const percentDeviation = expectedDeployment > 0 ? (variance / expectedDeployment) * 100 : 0;

    // Determine status (allow 10% tolerance)
    let status: 'ahead' | 'on-track' | 'behind';
    if (percentDeviation > 10) {
      status = 'ahead';
    } else if (percentDeviation < -10) {
      status = 'behind';
    } else {
      status = 'on-track';
    }

    return {
      actual: actualDeployment,
      target: expectedDeployment,
      variance,
      percentDeviation,
      status,
    };
  }

  /**
   * Calculate performance variance (IRR)
   */
  private calculatePerformanceVariance(
    actual: ActualMetrics,
    target: TargetMetrics
  ): VarianceMetrics['performanceVariance'] {
    const actualIRR = actual.irr;
    const targetIRR = target.targetIRR;

    // Handle case where IRR cannot be calculated
    if (actualIRR === null) {
      return {
        actualIRR: null,
        targetIRR,
        variance: null,
        status: 'insufficient-data',
      };
    }

    const variance = actualIRR - targetIRR;

    // Determine status (allow 2% tolerance for IRR)
    let status: 'above' | 'on-track' | 'below';
    if (variance > 0.02) {
      status = 'above';
    } else if (variance < -0.02) {
      status = 'below';
    } else {
      status = 'on-track';
    }

    return {
      actualIRR,
      targetIRR,
      variance,
      status,
    };
  }

  /**
   * Calculate TVPI variance
   */
  private calculateTVPIVariance(
    actual: ActualMetrics,
    projected: ProjectedMetrics,
    target: TargetMetrics
  ): VarianceMetrics['tvpiVariance'] {
    const actualTVPI = actual.tvpi;
    const projectedTVPI = projected.expectedTVPI;
    const targetTVPI = target.targetTVPI;

    const varianceVsProjected = actualTVPI - projectedTVPI;
    const varianceVsTarget = actualTVPI - targetTVPI;

    return {
      actual: actualTVPI,
      projected: projectedTVPI,
      target: targetTVPI,
      varianceVsProjected,
      varianceVsTarget,
    };
  }

  /**
   * Calculate pacing variance
   */
  private calculatePaceVariance(
    actual: ActualMetrics,
    projected: ProjectedMetrics,
    target: TargetMetrics
  ): VarianceMetrics['paceVariance'] {
    const status = projected.deploymentPace;

    // Calculate deployment rates
    const fundAgeMonths = actual.fundAgeMonths || 0;
    const investmentPeriodMonths = target.targetDeploymentYears * 12;
    const periodElapsedPercent = Math.min(100, (fundAgeMonths / investmentPeriodMonths) * 100);

    const capitalDeployedPercent =
      target.targetFundSize > 0 ? (actual.totalDeployed / target.targetFundSize) * 100 : 0;

    // Calculate months deviation
    // If we've deployed 60% of capital but only 50% of time has elapsed, we're ahead
    const expectedMonthsForDeployment = (capitalDeployedPercent / 100) * investmentPeriodMonths;
    const monthsDeviation = fundAgeMonths - expectedMonthsForDeployment;

    return {
      status,
      monthsDeviation,
      periodElapsedPercent,
      capitalDeployedPercent,
    };
  }

  /**
   * Calculate portfolio construction variance
   */
  private calculatePortfolioVariance(
    actual: ActualMetrics,
    target: TargetMetrics
  ): VarianceMetrics['portfolioVariance'] {
    const actualCompanies = actual.totalCompanies;
    const targetCompanies = target.targetCompanyCount;
    const variance = actualCompanies - targetCompanies;

    // Determine if on track based on deployment progress
    const deploymentProgress =
      target.targetFundSize > 0 ? actual.totalDeployed / target.targetFundSize : 0;

    const expectedCompanies = Math.round(targetCompanies * deploymentProgress);
    const onTrack = Math.abs(actualCompanies - expectedCompanies) <= 2; // Allow 2 company tolerance

    return {
      actualCompanies,
      targetCompanies,
      variance,
      onTrack,
    };
  }
}
