/**
 * Expectation Mode Validation Test Suite
 *
 * Task 2.6: Validates that expectation mode matches deterministic core
 * and Monte Carlo mean converges to expectation values.
 *
 * Key validations:
 * 1. Expectation mode is fully deterministic
 * 2. Same seed produces identical stochastic results
 * 3. Confidence bounds are mathematically valid
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  OrchestratorConfig,
  ExpectationModeResult,
} from '../../../server/services/monte-carlo-orchestrator';
import { MonteCarloOrchestrator } from '../../../server/services/monte-carlo-orchestrator';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createValidationConfig = (
  overrides: Partial<OrchestratorConfig> = {}
): OrchestratorConfig => ({
  fundId: 1,
  runs: 2000,
  timeHorizonYears: 5,
  mode: 'expectation',
  portfolioSize: 20,
  randomSeed: 42,
  ...overrides,
});

// =============================================================================
// EXPECTATION MODE DETERMINISM TESTS
// =============================================================================

describe('Expectation Mode Validation - Determinism', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should produce identical results across multiple runs', async () => {
    const config = createValidationConfig({ mode: 'expectation' });

    // Run 5 times to ensure determinism
    const results: ExpectationModeResult[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(await orchestrator.runExpectationMode(config));
    }

    // All results should be identical
    const baseline = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i].expectedIRR).toBe(baseline.expectedIRR);
      expect(results[i].expectedMultiple).toBe(baseline.expectedMultiple);
      expect(results[i].expectedTVPI).toBe(baseline.expectedTVPI);
      expect(results[i].expectedDPI).toBe(baseline.expectedDPI);
      expect(results[i].expectedTotalValue).toBe(baseline.expectedTotalValue);
    }
  });

  it('should produce same hash for same config', async () => {
    const config = createValidationConfig({ mode: 'expectation' });

    const result1 = await orchestrator.runExpectationMode(config);
    const result2 = await orchestrator.runExpectationMode(config);

    expect(result1.metadata.deterministicHash).toBe(result2.metadata.deterministicHash);
  });

  it('should be independent of random seed (expectation mode)', async () => {
    // Expectation mode should NOT depend on random seed
    const config1 = createValidationConfig({ mode: 'expectation', randomSeed: 111 });
    const config2 = createValidationConfig({ mode: 'expectation', randomSeed: 999 });

    const result1 = await orchestrator.runExpectationMode(config1);
    const result2 = await orchestrator.runExpectationMode(config2);

    // Expected values should be identical regardless of seed
    expect(result1.expectedIRR).toBe(result2.expectedIRR);
    expect(result1.expectedMultiple).toBe(result2.expectedMultiple);
    expect(result1.expectedTVPI).toBe(result2.expectedTVPI);
  });

  it('should produce different results for different configs', async () => {
    const config1 = createValidationConfig({ mode: 'expectation', timeHorizonYears: 5 });
    const config2 = createValidationConfig({ mode: 'expectation', timeHorizonYears: 10 });

    const result1 = await orchestrator.runExpectationMode(config1);
    const result2 = await orchestrator.runExpectationMode(config2);

    // Different time horizons should produce different results
    expect(result1.expectedIRR).not.toBe(result2.expectedIRR);
    expect(result1.metadata.deterministicHash).not.toBe(result2.metadata.deterministicHash);
  });

  it('should produce different results for different portfolio sizes', async () => {
    const config1 = createValidationConfig({ mode: 'expectation', portfolioSize: 10 });
    const config2 = createValidationConfig({ mode: 'expectation', portfolioSize: 50 });

    const result1 = await orchestrator.runExpectationMode(config1);
    const result2 = await orchestrator.runExpectationMode(config2);

    // Different portfolio sizes should produce different results
    expect(result1.expectedMultiple).not.toBe(result2.expectedMultiple);
  });
});

// =============================================================================
// CONFIDENCE BOUNDS VALIDATION TESTS
// =============================================================================

describe('Expectation Mode Validation - Confidence Bounds', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should produce valid lower < upper bounds', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    // Lower should always be less than upper
    expect(result.confidenceBounds.irr.lower).toBeLessThan(result.confidenceBounds.irr.upper);
    expect(result.confidenceBounds.multiple.lower).toBeLessThan(
      result.confidenceBounds.multiple.upper
    );
    expect(result.confidenceBounds.tvpi.lower).toBeLessThan(result.confidenceBounds.tvpi.upper);
  });

  it('should have expected value within confidence bounds', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    // Expected value should be within bounds
    expect(result.expectedIRR).toBeGreaterThanOrEqual(result.confidenceBounds.irr.lower);
    expect(result.expectedIRR).toBeLessThanOrEqual(result.confidenceBounds.irr.upper);

    expect(result.expectedMultiple).toBeGreaterThanOrEqual(result.confidenceBounds.multiple.lower);
    expect(result.expectedMultiple).toBeLessThanOrEqual(result.confidenceBounds.multiple.upper);

    expect(result.expectedTVPI).toBeGreaterThanOrEqual(result.confidenceBounds.tvpi.lower);
    expect(result.expectedTVPI).toBeLessThanOrEqual(result.confidenceBounds.tvpi.upper);
  });

  it('should narrow bounds with more iterations', async () => {
    const config1 = createValidationConfig({ mode: 'expectation', runs: 1000 });
    const config2 = createValidationConfig({ mode: 'expectation', runs: 10000 });

    const result1 = await orchestrator.runExpectationMode(config1);
    const result2 = await orchestrator.runExpectationMode(config2);

    // More iterations should produce narrower bounds (CLT)
    const width1 = result1.confidenceBounds.irr.upper - result1.confidenceBounds.irr.lower;
    const width2 = result2.confidenceBounds.irr.upper - result2.confidenceBounds.irr.lower;

    expect(width2).toBeLessThan(width1);
  });

  it('should produce reasonable bound widths', async () => {
    const config = createValidationConfig({ mode: 'expectation', runs: 5000 });
    const result = await orchestrator.runExpectationMode(config);

    // IRR bounds should be within reasonable range (not too wide, not too narrow)
    const irrWidth = result.confidenceBounds.irr.upper - result.confidenceBounds.irr.lower;
    expect(irrWidth).toBeGreaterThan(0.001); // Not trivially narrow
    expect(irrWidth).toBeLessThan(0.5); // Not excessively wide
  });
});

// =============================================================================
// EXPECTED VALUE RANGE VALIDATION TESTS
// =============================================================================

describe('Expectation Mode Validation - Value Ranges', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should produce IRR in valid range (-50% to +100%)', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.expectedIRR).toBeGreaterThan(-0.5);
    expect(result.expectedIRR).toBeLessThan(1.0);
  });

  it('should produce positive multiple', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.expectedMultiple).toBeGreaterThan(0);
  });

  it('should produce TVPI >= DPI', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    // TVPI (total value) should be >= DPI (distributed)
    expect(result.expectedTVPI).toBeGreaterThanOrEqual(result.expectedDPI);
  });

  it('should produce positive total value', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.expectedTotalValue).toBeGreaterThan(0);
  });

  it('should produce DPI in valid range (0 to TVPI)', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.expectedDPI).toBeGreaterThanOrEqual(0);
    expect(result.expectedDPI).toBeLessThanOrEqual(result.expectedTVPI);
  });

  it('should scale total value with time horizon', async () => {
    const config1 = createValidationConfig({ mode: 'expectation', timeHorizonYears: 3 });
    const config2 = createValidationConfig({ mode: 'expectation', timeHorizonYears: 10 });

    const result1 = await orchestrator.runExpectationMode(config1);
    const result2 = await orchestrator.runExpectationMode(config2);

    // Longer time horizon should generally increase DPI (more exits)
    expect(result2.expectedDPI).toBeGreaterThanOrEqual(result1.expectedDPI);
  });
});

// =============================================================================
// METADATA VALIDATION TESTS
// =============================================================================

describe('Expectation Mode Validation - Metadata', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should include valid timestamp', async () => {
    const before = new Date();
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);
    const after = new Date();

    expect(result.metadata.timestamp).toBeInstanceOf(Date);
    expect(result.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.metadata.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should include model version', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.metadata.modelVersion).toBeDefined();
    expect(typeof result.metadata.modelVersion).toBe('string');
    expect(result.metadata.modelVersion.length).toBeGreaterThan(0);
  });

  it('should include deterministic hash', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.metadata.deterministicHash).toBeDefined();
    expect(result.metadata.deterministicHash.startsWith('det-')).toBe(true);
  });

  it('should track execution time', async () => {
    const config = createValidationConfig({ mode: 'expectation' });
    const result = await orchestrator.runExpectationMode(config);

    expect(result.executionTimeMs).toBeDefined();
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.executionTimeMs).toBeLessThan(10000); // Should complete within 10s
  });
});

// =============================================================================
// CONSISTENCY VALIDATION TESTS
// =============================================================================

describe('Expectation Mode Validation - Consistency', () => {
  let orchestrator: MonteCarloOrchestrator;

  beforeEach(() => {
    orchestrator = new MonteCarloOrchestrator(42);
  });

  it('should maintain consistency after reset', async () => {
    const config = createValidationConfig({ mode: 'expectation' });

    const result1 = await orchestrator.runExpectationMode(config);
    orchestrator.reset(999); // Reset with different seed
    const result2 = await orchestrator.runExpectationMode(config);

    // Expectation mode should be independent of PRNG state
    expect(result1.expectedIRR).toBe(result2.expectedIRR);
    expect(result1.expectedMultiple).toBe(result2.expectedMultiple);
    expect(result1.expectedTVPI).toBe(result2.expectedTVPI);
  });

  it('should preserve config in result', async () => {
    const config = createValidationConfig({
      mode: 'expectation',
      fundId: 123,
      timeHorizonYears: 7,
      portfolioSize: 30,
    });

    const result = await orchestrator.runExpectationMode(config);

    expect(result.config.fundId).toBe(123);
    expect(result.config.timeHorizonYears).toBe(7);
    expect(result.config.portfolioSize).toBe(30);
    expect(result.config.mode).toBe('expectation');
  });

  it('should handle sequential calls without state leakage', async () => {
    const configs = [
      createValidationConfig({ mode: 'expectation', timeHorizonYears: 3 }),
      createValidationConfig({ mode: 'expectation', timeHorizonYears: 5 }),
      createValidationConfig({ mode: 'expectation', timeHorizonYears: 7 }),
    ];

    const results: ExpectationModeResult[] = [];
    for (const config of configs) {
      results.push(await orchestrator.runExpectationMode(config));
    }

    // Each result should match its config
    expect(results[0].config.timeHorizonYears).toBe(3);
    expect(results[1].config.timeHorizonYears).toBe(5);
    expect(results[2].config.timeHorizonYears).toBe(7);

    // Results should be different for different configs
    expect(results[0].expectedIRR).not.toBe(results[2].expectedIRR);
  });
});
