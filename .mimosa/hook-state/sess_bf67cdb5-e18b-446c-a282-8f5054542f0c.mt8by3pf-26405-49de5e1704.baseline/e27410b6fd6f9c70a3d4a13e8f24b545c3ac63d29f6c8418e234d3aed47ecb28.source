/**
 * Exit & Proceeds Calculation Utilities
 *
 * Handles exit value modeling with dollar-based inputs (not multiples).
 * Computes fund proceeds after waterfall, secondaries, and other adjustments.
 */

export interface ExitParams {
  /** Total exit equity value in whole USD dollars */
  exitEquityUSD: number;

  /** Fund's ownership percentage at exit (0-1 decimal, e.g., 0.15 = 15%) */
  ownershipAtExit: number;

  /** Fraction of proceeds to fund after waterfall (0-1 decimal) */
  payoutFractionFromWaterfall: number;

  /** Percentage of position sold in secondary (0-100 scale) */
  secondarySoldPct: number;
}

/**
 * Compute fund proceeds from an exit event
 *
 * IMPORTANT: All monetary values in WHOLE DOLLARS (integers)
 *
 * Flow:
 * 1. Gross proceeds = Exit equity value × Ownership %
 * 2. After waterfall = Gross proceeds × Waterfall payout fraction
 * 3. After secondary = After waterfall × (1 - Secondary sold %)
 *
 * @param params - Exit event parameters
 * @returns Fund proceeds in whole dollars
 *
 * @example
 * // $50M exit, 20% ownership, 80% to LPs after carry, 10% sold in secondary
 * computeProceedsFromExit({
 *   exitEquityUSD: 50_000_000,
 *   ownershipAtExit: 0.20,
 *   payoutFractionFromWaterfall: 0.80,
 *   secondarySoldPct: 10
 * }) // Returns: $7,200,000
 * // Calculation: $50M × 0.20 = $10M gross
 * //              $10M × 0.80 = $8M after carry
 * //              $8M × 0.90 = $7.2M after secondary
 */
export function computeProceedsFromExit(params: ExitParams): number {
  const { exitEquityUSD, ownershipAtExit, payoutFractionFromWaterfall, secondarySoldPct } = params;

  // Validate inputs
  if (exitEquityUSD < 0) {
    throw new Error('Exit equity value must be non-negative');
  }

  if (ownershipAtExit < 0 || ownershipAtExit > 1) {
    throw new Error('Ownership must be between 0 and 1');
  }

  if (payoutFractionFromWaterfall < 0 || payoutFractionFromWaterfall > 1) {
    throw new Error('Waterfall payout fraction must be between 0 and 1');
  }

  if (secondarySoldPct < 0 || secondarySoldPct > 100) {
    throw new Error('Secondary sold percentage must be between 0 and 100');
  }

  // Step 1: Gross proceeds = exit value × ownership
  const grossProceeds = exitEquityUSD * ownershipAtExit;

  // Step 2: After waterfall (carry distribution)
  const afterWaterfall = grossProceeds * payoutFractionFromWaterfall;

  // Step 3: After secondary sales (reduced position)
  const afterSecondary = afterWaterfall * (1 - secondarySoldPct / 100);

  // Return as whole dollars
  return Math.round(afterSecondary);
}

/**
 * Compute implied multiple (for display/validation only)
 *
 * Shows relationship between exit value and invested cost.
 * NOT used in proceeds calculations (those use dollar exits directly).
 *
 * @param exitEquityUSD - Exit equity value in whole dollars
 * @param investedCost - Total invested cost in whole dollars
 * @returns Implied multiple (e.g., 3.5 = 3.5x return)
 *
 * @example
 * computeImpliedMultiple(10_000_000, 2_000_000) // 5.0 (5x return)
 * computeImpliedMultiple(5_000_000, 0) // 0 (avoid division by zero)
 */
export function computeImpliedMultiple(exitEquityUSD: number, investedCost: number): number {
  if (investedCost === 0) {
    return 0;
  }

  return exitEquityUSD / investedCost;
}

/**
 * Exit value distribution (low/median/high scenario modeling)
 */
export interface ExitValueDistribution {
  /** Median exit value (required) */
  median: number;

  /** Low-case exit value (optional) */
  low?: number;

  /** High-case exit value (optional) */
  high?: number;

  /** Probability weights for each scenario (optional, must sum to 1) */
  weights?: {
    low?: number;
    median?: number;
    high?: number;
  };
}

/**
 * Compute expected exit value from distribution
 *
 * If weights not provided, defaults to: low=20%, median=60%, high=20%
 *
 * @param distribution - Exit value distribution
 * @returns Weighted expected value in whole dollars
 *
 * @example
 * computeExpectedExitValue({
 *   low: 10_000_000,
 *   median: 50_000_000,
 *   high: 100_000_000,
 *   weights: { low: 0.3, median: 0.5, high: 0.2 }
 * }) // Returns: $48,000,000
 */
export function computeExpectedExitValue(distribution: ExitValueDistribution): number {
  const { median, low, high, weights } = distribution;

  // Default weights: low=20%, median=60%, high=20%
  const lowWeight = weights?.low ?? (low !== undefined ? 0.2 : 0);
  const medianWeight = weights?.median ?? (high === undefined && low === undefined ? 1.0 : 0.6);
  const highWeight = weights?.high ?? (high !== undefined ? 0.2 : 0);

  // Validate weights sum to 1 (within tolerance)
  const totalWeight = lowWeight + medianWeight + highWeight;
  if (Math.abs(totalWeight - 1) > 1e-6) {
    throw new Error(`Weights must sum to 1, got ${totalWeight.toFixed(3)}`);
  }

  // Compute weighted average
  const lowValue = low ?? median;
  const highValue = high ?? median;

  const expected = (lowValue * lowWeight) + (median * medianWeight) + (highValue * highWeight);

  return Math.round(expected);
}

/**
 * Validate exit value ordering (low ≤ median ≤ high)
 *
 * @param distribution - Exit value distribution
 * @returns Array of validation errors (empty if valid)
 */
export function validateExitDistribution(distribution: ExitValueDistribution): string[] {
  const errors: string[] = [];
  const { low, median, high } = distribution;

  if (median < 0) {
    errors.push('Median exit value must be non-negative');
  }

  if (low !== undefined) {
    if (low < 0) {
      errors.push('Low exit value must be non-negative');
    }

    if (low > median) {
      errors.push(`Low exit value (${low}) must be ≤ median (${median})`);
    }
  }

  if (high !== undefined) {
    if (high < 0) {
      errors.push('High exit value must be non-negative');
    }

    if (high < median) {
      errors.push(`High exit value (${high}) must be ≥ median (${median})`);
    }
  }

  // Validate weights if provided
  if (distribution.weights) {
    const { low: lowW, median: medianW, high: highW } = distribution.weights;

    if (lowW !== undefined && (lowW < 0 || lowW > 1)) {
      errors.push('Low weight must be between 0 and 1');
    }

    if (medianW !== undefined && (medianW < 0 || medianW > 1)) {
      errors.push('Median weight must be between 0 and 1');
    }

    if (highW !== undefined && (highW < 0 || highW > 1)) {
      errors.push('High weight must be between 0 and 1');
    }

    const totalWeight = (lowW ?? 0) + (medianW ?? 0) + (highW ?? 0);
    if (Math.abs(totalWeight - 1) > 1e-6) {
      errors.push(`Weights must sum to 1, got ${totalWeight.toFixed(3)}`);
    }
  }

  return errors;
}

/**
 * Stage-specific exit values (for portfolio modeling)
 */
export type Stage = 'preSeed' | 'seed' | 'seriesA' | 'seriesB' | 'seriesC' | 'seriesD';

export type ExitValuesByStage = Record<Stage, ExitValueDistribution>;

/**
 * Compute portfolio-wide expected exit value
 *
 * @param exitValues - Exit value distributions by stage
 * @param stageCounts - Number of companies at each stage
 * @returns Total expected portfolio exit value in whole dollars
 *
 * @example
 * computePortfolioExitValue(
 *   {
 *     seed: { median: 20_000_000 },
 *     seriesA: { median: 50_000_000 }
 *   },
 *   {
 *     seed: 10,  // 10 seed companies
 *     seriesA: 5 // 5 Series A companies
 *   }
 * ) // Returns expected value of portfolio
 */
export function computePortfolioExitValue(
  exitValues: Partial<ExitValuesByStage>,
  stageCounts: Partial<Record<Stage, number>>
): number {
  let totalExpected = 0;

  for (const [stage, distribution] of Object.entries(exitValues)) {
    const count = stageCounts[stage as Stage] ?? 0;
    const expectedValue = computeExpectedExitValue(distribution);
    totalExpected += expectedValue * count;
  }

  return Math.round(totalExpected);
}
