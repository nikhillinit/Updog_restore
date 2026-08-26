/**
 * Investment Rounds Business Logic
 * Calculations, validations, and transformations
 */

import type {
  InvestmentRound,
  RoundUpdate,
  RateValidation,
  RoundSummary,
  ValuationType
} from '@/types/investment-rounds';

/**
 * Calculate post-money valuation from pre-money + round size
 */
export function calculatePostMoney(preMoney: number, roundSize: number): number {
  return preMoney + roundSize;
}

/**
 * Calculate pre-money valuation from post-money - round size
 */
export function calculatePreMoney(postMoney: number, roundSize: number): number {
  return Math.max(0, postMoney - roundSize);
}

/**
 * Apply valuation update based on type selected
 * Returns updated preMoney and postMoney values
 */
export function applyValuationUpdate(
  valuationType: ValuationType,
  valuation: number,
  roundSize: number
): { preMoney: number; postMoney: number } {
  if (valuationType === 'Pre-Money') {
    return {
      preMoney: valuation,
      postMoney: calculatePostMoney(valuation, roundSize)
    };
  } else {
    return {
      preMoney: calculatePreMoney(valuation, roundSize),
      postMoney: valuation
    };
  }
}

/**
 * Calculate failure rate from graduation and exit rates
 * Ensures tri-rate model: graduation + exit + failure = 100%
 */
export function calculateFailureRate(graduationRate: number, exitRate: number): number {
  return Math.max(0, 100 - graduationRate - exitRate);
}

/**
 * Validate tri-rate model
 */
export function validateRates(graduationRate: number, exitRate: number): RateValidation {
  const totalRate = graduationRate + exitRate;

  if (totalRate > 100) {
    return {
      isValid: false,
      totalRate,
      error: `Graduation (${graduationRate}%) + Exit (${exitRate}%) exceeds 100%`
    };
  }

  if (graduationRate < 0 || exitRate < 0) {
    return {
      isValid: false,
      totalRate,
      error: 'Rates cannot be negative'
    };
  }

  return {
    isValid: true,
    totalRate
  };
}

/**
 * Apply a round update with automatic calculation of dependent fields
 */
export function applyRoundUpdate(
  currentRound: InvestmentRound,
  update: RoundUpdate
): InvestmentRound {
  const updated = { ...currentRound, ...update };

  // Recalculate valuation if type or size changed
  if ('valuationType' in update || 'valuation' in update || 'roundSize' in update) {
    const { preMoney, postMoney } = applyValuationUpdate(
      updated.valuationType,
      updated.valuation,
      updated.roundSize
    );
    updated.preMoney = preMoney;
    updated.postMoney = postMoney;
  }

  // Recalculate failure rate if graduation or exit changed
  if ('graduationRate' in update || 'exitRate' in update) {
    updated.failureRate = calculateFailureRate(
      updated.graduationRate,
      updated.exitRate
    );
  }

  // Mark as custom if user modified
  if (Object.keys(update).length > 0 && !updated.isCustom) {
    updated.isCustom = true;
  }

  return updated;
}

/**
 * Calculate summary metrics from all rounds
 */
export function calculateRoundSummary(rounds: InvestmentRound[]): RoundSummary {
  if (rounds.length === 0) {
    return {
      totalRoundSize: 0,
      averagePreMoney: 0,
      averagePostMoney: 0,
      averageEsop: 0,
      esopRange: { min: 0, max: 0 },
      averageGraduationRate: 0,
      averageExitRate: 0,
      averageFailureRate: 0,
      averageTimeToGraduate: 0,
      averageTimeToExit: 0,
      totalFundLifeMonths: 0,
      weightedExitValuation: 0,
      expectedExitCount: 0
    };
  }

  const totalRoundSize = rounds.reduce((sum, r) => sum + r.roundSize, 0);

  // Weight by round size for financial metrics
  const weightedPreMoney = rounds.reduce((sum, r) => sum + r.preMoney * r.roundSize, 0);
  const weightedPostMoney = rounds.reduce((sum, r) => sum + r.postMoney * r.roundSize, 0);
  const weightedEsop = rounds.reduce((sum, r) => sum + r.esopPct * r.roundSize, 0);

  // Simple averages for rates
  const avgGraduation = rounds.reduce((sum, r) => sum + r.graduationRate, 0) / rounds.length;
  const avgExit = rounds.reduce((sum, r) => sum + r.exitRate, 0) / rounds.length;
  const avgFailure = rounds.reduce((sum, r) => sum + r.failureRate, 0) / rounds.length;

  // Time metrics
  const avgTimeToGraduate = rounds
    .filter(r => r.graduationRate > 0)
    .reduce((sum, r) => sum + r.monthsToGraduate, 0) / rounds.filter(r => r.graduationRate > 0).length || 0;

  const avgTimeToExit = rounds.reduce((sum, r) => sum + r.monthsToExit, 0) / rounds.length;

  const totalFundLife = rounds.reduce((sum, r) => sum + r.monthsToGraduate, 0);

  // Exit value weighted by exit rate
  const weightedExitVal = rounds.reduce(
    (sum, r) => sum + r.exitValuation * (r.exitRate / 100),
    0
  );

  // Expected number of exits (assuming 100 companies)
  const expectedExits = rounds.reduce(
    (sum, r) => sum + r.exitRate,
    0
  );

  // ESOP range
  const esops = rounds.map(r => r.esopPct);
  const esopRange = {
    min: Math.min(...esops),
    max: Math.max(...esops)
  };

  return {
    totalRoundSize,
    averagePreMoney: totalRoundSize > 0 ? weightedPreMoney / totalRoundSize : 0,
    averagePostMoney: totalRoundSize > 0 ? weightedPostMoney / totalRoundSize : 0,
    averageEsop: totalRoundSize > 0 ? weightedEsop / totalRoundSize : 0,
    esopRange,
    averageGraduationRate: avgGraduation,
    averageExitRate: avgExit,
    averageFailureRate: avgFailure,
    averageTimeToGraduate: avgTimeToGraduate,
    averageTimeToExit: avgTimeToExit,
    totalFundLifeMonths: totalFundLife,
    weightedExitValuation: weightedExitVal,
    expectedExitCount: expectedExits
  };
}

/**
 * Validate a complete round
 */
export function validateRound(round: InvestmentRound): string[] {
  const errors: string[] = [];

  // Valuation validation
  if (round.roundSize <= 0) {
    errors.push('Round size must be positive');
  }

  if (round.preMoney < 0) {
    errors.push('Pre-money valuation cannot be negative');
  }

  if (round.postMoney <= 0) {
    errors.push('Post-money valuation must be positive');
  }

  if (round.postMoney < round.roundSize) {
    errors.push('Post-money must be >= round size');
  }

  // ESOP validation
  if (round.esopPct < 0 || round.esopPct > 50) {
    errors.push('ESOP must be between 0-50%');
  }

  if (round.esopPct > 30) {
    errors.push('Warning: ESOP >30% is unusually high');
  }

  // Rate validation
  const rateCheck = validateRates(round.graduationRate, round.exitRate);
  if (!rateCheck.isValid) {
    errors.push(rateCheck.error!);
  }

  // Timing validation
  if (round.monthsToGraduate < 0) {
    errors.push('Months to graduate cannot be negative');
  }

  if (round.monthsToExit < 0) {
    errors.push('Months to exit cannot be negative');
  }

  // Exit valuation validation
  if (round.exitValuation < 0) {
    errors.push('Exit valuation cannot be negative');
  }

  // Terminal stage validation
  if (round.name === 'Series D+' && round.graduationRate > 0) {
    errors.push('Terminal stage (Series D+) cannot have graduation rate > 0');
  }

  return errors;
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}B`;
  }
  return `$${value.toFixed(1)}M`;
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format months for display
 */
export function formatMonths(months: number): string {
  if (months === 0) return 'N/A';
  if (months < 12) return `${months}mo`;
  const years = (months / 12).toFixed(1);
  return `${years}yr`;
}
