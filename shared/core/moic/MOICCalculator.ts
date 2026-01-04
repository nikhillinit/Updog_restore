/**
 * MOICCalculator - Comprehensive MOIC (Multiple on Invested Capital) Suite
 *
 * Phase 2 Phoenix: Implements 7 MOIC variants for reserve allocation decisions.
 *
 * All calculations are deterministic (pure functions, no sampling).
 * Uses Decimal.js for precision per Phoenix precision guidelines.
 *
 * Variants:
 * 1. Current MOIC - Current valuation / invested
 * 2. Exit MOIC - Projected exit value / invested
 * 3. Initial MOIC - Returns on initial investment only
 * 4. Follow-on MOIC - Returns on follow-on investments only
 * 5. Reserves MOIC - Expected returns from planned reserves
 * 6. Opportunity Cost MOIC - Foregone alternative returns
 * 7. Blended MOIC - Weighted portfolio average
 */

import Decimal from 'decimal.js';

// Configure decimal.js for financial precision
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// Types
// ============================================================================

export interface Investment {
  id: string;
  name: string;
  /** Initial check size */
  initialInvestment: number;
  /** Sum of all follow-on investments */
  followOnInvestment: number;
  /** Current valuation of the position */
  currentValuation: number;
  /** Projected exit value (expected exit proceeds) */
  projectedExitValue: number;
  /** Probability of reaching projected exit (0-1) */
  exitProbability: number;
  /** Planned reserves for this investment */
  plannedReserves: number;
  /** Expected MOIC if reserves are deployed */
  reserveExitMultiple: number;
  /** Investment date (for time-weighted calculations) */
  investmentDate: Date;
}

export interface MOICResult {
  /** The calculated MOIC value */
  value: number | null;
  /** Human-readable description */
  description: string;
  /** Calculation formula used */
  formula: string;
  /** Input values used */
  inputs: Record<string, number>;
}

export interface PortfolioMOICSummary {
  /** Individual company MOICs */
  companies: Array<{
    id: string;
    name: string;
    currentMOIC: MOICResult;
    exitMOIC: MOICResult;
    initialMOIC: MOICResult;
    followOnMOIC: MOICResult;
    reservesMOIC: MOICResult;
  }>;
  /** Portfolio-level aggregates */
  portfolio: {
    blendedMOIC: MOICResult;
    totalInvested: number;
    totalCurrentValue: number;
    totalProjectedValue: number;
  };
}

// ============================================================================
// Safe Division Helper
// ============================================================================

/**
 * Safe division that returns null for zero divisor.
 * Per Phoenix guidelines: safeDiv(0, 0) returns null, not 0.
 */
function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return new Decimal(numerator).div(denominator).toNumber();
}

// ============================================================================
// MOIC Calculator Class
// ============================================================================

export class MOICCalculator {
  /**
   * 1. Current MOIC
   *
   * Definition: Current valuation divided by total invested capital
   * Formula: Current Valuation / (Initial Investment + Follow-on Investment)
   *
   * Use case: Measure current paper returns on total invested
   */
  static calculateCurrentMOIC(investment: Investment): MOICResult {
    const totalInvested = investment.initialInvestment + investment.followOnInvestment;
    const value = safeDiv(investment.currentValuation, totalInvested);

    return {
      value,
      description: 'Current valuation divided by total invested capital',
      formula: 'Current Valuation / (Initial + Follow-on)',
      inputs: {
        currentValuation: investment.currentValuation,
        totalInvested,
      },
    };
  }

  /**
   * 2. Exit MOIC
   *
   * Definition: Projected exit value divided by total invested capital
   * Formula: Projected Exit Value / (Initial Investment + Follow-on Investment)
   *
   * Use case: Measure expected returns at exit
   * Note: This is probability-weighted if exitProbability is provided
   */
  static calculateExitMOIC(
    investment: Investment,
    probabilityWeighted: boolean = false
  ): MOICResult {
    const totalInvested = investment.initialInvestment + investment.followOnInvestment;
    let exitValue = investment.projectedExitValue;

    if (probabilityWeighted && investment.exitProbability < 1) {
      exitValue = exitValue * investment.exitProbability;
    }

    const value = safeDiv(exitValue, totalInvested);

    return {
      value,
      description: probabilityWeighted
        ? 'Probability-weighted exit value divided by total invested'
        : 'Projected exit value divided by total invested capital',
      formula: probabilityWeighted
        ? '(Exit Value × Exit Probability) / (Initial + Follow-on)'
        : 'Exit Value / (Initial + Follow-on)',
      inputs: {
        projectedExitValue: investment.projectedExitValue,
        exitProbability: investment.exitProbability,
        totalInvested,
      },
    };
  }

  /**
   * 3. Initial MOIC
   *
   * Definition: Value attributable to initial investment divided by initial investment
   * Formula: (Initial Investment / Total Invested) × Current Valuation / Initial Investment
   *        = Current Valuation × Initial Share / Initial Investment
   *
   * Use case: Isolate returns from initial check vs follow-ons
   * Note: Assumes pro-rata value distribution based on ownership
   */
  static calculateInitialMOIC(investment: Investment): MOICResult {
    const totalInvested = investment.initialInvestment + investment.followOnInvestment;

    // Calculate the share of value attributable to initial investment
    // Assumes value is distributed pro-rata to investment amounts
    const initialShare = totalInvested > 0
      ? investment.initialInvestment / totalInvested
      : 0;
    const initialValue = investment.currentValuation * initialShare;

    const value = safeDiv(initialValue, investment.initialInvestment);

    return {
      value,
      description: 'Returns attributable to initial investment only',
      formula: '(Current Value × Initial Share) / Initial Investment',
      inputs: {
        currentValuation: investment.currentValuation,
        initialInvestment: investment.initialInvestment,
        initialShare,
        initialValue,
      },
    };
  }

  /**
   * 4. Follow-on MOIC
   *
   * Definition: Value attributable to follow-on investments divided by follow-on investment
   * Formula: (Follow-on Investment / Total Invested) × Current Valuation / Follow-on Investment
   *
   * Use case: Measure effectiveness of follow-on capital deployment
   */
  static calculateFollowOnMOIC(investment: Investment): MOICResult {
    if (investment.followOnInvestment === 0) {
      return {
        value: null,
        description: 'No follow-on investment made',
        formula: 'N/A (no follow-on)',
        inputs: {
          followOnInvestment: 0,
        },
      };
    }

    const totalInvested = investment.initialInvestment + investment.followOnInvestment;

    // Calculate the share of value attributable to follow-on investment
    const followOnShare = investment.followOnInvestment / totalInvested;
    const followOnValue = investment.currentValuation * followOnShare;

    const value = safeDiv(followOnValue, investment.followOnInvestment);

    return {
      value,
      description: 'Returns attributable to follow-on investments only',
      formula: '(Current Value × Follow-on Share) / Follow-on Investment',
      inputs: {
        currentValuation: investment.currentValuation,
        followOnInvestment: investment.followOnInvestment,
        followOnShare,
        followOnValue,
      },
    };
  }

  /**
   * 5. Reserves MOIC (Exit MOIC on Planned Reserves)
   *
   * Definition: Expected exit value from deploying planned reserves
   * Formula: (Planned Reserves × Reserve Exit Multiple) / Planned Reserves
   *        = Reserve Exit Multiple (simplified)
   *
   * Use case: Decision support for reserve allocation
   * Note: This is the key metric for "next dollar" decisions
   */
  static calculateReservesMOIC(
    investment: Investment,
    applyProbability: boolean = true
  ): MOICResult {
    if (investment.plannedReserves === 0) {
      return {
        value: null,
        description: 'No planned reserves for this investment',
        formula: 'N/A (no planned reserves)',
        inputs: {
          plannedReserves: 0,
        },
      };
    }

    let expectedValue = investment.plannedReserves * investment.reserveExitMultiple;

    if (applyProbability) {
      expectedValue = expectedValue * investment.exitProbability;
    }

    const value = safeDiv(expectedValue, investment.plannedReserves);

    return {
      value,
      description: applyProbability
        ? 'Probability-weighted expected return on planned reserves'
        : 'Expected return on planned reserves',
      formula: applyProbability
        ? '(Reserves × Exit Multiple × Exit Probability) / Reserves'
        : '(Reserves × Exit Multiple) / Reserves',
      inputs: {
        plannedReserves: investment.plannedReserves,
        reserveExitMultiple: investment.reserveExitMultiple,
        exitProbability: investment.exitProbability,
        expectedValue,
      },
    };
  }

  /**
   * 6. Opportunity Cost MOIC
   *
   * Definition: What returns would have been with alternative deployment
   * Formula: (Investment Amount × Alternative Return Rate) / Investment Amount
   *        = Alternative Return Rate (typically risk-free rate or portfolio average)
   *
   * Use case: Compare actual returns against benchmark/alternative
   *
   * @param investment - The investment to analyze
   * @param alternativeReturnRate - Expected MOIC from alternative deployment (e.g., 1.02 for 2% treasury)
   */
  static calculateOpportunityCostMOIC(
    investment: Investment,
    alternativeReturnRate: number = 1.0 // Default: no alternative return
  ): MOICResult {
    const totalInvested = investment.initialInvestment + investment.followOnInvestment;
    const alternativeValue = totalInvested * alternativeReturnRate;

    // Opportunity cost is the difference between actual and alternative
    const actualMOIC = this.calculateCurrentMOIC(investment).value ?? 0;
    const opportunityCost = actualMOIC - alternativeReturnRate;

    return {
      value: opportunityCost,
      description: 'Difference between actual MOIC and alternative return rate',
      formula: 'Actual MOIC - Alternative Return Rate',
      inputs: {
        actualMOIC,
        alternativeReturnRate,
        totalInvested,
        alternativeValue,
      },
    };
  }

  /**
   * 7. Blended MOIC (Portfolio-Weighted Average)
   *
   * Definition: Investment-weighted average MOIC across portfolio
   * Formula: Σ(Investment_i × MOIC_i) / Σ(Investment_i)
   *
   * Use case: Single portfolio-level performance metric
   */
  static calculateBlendedMOIC(investments: Investment[]): MOICResult {
    if (investments.length === 0) {
      return {
        value: null,
        description: 'No investments in portfolio',
        formula: 'N/A (empty portfolio)',
        inputs: {},
      };
    }

    let totalWeightedMOIC = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const inv of investments) {
      const invested = inv.initialInvestment + inv.followOnInvestment;
      const moic = this.calculateCurrentMOIC(inv).value ?? 0;

      totalWeightedMOIC = totalWeightedMOIC.plus(
        new Decimal(invested).times(moic)
      );
      totalInvested = totalInvested.plus(invested);
    }

    const value = totalInvested.isZero()
      ? null
      : totalWeightedMOIC.div(totalInvested).toNumber();

    return {
      value,
      description: 'Investment-weighted average MOIC across portfolio',
      formula: 'Σ(Investment × MOIC) / Σ(Investment)',
      inputs: {
        portfolioSize: investments.length,
        totalInvested: totalInvested.toNumber(),
        totalWeightedMOIC: totalWeightedMOIC.toNumber(),
      },
    };
  }

  /**
   * Calculate all MOIC variants for an investment
   */
  static calculateAllMOICs(
    investment: Investment,
    alternativeReturnRate: number = 1.0
  ): Record<string, MOICResult> {
    return {
      current: this.calculateCurrentMOIC(investment),
      exit: this.calculateExitMOIC(investment, false),
      exitProbabilityWeighted: this.calculateExitMOIC(investment, true),
      initial: this.calculateInitialMOIC(investment),
      followOn: this.calculateFollowOnMOIC(investment),
      reserves: this.calculateReservesMOIC(investment, true),
      reservesRaw: this.calculateReservesMOIC(investment, false),
      opportunityCost: this.calculateOpportunityCostMOIC(investment, alternativeReturnRate),
    };
  }

  /**
   * Generate portfolio-level MOIC summary
   */
  static generatePortfolioSummary(investments: Investment[]): PortfolioMOICSummary {
    const companies = investments.map(inv => ({
      id: inv.id,
      name: inv.name,
      currentMOIC: this.calculateCurrentMOIC(inv),
      exitMOIC: this.calculateExitMOIC(inv, true),
      initialMOIC: this.calculateInitialMOIC(inv),
      followOnMOIC: this.calculateFollowOnMOIC(inv),
      reservesMOIC: this.calculateReservesMOIC(inv, true),
    }));

    const totalInvested = investments.reduce(
      (sum, inv) => sum + inv.initialInvestment + inv.followOnInvestment,
      0
    );

    const totalCurrentValue = investments.reduce(
      (sum, inv) => sum + inv.currentValuation,
      0
    );

    const totalProjectedValue = investments.reduce(
      (sum, inv) => sum + inv.projectedExitValue * inv.exitProbability,
      0
    );

    return {
      companies,
      portfolio: {
        blendedMOIC: this.calculateBlendedMOIC(investments),
        totalInvested,
        totalCurrentValue,
        totalProjectedValue,
      },
    };
  }

  /**
   * Rank investments by Exit MOIC on Planned Reserves
   *
   * This is the key reserve allocation metric - ranks investments
   * by expected returns from deploying additional capital.
   *
   * Returns investments sorted by reserves MOIC (highest first)
   */
  static rankByReservesMOIC(investments: Investment[]): Array<{
    investment: Investment;
    reservesMOIC: MOICResult;
    rank: number;
  }> {
    const ranked = investments
      .map(inv => ({
        investment: inv,
        reservesMOIC: this.calculateReservesMOIC(inv, true),
      }))
      .sort((a, b) => {
        const aVal = a.reservesMOIC.value ?? -Infinity;
        const bVal = b.reservesMOIC.value ?? -Infinity;
        return bVal - aVal; // Descending order
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    return ranked;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a test investment with default values
 */
export function createTestInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    id: 'test-001',
    name: 'Test Company',
    initialInvestment: 1_000_000,
    followOnInvestment: 500_000,
    currentValuation: 3_000_000,
    projectedExitValue: 5_000_000,
    exitProbability: 0.6,
    plannedReserves: 250_000,
    reserveExitMultiple: 4.0,
    investmentDate: new Date('2022-01-01'),
    ...overrides,
  };
}

/**
 * Create a sample portfolio for testing
 */
export function createSamplePortfolio(): Investment[] {
  return [
    createTestInvestment({
      id: 'company-a',
      name: 'Alpha Tech',
      initialInvestment: 2_000_000,
      followOnInvestment: 1_000_000,
      currentValuation: 12_000_000,
      projectedExitValue: 20_000_000,
      exitProbability: 0.5,
      plannedReserves: 500_000,
      reserveExitMultiple: 5.0,
    }),
    createTestInvestment({
      id: 'company-b',
      name: 'Beta Labs',
      initialInvestment: 1_500_000,
      followOnInvestment: 0,
      currentValuation: 4_500_000,
      projectedExitValue: 8_000_000,
      exitProbability: 0.4,
      plannedReserves: 1_000_000,
      reserveExitMultiple: 3.5,
    }),
    createTestInvestment({
      id: 'company-c',
      name: 'Gamma Bio',
      initialInvestment: 3_000_000,
      followOnInvestment: 2_000_000,
      currentValuation: 8_000_000,
      projectedExitValue: 15_000_000,
      exitProbability: 0.7,
      plannedReserves: 750_000,
      reserveExitMultiple: 4.5,
    }),
  ];
}
