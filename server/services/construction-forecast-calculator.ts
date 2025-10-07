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
      fundSize,
      targetTVPI,
      investmentPeriodQuarters: investmentPeriodYears * 4,
      fundLifeQuarters: fundLifeYears * 4,
      actualTVPIPoints: [], // No actuals in construction phase
      navCalculationMode,
      finalDistributionCoefficient,
      feeBasisTimeline
    };

    // Compute J-curve path
    const jCurvePath = computeJCurvePath(jCurveConfig);

    // Extract current metrics (quarter 0)
    const currentPoint = jCurvePath.mainPath[0];
    if (!currentPoint) {
      throw new Error('J-curve computation failed: no data points');
    }

    const current = {
      tvpi: currentPoint.tvpi,
      dpi: currentPoint.dpi,
      rvpi: currentPoint.rvpi,
      nav: new Decimal(currentPoint.nav),
      calledCapital: new Decimal(currentPoint.calledCapital),
      distributions: new Decimal(currentPoint.distributions)
    };

    // Extract projected metrics (final quarter)
    const finalPoint = jCurvePath.mainPath[jCurvePath.mainPath.length - 1];
    if (!finalPoint) {
      throw new Error('J-curve computation failed: no final point');
    }

    const projected = {
      tvpi: finalPoint.tvpi,
      dpi: finalPoint.dpi,
      rvpi: finalPoint.rvpi,
      nav: new Decimal(finalPoint.nav),
      calledCapital: new Decimal(finalPoint.calledCapital),
      distributions: new Decimal(finalPoint.distributions)
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
