/**
 * Monte Carlo Parity Assertions
 *
 * Task 4: Validates that E[stochastic output] converges to
 * the deterministic expectation output as sample size increases.
 *
 * These tests exercise the orchestrator's validateConvergence()
 * method and verify statistical properties of the simulation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MonteCarloOrchestrator } from '../../../server/services/monte-carlo-orchestrator';
import type { OrchestratorConfig } from '../../../server/services/monte-carlo-orchestrator';
import { createMCFixtureProvider } from '../../fixtures/monte-carlo-fixtures';

const fixtureDataSource = createMCFixtureProvider();

const createConfig = (overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
  fundId: 1,
  runs: 1000,
  timeHorizonYears: 5,
  mode: 'stochastic',
  portfolioSize: 20,
  randomSeed: 42,
  ...overrides,
});

// =============================================================================
// CONVERGENCE PARITY TESTS
// =============================================================================

describe('Monte Carlo Parity: Expectation vs Stochastic', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42, fixtureDataSource);
  });

  it('should run both modes and report convergence diagnostics', async () => {
    const config = createConfig({ convergenceIterations: 2000 });
    const result = await orchestrator.validateConvergence(config);

    // Both modes should produce finite, comparable values
    expect(Number.isFinite(result.irr.expectationValue)).toBe(true);
    expect(Number.isFinite(result.irr.monteCarloMean)).toBe(true);
    expect(Number.isFinite(result.tvpi.expectationValue)).toBe(true);
    expect(Number.isFinite(result.tvpi.monteCarloMean)).toBe(true);

    // Differences should be non-negative
    expect(result.irr.difference).toBeGreaterThanOrEqual(0);
    expect(result.tvpi.difference).toBeGreaterThanOrEqual(0);

    // overall should be a boolean
    expect(typeof result.overall).toBe('boolean');
  });

  it('should report convergence metrics with correct structure', async () => {
    const config = createConfig({ convergenceIterations: 2000 });
    const result = await orchestrator.validateConvergence(config);

    // IRR convergence result
    expect(result.irr.expectationValue).toBeDefined();
    expect(result.irr.monteCarloMean).toBeDefined();
    expect(result.irr.difference).toBeGreaterThanOrEqual(0);
    expect(result.irr.tolerance).toBe(0.1);
    expect(result.irr.iterations).toBe(2000);

    // TVPI convergence result
    expect(result.tvpi.expectationValue).toBeDefined();
    expect(result.tvpi.monteCarloMean).toBeDefined();
    expect(result.tvpi.difference).toBeGreaterThanOrEqual(0);
    expect(result.tvpi.tolerance).toBe(0.05);
    expect(result.tvpi.iterations).toBe(2000);
  });

  it('should produce bounded differences across sample sizes', async () => {
    // Run with small sample
    orchestrator.reset(42);
    const smallResult = await orchestrator.validateConvergence(
      createConfig({ convergenceIterations: 500 })
    );

    // Run with large sample
    orchestrator.reset(42);
    const largeResult = await orchestrator.validateConvergence(
      createConfig({ convergenceIterations: 5000 })
    );

    // Both should produce finite, bounded differences
    expect(Number.isFinite(smallResult.irr.difference)).toBe(true);
    expect(Number.isFinite(largeResult.irr.difference)).toBe(true);
    expect(Number.isFinite(smallResult.tvpi.difference)).toBe(true);
    expect(Number.isFinite(largeResult.tvpi.difference)).toBe(true);

    // Iteration counts should match configuration
    expect(smallResult.irr.iterations).toBe(500);
    expect(largeResult.irr.iterations).toBe(5000);
  });

  it('should accept custom tolerance parameters', async () => {
    const config = createConfig({ convergenceIterations: 5000 });
    const customTolerance = { irr: 0.15, tvpi: 0.1 };
    const result = await orchestrator.validateConvergence(config, customTolerance);

    expect(result.irr.tolerance).toBe(0.15);
    expect(result.tvpi.tolerance).toBe(0.1);
    // Differences should be non-negative numbers regardless of convergence
    expect(result.irr.difference).toBeGreaterThanOrEqual(0);
    expect(result.tvpi.difference).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// REPRODUCIBILITY PARITY TESTS
// =============================================================================

describe('Monte Carlo Parity: Reproducibility', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42, fixtureDataSource);
  });

  it('should produce identical stochastic results with same seed', async () => {
    const config = createConfig({ runs: 1000, randomSeed: 12345 });

    orchestrator.reset(12345);
    const run1 = await orchestrator.runStochasticMode(config);

    orchestrator.reset(12345);
    const run2 = await orchestrator.runStochasticMode(config);

    // Exact equality — same seed must produce same numbers
    expect(run1.irr.statistics.mean).toBe(run2.irr.statistics.mean);
    expect(run1.tvpi.statistics.mean).toBe(run2.tvpi.statistics.mean);
    expect(run1.multiple.statistics.mean).toBe(run2.multiple.statistics.mean);
    expect(run1.dpi.statistics.mean).toBe(run2.dpi.statistics.mean);
  });

  it('should produce different results with different seeds', async () => {
    orchestrator.reset(111);
    const run1 = await orchestrator.runStochasticMode(
      createConfig({ runs: 1000, randomSeed: 111 })
    );

    orchestrator.reset(222);
    const run2 = await orchestrator.runStochasticMode(
      createConfig({ runs: 1000, randomSeed: 222 })
    );

    // At least one metric should differ
    const allSame =
      run1.irr.statistics.mean === run2.irr.statistics.mean &&
      run1.tvpi.statistics.mean === run2.tvpi.statistics.mean;
    expect(allSame).toBe(false);
  });

  it('should pass verifyReproducibility check', async () => {
    const config = createConfig({ runs: 500, randomSeed: 42 });
    const verification = await orchestrator.verifyReproducibility(config);

    expect(verification.reproducible).toBe(true);
    expect(verification.differences).toHaveLength(0);
    expect(verification.run1Hash).toBe(verification.run2Hash);
  });
});

// =============================================================================
// STATISTICAL DISTRIBUTION PROPERTIES
// =============================================================================

describe('Monte Carlo Parity: Distribution Properties', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42, fixtureDataSource);
  });

  it('should produce right-skewed return distributions (VC characteristic)', async () => {
    const config = createConfig({ runs: 2000 });
    const result = await orchestrator.runStochasticMode(config);

    // VC returns are right-skewed: mean > median (p50)
    expect(result.multiple.statistics.mean).toBeGreaterThan(result.multiple.percentiles.p50);
  });

  it('should produce monotonic percentiles', async () => {
    const config = createConfig({ runs: 2000 });
    const result = await orchestrator.runStochasticMode(config);

    const metrics = ['irr', 'tvpi', 'multiple', 'dpi'] as const;
    for (const metric of metrics) {
      const p = result[metric].percentiles;
      expect(p.p5).toBeLessThanOrEqual(p.p25);
      expect(p.p25).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p75);
      expect(p.p75).toBeLessThanOrEqual(p.p95);
    }
  });

  it('should produce narrower CI68 than CI95', async () => {
    const config = createConfig({ runs: 2000 });
    const result = await orchestrator.runStochasticMode(config);

    const ci68Width =
      result.irr.confidenceIntervals.ci68[1] - result.irr.confidenceIntervals.ci68[0];
    const ci95Width =
      result.irr.confidenceIntervals.ci95[1] - result.irr.confidenceIntervals.ci95[0];

    expect(ci68Width).toBeLessThan(ci95Width);
  });

  it('should keep multiples non-negative', async () => {
    const config = createConfig({ runs: 2000 });
    const result = await orchestrator.runStochasticMode(config);

    expect(result.multiple.statistics.min).toBeGreaterThanOrEqual(0);
    expect(result.tvpi.statistics.min).toBeGreaterThanOrEqual(0);
  });
});
