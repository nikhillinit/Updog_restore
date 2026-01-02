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

    // Number of quarters in fund life
    const numQuarters = fundLifeYears * 4;

    // Compute fee basis timeline if fee profile provided
    let feeTimelinePerPeriod: Decimal[] = Array(numQuarters + 1).fill(new Decimal(0));
    if (feeProfile) {
      const feeBasisConfig: FeeBasisConfig = {
        fundSize,
        numQuarters,
        feeProfile
      };
      const feeBasisTimeline = computeFeeBasisTimeline(feeBasisConfig);
      // Extract management fees from each period
      feeTimelinePerPeriod = feeBasisTimeline.periods.map((p) => p.managementFees);
    }

    // Configure J-curve computation
    const jCurveConfig: JCurveConfig = {
      kind: 'logistic',
      horizonYears: fundLifeYears,
      investYears: investmentPeriodYears,
      targetTVPI: new Decimal(targetTVPI),
      step: 'quarter',
      navCalculationMode,
      finalDistributionCoefficient,
    };

    // Compute J-curve path
    const jCurvePath = computeJCurvePath(jCurveConfig, feeTimelinePerPeriod);

    // Extract current metrics (quarter 0) from separate arrays
    const tvpi0 = jCurvePath.tvpi[0];
    const dpi0 = jCurvePath.dpi[0];
    const nav0 = jCurvePath.nav[0];
    const calls0 = jCurvePath.calls[0];

    if (!tvpi0 || !nav0) {
      throw new Error('J-curve computation failed: no data points');
    }

    const current = {
      tvpi: tvpi0.toNumber(),
      dpi: dpi0?.toNumber() ?? 0,
      rvpi: tvpi0.minus(dpi0 ?? 0).toNumber(),
      nav: nav0,
      calledCapital: calls0 ?? new Decimal(0),
      distributions: nav0.times(dpi0 ?? 0),
    };

    // Extract projected metrics (final quarter)
    const lastIdx = jCurvePath.tvpi.length - 1;
    const tvpiFinal = jCurvePath.tvpi[lastIdx];
    const dpiFinal = jCurvePath.dpi[lastIdx];
    const navFinal = jCurvePath.nav[lastIdx];
    const callsFinal = jCurvePath.calls[lastIdx];

    if (!tvpiFinal || !navFinal) {
      throw new Error('J-curve computation failed: no final point');
    }

    const projected = {
      tvpi: tvpiFinal.toNumber(),
      dpi: dpiFinal?.toNumber() ?? 0,
      rvpi: tvpiFinal.minus(dpiFinal ?? 0).toNumber(),
      nav: navFinal,
      calledCapital: callsFinal ?? fundSize,
      distributions: navFinal.times(dpiFinal ?? 0),
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
