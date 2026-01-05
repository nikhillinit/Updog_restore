/**
 * Recycling Engine for Multi-Period VC Fund Modeling
 *
 * Models capital recycling: reinvesting exit proceeds back into new investments within the same bucket.
 * Critical for realistic fund modeling where successful exits generate capital for follow-on investments.
 *
 * Design rationale:
 * - VC funds typically recycle capital from early exits into later investments
 * - Same-bucket constraint: Seed exits → reinvest in Seed (maintains strategy consistency)
 * - Recycling multiples track: 1x = no recycling, 2x = proceeds reinvested once, etc.
 * - Enables multi-period modeling without explicit time dimension
 *
 * Mathematical model:
 * - Deployed capital per bucket grows: C_deployed = C_initial * (1 + recycling_rate)
 * - Recycling rate derived from: exit MOIC distribution + reinvestment % + timing
 * - Same-bucket only: prevents cross-contamination between strategies
 *
 * References:
 * - Kaplan & Schoar (2005): "Private Equity Performance: Returns, Persistence, and Capital Flows"
 * - Press On Ventures Excel: Capital recycling worksheet
 */

export interface RecyclingConfig {
  /** Enable recycling (default: true) */
  enabled: boolean;

  /** Recycling mode (same-bucket only for now) */
  mode: 'same-bucket';

  /** Percentage of exit proceeds to reinvest (0 to 1) */
  reinvestmentRate: number;

  /** Average holding period in years (affects recycling timing) */
  avgHoldingPeriod: number;

  /** Fund lifetime in years (limits recycling rounds) */
  fundLifetime: number;
}

/**
 * Recycling calculation result
 */
export interface RecyclingResult {
  /** Total deployed capital including recycled amounts */
  totalDeployed: number;

  /** Recycling multiple (totalDeployed / initialCapital) */
  recyclingMultiple: number;

  /** Number of recycling rounds that occurred */
  recyclingRounds: number;

  /** Breakdown by round */
  rounds: RecyclingRound[];
}

/**
 * Single recycling round details
 */
export interface RecyclingRound {
  /** Round number (0 = initial deployment) */
  round: number;

  /** Capital deployed in this round */
  deployed: number;

  /** Expected proceeds from this round */
  expectedProceeds: number;

  /** Capital available for next round */
  availableForNext: number;
}

/**
 * Validate recycling configuration
 */
export function validateRecyclingConfig(config: RecyclingConfig): void {
  if (config.reinvestmentRate < 0 || config.reinvestmentRate > 1) {
    throw new Error(
      `Reinvestment rate must be in [0, 1], got ${config.reinvestmentRate.toFixed(4)}`
    );
  }

  if (config.avgHoldingPeriod <= 0) {
    throw new Error(
      `Average holding period must be positive, got ${config.avgHoldingPeriod.toFixed(2)} years`
    );
  }

  if (config.fundLifetime <= 0) {
    throw new Error(`Fund lifetime must be positive, got ${config.fundLifetime.toFixed(2)} years`);
  }

  if (config.avgHoldingPeriod >= config.fundLifetime) {
    console.warn(
      `[RecyclingEngine] Holding period (${config.avgHoldingPeriod}y) >= fund lifetime (${config.fundLifetime}y): limited recycling`
    );
  }
}

/**
 * Calculate maximum recycling rounds based on timing
 *
 * @param config - Recycling configuration
 * @returns Maximum number of recycling rounds possible
 */
export function calculateMaxRecyclingRounds(config: RecyclingConfig): number {
  if (!config.enabled) return 0;

  // Each round takes avgHoldingPeriod years
  // Total time available = fundLifetime
  const maxRounds = Math.floor(config.fundLifetime / config.avgHoldingPeriod);

  // Subtract 1 because round 0 is initial deployment
  return Math.max(0, maxRounds - 1);
}

/**
 * Calculate recycling multiple and deployed capital
 *
 * @param initialCapital - Initial capital allocated to bucket
 * @param avgMOIC - Average MOIC for investments in bucket
 * @param config - Recycling configuration
 * @returns Recycling calculation result
 */
export function calculateRecycling(
  initialCapital: number,
  avgMOIC: number,
  config: RecyclingConfig
): RecyclingResult {
  validateRecyclingConfig(config);

  if (!config.enabled) {
    return {
      totalDeployed: initialCapital,
      recyclingMultiple: 1.0,
      recyclingRounds: 0,
      rounds: [
        {
          round: 0,
          deployed: initialCapital,
          expectedProceeds: initialCapital * avgMOIC,
          availableForNext: 0,
        },
      ],
    };
  }

  const maxRounds = calculateMaxRecyclingRounds(config);
  const rounds: RecyclingRound[] = [];

  let totalDeployed = 0;
  let availableCapital = initialCapital;
  let roundCount = 0;

  // Round 0: Initial deployment
  const round0Proceeds = initialCapital * avgMOIC;
  const round0Available = round0Proceeds * config.reinvestmentRate;

  rounds.push({
    round: 0,
    deployed: initialCapital,
    expectedProceeds: round0Proceeds,
    availableForNext: round0Available,
  });

  totalDeployed += initialCapital;
  availableCapital = round0Available;

  // Subsequent recycling rounds
  for (let round = 1; round <= maxRounds && availableCapital > 0; round++) {
    const deployed = availableCapital;
    const proceeds = deployed * avgMOIC;
    const available = proceeds * config.reinvestmentRate;

    rounds.push({
      round,
      deployed,
      expectedProceeds: proceeds,
      availableForNext: available,
    });

    totalDeployed += deployed;
    availableCapital = available;
    roundCount++;

    // Stop if next round would be negligible (< 1% of initial)
    if (available < initialCapital * 0.01) {
      break;
    }
  }

  const recyclingMultiple = totalDeployed / initialCapital;

  return {
    totalDeployed,
    recyclingMultiple,
    recyclingRounds: roundCount,
    rounds,
  };
}

/**
 * Recycling Engine for multi-bucket scenario modeling
 */
export class RecyclingEngine {
  private config: RecyclingConfig;

  constructor(config: RecyclingConfig) {
    validateRecyclingConfig(config);
    this.config = config;
  }

  /**
   * Calculate recycling for single bucket
   */
  calculateBucketRecycling(initialCapital: number, avgMOIC: number): RecyclingResult {
    return calculateRecycling(initialCapital, avgMOIC, this.config);
  }

  /**
   * Calculate recycling for multiple buckets
   *
   * @param bucketCapitals - Array of initial capital per bucket
   * @param bucketMOICs - Array of average MOIC per bucket
   * @returns Array of recycling results per bucket
   */
  calculateMultiBucketRecycling(
    bucketCapitals: number[],
    bucketMOICs: number[]
  ): RecyclingResult[] {
    if (bucketCapitals.length !== bucketMOICs.length) {
      throw new Error(
        `Bucket capitals (${bucketCapitals.length}) and MOICs (${bucketMOICs.length}) must have same length`
      );
    }

    return bucketCapitals.map((capital, i) =>
      this.calculateBucketRecycling(capital, bucketMOICs[i])
    );
  }

  /**
   * Get configuration (for diagnostics)
   */
  getConfig(): Readonly<RecyclingConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RecyclingConfig>): void {
    const newConfig = { ...this.config, ...config };
    validateRecyclingConfig(newConfig);
    this.config = newConfig;
  }
}

/**
 * Default recycling configuration for VC funds
 *
 * Based on industry norms:
 * - Reinvestment rate: 80% (20% held for reserves/management fees)
 * - Avg holding period: 5 years (typical VC exit timeline)
 * - Fund lifetime: 10 years (standard VC fund structure)
 *
 * This produces ~1 recycling round on average (10y / 5y - 1 = 1)
 */
export const DEFAULT_RECYCLING_CONFIG: RecyclingConfig = {
  enabled: true,
  mode: 'same-bucket',
  reinvestmentRate: 0.8,
  avgHoldingPeriod: 5,
  fundLifetime: 10,
};

/**
 * Create recycling engine with validation
 */
export function createRecyclingEngine(
  config: RecyclingConfig = DEFAULT_RECYCLING_CONFIG
): RecyclingEngine {
  return new RecyclingEngine(config);
}
