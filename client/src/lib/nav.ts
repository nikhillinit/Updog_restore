// NAV projection with J-curve modeling for LP-realistic valuations

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

  for (let q = 0; q <= totalQuarters; q++) {
    if (q <= blindPoolQuarters) {
      // Blind pool period: NAV stays flat at cost basis
      navSeries.push(totalInvestment);
    } else {
      // Post blind pool: linear decay to zero
      const remainingQuarters = Math.max(1, totalQuarters - blindPoolQuarters);
      const progressPct = (q - blindPoolQuarters) / remainingQuarters;
      const remaining = Math.max(0, 1 - progressPct);
      navSeries.push(totalInvestment * remaining);
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

  for (let q = 0; q <= totalQuarters; q++) {
    let nav: number;
    let distributions = 0;
    const quarterlyFees = totalInvestment * 0.02 / 4; // 2% annual management fee

    if (q <= blindPoolQuarters) {
      // Phase 1: Blind pool - flat at cost
      nav = totalInvestment;
    } else if (q <= blindPoolQuarters + appreciationQuarters) {
      // Phase 2: Appreciation phase - step up to peak
      const appreciationProgress = (q - blindPoolQuarters) / appreciationQuarters;
      const appreciationCurve = Math.sin(appreciationProgress * Math.PI / 2); // Smooth curve
      nav = totalInvestment * (1 + (peakMultiple - 1) * appreciationCurve);
    } else {
      // Phase 3: Exit phase - distributions and declining NAV
      const exitQuarters = totalQuarters - blindPoolQuarters - appreciationQuarters;
      const exitProgress = (q - blindPoolQuarters - appreciationQuarters) / exitQuarters;

      // Distributions increase over time (exits generate cash)
      const distributionRate = Math.pow(exitProgress, 0.7); // Front-loaded distributions
      distributions = totalInvestment * peakMultiple * distributionRate * 0.15; // 15% of peak value per quarter at peak

      // NAV declines as distributions occur
      const navMultiple = peakMultiple * (1 - exitProgress) + finalMultiple * exitProgress;
      nav = totalInvestment * navMultiple;
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

  for (let q = startQuarter; q <= endQuarter; q++) {
    const quarterId = q - startQuarter;

    if (quarterId <= flatPeriod) {
      // Flat period
      nav.push(totalInvestment);
    } else {
      // Linear decay
      const decayPeriod = endQuarter - startQuarter - flatPeriod;
      const remaining = Math.max(0, (endQuarter - q) / decayPeriod);
      nav.push(totalInvestment * remaining);
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
  return Math.max(0, (currentNAV + cumulativeDistributions) / totalInvested);
}

/**
 * Calculate DPI (Distributions to Paid-In)
 */
export function calculateDPI(
  cumulativeDistributions: number,
  totalInvested: number
): number {
  if (totalInvested === 0) return 0;
  return Math.max(0, cumulativeDistributions / totalInvested);
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

  for (let q = 0; q <= totalQuarters; q++) {
    let totalNAV = 0;
    let totalDistributions = 0;

    investments.forEach(investment => {
      if (q >= investment.startQuarter && q <= investment.exitQuarter) {
        const investmentNAV = projectNAVSimple(
          investment.amount,
          investment.startQuarter,
          investment.exitQuarter
        );
        const navIndex = q - investment.startQuarter;
        if (navIndex < investmentNAV.length) {
          totalNAV += investmentNAV[navIndex];
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

    if (maturityPct < 0.25) confidence = 'low'; // Early stage, high uncertainty
    else if (maturityPct < 0.75) confidence = 'medium'; // Mid-stage
    else confidence = 'high'; // Mature stage, more predictable

    return { nav: Math.max(0, nav), confidence };

  } catch (error) {
    console.error('NAV calculation error:', error);
    return { nav: totalInvestment * 0.8, confidence: 'low' }; // Conservative fallback
  }
}