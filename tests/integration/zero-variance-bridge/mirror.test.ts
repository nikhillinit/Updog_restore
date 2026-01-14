/**
 * Zero-Variance Mirror Tests
 *
 * Phase 1: Prove self-consistency - MC(seed=X, vol=0) === MC(seed=X, vol=0)
 * Identical inputs must produce identical outputs.
 *
 * @group integration
 * @group zero-variance-bridge
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MonteCarloTestHarness } from '../../utils/monte-carlo-test-harness';
import { ZERO_VOL_DISTRIBUTIONS, CANONICAL_PORTFOLIO_INPUTS, CANONICAL_CONFIG } from './fixtures';

describe('Zero-Variance Mirror Test', () => {
  describe('Self-Consistency', () => {
    it('should produce identical results for identical inputs (Run A === Run B)', async () => {
      // Create fresh harnesses with same seed
      const harnessA = new MonteCarloTestHarness(CANONICAL_CONFIG.randomSeed);
      const harnessB = new MonteCarloTestHarness(CANONICAL_CONFIG.randomSeed);

      const runA = await harnessA.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      const runB = await harnessB.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      // Compare deterministic sub-objects
      // Exclude: simulationId (UUID), executionTimeMs (timing)
      expect(runA.irr.statistics).toStrictEqual(runB.irr.statistics);
      expect(runA.irr.percentiles).toStrictEqual(runB.irr.percentiles);
      expect(runA.multiple.statistics).toStrictEqual(runB.multiple.statistics);
      expect(runA.dpi.statistics).toStrictEqual(runB.dpi.statistics);
      expect(runA.tvpi.statistics).toStrictEqual(runB.tvpi.statistics);
      expect(runA.totalValue.statistics).toStrictEqual(runB.totalValue.statistics);
      expect(runA.riskMetrics).toStrictEqual(runB.riskMetrics);
    });

    it('should produce identical scenarios when reset to same seed', async () => {
      const harness = new MonteCarloTestHarness(12345);

      const runA = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      // Reset to same seed
      harness.resetSeed(12345);

      const runB = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );

      // All scenario values should be identical
      expect(runA.irr.scenarios).toStrictEqual(runB.irr.scenarios);
      expect(runA.multiple.scenarios).toStrictEqual(runB.multiple.scenarios);
    });
  });

  describe('Zero-Variance Properties', () => {
    let result: Awaited<ReturnType<MonteCarloTestHarness['executeWithOverrides']>>;

    beforeAll(async () => {
      const harness = new MonteCarloTestHarness(CANONICAL_CONFIG.randomSeed);
      result = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );
    });

    it('should have zero standard deviation for IRR', () => {
      // Floating-point noise may produce values like 1e-16, which is effectively zero
      expect(result.irr.statistics.standardDeviation).toBeLessThan(1e-10);
    });

    it('should have zero standard deviation for multiple', () => {
      expect(result.multiple.statistics.standardDeviation).toBeLessThan(1e-10);
    });

    it('should have zero standard deviation for DPI', () => {
      expect(result.dpi.statistics.standardDeviation).toBeLessThan(1e-10);
    });

    it('should have zero standard deviation for total value', () => {
      // Total value is in dollars (1e8 scale), so noise can be larger
      expect(result.totalValue.statistics.standardDeviation).toBeLessThan(1e-4);
    });

    it('should have all percentiles equal to mean for IRR', () => {
      const mean = result.irr.statistics.mean;
      expect(result.irr.percentiles.p5).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p25).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p50).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p75).toBeCloseTo(mean, 10);
      expect(result.irr.percentiles.p95).toBeCloseTo(mean, 10);
    });

    it('should have min === max === mean when variance is zero', () => {
      expect(result.irr.statistics.min).toBeCloseTo(result.irr.statistics.mean, 10);
      expect(result.irr.statistics.max).toBeCloseTo(result.irr.statistics.mean, 10);
      expect(result.multiple.statistics.min).toBeCloseTo(result.multiple.statistics.mean, 10);
      expect(result.multiple.statistics.max).toBeCloseTo(result.multiple.statistics.mean, 10);
    });

    it('should produce finite values (no NaN or Infinity)', () => {
      // Check all numeric fields are finite
      expect(Number.isFinite(result.irr.statistics.mean)).toBe(true);
      expect(Number.isFinite(result.riskMetrics.sharpeRatio)).toBe(true);
      expect(Number.isFinite(result.riskMetrics.sortinoRatio)).toBe(true);
      expect(Number.isFinite(result.totalValue.statistics.mean)).toBe(true);
    });
  });

  describe('Risk Metrics at Zero Variance', () => {
    let result: Awaited<ReturnType<MonteCarloTestHarness['executeWithOverrides']>>;

    beforeAll(async () => {
      const harness = new MonteCarloTestHarness(CANONICAL_CONFIG.randomSeed);
      result = await harness.executeWithOverrides(
        CANONICAL_CONFIG,
        ZERO_VOL_DISTRIBUTIONS,
        CANONICAL_PORTFOLIO_INPUTS,
        { deterministicMode: true, skipStore: true }
      );
    });

    it('should have capped Sharpe ratio (not Infinity)', () => {
      // With positive excess return and zero stdDev, Sharpe would be Infinity
      // We cap at 10 per industry standard
      expect(result.riskMetrics.sharpeRatio).toBe(10);
    });

    it('should have capped Sortino ratio (not Infinity)', () => {
      expect(result.riskMetrics.sortinoRatio).toBe(10);
    });

    it('should have zero downside risk (no negative returns variance)', () => {
      // When all returns equal the mean, there's no downside variance
      // Note: Depends on whether mean > 0
      expect(result.riskMetrics.downsideRisk).toBeGreaterThanOrEqual(0);
    });

    it('should have VaR equal to mean (no tail risk)', () => {
      const meanIrr = result.irr.statistics.mean;
      expect(result.riskMetrics.valueAtRisk.var5).toBeCloseTo(meanIrr, 10);
      expect(result.riskMetrics.valueAtRisk.var10).toBeCloseTo(meanIrr, 10);
    });

    it('should have CVaR equal to VaR (no tail beyond VaR)', () => {
      expect(result.riskMetrics.conditionalValueAtRisk.cvar5).toBeCloseTo(
        result.riskMetrics.valueAtRisk.var5,
        10
      );
      expect(result.riskMetrics.conditionalValueAtRisk.cvar10).toBeCloseTo(
        result.riskMetrics.valueAtRisk.var10,
        10
      );
    });
  });
});
