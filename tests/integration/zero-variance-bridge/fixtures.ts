/**
 * Zero-Variance Bridge Test Fixtures
 *
 * Canonical test data and expected values for deterministic Monte Carlo testing.
 *
 * @module tests/integration/zero-variance-bridge/fixtures
 */

import type {
  SimulationConfig,
  DistributionParameters,
  PortfolioInputs,
} from '../../../server/services/monte-carlo-engine';

// =============================================================================
// CANONICAL INPUTS
// =============================================================================

/**
 * Zero-variance distribution parameters.
 * All volatilities set to 0 for deterministic scenario generation.
 */
export const ZERO_VOL_DISTRIBUTIONS: DistributionParameters = {
  irr: { mean: 0.15, volatility: 0 },
  multiple: { mean: 2.5, volatility: 0 },
  dpi: { mean: 0.8, volatility: 0 },
  exitTiming: { mean: 5.5, volatility: 0 },
  followOnSize: { mean: 0.5, volatility: 0 },
};

/**
 * Canonical portfolio inputs for testing.
 */
export const CANONICAL_PORTFOLIO_INPUTS: PortfolioInputs = {
  fundSize: 100_000_000, // $100M fund
  deployedCapital: 80_000_000, // $80M deployed
  reserveRatio: 0.2, // 20% reserves
  sectorWeights: {
    technology: 0.4,
    healthcare: 0.3,
    consumer: 0.2,
    other: 0.1,
  },
  stageWeights: {
    seed: 0.3,
    seriesA: 0.4,
    seriesB: 0.2,
    seriesC: 0.1,
  },
  averageInvestmentSize: 2_000_000, // $2M average
};

/**
 * Canonical simulation config.
 */
export const CANONICAL_CONFIG: SimulationConfig = {
  fundId: 999, // Placeholder (not used with overrides)
  runs: 100, // 100 scenarios (sufficient for determinism tests)
  timeHorizonYears: 5, // 5 year horizon
  randomSeed: 12345, // Fixed seed for reproducibility
};

// =============================================================================
// ORACLE EXPECTED VALUES
// =============================================================================

/**
 * Oracle derivation for zero-variance outputs.
 *
 * When volatility σ = 0, the Box-Muller transform reduces to:
 *   z0 = sqrt(-2 * log(u1)) * cos(2π * u2)
 * becomes irrelevant because: result = mean + z0 * 0 = mean
 *
 * Therefore all samples equal the mean exactly.
 */

const MEAN_IRR = 0.15;
const MEAN_MULTIPLE = 2.5;
const MEAN_DPI = 0.8;
const MEAN_EXIT_TIMING = 5.5;
const TIME_HORIZON = 5;
const DEPLOYED = 80_000_000;

/**
 * Oracle formula (matches engine at monte-carlo-engine.ts:708-718):
 *
 *   compoundFactor = (1 + IRR)^timeHorizon
 *   yearsAboveBaseline = max(0, timeHorizon - 5)
 *   timeDecay = 0.97^yearsAboveBaseline (or 0.95 if timeHorizon > 10)
 *   totalValue = deployedCapital * multiple * compoundFactor * timeDecay
 *
 * For timeHorizon = 5:
 *   compoundFactor = (1.15)^5 = 2.0113571...
 *   yearsAboveBaseline = 0
 *   timeDecay = 1.0
 *   totalValue = 80,000,000 * 2.5 * 2.0113571 * 1.0 = $402,271,428
 */
const COMPOUND_FACTOR = Math.pow(1 + MEAN_IRR, TIME_HORIZON);
const YEARS_ABOVE_BASELINE = Math.max(0, TIME_HORIZON - 5);
const TIME_DECAY = Math.pow(0.97, YEARS_ABOVE_BASELINE); // = 1.0 for horizon <= 5

export const EXPECTED_VALUES = {
  irr: {
    mean: MEAN_IRR,
    standardDeviation: 0,
    allPercentilesEqual: true,
  },
  multiple: {
    mean: MEAN_MULTIPLE,
    standardDeviation: 0,
    allPercentilesEqual: true,
  },
  dpi: {
    mean: MEAN_DPI,
    standardDeviation: 0,
    allPercentilesEqual: true,
  },
  exitTiming: {
    mean: MEAN_EXIT_TIMING,
    standardDeviation: 0,
    allPercentilesEqual: true,
  },
  tvpi: {
    // tvpi = multiple * timeDecay
    mean: MEAN_MULTIPLE * TIME_DECAY,
  },
  totalValue: {
    // totalValue = deployedCapital * multiple * compoundFactor * timeDecay
    mean: DEPLOYED * MEAN_MULTIPLE * COMPOUND_FACTOR * TIME_DECAY,
  },
  risk: {
    standardDeviation: 0,
    maxDrawdown: 0, // Note: Current engine may produce non-zero due to internal volatility
    sharpeRatio: 10, // Capped (excess return / 0 = Inf -> 10)
    sortinoRatio: 10, // Capped
    downsideRisk: 0,
  },
};

// =============================================================================
// TOLERANCE CONSTANTS
// =============================================================================

/**
 * Oracle tolerance for floating-point comparisons.
 *
 * Using relative tolerance with absolute floor to handle values near zero.
 */
export const ORACLE_TOLERANCE = {
  relative: 1e-10, // 0.00000001% relative tolerance
  absolute: 1e-12, // Absolute floor for near-zero values
};

/**
 * Calculate effective tolerance for oracle comparisons.
 */
export function getOracleTolerance(expected: number): number {
  return Math.max(ORACLE_TOLERANCE.relative * Math.abs(expected), ORACLE_TOLERANCE.absolute);
}

/**
 * Assert value matches oracle expectation within tolerance.
 */
export function expectOracleMatch(actual: number, expected: number, description: string): void {
  const tolerance = getOracleTolerance(expected);
  const diff = Math.abs(actual - expected);

  if (diff > tolerance) {
    throw new Error(
      `Oracle mismatch for ${description}: ` +
        `expected ${expected}, got ${actual}, ` +
        `diff ${diff} exceeds tolerance ${tolerance}`
    );
  }
}
