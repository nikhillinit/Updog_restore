import Decimal from '@shared/lib/decimal-config';

// NAV projection with J-curve modeling for LP-realistic valuations

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

/**
 * J-curve NAV modeling that reflects real VC fund valuation patterns
 * - Flat NAV during blind pool period (initial 2-3 years)
 * - Gradual decay during maturation period
 * - Accelerated decline toward liquidation
 */
export function projectNAVJCurve(
  totalInvestment: number,
  totalQuarters: number,
  blindPoolQuarters = 8 // Default 2 years flat
): number[] {
  const navSeries: number[] = [];
  const totalInvestmentD = new Decimal(totalInvestment);

  for (let q = 0; q <= totalQuarters; q++) {
    if (q <= blindPoolQuarters) {
      // Blind pool period: NAV stays flat at cost basis
      navSeries.push(totalInvestment);
    } else {
      // Post blind pool: linear decay to zero
      const remainingQuarters = Math.max(1, totalQuarters - blindPoolQuarters);
      const progressPct = new Decimal(q - blindPoolQuarters).div(remainingQuarters);
      const remaining = Decimal.max(ZERO, ONE.minus(progressPct));
      navSeries.push(totalInvestmentD.mul(remaining).toNumber());
    }
  }

  return navSeries;
}

/**
 * Enhanced J-curve with step-up and step-down periods
 * More realistic for modeling portfolio appreciation before exits
 */
export function projectNAVEnhanced(
  totalInvestment: number,
  totalQuarters: number,
  options: {
    blindPoolQuarters?: number;
    appreciationQuarters?: number;
    peakMultiple?: number;
    finalMultiple?: number;
  } = {}
): Array<{ quarter: number; nav: number; distributions: number; fees: number }> {
  const {
    blindPoolQuarters = 8,
    appreciationQuarters = 12,
    peakMultiple = 1.5,
    finalMultiple = 0.1, // Some residual value
  } = options;

  const result: Array<{ quarter: number; nav: number; distributions: number; fees: number }> = [];
  const totalInvestmentD = new Decimal(totalInvestment);
  const quarterlyFees = totalInvestmentD.mul(0.02).div(4).toNumber();

  for (let q = 0; q <= totalQuarters; q++) {
    let nav: number;
    let distributions = 0;

    if (q <= blindPoolQuarters) {
      // Phase 1: Blind pool - flat at cost
      nav = totalInvestment;
    } else if (q <= blindPoolQuarters + appreciationQuarters) {
      // Phase 2: Appreciation phase - step up to peak
      const appreciationProgress = (q - blindPoolQuarters) / appreciationQuarters;
      const appreciationCurve = Math.sin((appreciationProgress * Math.PI) / 2); // Smooth curve
      const navMultiple = ONE.plus(new Decimal(peakMultiple).minus(1).mul(appreciationCurve));
      nav = totalInvestmentD.mul(navMultiple).toNumber();
    } else {
      // Phase 3: Exit phase - distributions and declining NAV
      const exitQuarters = Math.max(1, totalQuarters - blindPoolQuarters - appreciationQuarters);
      const exitProgress = new Decimal(q - blindPoolQuarters - appreciationQuarters).div(
        exitQuarters
      );

      // Distributions increase over time (exits generate cash)
      const distributionRate = Math.pow(exitProgress.toNumber(), 0.7); // Front-loaded distributions
      distributions = totalInvestmentD.mul(peakMultiple).mul(distributionRate).mul(0.15).toNumber(); // 15% of peak value per quarter at peak

      // NAV declines as distributions occur
      const navMultiple = new Decimal(peakMultiple)
        .mul(ONE.minus(exitProgress))
        .plus(new Decimal(finalMultiple).mul(exitProgress));
      nav = totalInvestmentD.mul(navMultiple).toNumber();
    }

    result.push({
      quarter: q,
      nav: Math.max(0, nav),
      distributions,
      fees: quarterlyFees,
    });
  }

  return result;
}

/**
 * Simple NAV projection for quick MVP calculations
 * Maintains the original linear approach with slight J-curve adjustment
 */
export function projectNAVSimple(
  totalInvestment: number,
  startQuarter: number,
  endQuarter: number
): number[] {
  const nav: number[] = [];
  const flatPeriod = 8; // 2 years flat
  const totalInvestmentD = new Decimal(totalInvestment);

  for (let q = startQuarter; q <= endQuarter; q++) {
    const quarterId = q - startQuarter;

    if (quarterId <= flatPeriod) {
      // Flat period
      nav.push(totalInvestment);
    } else {
      // Linear decay
      const decayPeriod = Math.max(1, endQuarter - startQuarter - flatPeriod);
      const remaining = Decimal.max(ZERO, new Decimal(endQuarter - q).div(decayPeriod));
      nav.push(totalInvestmentD.mul(remaining).toNumber());
    }
  }

  return nav;
}

/**
 * Calculate TVPI (Total Value to Paid-In) from NAV and distributions
 */
export function calculateTVPI(
  currentNAV: number,
  cumulativeDistributions: number,
  totalInvested: number
): number {
  if (totalInvested === 0) return 1.0;
  return Decimal.max(
    ZERO,
    new Decimal(currentNAV).plus(cumulativeDistributions).div(totalInvested)
  ).toNumber();
}

/**
 * Calculate DPI (Distributions to Paid-In)
 */
export function calculateDPI(cumulativeDistributions: number, totalInvested: number): number {
  if (totalInvested === 0) return 0;
  return Decimal.max(ZERO, new Decimal(cumulativeDistributions).div(totalInvested)).toNumber();
}

/**
 * Generate portfolio-level NAV progression for multiple investments
 */
export function generatePortfolioNAV(
  investments: Array<{
    amount: number;
    startQuarter: number;
    exitQuarter: number;
    exitMultiple: number;
  }>,
  totalQuarters: number
): Array<{ quarter: number; totalNAV: number; totalDistributions: number }> {
  const portfolio: Array<{ quarter: number; totalNAV: number; totalDistributions: number }> = [];
  const navByInvestment = investments.map((investment) =>
    projectNAVSimple(investment.amount, investment.startQuarter, investment.exitQuarter)
  );

  for (let q = 0; q <= totalQuarters; q++) {
    let totalNAV = 0;
    let totalDistributions = 0;

    investments.forEach((investment, idx) => {
      if (q >= investment.startQuarter && q <= investment.exitQuarter) {
        const navIndex = q - investment.startQuarter;
        const investmentNAV = navByInvestment[idx];
        if (investmentNAV && navIndex < investmentNAV.length) {
          totalNAV += investmentNAV[navIndex] ?? 0;
        }
      } else if (q > investment.exitQuarter) {
        // Investment has exited, add to distributions
        totalDistributions += investment.amount * investment.exitMultiple;
      }
    });

    portfolio.push({
      quarter: q,
      totalNAV,
      totalDistributions,
    });
  }

  return portfolio;
}

/**
 * Demo-safe NAV calculation with error boundaries
 */
export function calculateNAVSafe(
  totalInvestment: number,
  currentQuarter: number,
  totalQuarters: number
): { nav: number; confidence: 'high' | 'medium' | 'low' } {
  try {
    if (totalInvestment <= 0 || totalQuarters <= 0) {
      return { nav: 0, confidence: 'low' };
    }

    const navSeries = projectNAVJCurve(totalInvestment, totalQuarters);
    const nav = navSeries[Math.min(currentQuarter, navSeries.length - 1)] || 0;

    // Confidence based on fund maturity
    const maturityPct = currentQuarter / totalQuarters;
    let confidence: 'high' | 'medium' | 'low' = 'high';

    if (maturityPct < 0.25)
      confidence = 'low'; // Early stage, high uncertainty
    else if (maturityPct < 0.75)
      confidence = 'medium'; // Mid-stage
    else confidence = 'high'; // Mature stage, more predictable

    return { nav: Math.max(0, nav), confidence };
  } catch (error) {
    console.error('NAV calculation error:', error);
    return { nav: totalInvestment * 0.8, confidence: 'low' }; // Conservative fallback
  }
}
