/**
 * Distribution override helpers for scenario-aware Monte Carlo runs.
 *
 * Phase 2 plan 02-02 (REQ-BCK-01, D-01): Both `MonteCarloEngine` and
 * `StreamingMonteCarloEngine` need to honor `config.marketParameters` when
 * present, applying the same translation rules so engine selection cannot
 * silently change scenario semantics. This helper is the single source of
 * truth for that translation — the two engines import it instead of
 * inline-duplicating the logic.
 *
 * Translation rules (executor chose option (a) per plan Q2 — scale irr.mean
 * by (1 - failureRate) — as the minimum-viable, fully-encapsulated approach):
 *
 *   exitMultiplierMean       -> multiple.mean
 *   exitMultiplierVolatility -> multiple.volatility
 *   holdPeriodYears          -> exitTiming.mean
 *   failureRate              -> scale irr.mean by (1 - failureRate)
 *   followOnProbability      -> NOT mapped (no clean 1:1 translation to
 *                               DistributionParameters; deferred to a
 *                               future phase if statistical defensibility
 *                               becomes a P1 concern)
 *
 * The returned object is a fresh `DistributionParameters` — the input is
 * NOT mutated. `failureRateScale = Math.max(0, 1 - failureRate)` guards
 * against pathological inputs (failureRate > 1 clamps to 0 instead of
 * producing a negative scale).
 *
 * @see .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-02-engine-market-params-override-PLAN.md
 * @see .planning/phases/02-backtesting-scenario-comparison-rewrite-p1/02-RESEARCH.md Q2-Q4
 */

import type { MarketParameters } from '@shared/types/backtesting';
import type { DistributionParameters } from '../monte-carlo-engine';

/**
 * Apply a MarketParameters override to a base DistributionParameters object.
 *
 * When the caller passes scenario-specific MarketParameters (e.g. the 2008
 * GFC historical scenario), this helper translates them into the shape the
 * Monte Carlo engines consume. The same helper is called from both
 * `MonteCarloEngine.calibrateDistributions` and
 * `StreamingMonteCarloEngine.calibrateDistributions` so engine selection
 * cannot produce divergent scenario semantics.
 *
 * @param base - The base DistributionParameters computed from variance
 *               reports or `getDefaultDistributions()`.
 * @param params - The scenario-specific MarketParameters override.
 * @returns A new DistributionParameters object with the override applied.
 */
export function applyMarketParametersOverride(
  base: DistributionParameters,
  params: MarketParameters
): DistributionParameters {
  const failureRateScale = Math.max(0, 1 - params.failureRate);
  return {
    irr: {
      mean: base.irr.mean * failureRateScale,
      volatility: base.irr.volatility,
    },
    multiple: {
      mean: params.exitMultiplierMean,
      volatility: params.exitMultiplierVolatility,
    },
    dpi: base.dpi,
    exitTiming: {
      mean: params.holdPeriodYears,
      volatility: base.exitTiming.volatility,
    },
    followOnSize: base.followOnSize,
  };
}
