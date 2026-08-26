/**
 * Zero-Variance Oracle Tests
 *
 * Phase 2: Prove mathematical correctness - MC(vol=0) outputs match closed-form math.
 *
 * Oracle derivation: When volatility = 0, the Box-Muller transform reduces to
 * returning the mean directly. All outputs should match the expected values
 * calculated from the engine's formulas.
 *
 * @group integration
 * @group zero-variance-bridge
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MonteCarloTestHarness } from '../../utils/monte-carlo-test-harness';
import {
  ZERO_VOL_DISTRIBUTIONS,
  CANONICAL_PORTFOLIO_INPUTS,
  CANONICAL_CONFIG,
  EXPECTED_VALUES,
  getOracleTolerance,
} from './fixtures';

describe('Zero-Variance Oracle Parity', () => {
  let harness: MonteCarloTestHarness;
  let result: Awaited<ReturnType<MonteCarloTestHarness['executeWithOverrides']>>;

  beforeAll(async () => {
    harness = new MonteCarloTestHarness(CANONICAL_CONFIG.randomSeed);
    result = await harness.executeWithOverrides(
      CANONICAL_CONFIG,
      ZERO_VOL_DISTRIBUTIONS,
      CANONICAL_PORTFOLIO_INPUTS,
      { deterministicMode: true, skipStore: true }
    );
  });

  describe('Distribution Collapse', () => {
    it('IRR: all percentiles should equal mean', () => {
      const mean = result.irr.statistics.mean;

      expect(result.irr.percentiles.p5).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p25).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p50).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p75).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p95).toBeCloseTo(mean, 10);
      expect(result.irr.statistics.min).toBeCloseTo(mean, 10);
      expect(result.irr.statistics.max).toBeCloseTo(mean, 10);
    });

    it('Multiple: all percentiles should equal mean', () => {
      const mean = result.multiple.statistics.mean;

      expect(result.multiple.percentiles.p5).toBeCloseTo(mean, 10);
      expect(result.multiple.percentiles.p50).toBeCloseTo(mean, 10);
      expect(result.multiple.percentiles.p95).toBeCloseTo(mean, 10);
    });

    it('DPI: all percentiles should equal mean', () => {
      const mean = result.dpi.statistics.mean;

      expect(result.dpi.percentiles.p5).toBeCloseTo(mean, 10);
      expect(result.dpi.percentiles.p50).toBeCloseTo(mean, 10);
      expect(result.dpi.percentiles.p95).toBeCloseTo(mean, 10);
    });

    it('TVPI: distribution should collapse to single value', () => {
      expect(result.tvpi.statistics.standardDeviation).toBe(0);
    });
  });

  describe('Closed-Form Value Calculations', () => {
    it('should have IRR mean equal to input distribution mean', () => {
      expect(result.irr.statistics.mean).toBeCloseTo(ZERO_VOL_DISTRIBUTIONS.irr.mean, 10);
    });

    it('should have Multiple mean equal to input distribution mean', () => {
      expect(result.multiple.statistics.mean).toBeCloseTo(ZERO_VOL_DISTRIBUTIONS.multiple.mean, 10);
    });

    it('should have DPI mean equal to input distribution mean', () => {
      expect(result.dpi.statistics.mean).toBeCloseTo(ZERO_VOL_DISTRIBUTIONS.dpi.mean, 10);
    });

    it('should match oracle TVPI calculation', () => {
      // TVPI = multiple * timeDecay
      // For 5-year horizon, timeDecay = 1.0
      const expectedTVPI = EXPECTED_VALUES.tvpi.mean;

      expect(result.tvpi.statistics.mean).toBeCloseTo(expectedTVPI, 6);
    });

    it('should match oracle total value calculation', () => {
      /**
       * Oracle formula (matches engine):
       *   compoundFactor = (1 + IRR)^timeHorizon = (1.15)^5 = 2.0113571
       *   timeDecay = 1.0 (for 5-year horizon)
       *   totalValue = deployedCapital * multiple * compoundFactor * timeDecay
       *              = 80,000,000 * 2.5 * 2.0113571 * 1.0
       *              = $402,271,428
       */
      const expectedTotalValue = EXPECTED_VALUES.totalValue.mean;
      const tolerance = getOracleTolerance(expectedTotalValue);

      expect(Math.abs(result.totalValue.statistics.mean - expectedTotalValue)).toBeLessThan(
        tolerance
      );
    });
  });

  describe('Risk Metrics at Zero Variance', () => {
    it('standard deviation should be effectively zero', () => {
      // Floating-point arithmetic may produce tiny values like 1e-16
      // These are below VOLATILITY_FLOOR (1e-8) and treated as zero
      expect(result.irr.statistics.standardDeviation).toBeLessThan(1e-10);
      expect(result.multiple.statistics.standardDeviation).toBeLessThan(1e-10);
    });

    it('Sharpe Ratio should be capped at 10 (positive excess return)', () => {
      // excess return = 0.15 - 0.02 = 0.13 > 0
      // Sharpe = 0.13 / 0 = Inf -> capped at 10
      expect(result.riskMetrics.sharpeRatio).toBe(EXPECTED_VALUES.risk.sharpeRatio);
    });

    it('Sortino Ratio should be capped at 10', () => {
      expect(result.riskMetrics.sortinoRatio).toBe(EXPECTED_VALUES.risk.sortinoRatio);
    });

    it('VaR should equal mean IRR (no tail risk)', () => {
      const meanIrr = result.irr.statistics.mean;
      expect(result.riskMetrics.valueAtRisk.var5).toBeCloseTo(meanIrr, 10);
      expect(result.riskMetrics.valueAtRisk.var10).toBeCloseTo(meanIrr, 10);
    });

    it('CVaR should equal VaR (no tail beyond VaR)', () => {
      expect(result.riskMetrics.conditionalValueAtRisk.cvar5).toBeCloseTo(
        result.riskMetrics.valueAtRisk.var5,
        10
      );
    });

    it('probability of loss should be 0 (all returns positive)', () => {
      // IRR mean = 0.15 > 0, and stdDev = 0, so all returns = 0.15
      expect(result.riskMetrics.probabilityOfLoss).toBe(0);
    });
  });

  describe('Confidence Intervals at Zero Variance', () => {
    it('CI68 should collapse to [mean, mean]', () => {
      const mean = result.irr.statistics.mean;
      const [lower, upper] = result.irr.confidenceIntervals.ci68;

      expect(lower).toBeCloseTo(mean, 10);
      expect(upper).toBeCloseTo(mean, 10);
    });

    it('CI95 should collapse to [mean, mean]', () => {
      const mean = result.irr.statistics.mean;
      const [lower, upper] = result.irr.confidenceIntervals.ci95;

      expect(lower).toBeCloseTo(mean, 10);
      expect(upper).toBeCloseTo(mean, 10);
    });
  });
});
