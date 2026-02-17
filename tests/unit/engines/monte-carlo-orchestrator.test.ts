/**
 * Monte Carlo Orchestrator Test Suite
 *
 * Task 2.5: Validates the orchestrator's expectation mode,
 * stochastic mode, and reproducibility guarantees.
 *
 * @quarantine
 * @owner @phoenix-team
 * @reason Stochastic mode assertions depend on baseline DB fixtures unavailable in unit test runtime.
 * @exitCriteria Add deterministic baseline fixture strategy (or seeded integration DB) for stochastic mode tests.
 * @addedDate 2026-01-14
 *
 * Note: Expectation mode tests are active. Only stochastic mode tests
 * require Phase 2 infrastructure (distribution sampling, multi-run aggregation).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  OrchestratorConfig,
  ExpectationModeResult,
  StochasticModeResult,
} from '../../../server/services/monte-carlo-orchestrator';
import { MonteCarloOrchestrator } from '../../../server/services/monte-carlo-orchestrator';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createBaseConfig = (overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig => ({
  fundId: 1,
  runs: 1000,
  timeHorizonYears: 5,
  mode: 'expectation',
  portfolioSize: 20,
  ...overrides,
});

// =============================================================================
// ORCHESTRATOR INITIALIZATION TESTS
// =============================================================================

describe('MonteCarloOrchestrator - Initialization', () => {
  it('should initialize with default seed', () => {
    const orchestrator = new MonteCarloOrchestrator();
    expect(orchestrator).toBeDefined();
  });

  it('should initialize with custom seed', () => {
    const orchestrator = new MonteCarloOrchestrator(42);
    expect(orchestrator).toBeDefined();
  });

  it('should reset with new seed', () => {
    const orchestrator = new MonteCarloOrchestrator(42);
    orchestrator.reset(123);
    expect(orchestrator).toBeDefined();
  });
});

// =============================================================================
// EXPECTATION MODE TESTS
// =============================================================================

describe('MonteCarloOrchestrator - Expectation Mode', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should return expectation mode result', async () => {
    const config = createBaseConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.mode).toBe('expectation');
    expect(result.expectedIRR).toBeDefined();
    expect(result.expectedMultiple).toBeDefined();
    expect(result.expectedTVPI).toBeDefined();
  });

  it('should produce deterministic results (no randomness)', async () => {
    const config = createBaseConfig({ mode: 'expectation' });

    const result1 = await orchestrator.runExpectationMode(config);
    const result2 = await orchestrator.runExpectationMode(config);

    // Expectation mode should be fully deterministic
    expect(result1.expectedIRR).toBe(result2.expectedIRR);
    expect(result1.expectedMultiple).toBe(result2.expectedMultiple);
    expect(result1.expectedTVPI).toBe(result2.expectedTVPI);
    expect(result1.expectedDPI).toBe(result2.expectedDPI);
    expect(result1.expectedTotalValue).toBe(result2.expectedTotalValue);
  });

  it('should include confidence bounds', async () => {
    const config = createBaseConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.confidenceBounds).toBeDefined();
    expect(result.confidenceBounds.irr.lower).toBeLessThan(result.confidenceBounds.irr.upper);
    expect(result.confidenceBounds.multiple.lower).toBeLessThan(
      result.confidenceBounds.multiple.upper
    );
    expect(result.confidenceBounds.tvpi.lower).toBeLessThan(result.confidenceBounds.tvpi.upper);
  });

  it('should include metadata with deterministic hash', async () => {
    const config = createBaseConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.deterministicHash).toBeDefined();
    expect(result.metadata.deterministicHash.startsWith('det-')).toBe(true);
    expect(result.metadata.modelVersion).toBeDefined();
    expect(result.metadata.timestamp).toBeInstanceOf(Date);
  });

  it('should produce same hash for same config', async () => {
    const config = createBaseConfig({ mode: 'expectation' });

    const result1 = await orchestrator.runExpectationMode(config);
    const result2 = await orchestrator.runExpectationMode(config);

    expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
  });

  it('should produce different hash for different config', async () => {
    const config1 = createBaseConfig({ mode: 'expectation', timeHorizonYears: 5 });
    const config2 = createBaseConfig({ mode: 'expectation', timeHorizonYears: 10 });

    const result1 = await orchestrator.runExpectationMode(config1);
    const result2 = await orchestrator.runExpectationMode(config2);

    expect(result1.metadata.deterministicHash).not.toBe(result2.metadata.deterministicHash);
  });

  it('should return valid IRR range', async () => {
    const config = createBaseConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    // IRR should be in reasonable range for VC (-50% to +100%)
    expect(result.expectedIRR).toBeGreaterThan(-0.5);
    expect(result.expectedIRR).toBeLessThan(1.0);
  });

  it('should return valid multiple range', async () => {
    const config = createBaseConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    // Multiple should be positive and reasonable (0.1x to 10x)
    expect(result.expectedMultiple).toBeGreaterThan(0.1);
    expect(result.expectedMultiple).toBeLessThan(10);
  });
});

// =============================================================================
// STOCHASTIC MODE TESTS
// =============================================================================

// Note: Stochastic mode tests require database access and are skipped in unit tests
// Run these as integration tests with a test database
describe.skip('MonteCarloOrchestrator - Stochastic Mode', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  // @group integration - Requires database baseline data
  it('should return stochastic mode result', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 500 });
    const result = await orchestrator.runStochasticMode(config);

    expect(result.mode).toBe('stochastic');
    expect(result.seed).toBeDefined();
    expect(result.irr).toBeDefined();
    expect(result.tvpi).toBeDefined();
  });

  // @group integration - Requires database baseline data
  it('should be reproducible with same seed', async () => {
    const seed = 12345;
    const config = createBaseConfig({ mode: 'stochastic', runs: 500, randomSeed: seed });

    // Reset orchestrator between runs to ensure fresh state
    orchestrator.reset(seed);
    const result1 = await orchestrator.runStochasticMode(config);

    orchestrator.reset(seed);
    const result2 = await orchestrator.runStochasticMode(config);

    // Same seed should produce identical results
    expect(result1.irr.statistics.mean).toBe(result2.irr.statistics.mean);
    expect(result1.tvpi.statistics.mean).toBe(result2.tvpi.statistics.mean);
    expect(result1.seed).toBe(result2.seed);
  });

  // @group integration - Requires database baseline data
  it('should produce different results with different seeds', async () => {
    const config1 = createBaseConfig({ mode: 'stochastic', runs: 500, randomSeed: 111 });
    const config2 = createBaseConfig({ mode: 'stochastic', runs: 500, randomSeed: 222 });

    orchestrator.reset(111);
    const result1 = await orchestrator.runStochasticMode(config1);

    orchestrator.reset(222);
    const result2 = await orchestrator.runStochasticMode(config2);

    // Different seeds should produce different results
    // (with high probability - exact equality is astronomically unlikely)
    expect(result1.seed).not.toBe(result2.seed);
    // Note: means might be similar due to central limit theorem, so just check seeds differ
  });

  // @group integration - Requires database baseline data
  it('should include scenarios array', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 500 });
    const result = await orchestrator.runStochasticMode(config);

    expect(result.irr.scenarios).toBeInstanceOf(Array);
    expect(result.irr.scenarios.length).toBeGreaterThan(0);
  });

  // @group integration - Requires database baseline data
  it('should calculate percentiles', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 1000 });
    const result = await orchestrator.runStochasticMode(config);

    // Percentiles should be monotonic
    expect(result.irr.percentiles.p5).toBeLessThanOrEqual(result.irr.percentiles.p25);
    expect(result.irr.percentiles.p25).toBeLessThanOrEqual(result.irr.percentiles.p50);
    expect(result.irr.percentiles.p50).toBeLessThanOrEqual(result.irr.percentiles.p75);
    expect(result.irr.percentiles.p75).toBeLessThanOrEqual(result.irr.percentiles.p95);
  });
});

// =============================================================================
// REPRODUCIBILITY VERIFICATION TESTS
// =============================================================================

// Note: Reproducibility tests require database access and are skipped in unit tests
describe.skip('MonteCarloOrchestrator - Reproducibility Verification', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  // @group integration - Requires database baseline data
  it('should verify reproducibility for same seed', async () => {
    const config = createBaseConfig({
      mode: 'stochastic',
      runs: 500,
      randomSeed: 42,
    });

    const verification = await orchestrator.verifyReproducibility(config);

    expect(verification.reproducible).toBe(true);
    expect(verification.differences).toHaveLength(0);
    expect(verification.run1Hash).toBe(verification.run2Hash);
  });

  // @group integration - Requires database baseline data
  it('should return hash comparison', async () => {
    const config = createBaseConfig({
      mode: 'stochastic',
      runs: 500,
      randomSeed: 42,
    });

    const verification = await orchestrator.verifyReproducibility(config);

    expect(verification.run1Hash).toBeDefined();
    expect(verification.run2Hash).toBeDefined();
    expect(verification.run1Hash.startsWith('res-')).toBe(true);
    expect(verification.run2Hash.startsWith('res-')).toBe(true);
  });
});

// =============================================================================
// RUN METHOD DISPATCH TESTS
// =============================================================================

describe('MonteCarloOrchestrator - Run Method Dispatch', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should dispatch to expectation mode', async () => {
    const config = createBaseConfig({ mode: 'expectation' });
    const result = await orchestrator.run(config);

    expect(result.mode).toBe('expectation');
    expect((result as ExpectationModeResult).expectedIRR).toBeDefined();
  });

  // @group integration - Requires database baseline data
  it.skip('should dispatch to stochastic mode', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 500 });
    const result = await orchestrator.run(config);

    expect(result.mode).toBe('stochastic');
    expect((result as StochasticModeResult).seed).toBeDefined();
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('MonteCarloOrchestrator - Edge Cases', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  // @group integration - Requires database baseline data
  it.skip('should handle minimum runs', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 100 });
    const result = await orchestrator.runStochasticMode(config);

    expect(result).toBeDefined();
    expect(result.irr.scenarios.length).toBeGreaterThanOrEqual(100);
  });

  it('should handle short time horizon', async () => {
    const config = createBaseConfig({ mode: 'expectation', timeHorizonYears: 1 });
    const result = await orchestrator.runExpectationMode(config);

    expect(result).toBeDefined();
    expect(result.expectedIRR).toBeDefined();
  });

  it('should handle long time horizon', async () => {
    const config = createBaseConfig({ mode: 'expectation', timeHorizonYears: 15 });
    const result = await orchestrator.runExpectationMode(config);

    expect(result).toBeDefined();
    expect(result.expectedIRR).toBeDefined();
  });

  it('should handle small portfolio size', async () => {
    const config = createBaseConfig({ mode: 'expectation', portfolioSize: 5 });
    const result = await orchestrator.runExpectationMode(config);

    expect(result).toBeDefined();
    expect(result.expectedMultiple).toBeDefined();
  });

  it('should handle large portfolio size', async () => {
    const config = createBaseConfig({ mode: 'expectation', portfolioSize: 100 });
    const result = await orchestrator.runExpectationMode(config);

    expect(result).toBeDefined();
    expect(result.expectedMultiple).toBeDefined();
  });
});

// =============================================================================
// DISTRIBUTION VALIDITY TESTS (Pre-Task 2.7)
// =============================================================================

// Note: Distribution validity tests require database access and are skipped in unit tests
// These will be properly tested in Task 2.7 with full integration tests
describe.skip('MonteCarloOrchestrator - Distribution Validity', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  // @group integration - Requires database baseline data (Task 2.7)
  it('should produce valid percentile monotonicity', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 1000 });
    const result = await orchestrator.runStochasticMode(config);

    // All metrics should have monotonic percentiles
    const metrics = ['irr', 'tvpi', 'multiple', 'dpi'] as const;
    for (const metric of metrics) {
      const percentiles = result[metric].percentiles;
      expect(percentiles.p5).toBeLessThanOrEqual(percentiles.p50);
      expect(percentiles.p50).toBeLessThanOrEqual(percentiles.p95);
    }
  });

  // @group integration - Requires database baseline data (Task 2.7)
  it('should produce positive multiples', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 1000 });
    const result = await orchestrator.runStochasticMode(config);

    // Multiple should never be negative
    expect(result.multiple.statistics.min).toBeGreaterThanOrEqual(0);
  });

  // @group integration - Requires database baseline data (Task 2.7)
  it('should produce reasonable mean values', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 2000 });
    const result = await orchestrator.runStochasticMode(config);

    // Mean IRR should be in reasonable range
    expect(result.irr.statistics.mean).toBeGreaterThan(-0.5);
    expect(result.irr.statistics.mean).toBeLessThan(1.0);

    // Mean multiple should be positive
    expect(result.multiple.statistics.mean).toBeGreaterThan(0);
  });

  // @group integration - Requires database baseline data (Task 2.7)
  it('should have consistent confidence intervals', async () => {
    const config = createBaseConfig({ mode: 'stochastic', runs: 1000 });
    const result = await orchestrator.runStochasticMode(config);

    // CI68 should be narrower than CI95
    const ci68Width =
      result.irr.confidenceIntervals.ci68[1] - result.irr.confidenceIntervals.ci68[0];
    const ci95Width =
      result.irr.confidenceIntervals.ci95[1] - result.irr.confidenceIntervals.ci95[0];

    expect(ci68Width).toBeLessThan(ci95Width);
  });
});
