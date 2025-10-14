/**
 * Construction Forecast Calculator
 *
 * Generates J-curve-based forecasts for funds with no investments yet.
 * Returns construction-phase projections using pure mathematical models.
 *
 * Source: 'construction_forecast'
 */

import Decimal from 'decimal.js';
import type { FeeProfile } from '@shared/schemas/fee-profile';
import { computeJCurvePath, type JCurveConfig, type JCurvePath } from '@shared/lib/jcurve';
import { computeFeeBasisTimeline, type FeeBasisConfig } from '@shared/lib/fund-math';
import { getFundAge, getLifecycleStage, isConstructionPhase } from '@shared/lib/lifecycle-rules';

/**
 * Construction forecast configuration
 */
export interface ConstructionForecastConfig {
  /** Fund size (committed capital) */
  fundSize: Decimal;

  /** Fund establishment date */
  establishmentDate: Date | string;

  /** Target TVPI multiple (e.g., 2.5) */
  targetTVPI: number;

  /** Investment period in years (default 5) */
  investmentPeriodYears?: number;

  /** Total fund life in years (default 10) */
  fundLifeYears?: number;

  /** Fee profile (optional) */
  feeProfile?: FeeProfile;

  /** NAV calculation mode */
  navCalculationMode?: 'standard' | 'fee-adjusted';

  /** Final distribution coefficient (default 0.7) */
  finalDistributionCoefficient?: number;
}

/**
 * Construction forecast result
 */
export interface ConstructionForecast {
  /** Forecast source identifier */
  source: 'construction_forecast';

  /** Current metrics (quarter 0) */
  current: {
    tvpi: number;
    dpi: number;
    rvpi: number;
    nav: Decimal;
    calledCapital: Decimal;
    distributions: Decimal;
  };

  /** Projected metrics (final quarter) */
  projected: {
    tvpi: number;
    dpi: number;
    rvpi: number;
    nav: Decimal;
    calledCapital: Decimal;
    distributions: Decimal;
  };

  /** Full J-curve path */
  jCurvePath: JCurvePath;

  /** Fund lifecycle metadata */
  metadata: {
    fundAge: ReturnType<typeof getFundAge>;
    lifecycleStage: ReturnType<typeof getLifecycleStage>;
    isConstruction: boolean;
  };
}

/**
 * Construction Forecast Calculator
 *
 * Generates J-curve forecasts for empty funds using mathematical models.
 */
export class ConstructionForecastCalculator {
  /**
   * Generate construction forecast
   *
   * @param config - Forecast configuration
   * @returns Construction forecast with J-curve path
   */
  static generateForecast(config: ConstructionForecastConfig): ConstructionForecast {
    const {
      fundSize,
      establishmentDate,
      targetTVPI,
      investmentPeriodYears = 5,
      fundLifeYears = 10,
      feeProfile,
      navCalculationMode = 'standard',
      finalDistributionCoefficient = 0.7
    } = config;

    // Calculate fund age
    const fundAge = getFundAge(establishmentDate);
    const lifecycleStage = getLifecycleStage(fundAge, investmentPeriodYears);
    const hasInvestments = false; // Construction phase by definition
    const isConstruction = isConstructionPhase(fundAge, hasInvestments);

    // Compute fee basis timeline if fee profile provided
    let feeBasisTimeline;
    if (feeProfile) {
      const feeBasisConfig: FeeBasisConfig = {
        fundSize,
        numQuarters: fundLifeYears * 4,
        feeProfile
      };
      feeBasisTimeline = computeFeeBasisTimeline(feeBasisConfig);
    }

    // Configure J-curve computation
    const jCurveConfig: JCurveConfig = {
      kind: 'gompertz',
      horizonYears: fundLifeYears,
      investYears: investmentPeriodYears,
      targetTVPI: new Decimal(targetTVPI),
      step: 'quarter',
      navCalculationMode,
      finalDistributionCoefficient
    };

    // Compute fee timeline (empty for construction phase)
    const numQuarters = fundLifeYears * 4;
    const feeTimeline = feeBasisTimeline
      ? feeBasisTimeline.periods.map(p => p.fee)
      : Array(numQuarters).fill(new Decimal(0));

    // Compute J-curve path
    const jCurvePath = computeJCurvePath(jCurveConfig, feeTimeline);

    // Extract current metrics (quarter 0)
    const currentTVPI = jCurvePath.tvpi[0];
    const currentNAV = jCurvePath.nav[0];
    const currentDPI = jCurvePath.dpi[0];

    if (!currentTVPI || !currentNAV || !currentDPI) {
      throw new Error('J-curve computation failed: no data points');
    }

    const current = {
      tvpi: currentTVPI.toNumber(),
      dpi: currentDPI.toNumber(),
      rvpi: currentTVPI.minus(currentDPI).toNumber(),
      nav: currentNAV,
      calledCapital: new Decimal(0), // No calls yet in construction
      distributions: currentDPI
    };

    // Extract projected metrics (final quarter)
    const finalTVPI = jCurvePath.tvpi[jCurvePath.tvpi.length - 1];
    const finalNAV = jCurvePath.nav[jCurvePath.nav.length - 1];
    const finalDPI = jCurvePath.dpi[jCurvePath.dpi.length - 1];

    if (!finalTVPI || !finalNAV || !finalDPI) {
      throw new Error('J-curve computation failed: no final point');
    }

    const projected = {
      tvpi: finalTVPI.toNumber(),
      dpi: finalDPI.toNumber(),
      rvpi: finalTVPI.minus(finalDPI).toNumber(),
      nav: finalNAV,
      calledCapital: fundSize, // Fully called by end
      distributions: finalDPI
    };

    return {
      source: 'construction_forecast',
      current,
      projected,
      jCurvePath,
      metadata: {
        fundAge,
        lifecycleStage,
        isConstruction
      }
    };
  }

  /**
   * Check if fund is eligible for construction forecast
   *
   * @param establishmentDate - Fund establishment date
   * @param hasInvestments - Whether fund has any investments
   * @returns True if eligible
   */
  static isEligible(
    establishmentDate: Date | string,
    hasInvestments: boolean
  ): boolean {
    const fundAge = getFundAge(establishmentDate);
    return isConstructionPhase(fundAge, hasInvestments);
  }
}
